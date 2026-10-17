import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Automations } from "../server/automations.js";
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-automation-")),
    store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Automation" }),
    service = new Automations(store, { enabled: false });
  store.automations = service;
  t.after(async () => {
    service.close();
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { store, project, service };
}
const rule = (patch = {}) => ({
  id: "r1",
  name: "Set priority",
  trigger: "manual",
  field: "priority",
  value: "high",
  enabled: false,
  ...patch,
});
test("automation previews, disabled switch, stale checks and run logs", async (t) => {
  const { store, project, service } = await fixture(t),
    task = await store.createTask(project.id, { title: "Task" });
  await service.configure(project.id, [rule()], { username: "local" });
  const preview = await service.run(project.id, "r1");
  assert.equal(preview.changes.length, 1);
  assert.equal((await store.snapshot(project.id)).tasks[0].priority, "none");
  await assert.rejects(
    service.run(project.id, "r1", { preview: false }),
    /Enable/,
  );
  await service.configure(project.id, [rule({ enabled: true })], {
    username: "local",
  });
  await store.updateTask(project.id, task.id, {
    revision: task.revision,
    body: "Changed after preview",
  });
  await assert.rejects(
    service.run(project.id, "r1", {
      preview: false,
      revisions: { [task.id]: task.revision },
    }),
    (e) => e.status === 409,
  );
  const result = await store.mutate(() =>
    service.run(project.id, "r1", { preview: false }),
  );
  assert.equal(result.changed, 1);
  assert.equal((await service.list(project.id)).logs.length, 1);
  assert.equal((await store.snapshot(project.id)).tasks[0].priority, "high");
});
test("status rules do not recursively trigger and due rules skip completed/source-owned records safely", async (t) => {
  const { store, project, service } = await fixture(t);
  let task = await store.createTask(project.id, { title: "Status trigger" });
  await service.configure(
    project.id,
    [
      rule({
        enabled: true,
        trigger: "status",
        to: "done",
        field: "status",
        value: "todo",
      }),
    ],
    { username: "local" },
  );
  task = await store.updateTask(project.id, task.id, {
    revision: task.revision,
    status: "done",
  });
  assert.equal(task.status, "todo");
  assert.equal((await service.list(project.id)).logs.length, 1);
  await service.configure(
    project.id,
    [rule({ enabled: true, trigger: "due" })],
    { username: "local" },
  );
  await store.createTask(project.id, {
    title: "Completed",
    status: "done",
    due: "2020-01-01",
  });
  const imported = await store.createTask(project.id, {
      title: "Source",
      due: "2020-01-01",
    }),
    file = store.file(project.id, "tasks", imported.id),
    record = await store.read(file);
  await store.write(
    file,
    { ...record.data, source: { provider: "jira", external_id: "one" } },
    record.body,
    record,
  );
  const before = (await service.list(project.id)).logs.length;
  await service.due();
  await service.due();
  const after = await service.list(project.id);
  assert.equal(after.logs.length, before + 1);
  assert.equal(after.logs[0].changed, 0);
  assert.match(after.logs[0].errors[0].error, /Source-owned/);
});
