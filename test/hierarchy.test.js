import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { schema } from "../server/model.js";
const rules = {
  mode: "enforced",
  roots: ["epic"],
  children: {
    epic: ["story"],
    story: ["task", "bug"],
    task: [],
    bug: [],
    milestone: [],
  },
};
test("Hierarchy validates configured types", () => {
  assert.throws(
    () => schema({ hierarchy: { ...rules, roots: ["unknown"] } }),
    /hierarchy/,
  );
  assert.throws(
    () => schema({ hierarchy: { ...rules, children: {} } }),
    /hierarchy/,
  );
  assert.equal(schema({ hierarchy: rules }).hierarchy.mode, "enforced");
});
test("Subtask bundles prevalidate, retry without duplicates, and enforce hierarchy on create, reparent, type edits, settings and history", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-hierarchy-"));
  const store = new Store(root);
  try {
    await store.init();
    let project = await store.createProject({
      title: "Strict",
      schema: { hierarchy: rules },
    });
    await assert.rejects(
      () =>
        store.createTask(project.id, { title: "Invalid root", type: "task" }),
      /requires an allowed parent/,
    );
    await assert.rejects(
      () =>
        store.createTask(project.id, {
          title: "Parent",
          type: "epic",
          subtasks: [{ title: "Bad child", type: "task" }],
        }),
      /cannot parent/,
    );
    assert.equal((await store.snapshot(project.id)).tasks.length, 0);
    const input = {
      title: "Parent",
      type: "epic",
      creation_request: "bundle-one",
      subtasks: [
        { title: "First story", type: "story" },
        { title: "Second story", type: "story" },
      ],
    };
    let parent = await store.createTask(project.id, input);
    assert.equal((await store.createTask(project.id, input)).id, parent.id);
    let tasks = (await store.snapshot(project.id)).tasks;
    assert.equal(tasks.length, 3);
    assert.equal(new Set(tasks.map((t) => t.key)).size, 3);
    const child = tasks.find((t) => t.title === "First story");
    assert.equal(child.parent, parent.id);
    await assert.rejects(
      () =>
        store.updateTask(project.id, parent.id, {
          revision: parent.revision,
          type: "story",
        }),
      /requires|cannot parent/,
    );
    await assert.rejects(
      () =>
        store.updateTask(project.id, child.id, {
          revision: child.revision,
          parent: null,
        }),
      /requires/,
    );
    await assert.rejects(
      () =>
        store.updateTask(project.id, child.id, {
          revision: child.revision,
          type: "bug",
        }),
      /cannot parent/,
    );
    await assert.rejects(
      () =>
        store.updateProject(project.id, {
          revision: project.revision,
          schema: {
            hierarchy: { ...rules, children: { ...rules.children, epic: [] } },
          },
        }),
      /Move existing tasks/,
    );
    project = (await store.snapshot(project.id)).project;
    project = await store.updateProject(project.id, {
      revision: project.revision,
      schema: { hierarchy: { ...rules, mode: "free" } },
    });
    let loose = await store.createTask(project.id, {
      title: "Free task",
      type: "task",
    });
    loose = await store.updateTask(project.id, loose.id, {
      revision: loose.revision,
      type: "epic",
    });
    const old = (await store.history(loose.file)).find(
      (v) => v.data.type === "task",
    );
    project = (await store.snapshot(project.id)).project;
    await store.updateProject(project.id, {
      revision: project.revision,
      schema: { hierarchy: rules },
    });
    await assert.rejects(
      () => store.restoreVersion(loose.file, old.revision, loose.revision),
      /requires/,
    );
    const count = (await store.snapshot(project.id)).tasks.length;
    const write = store.write.bind(store);
    let writes = 0;
    store.write = async (file, ...args) => {
      if (file.includes("/tasks/") && ++writes === 2)
        throw new Error("Simulated disk failure");
      return write(file, ...args);
    };
    await assert.rejects(
      () =>
        store.createTask(project.id, {
          ...input,
          creation_request: "bundle-failure",
        }),
      /disk failure/,
    );
    store.write = write;
    assert.equal((await store.snapshot(project.id)).tasks.length, count);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
