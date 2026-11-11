// F0.21-73: each project keeps its own list of tags, edited in its settings.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { schema } from "../server/model.js";
import { editTag } from "../server/project-tags.js";
import { projectTags, tagColor } from "../public/project-tags.js";
import { PALETTE } from "../public/color-model.js";

test("a project's tags are its list in order, then tags only its cards use, A to Z", () => {
  const config = { tags: [{ name: "ux", color: "#aed7dc" }, { name: "api" }] };
  const tasks = [{ tags: ["zeta", "api"] }, { tags: ["Beta"] }, {}];
  assert.deepEqual(projectTags(config, tasks).map((t) => t.name), ["ux", "api", "Beta", "zeta"]);
  assert.equal(tagColor(config, "ux"), "#aed7dc");
  // A tag without a colour of its own takes one of the palette's, always the same for its name (F0.23-22).
  assert.ok(PALETTE.some(([color]) => color === tagColor(config, "zeta") && color !== "#ffffff"));
  assert.equal(tagColor(config, "zeta"), tagColor({}, "zeta"));
  assert.ok(new Set(["api", "Beta", "zeta", "design", "marketing", "q4"].map((name) => tagColor({}, name))).size > 2);
  // White, the picker's "no colour", is a choice: that tag keeps the plain chip.
  assert.equal(tagColor({ tags: [{ name: "plain", color: "#ffffff" }] }, "plain"), "#ffffff");
  assert.deepEqual(projectTags({}, []), []);
});

test("a project schema keeps unique tag names with optional colours", () => {
  const tags = [{ name: "ux", color: "#AED7DC" }, { name: "api" }];
  assert.deepEqual(schema({ tags }).tags, tags);
  assert.equal(schema({}).tags, undefined);
  for (const bad of ["ux", [{ name: "" }], [{ name: "a,b" }], [{ name: "x".repeat(81) }], [{ name: "a" }, { name: "a" }], [{ name: "a", color: "red" }], [{ name: " a" }], [{ name: "a", extra: 1 }]])
    assert.throws(() => schema({ tags: bad }), /Tags/, JSON.stringify(bad));
});

test("renaming a tag changes every card with it and keeps its colour; a rename onto another merges; deleting removes it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-tags-"));
  try {
    const s = new Store(root);
    await s.init();
    let project = await s.createProject({ title: "Tags" });
    const a = await s.createTask(project.id, { title: "A", tags: ["ux", "api"] });
    const b = await s.createTask(project.id, { title: "B", tags: ["ux"] });
    const c = await s.createTask(project.id, { title: "C", tags: ["api"] });
    project = await s.updateProject(project.id, { revision: project.revision, schema: { ...project.schema, tags: [{ name: "ux", color: "#aed7dc" }] } });
    const tagsOf = async () => Object.fromEntries((await s.snapshot(project.id)).tasks.map((t) => [t.title, t.tags]));

    await assert.rejects(() => editTag(s, project.id, { revision: "stale", tag_edit: { from: "ux", to: "design" } }), (e) => e.status === 409);
    await assert.rejects(() => editTag(s, project.id, { revision: project.revision, tag_edit: { from: "ux", to: "a,b" } }), /Tag/);
    let result = await editTag(s, project.id, { revision: project.revision, tag_edit: { from: "ux", to: "design" } });
    assert.equal(result.count, 2);
    assert.deepEqual(result.project.schema.tags, [{ name: "design", color: "#aed7dc" }]);
    assert.deepEqual(await tagsOf(), { A: ["design", "api"], B: ["design"], C: ["api"] });

    result = await editTag(s, result.project.id, { revision: result.project.revision, tag_edit: { from: "api", to: "design" } });
    assert.equal(result.count, 2);
    assert.deepEqual(result.project.schema.tags, [{ name: "design", color: "#aed7dc" }], "merged into the listed tag");
    assert.deepEqual(await tagsOf(), { A: ["design"], B: ["design"], C: ["design"] });

    result = await editTag(s, result.project.id, { revision: result.project.revision, tag_edit: { from: "design", to: null } });
    assert.equal(result.count, 3);
    assert.deepEqual(result.project.schema.tags, []);
    assert.deepEqual(await tagsOf(), { A: [], B: [], C: [] });
    assert.ok([a, b, c].every(Boolean));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a rename that one card refuses changes no card and names the card", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-tags-"));
  try {
    const s = new Store(root);
    await s.init();
    const project = await s.createProject({ title: "Rollback" });
    const good = await s.createTask(project.id, { title: "Good", tags: ["ux"] });
    const bad = await s.createTask(project.id, { title: "Broken card", tags: ["ux"] });
    // The second card's save fails, as one edited elsewhere meanwhile would.
    const update = s.updateTask.bind(s);
    s.updateTask = (projectId, id, input) => id === bad.id ? Promise.reject(Object.assign(new Error("This card changed elsewhere."), { status: 409 })) : update(projectId, id, input);
    await assert.rejects(() => s.mutate(() => editTag(s, project.id, { revision: project.revision, tag_edit: { from: "ux", to: "design" } })), /Broken card/);
    const after = await s.snapshot(project.id);
    assert.deepEqual(after.tasks.find((t) => t.id === good.id).tags, ["ux"], "the earlier card is rolled back");
    assert.equal(after.project.revision, project.revision);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

