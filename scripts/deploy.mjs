// Deploys the working tree to the running Pencils container (used by npm run release).
import { spawn } from "node:child_process";
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
  env = { ...env, ...production, VAULT_PATH: vaultMount.Source, OBSIDIAN_CONTAINER_ROOT: production.OBSIDIAN_ROOT || "", ...(binding ? { PORT: binding.HostPort, BIND_ADDRESS: binding.HostIp || "0.0.0.0" } : {}), ...(uid ? { LOCAL_UID: uid } : {}), ...(gid ? { LOCAL_GID: gid } : {}) };
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
