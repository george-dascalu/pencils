import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const files = (await fs.readdir("server/http", { recursive: true }))
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
  .map((file) => path.join("server/http", file));
await build({
  entryPoints: files,
  outdir: "server/http",
  outbase: "server/http",
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
});
console.log(`Built ${files.length} TypeScript server modules.`);
