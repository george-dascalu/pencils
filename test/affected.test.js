import test from "node:test";
import assert from "node:assert/strict";
import { affected, phases } from "../scripts/affected.mjs";

test("a view's own code runs its area and the shared UI checks", () => {
  const plan = affected(["public/calendar.js"]);
  assert.equal(plan.all, false);
  assert.deepEqual(plan.paths, ["e2e/planning", "e2e/ui"]);
  assert.equal(plan.heavy, false);
});

test("component CSS maps like its code; shared styling runs everything", () => {
  assert.deepEqual(affected(["public/table-tools.css"]).paths, ["e2e/lists", "e2e/ui"]);
  for (const file of ["public/controls.css", "public/styles.css", "public/project-layout.css", "public/app.js", "server/store.js", "e2e/fixtures.mjs", "package.json"])
    assert.equal(affected([file]).all, true, file);
});

test("a file the map doesn't know runs everything", () => {
  const plan = affected(["public/brand-new-thing.js"]);
  assert.equal(plan.all, true);
  assert.match(plan.reasons.join("\n"), /brand-new-thing\.js.*not mapped/);
});

test("board data and storage code add the heavy scale tests, which live in e2e/platform", () => {
  assert.equal(affected(["public/canvas.js"]).heavy, true);
  assert.deepEqual(affected(["public/canvas.js"]).paths, ["e2e/board", "e2e/platform", "e2e/ui"]);
  assert.equal(affected(["e2e/platform/canvas-large-board.spec.mjs"]).heavy, true, "an edited heavy spec runs its heavy tests");
  assert.equal(affected(["server/canvas.js"]).heavy, true);
  assert.equal(affected(["server/recovery.js"]).heavy, true, "any server change");
  assert.equal(affected(["public/selection-toolbar.js"]).heavy, true, "a heavy test checks the toolbar with thousands selected");
  assert.equal(affected(["public/color-picker.css"]).heavy, false);
});

test("a changed spec runs itself; docs and unit tests need no browser tests", () => {
  assert.deepEqual(affected(["e2e/lists/table-tools.spec.mjs"]).paths, ["e2e/lists/table-tools.spec.mjs"]);
  const none = affected(["CHANGELOG.md", "AGENTS.md", "test/store.test.js", "scripts/affected.mjs"]);
  assert.equal(none.all, false);
  assert.deepEqual(none.paths, []);
});

test("several areas combine, and a spec inside a chosen area is not listed twice", () => {
  assert.deepEqual(affected(["public/calendar.js", "public/document-editor.js", "e2e/planning/timeline-weekends.spec.mjs"]).paths, ["e2e/documents", "e2e/planning", "e2e/ui"]);
});

test("a helper runs every area whose code imports it, directly or through other modules", () => {
  // grid-model.js is the Table's model and also used by board grids (canvas.js, frame-model.js).
  const paths = affected(["public/grid-model.js"]).paths;
  for (const area of ["e2e/board", "e2e/lists", "e2e/ui"]) assert.ok(paths.includes(area), `${area} in ${paths}`);
  assert.equal(affected(["public/grid-model.js"]).all, false, "app.js and features.js, which import nearly everything, don't widen it to every test");
});

test("a deleted spec is dropped instead of becoming a filter that matches nothing", () => {
  assert.deepEqual(affected(["e2e/lists/removed-long-ago.spec.mjs"]).paths, []);
});

// F0.21-94: faster releases. A change's own lines decide whether WebKit runs, and whether a
// shared file's change reaches only some areas.
const edit = (after, lines, before = after) => () => ({ before, after, added: lines, removed: [] });

test("WebKit (the ios project) runs only when touch or phone code changes", () => {
  assert.equal(affected(["public/calendar.js"]).touch, true, "unknown changes run it");
  const plain = "export const a = 1;\nexport const b = 2;\n";
  assert.equal(affected(["public/calendar.js"], { changes: edit(plain, [2]) }).touch, false);
  const coarse = "@media (pointer: coarse) {\n  .x { padding: 4px; }\n}\n";
  assert.equal(affected(["public/calendar.css"], { changes: edit(coarse, [2]) }).touch, true, "inside a touch media query");
  assert.equal(affected(["public/phone-board-tools.js"], { changes: edit(plain, [2]) }).touch, true, "a phone module");
  assert.equal(affected(["server/store.js"], { changes: edit(plain, [2]) }).touch, false, "server code runs every Chromium test, not WebKit");
  assert.equal(affected(["e2e/fixtures.mjs"], { changes: edit(plain, [2]) }).touch, true, "test infrastructure runs both");
  const spec = 'onDevices(["phone"], () => test("x", async () => {}));\n';
  assert.equal(affected(["e2e/lists/group-by-tag.spec.mjs"], { changes: edit(spec, [1]) }).touch, true, "a spec with phone tests");
});

