// Owner request (F0.22-92): no scroll container in the app bounces past its edges (iOS's rubber band),
// in a view, a dialog, a panel or a menu. Every rule that lets an element scroll an axis
// (overflow auto or scroll) stops that axis with overscroll-behavior in the same rule.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function unstopped(body) {
  const scroll = { x: false, y: false }, stop = { x: false, y: false };
  for (const [, prop, axis, value] of body.matchAll(/(?:^|[;\s])(overflow|overscroll-behavior)(?:-(x|y))?\s*:\s*([^;]+)/g)) {
    const values = value.trim().replace(/\s*!important$/, "").split(/\s+/);
    for (const [a, v] of axis ? [[axis, values[0]]] : [["x", values[0]], ["y", values[1] || values[0]]]) {
      if (prop === "overflow") scroll[a] = /^(auto|scroll)$/.test(v);
      else stop[a] = v === "none";
    }
  }
  return ["x", "y"].filter((a) => scroll[a] && !stop[a]);
}

test("the check sees each axis a rule scrolls", () => {
  assert.deepEqual(unstopped("overflow: auto;"), ["x", "y"]);
  assert.deepEqual(unstopped("overflow: hidden auto; overscroll-behavior-y: none"), []);
  assert.deepEqual(unstopped("overflow-x: auto; overflow-y: hidden; overscroll-behavior: contain"), ["x"]);
  assert.deepEqual(unstopped("overflow-x: scroll; overscroll-behavior-x: none"), []);
  assert.deepEqual(unstopped("overflow: hidden"), []);
});

test("every scrolling rule in public/ stops at its edges", () => {
  const found = [];
  for (const file of fs.readdirSync("public").filter((f) => f.endsWith(".css"))) {
    const css = fs.readFileSync(`public/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const axes = unstopped(m[2]);
      if (axes.length) found.push(`${file}:${css.slice(0, m.index + m[1].length).split("\n").length} ${m[1].trim()} (${axes.join(", ")})`);
    }
  }
  assert.deepEqual(found, []);
});
