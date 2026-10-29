import { BOARD_LIMITS } from "../public/board-limits.js";
import { penStyle, strokeMarkup } from "../public/pen-model.js";
import { Problem } from "./problem.js";
import { choice } from "./values.js";

// Pen strokes, checked the same way on boards and in document sketches.
export function checkStroke(node) {
  if (
    !Array.isArray(node.points) ||
    node.points.length > 10000 ||
    node.points.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v) || Math.abs(v) > BOARD_LIMITS.coordinate),
    )
  )
    throw new Problem(400, "Invalid drawing.");
  if (
    node.strokeWidth != null &&
    (!Number.isFinite(node.strokeWidth) ||
      node.strokeWidth < 1 ||
      node.strokeWidth > 32)
  )
    throw new Problem(400, "Invalid pen thickness.");
  if (
    node.opacity != null &&
    (!Number.isFinite(node.opacity) ||
      node.opacity < 0.1 ||
      node.opacity > 1)
  )
    throw new Problem(400, "Invalid pen opacity.");
  if (node.brush != null)
    choice(node.brush, ["pen", "highlighter"], "pen brush");
  if (node.pressure != null && typeof node.pressure !== "boolean")
    throw new Problem(400, "Invalid pen pressure setting.");
  if (
    node.pressures != null &&
    (!Array.isArray(node.pressures) ||
      node.pressures.length !== node.points.length ||
      node.pressures.some((p) => !Number.isFinite(p) || p < 0 || p > 1))
  )
    throw new Problem(400, "Invalid pen pressure samples.");
  if (
    node.sampleTimes != null &&
    (!Array.isArray(node.sampleTimes) ||
      node.sampleTimes.length !== node.points.length ||
      node.sampleTimes.some(
        (v, i) =>
          !Number.isFinite(v) ||
          v < 0 ||
          v > 86400000 ||
          (i > 0 && v < node.sampleTimes[i - 1]),
      ))
  )
    throw new Problem(400, "Invalid pen timing samples.");
  if (
    node.tilts != null &&
    (!Array.isArray(node.tilts) ||
      node.tilts.length !== node.points.length ||
      node.tilts.some(
        (v) =>
          !Array.isArray(v) ||
          v.length !== 2 ||
          v.some((n) => !Number.isFinite(n) || n < -90 || n > 90),
      ))
  )
    throw new Problem(400, "Invalid pen tilt samples.");
}

// A document sketch's strokes, keeping only what draws them.
const SKETCH_FIELDS = ["x", "y", "color", "strokeWidth", "opacity", "brush", "pressure", "points", "pressures"];
export function sketchStrokes(strokes) {
  if (!Array.isArray(strokes) || !strokes.length || strokes.length > 2000 || strokes.reduce((n, s) => n + (Array.isArray(s?.points) ? s.points.length : 0), 0) > 50_000)
    throw new Problem(400, "A sketch holds 1 to 2,000 strokes and up to 50,000 points.");
  return strokes.map((s) => {
    if (
      !s || typeof s !== "object" ||
      ![s.x, s.y].every((v) => Number.isFinite(v) && Math.abs(v) <= BOARD_LIMITS.coordinate) ||
      (s.color != null && !/^#[0-9a-f]{6}$/i.test(s.color)) ||
      !s.points?.length
    )
      throw new Problem(400, "Invalid drawing.");
    checkStroke(s);
    return Object.fromEntries(SKETCH_FIELDS.filter((key) => s[key] != null).map((key) => [key, s[key]]));
  });
}

// The SVG Obsidian and the document show, drawn from checked numbers and colours only, cropped
// to the ink.
export function sketchSVG(strokes) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const s of strokes) {
    const r = penStyle(s).strokeWidth;
    for (const [x, y] of s.points) {
      left = Math.min(left, s.x + x - r);
      top = Math.min(top, s.y + y - r);
      right = Math.max(right, s.x + x + r);
      bottom = Math.max(bottom, s.y + y + r);
    }
  }
  const x = Math.floor(left - 8), y = Math.floor(top - 8), width = Math.ceil(right + 8) - x, height = Math.ceil(bottom + 8) - y;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${strokes.map((s) => `<g transform="translate(${s.x} ${s.y})">${strokeMarkup(s)}</g>`).join("")}</svg>\n`;
}