test("a shared stylesheet's scoped rule runs the areas and specs that use its selectors", () => {
  const css = ".a { color: red; }\n.week-board-card { border: 1px solid; }\n.b { color: blue; }\n";
  const plan = affected(["public/project-layout.css"], { changes: edit(css, [2]) });
  assert.equal(plan.all, false, plan.reasons.join("\n"));
  assert.ok(plan.paths.includes("e2e/planning"), plan.paths.join(" "));
  assert.ok(plan.paths.includes("e2e/ui"));
  // Markup that shared code builds shows in every view, so its styling runs everything.
  const shell = ".toolbar .view-controls {\n  display: flex;\n}\n";
  assert.equal(affected(["public/project-layout.css"], { changes: edit(shell, [2]) }).all, true, "view-controls is built by app.js");
});

test(":is(), :where() and :has() lists run everything, and :not() never narrows", () => {
  const inputs = ":is(input, select):not(.title-input) {\n  font-size: 14px;\n}\n";
  assert.equal(affected(["public/controls.css"], { changes: edit(inputs, [2]) }).all, true, "every input");
  const list = ":is(.icon-button, .tree-toggle) {\n  width: 32px;\n}\n";
  assert.equal(affected(["public/controls.css"], { changes: edit(list, [2]) }).all, true);
});

test("touch styling is found by its media query however far above the change it starts", () => {
  const css = `@media (pointer: coarse) {\n${".x { color: red; }\n".repeat(30)}}\n`;
  assert.equal(affected(["public/calendar.css"], { changes: edit(css, [28]) }).touch, true);
});

test("root tokens, element-wide rules and widely used classes in shared styling still run everything", () => {
  const root = ":root {\n  --gap: 4px;\n}\n";
  assert.equal(affected(["public/controls.css"], { changes: edit(root, [2]) }).all, true, ":root");
  const element = "button:hover {\n  color: red;\n}\n";
  assert.equal(affected(["public/styles.css"], { changes: edit(element, [2]) }).all, true, "every button");
  const common = ".icon-button {\n  color: red;\n}\n";
  assert.equal(affected(["public/styles.css"], { changes: edit(common, [2]) }).all, true, "a class used across the app");
});

test("a shared script's change runs everything, markup lines included", () => {
  const logic = "function f(a) {\n  return a + 1;\n}\n";
  assert.equal(affected(["public/app.js"], { changes: edit(logic, [2]) }).all, true, "logic");
  const guard = 'if (event.key === "Escape" && document.querySelector(".week-board-card")) return;\n';
  assert.equal(affected(["public/app.js"], { changes: edit(guard, [1]) }).all, true, "logic that looks up markup is still logic");
  const markup = 'const x = `<span class="range-trigger">`;\n';
  assert.equal(affected(["public/project-layout.js"], { changes: edit(markup, [1]) }).all, true, "markup a shared module builds may show in any view");
});

test("release runs go in two phases that fail fast: changed specs and e2e/ui first, then the rest once", () => {
  const plan = affected(["public/calendar.js", "e2e/lists/group-by-tag.spec.mjs"], { changes: edit("x\n", [1]) });
  const [first, rest] = phases(plan);
  assert.deepEqual(first, ["e2e/lists/group-by-tag.spec.mjs", "e2e/ui"]);
  assert.ok(rest.includes("e2e/planning") && !rest.includes("e2e/ui") && !rest.includes("e2e/lists/group-by-tag.spec.mjs"), rest.join(" "));
  const all = phases(affected(["server/store.js"]))[1];
  assert.ok(!all.includes("e2e/ui") && all.includes("e2e/board") && !all.includes("e2e/helpers"), all.join(" "));
  const inside = phases(affected(["e2e/planning/week-board.spec.mjs", "public/calendar.js"], { changes: edit("x\n", [1]) }))[1];
  assert.ok(!inside.includes("e2e/planning") && inside.includes("e2e/planning/timeline-toolbar.spec.mjs") && !inside.includes("e2e/planning/week-board.spec.mjs"), "the rest of an area whose spec ran first");
});
