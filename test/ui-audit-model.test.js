import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { readableText, nodeFill } from "../public/node-layout.js";
import { staticAssets } from "../server/static-assets.js";

const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
test("automatic object text meets 4.5:1 across pale, saturated and dark fills", () => {
  for (const fill of ["#f4e1a1", "#f5e7a2", "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#777777", "#663399"]) {
    const light = luminance(fill), text = luminance(readableText(fill));
    assert.ok((Math.max(light, text) + .05) / (Math.min(light, text) + .05) >= 4.5, fill);
  }
  assert.equal(nodeFill({ type: "task", displayAs: "note" }), "#f5e7a2");
});
test("static assets negotiate compression, validate caches, update source assets and preserve offline files", async () => {
  const root = await fs.mkdtemp("/tmp/pencils-static-");
  const publicDir = `${root}/public`, builtDir = `${root}/built`;
  await fs.mkdir(publicDir, { recursive: true });
  await fs.mkdir(`${builtDir}/assets`, { recursive: true });
  const original = "/* compressed */".repeat(200);
  await fs.writeFile(`${builtDir}/assets/app-ABCDEFG1.js`, original);
  await fs.writeFile(`${publicDir}/drawing-offline.js`, "offline");
  await fs.writeFile(`${builtDir}/index.html`, "<p>Built shell</p>");
  const serve = staticAssets({ publicDir, builtDir, vendor: {}, mime: { ".js": "text/javascript", ".html": "text/html" }, production: true });
  const request = async (url, headers = {}, method = "GET") => {
    const result = {};
    result.found = await serve({ method, headers }, {
      writeHead(status, headers) { Object.assign(result, { status, headers }); },
      end(body) { result.body = body; },
    }, url, {});
    return result;
  };
  try {
    for (const [encoding, decode] of [["br", brotliDecompressSync], ["gzip", gunzipSync]]) {
      const result = await request("/assets/app-ABCDEFG1.js", { "accept-encoding": encoding });
      assert.equal(result.headers["Content-Encoding"], encoding);
      assert.match(result.headers["Cache-Control"], /immutable/);
      assert.equal(decode(result.body).toString(), original);
      const cached = await request("/assets/app-ABCDEFG1.js", { "if-none-match": result.headers.ETag });
      assert.equal(cached.status, 304);
    }
    const raw = await request("/assets/app-ABCDEFG1.js", { "accept-encoding": "br;q=0, gzip;q=0" });
    assert.equal(raw.headers["Content-Encoding"], undefined);
    assert.equal(raw.body.toString(), original);
    assert.equal((await request("/")).body.toString(), "<p>Built shell</p>");
    assert.equal((await request("/drawing-offline.js")).body.toString(), "offline");
    await fs.writeFile(`${publicDir}/drawing-offline.js`, "updated offline");
    assert.equal((await request("/drawing-offline.js")).body.toString(), "updated offline");
    assert.equal((await request("/../outside")).found, false);
    assert.equal((await request("/missing.js")).found, false);
    assert.equal((await request("/assets/app-ABCDEFG1.js", {}, "HEAD")).body, undefined);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
