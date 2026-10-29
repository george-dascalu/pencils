import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";

// Owner request, 29 October 2026 (note-taking research, idea 11): sketches in documents.
test("a sketch is saved as its strokes and an SVG drawn only from their numbers and colours", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-sketch-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Sketches" });
  const stroke = { x: 10, y: 20, color: "#aa3300", strokeWidth: 4, opacity: 1, brush: "pen", pressure: true, points: [[0, 0], [30, 10], [60, 0]], pressures: [0.5, 0.6, 0.5], rawPoints: [[0, 0]], note: "<script>" };
  const saved = await store.sketch(project.id, { strokes: [stroke, { ...stroke, x: 100, color: "#123456" }] });
  assert.match(saved.path, /^attachments\/s-[a-f0-9-]+\.svg$/);
  assert.equal(saved.strokes, saved.path.replace(/\.svg$/, ".json"));
  const svg = (await store.attachment(project.id, path.basename(saved.path))).bytes.toString();
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
  assert.match(svg, /stroke="#aa3300"/);
  assert.match(svg, /stroke="#123456"/);
  assert.doesNotMatch(svg, /script/);
  const { strokes } = JSON.parse((await store.attachment(project.id, path.basename(saved.strokes))).bytes);
  assert.deepEqual(Object.keys(strokes[0]).sort(), ["brush", "color", "opacity", "points", "pressure", "pressures", "strokeWidth", "x", "y"], "only what draws the stroke is kept");
  for (const strokes of [[], "x", [null], [{ ...stroke, color: '"/><script>' }], [{ ...stroke, points: [[0, NaN]] }], [{ ...stroke, x: "1" }], [{ ...stroke, points: [] }], [{ ...stroke, pressures: [2, 0, 0] }], Array(2001).fill(stroke), Array(6).fill({ ...stroke, points: Array(9000).fill([1, 1]), pressures: Array(9000).fill(0.5) })])
    await assert.rejects(store.sketch(project.id, { strokes }), (error) => error.status === 400, JSON.stringify(strokes).slice(0, 50));
  await assert.rejects(store.attachment(project.id, "s-1234.html"), (error) => error.status === 400);
});
