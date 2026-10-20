import { build } from "esbuild";

await build({
  entryPoints: {
    deps: "public/document-editor-deps.js",
    diagrams: "public/document-diagrams.js",
  },
  outdir: "dist/public/vendor/editor",
  bundle: true, splitting: true, format: "esm",
  target: ["chrome110", "safari16.4", "firefox115"],
  minify: true, chunkNames: "chunk-[hash]",
});
