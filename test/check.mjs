import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const dir of ["server", "public", "test"])
  for (const file of await fs.readdir(dir)) {
    if (!/\.(m?js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ["--check", `${dir}/${file}`], {
      stdio: "inherit",
    });
    if (result.status) process.exit(result.status);
  }
console.log("All JavaScript modules pass syntax checks.");
