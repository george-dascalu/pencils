import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import "./build-editor.mjs";

const outdir = "dist/public/assets";
await fs.mkdir(outdir, { recursive: true });
const vendor = {
  "/vendor/editor/deps.js": "public/document-editor-deps.js",
  "/vendor/editor/diagrams.js": "public/document-diagrams.js",
  "/vendor/marked.js": "node_modules/marked/lib/marked.esm.js",
  "/vendor/purify.js": "node_modules/dompurify/dist/purify.es.mjs",
  "/vendor/turndown.js": "node_modules/turndown/lib/turndown.browser.es.js",
  "/vendor/turndown-gfm.js": "node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.es.js",
};
const result = await build({
  entryPoints: ["public/app.js", "public/appearance.js"],
  outdir, bundle: true, splitting: true, format: "esm",
  target: ["chrome110", "safari16.4", "firefox115"],
  minify: true, entryNames: "[name]-[hash]", chunkNames: "chunk-[hash]",
  metafile: true,
  plugins: [{
    name: "local-vendor",
    setup(builder) {
      builder.onResolve({ filter: /^\/vendor\// }, ({ path: name }) => ({ path: path.resolve(vendor[name]) }));
    },
  }],
});
const entry = name => "/" + Object.entries(result.metafile.outputs).find(([, value]) => value.entryPoint === `public/${name}.js`)[0].replace("dist/public/", "");
let html = await fs.readFile("public/index.html", "utf8");
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>/g)];
const css = (await Promise.all(styles.map(([, file]) => fs.readFile(`public${file}`, "utf8")))).join("\n");
const cssResult = await build({
  stdin: { contents: css, loader: "css", resolveDir: path.resolve("public") },
  bundle: true, external: ["/fonts/*"], minify: true,
  outdir, entryNames: "styles-[hash]", metafile: true,
});
const cssPath = "/" + Object.keys(cssResult.metafile.outputs)[0].replace("dist/public/", "");
html = html.replace(styles[0][0], `<link rel="stylesheet" href="${cssPath}" />`);
for (const [tag] of styles.slice(1)) html = html.replace(tag, "");
html = html.replace('src="/app.js"', `src="${entry("app")}"`)
  .replace('src="/appearance.js"', `src="${entry("appearance")}"`);
await fs.writeFile("dist/public/index.html", html);
await fs.writeFile("dist/assets-meta.json", JSON.stringify(result.metafile, null, 2));
console.log(`Built ${Object.keys(result.metafile.outputs).length} JavaScript entries/chunks and one stylesheet.`);
