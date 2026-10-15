import test from "node:test";
import assert from "node:assert/strict";
import { hexToHSV, hsvToHex, recentColors } from "../public/color-model.js";
test("visual picker converts primaries, achromatic colours and arbitrary hex accurately", () => {
  for (const [hex, hsv] of [
    ["#ff0000", { h: 0, s: 1, v: 1 }],
    ["#00ff00", { h: 120, s: 1, v: 1 }],
    ["#0000ff", { h: 240, s: 1, v: 1 }],
    ["#ffffff", { h: 0, s: 0, v: 1 }],
    ["#000000", { h: 0, s: 0, v: 0 }],
  ]) {
    assert.deepEqual(hexToHSV(hex), hsv);
    assert.equal(hsvToHex(hsv), hex);
  }
  for (const hex of ["#edc48b", "#123abc", "#7755aa", "#808080", "#abcdef"])
    assert.equal(hsvToHex(hexToHSV(hex)), hex);
  assert.equal(hsvToHex({ h: 360, s: 1, v: 1 }), "#ff0000");
  assert.equal(hsvToHex({ h: 30, s: 0.5, v: 0.8 }), "#cc9966");
});
test("recent colours are normalized, deduplicated, bounded and reject corrupt storage", () => {
  assert.deepEqual(
    recentColors(["#ABCDEF", "#123abc", "#abcdef", "bad", null], "#123ABC"),
    ["#123abc", "#abcdef"],
  );
  assert.deepEqual(recentColors({ bad: true }), []);
  assert.deepEqual(recentColors([["#123abc"], 123, {}]), []);
  assert.equal(
    recentColors(
      Array.from(
        { length: 20 },
        (_, i) => `#${i.toString(16).padStart(6, "0")}`,
      ),
    ).length,
    6,
  );
});
