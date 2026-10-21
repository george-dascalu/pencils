import fs from "node:fs";
if (fs.existsSync("node_modules/esbuild")) {
  if (fs.existsSync("scripts/build-editor.mjs"))
    await import("./build-editor.mjs");
  if (fs.existsSync("server/http/application.ts"))
    await import("./build-server.mjs");
}
