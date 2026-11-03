// Deploys the working tree to the running Pencils container (used by npm run release).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const childEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "DOCKER_HOST", "DOCKER_CONTEXT"].includes(key)));

export function command(command, args, { cwd = projectRoot, log, timeout = 30 * 60 * 1000, signal, env = childEnvironment() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let output = "", expired = false, killing;
    const stop = () => {
      expired = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killing = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
      killing.unref();
    };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    const receive = chunk => { output = (output + chunk).slice(-1000000); if (log) log.write(chunk); };
    child.stdout.on("data", receive); child.stderr.on("data", receive);
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(timer); clearTimeout(killing); signal?.removeEventListener("abort", stop);
      if (code === 0 && !expired) resolve(output);
      else reject(new Error(`${command} ${args[0] || ""} ${expired ? "was interrupted or timed out" : `exited with ${code}`}. See the release log.`));
    });
  });
}

// The vault to mount. A drive remounted at another path leaves the recorded vault missing, and Docker
// recreates it as an empty folder owned by root that Pencils cannot start in. When the recorded vault
// was this repository's own vault/ at its old path (oldRoot), use the one beside the repository now.
export function vaultSource(recorded, oldRoot, root) {
  // Only a missing folder counts as gone: one the release cannot read may still hold the vault.
  const holdsFiles = dir => {
    try { return fs.readdirSync(dir).length > 0; }
    catch (error) {
      if (error.code === "ENOENT") return false;
      throw new Error(`Cannot read the vault at ${dir} (${error.code}). Deployment stopped.`);
    }
  };
  if (holdsFiles(recorded)) return recorded;
  const own = path.join(root, "vault");
  if (oldRoot && path.resolve(recorded) === path.join(oldRoot, "vault") && holdsFiles(own)) return own;
  throw new Error(`The vault at ${recorded} is missing or empty. Mount its drive there, or deploy from the folder beside it. Deployment stopped.`);
}

// Retain three distinct Pencils images, counting aliases once. The exact live and
// rollback images take precedence when deploying after a rollback. Legacy release
// tags rank alongside current tags; old previews and rollback aliases retire too.
export function imageRetentionPlan(images, { live, rollback, inUse = [] }) {
  const own = images.filter(image => image.Repository === 'pencils');
  if (own.some(image => !/^sha256:[a-f0-9]{64}$/.test(image.ID) || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(image.Tag)))
    throw new Error('Invalid Pencils image inventory; cleanup stopped.');
  if (![live, rollback].every(id => own.some(image => image.ID === id)))
    throw new Error('The live or rollback image is missing from the inventory; cleanup stopped.');
  const versions = own.flatMap(image => {
    const match = image.Tag.match(/^(?:release-)?(\d+)\.(\d+)\.(\d+)$/);
    return match ? [{ id: image.ID, version: match.slice(1).map(Number) }] : [];
  }).sort((a, b) => {
    for (let i = 0; i < 3; i++) if (a.version[i] !== b.version[i]) return b.version[i] - a.version[i];
    return 0;
  });
  const keep = new Set([live, rollback]);
  for (const image of versions) { if (keep.size >= 3) break; keep.add(image.id); }
  const used = new Set(inUse), skipped = new Set(), remove = new Set();
  for (const image of own) if (!keep.has(image.ID)) {
    if (used.has(image.ID)) skipped.add(image.ID);
    else remove.add(`pencils:${image.Tag}`);
  }
  return { keep: [...keep], remove: [...remove], skipped: [...skipped] };
}

