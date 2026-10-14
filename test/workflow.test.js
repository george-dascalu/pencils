import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { schema } from "../server/model.js";
import { canTransition, nextStatuses } from "../public/workflow-model.js";
const flow = {
  statuses: ["todo", "doing", "done"],
  done: ["done"],
  initial_status: "todo",
  status_labels: { todo: "Ready", doing: "Working", done: "Complete" },
  transitions: { todo: ["doing"], doing: ["todo", "done"], done: ["doing"] },
};
test("Workflow validates destinations, defaults and labels; unchanged status remains valid", () => {
  const c = schema(flow);
  assert.deepEqual(nextStatuses(c, "todo"), ["todo", "doing"]);
  assert.equal(canTransition(c, "todo", "done"), false);
  assert.equal(canTransition(c, "done", "done"), true);
  assert.throws(
    () => schema({ ...flow, initial_status: "missing" }),
    /Default/,
  );
  assert.throws(
    () =>
      schema({
        ...flow,
        transitions: { ...flow.transitions, todo: ["missing"] },
      }),
    /destinations/,
  );
  assert.throws(
    () => schema({ ...flow, transitions: { todo: [] } }),
    /destinations/,
  );
  assert.throws(
    () => schema({ ...flow, status_labels: { unknown: "Name" } }),
    /Status names/,
  );
  assert.equal(canTransition(schema(), "todo", "done"), true);
});
test("Project workflow persists, enforces transitions and history, protects in-use statuses, and is isolated per project", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-workflow-"));
  const s = new Store(root);
  try {
    await s.init();
    const p = await s.createProject({ title: "Rules", schema: flow });
    const other = await s.createProject({ title: "Free" });
    let t = await s.createTask(p.id, { title: "Work" });
    assert.equal(t.status, "todo");
    await assert.rejects(
      () => s.updateTask(p.id, t.id, { revision: t.revision, status: "done" }),
      /does not allow/,
    );
    assert.equal((await s.snapshot(p.id)).tasks[0].revision, t.revision);
    t = await s.updateTask(p.id, t.id, {
      revision: t.revision,
      status: "doing",
    });
    t = await s.updateTask(p.id, t.id, {
      revision: t.revision,
      status: "done",
    });
    const original = (await s.history(t.file)).find(
      (v) => v.data.status === "todo",
    );
    await assert.rejects(
      () => s.restoreVersion(t.file, original.revision, t.revision),
      /does not allow/,
    );
    const same = await s.updateTask(p.id, t.id, {
      revision: t.revision,
      title: "Same status edit",
      status: "done",
    });
    assert.equal(same.status, "done");
    await assert.rejects(
      () =>
        s.updateProject(p.id, {
          revision: p.revision,
          schema: {
            ...flow,
            statuses: ["todo", "doing"],
            done: ["doing"],
            transitions: null,
            status_labels: {},
          },
        }),
      /status/,
    );
    const free = await s.createTask(other.id, { title: "Free move" });
    assert.equal(
      (
        await s.updateTask(other.id, free.id, {
          revision: free.revision,
          status: "done",
        })
      ).status,
      "done",
    );
    const fresh = new Store(root);
    await fresh.init();
    assert.deepEqual(
      (await fresh.snapshot(p.id)).project.schema.transitions,
      flow.transitions,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
