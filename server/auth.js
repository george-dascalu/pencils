import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { isIP } from "node:net";
import { Problem } from "./problem.js";

const scrypt = promisify(derive);
const localAddress = (address = "") => {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return isIP(ip) === 6 && (ip === "::1" || /^(f[cd][\da-f]{2}|fe[89ab][\da-f]):/.test(ip));
};
export class Auth {
  constructor(store, mode = process.env.AUTH_MODE || "shared", localName = process.env.LOCAL_USER_NAME || "George") {
    this.store = store;
    this.mode = typeof mode === "boolean" ? (mode ? "required" : "shared") : mode;
    if (!["shared", "required", "local", "single-user"].includes(this.mode))
      throw new Problem(500, "AUTH_MODE must be shared, required, local or single-user.");
    this.enabled = this.mode !== "shared";
    const automatic = this.mode === "local" || this.mode === "single-user";
    if (automatic && !/^[a-zA-Z0-9_.-]{1,80}$/.test(localName))
      throw new Problem(500, "LOCAL_USER_NAME must be a valid account name.");
    this.localUser = automatic
      ? { username: localName, admin: true, organisations: {}, automatic: true }
      : null;
    this.sessions = new Map();
    this.attempts = new Map();
    this.file = path.join(store.root, ".pencils", "accounts.json");
  }
  async storedAccounts() {
    await this.store.safe(this.file);
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async accounts() {
    const accounts = await this.storedAccounts();
    // The configured local identity also owns OAuth grants and background jobs.
    // Keep it separate from password accounts so changing modes preserves them.
    return this.localUser
      ? [...accounts.filter((u) => u.username !== this.localUser.username), this.localUser]
      : accounts;
  }
  public(user) {
    return {
      username: user.username,
      admin: !!user.admin,
      organisations: user.organisations || {},
      ...(user.automatic ? { automatic: true } : {}),
    };
  }
  async save(input) {
    if (this.localUser?.username === input.username)
      throw new Problem(400, "The automatic account is managed by server settings.");
    if (
      typeof input.username !== "string" ||
      !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.username)
    )
      throw new Problem(
        400,
        "Use a username with letters, numbers, dots, hyphens or underscores.",
      );
    const accounts = await this.storedAccounts(),
      old = accounts.find((u) => u.username === input.username);
    if (
      (!old || input.password) &&
      (typeof input.password !== "string" ||
        input.password.length < 12 ||
        input.password.length > 200)
    )
      throw new Problem(400, "Use a password between 12 and 200 characters.");
    const memberships = input.organisations || {};
    if (
      typeof memberships !== "object" ||
      Array.isArray(memberships) ||
      Object.values(memberships).some((v) => !["viewer", "editor"].includes(v))
    )
      throw new Problem(400, "Organisation access must be viewer or editor.");
    for (const id of Object.keys(memberships))
      await this.store.getOrganisation(id);
    if (typeof input.admin !== "boolean")
      throw new Problem(400, "Admin must be true or false.");
    if (
      old?.admin &&
      !input.admin &&
      !accounts.some((u) => u.admin && u.username !== input.username)
    )
      throw new Problem(400, "Keep at least one administrator.");
    const user = {
      ...old,
      username: input.username,
      admin: input.admin,
      organisations: memberships,
    };
    if (input.password) {
      user.salt = randomBytes(16).toString("hex");
      user.hash = Buffer.from(
        await scrypt(input.password, user.salt, 64),
      ).toString("hex");
    }
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.writeFile(
      temporary,
      JSON.stringify(
        [...accounts.filter((u) => u.username !== user.username), user],
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await fs.rename(temporary, this.file);
    for (const [key, session] of this.sessions)
      if (session.username === user.username) this.sessions.delete(key);
    return this.public(user);
  }
  async login(input, address) {
    const now = Date.now(),
      recent = (this.attempts.get(address) || []).filter(
        (t) => t > now - 15 * 60_000,
      );
    if (recent.length >= 10)
      throw new Problem(
        429,
        "Too many login attempts. Try again in 15 minutes.",
      );
    recent.push(now);
    this.attempts.set(address, recent);
    if (this.attempts.size > 10000)
      this.attempts.delete(this.attempts.keys().next().value);
    const user = (await this.accounts()).find(
      (u) => u.username === input.username && !u.automatic,
    );
    const password =
      typeof input.password === "string" && input.password.length <= 200
        ? input.password
        : "";
    const value = Buffer.from(
      await scrypt(password, user?.salt || "pencils-login", 64),
    );
    if (!user || !timingSafeEqual(value, Buffer.from(user.hash, "hex")))
      throw new Problem(401, "Incorrect username or password.");
    this.attempts.delete(address);
    for (const [key, session] of this.sessions)
      if (session.expires < now) this.sessions.delete(key);
    if (this.sessions.size > 10000)
      throw new Problem(503, "Too many active sessions.");
    const token = randomBytes(32).toString("hex");
    this.sessions.set(token, {
      username: user.username,
      expires: now + 12 * 60 * 60_000,
    });
    return { token, user: this.public(user) };
  }
  token(req) {
    return (req.headers.cookie || "").match(
      /(?:^|;\s*)pencils_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
  }
  async user(req) {
    if (!this.enabled)
      return { username: "Shared workspace", admin: true, organisations: {} };
    // Single-user mode explicitly grants all reachable clients the same identity.
    // Local mode trusts only the socket address, never Host/forwarded headers.
    if (this.localUser && (this.mode === "single-user" || localAddress(req.socket?.remoteAddress)))
      return this.public(this.localUser);
    const session = this.sessions.get(this.token(req));
    if (!session || session.expires < Date.now()) return null;
    const user = (await this.accounts()).find(
      (u) => u.username === session.username && !u.automatic,
    );
    return user ? this.public(user) : null;
  }
  allow(user, organisation, write = false) {
    return (
      !!user &&
      (user.admin ||
        (write
          ? user.organisations[organisation] === "editor"
          : !!user.organisations[organisation]))
    );
  }
  require(user, organisation, write = false) {
    if (!this.allow(user, organisation, write))
      throw new Problem(403, "You do not have access to this organisation.");
  }
  admin(user) {
    if (!user?.admin)
      throw new Problem(403, "Administrator access is required.");
  }
}
