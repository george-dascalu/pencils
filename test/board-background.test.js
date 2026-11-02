import test from "node:test";
import assert from "node:assert/strict";
import { paintBoardBackground } from "../public/board-background.js";

test("dots fade before their screen spacing becomes too small to render", () => {
  const el = { style: {} }, settings = { pattern: "dots", spacing: 20 };
  paintBoardBackground(el, settings, { x: 11, y: -7, z: 1 });
  assert.match(el.style.backgroundImage, /radial-gradient/);
  assert.equal(el.style.backgroundSize, "20px 20px");
  paintBoardBackground(el, settings, { x: 11, y: -7, z: .3 });
  assert.match(el.style.backgroundImage, /50%/);
  for (const z of [.2, .12, .03, .01]) {
    paintBoardBackground(el, settings, { x: 11, y: -7, z });
    assert.equal(el.style.backgroundImage, "none");
    assert.equal(el.style.backgroundPosition, "11px -7px");
  }
  paintBoardBackground(el, settings);
  assert.match(el.style.backgroundImage, /radial-gradient/);
});
