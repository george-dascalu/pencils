import test from "node:test";
import assert from "node:assert/strict";
import { affected } from "../scripts/affected.mjs";

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
