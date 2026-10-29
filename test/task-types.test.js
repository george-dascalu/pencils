import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Store } from "../server/store.js";
import { DEFAULT_SCHEMA, schema, upgradeDefaultTaskTypes } from "../server/model.js";
import { canParent } from "../public/hierarchy-model.js";

const legacyTypes = ["epic", "milestone", "story", "task", "bug"];
const legacy = () => ({ statuses: ["ready", "finished"], types: [...legacyTypes], done: ["finished"], fields: [], initial_status: "ready" });

test("Activity migration preserves custom types and mirrors Task hierarchy rules", () => {
  const original = legacy();
  original.hierarchy = { mode: "enforced", roots: ["epic"], children: {
    epic: ["story", "task"], milestone: [], story: ["task"], task: ["task", "bug"], bug: [],
  } };
  const upgraded = upgradeDefaultTaskTypes(original);
  schema(upgraded);
  assert.deepEqual(original.types, legacyTypes, "Input remains unchanged");
  assert.deepEqual(upgraded.statuses, original.statuses);
  assert.equal(upgraded.initial_status, original.initial_status);
  for (const parent of [null, ...legacyTypes]) {
    assert.equal(canParent(upgraded, "activity", parent), canParent(original, "task", parent));
    for (const child of legacyTypes) assert.equal(canParent(upgraded, child, parent), canParent(original, child, parent));
  }
  for (const child of legacyTypes) assert.equal(canParent(upgraded, child, "activity"), canParent(original, child, "task"));
  assert.equal(upgradeDefaultTaskTypes(upgraded), upgraded, "Upgrade is idempotent");
  const custom = { ...legacy(), types: ["task", "research"] };
  assert.equal(upgradeDefaultTaskTypes(custom), custom);
  const malformed = { ...legacy(), hierarchy: { mode: "enforced" } };
  assert.equal(upgradeDefaultTaskTypes(malformed), malformed);
});

test("Activity persists as Markdown in new and upgraded projects; removing it survives restart", async (t) => {
  const root = await fs.mkdtemp("/tmp/pencils-types-");
  const stores = [];
  t.after(async () => { for (const store of stores) store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const open = async () => { const store = new Store(root); stores.push(store); await store.init(); return store; };
  let store = await open();
  const project = await store.createProject({ title: "Activity project" });
  assert.deepEqual(project.schema.types, DEFAULT_SCHEMA.types);
  const task = await store.createTask(project.id, { title: "Workshop", type: "activity", body: "## Agenda\n\nDiscuss the next release.\n" });
  assert.match(await fs.readFile(`${root}/${task.file}`, "utf8"), /type: activity/);
  let changed = await store.updateTask(project.id, task.id, { revision: task.revision, type: "task" });
  changed = await store.updateTask(project.id, task.id, { revision: changed.revision, type: "activity" });
  assert.equal(changed.body, task.body);

  const old = await store.createProject({ title: "Existing project" });
  const record = await store.read(store.file(old.id, "project"));
  await store.write(store.file(old.id, "project"), { ...record.data, schema: legacy(), extension: "keep me" }, "Original project notes\n", record);
  const custom = await store.createProject({ title: "Custom project", schema: { ...legacy(), types: ["task", "research"] } });
  store = await open();
  let upgraded = (await store.snapshot(old.id)).project;
  assert.ok(upgraded.schema.types.includes("activity"));
  assert.equal(upgraded.extension, "keep me");
  assert.equal(upgraded.body, "Original project notes\n");
  assert.deepEqual(upgraded.schema.statuses, legacy().statuses);
  assert.equal((await store.snapshot(project.id)).tasks[0].type, "activity");
  assert.equal((await store.snapshot(custom.id)).project.revision, custom.revision);
  const stable = await open();
  assert.equal((await stable.snapshot(old.id)).project.revision, upgraded.revision, "Restarts do not rewrite the project");
  upgraded = await stable.updateProject(old.id, { revision: upgraded.revision, schema: { ...upgraded.schema, types: legacyTypes } });
  store = await open();
  assert.deepEqual((await store.snapshot(old.id)).project.schema.types, legacyTypes, "Intentional removal stays removed");
});
