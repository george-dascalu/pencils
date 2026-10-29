import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Problem } from "./problem.js";
import { sourceAccess } from "./sources.js";

// Phone quick capture (owner request, 29 Oct 2026): an iOS Shortcut posts text with a token made in
// Settings → You, and the text becomes a card in the token's project. Tokens are kept only as
// SHA-256 hashes, act as their owner with that person's access checked on every capture, and can
// only add cards.
const hash = (token) => createHash("sha256").update(String(token)).digest("hex");
const TAG = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;

// The first line is the title (without its #tags), the rest the description; #tags and "inbox" tag it.
export function captureCard(text) {
  const [first, ...rest] = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const tags = [...new Set([...text.matchAll(TAG)].map((m) => m[1]).filter((t) => t.length <= 80))].slice(0, 29);
  const title = first.replace(TAG, "").trim() || first.trim();
  return {
    title: title.slice(0, 300),
    body: title.length > 300 ? text.trim() : rest.join("\n").trim(),
    tags: [...tags.filter((t) => t !== "inbox"), "inbox"],
  };
}

export class Capture {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
    this.file = path.join(store.root, ".pencils", "capture-tokens.json");
    this.attempts = new Map();
  }
  async tokens() {
    await this.store.safe(this.file);
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  async save(tokens) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
  // The project a token may add cards to, if this person can still add cards there.
  async project(user, id) {
    let record;
    try {
      record = await this.store.read(this.store.file(id, "project"));
    } catch {
      throw new Problem(404, "Project not found.");
    }
    if (record.data.personal) throw new Problem(400, "Choose a team project; your personal space has no cards.");
    if (!this.auth.allow(user, record.data.organisation, true) || !sourceAccess(user, record.data))
      throw new Problem(403, "You can't add cards to this project.");
    return record.data;
  }
  async list(user) {
    return (await this.tokens()).filter((t) => t.username === user.username).map(({ id, project, created }) => ({ id, project, created }));
  }
  async create(user, project) {
    if (typeof project !== "string") throw new Problem(400, "Choose a project.");
    await this.project(user, project);
    const tokens = await this.tokens();
    if (tokens.filter((t) => t.username === user.username).length >= 10) throw new Problem(400, "Revoke a capture token before making another.");
    const token = randomBytes(32).toString("base64url"), entry = { id: randomUUID(), username: user.username, project, created: new Date().toISOString() };
    await this.save([...tokens, { ...entry, hash: hash(token) }]);
    return { ...entry, token };
  }
  async revoke(user, id) {
    const tokens = await this.tokens();
    if (!tokens.some((t) => t.id === id && t.username === user.username)) throw new Problem(404, "Capture token not found.");
    await this.save(tokens.filter((t) => t.id !== id));
    return { ok: true };
  }
  async capture(authorization, input, address) {
    const now = Date.now(), recent = (this.attempts.get(address) || []).filter((t) => t > now - 60_000);
    if (recent.length >= 30) throw new Problem(429, "Too many captures. Try again in a minute.");
    this.attempts.set(address, [...recent, now]);
    if (this.attempts.size > 10000) this.attempts.delete(this.attempts.keys().next().value);
    const token = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(authorization || "")?.[1];
    const text = input?.text;
    // Checked in the store's queue, so a token revoked or access removed just before still stops it.
    return this.store.mutate(async () => {
      const entry = token && (await this.tokens()).find((t) => t.hash === hash(token));
      const account = entry && (this.auth.enabled ? (await this.auth.accounts()).find((u) => u.username === entry.username) : { username: entry.username, admin: true, organisations: {} });
      if (!account) throw new Problem(401, "Unknown capture token. Make a new one in Settings → You.");
      if (typeof text !== "string" || !text.trim() || text.length > 50_000) throw new Problem(400, "Send the text to capture, up to 50,000 characters.");
      await this.project(this.auth.public(account), entry.project);
      const card = await this.store.createTask(entry.project, captureCard(text));
      return { id: card.id, key: card.key, title: card.title, project: entry.project };
    });
  }
}
