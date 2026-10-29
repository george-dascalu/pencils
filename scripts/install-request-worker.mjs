import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const unitDir = path.join(os.homedir(), ".config/systemd/user");
// systemd uses its own quoting, not shell interpolation.
const quoted = value => `"${value.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
await fs.mkdir(unitDir, { recursive: true });
await fs.writeFile(path.join(unitDir, "pencils-request-worker.service"), `[Unit]\nDescription=Pencils feature request worker\nAfter=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${root.replaceAll("%", "%%")}\nExecStart=${quoted(process.execPath)} ${quoted(path.join(root, "scripts/request-worker.mjs"))}\nEnvironment=${quoted(`PATH=${process.env.PATH}`)}\nRestart=on-failure\nRestartSec=15\nKillMode=control-group\nTimeoutStopSec=20\n\n[Install]\nWantedBy=default.target\n`);
execFileSync("systemd-analyze", ["--user", "verify", path.join(unitDir, "pencils-request-worker.service")], { stdio: "inherit" });
execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
execFileSync("systemctl", ["--user", "enable", "--now", "pencils-request-worker.service"], { stdio: "inherit" });
console.log("Feature request worker enabled. Its connection and sign-in status appear in Help → Feature requests.");
