// F0.22-25: a project can auto-assign the cards people create in the app to one of its people.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";

test("new cards go to the project's auto-assignee unless they name one, and only while that person is in the project", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-auto-assign-"));
  try {
    const s = new Store(root);
    await s.init();
    const org = await s.createOrganisation({ title: "Studio", people: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }] });
    const project = await s.createProject({ title: "Auto", organisation: org.id, people: ["a", "b"], schema: { default_assignee: "b" } });
    const made = (input, internal) => s.createTask(project.id, { title: "Card", ...input }, internal);
    assert.equal((await made({}, { assign: true })).assignee, "Bob");
    assert.equal((await made({}, { assign: true })).assignee_id, "b");
    assert.equal((await made({ assignee: "Alice" }, { assign: true })).assignee, "Alice", "a named assignee wins");
    assert.equal((await made({ assignee: "" }, { assign: true })).assignee, "", "an explicit Unassigned stays");
    assert.equal((await made({})).assignee, "", "imports and other writers keep what they bring");
    // With subtasks the card is assigned, and its new subtasks are left to be assigned.
    await made({ title: "Bundle", subtasks: [{ title: "Step", type: "task" }] }, { assign: true });
    const tasks = (await s.snapshot(project.id)).tasks;
    assert.equal(tasks.find((t) => t.title === "Bundle").assignee, "Bob");
    assert.equal(tasks.find((t) => t.title === "Step").assignee, "");
    // With the Assignee field off, nobody is assigned.
    const off = await s.updateProject(project.id, { revision: project.revision, schema: { ...project.schema, off: ["assignee"] } });
    assert.equal((await made({}, { assign: true })).assignee, "");
    const on = await s.updateProject(project.id, { revision: off.revision, schema: { ...off.schema, off: undefined } });
    // A person no longer in the project isn't assigned, and the card is still made.
    const fewer = await s.updateProject(project.id, { revision: on.revision, people: ["a"] });
    assert.equal((await made({}, { assign: true })).assignee, "");
    await assert.rejects(
      () => s.updateProject(project.id, { revision: fewer.revision, schema: { ...fewer.schema, default_assignee: "not an id!" } }),
      /auto-assign/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