// Called only after deploy has verified the new version. No daemon-wide prune,
// forced removals, containers or volumes: delete explicit Pencils references only.
export async function pruneReleaseImages(run, { version, health }) {
  if (!health?.ok || health.version !== version) throw new Error('Image cleanup requires the healthy new release.');
  const container = (await run('docker', ['compose', 'ps', '-q', 'pencils'])).trim();
  if (!container) throw new Error('No live Pencils container; cleanup stopped.');
  const live = (await run('docker', ['container', 'inspect', '--format', '{{.Image}}', container])).trim();
  const rollback = (await run('docker', ['image', 'inspect', '--format', '{{.Id}}', `pencils:rollback-before-${version}`])).trim();
  const rows = (await run('docker', ['image', 'ls', '--filter', 'reference=pencils:*', '--no-trunc', '--format', '{{json .}}'])).trim().split('\n').filter(Boolean).map(row => JSON.parse(row));
  if (!rows.some(image => image.Repository === 'pencils' && image.Tag === `release-${version}` && image.ID === live))
    throw new Error('The live image no longer matches this release; cleanup stopped.');
  const containers = (await run('docker', ['container', 'ls', '--all', '--quiet'])).trim().split(/\s+/).filter(Boolean);
  const inUse = containers.length ? (await run('docker', ['container', 'inspect', '--format', '{{.Image}}', ...containers])).trim().split('\n') : [];
  const plan = imageRetentionPlan(rows, { live, rollback, inUse });
  const result = { keep: plan.keep, skipped: plan.skipped, removed: 0, errors: [] };
  for (let i = 0; i < plan.remove.length; i += 50) {
    const batch = plan.remove.slice(i, i + 50);
    try { await run('docker', ['image', 'rm', '--no-prune', ...batch]); result.removed += batch.length; }
    catch (error) { result.errors.push(error.message); }
  }
  return result;
}

export async function deploy(root, version, { log, signal, url, rollback = `pencils:rollback-request-${Date.now()}` } = {}) {
  let env = childEnvironment();
  const run = (cmd, args, opts = {}) => command(cmd, args, { cwd: root, log, signal, env, ...opts });
  const container = (await run("docker", ["compose", "ps", "-q", "pencils"])).trim();
  if (!container) throw new Error("The existing Pencils container is not running. The prepared changes have not been deployed.");
  // Keep the exact deployed vault/auth/provider settings, including installations
  // originally started with a temporary --env-file. Never write these to logs.
  const [running] = JSON.parse(await command("docker", ["inspect", container], { cwd: root, signal }));
  const image = running.Image;
  const production = Object.fromEntries(running.Config.Env.map(item => { const i = item.indexOf("="); return [item.slice(0, i), item.slice(i + 1)]; }));
  const vaultMount = running.Mounts.find(m => m.Destination === "/data" && m.Type === "bind");
  if (!vaultMount) throw new Error("Cannot identify the existing vault bind mount. Deployment stopped.");
  const binding = running.HostConfig.PortBindings["3000/tcp"]?.[0];
  const [uid, gid] = running.Config.User.split(":");
  const vault = vaultSource(vaultMount.Source, running.Config.Labels?.["com.docker.compose.project.working_dir"], root);
  env = { ...env, ...production, VAULT_PATH: vault, OBSIDIAN_CONTAINER_ROOT: production.OBSIDIAN_ROOT || "", ...(binding ? { PORT: binding.HostPort, BIND_ADDRESS: binding.HostIp || "0.0.0.0" } : {}), ...(uid ? { LOCAL_UID: uid } : {}), ...(gid ? { LOCAL_GID: gid } : {}) };
  const compose = args => run("docker", ["compose", "--env-file", "/dev/null", ...args]);
  await run("docker", ["tag", image, rollback]);
  await compose(["build", "pencils"]);
  try {
    await compose(["up", "-d", "--no-deps", "pencils"]);
    for (let i = 0; i < 45; i++) {
      try {
        const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
        if (health.ok && health.version === version) return rollback;
      } catch {}
      await delay(1000);
    }
    throw new Error("The new release did not become healthy.");
  } catch (e) {
    await run("docker", ["tag", rollback, "pencils:local"], { signal: undefined });
    await run("docker", ["compose", "--env-file", "/dev/null", "up", "-d", "--no-deps", "pencils"], { signal: undefined });
    throw new Error(`${e.message} Restored the previous container image (${rollback}).`);
  }
}
