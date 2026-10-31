import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { directory, membersForProject } from "../server/teams.js";
import { capacityData, weekStart } from "../public/capacity.js";
const people = [
  { id: "a", name: "Alice", capacity: 32 },
  { id: "b", name: "Bob", capacity: 0 },
];
const teams = [
  { id: "design", name: "Design", members: ["a"] },
  { id: "delivery", name: "Delivery", members: ["a", "b"] },
];
test("Team members are unique across teams and directory validates membership and capacity", () => {
  assert.deepEqual(
    membersForProject({ teams: ["design", "delivery"] }, { people, teams }),
    people,
  );
  assert.throws(
    () => directory(people, [{ ...teams[0], members: ["outsider"] }]),
    /belong/,
  );
  assert.throws(
    () => directory([{ id: "a", name: "A", capacity: -1 }], []),
    /capacity/,
  );
  assert.throws(
    () => directory([{ id: "p", name: "P", task_capacity: 1.5 }], []),
    /task limit/,
  );
  assert.equal(
    directory([{ id: "p", name: "P", capacity: 32 }], []).people[0]
      .task_capacity,
    null,
  );
  assert.throws(
    () => directory([...people, { id: "c", name: "alice" }], teams),
    /distinct/,
  );
});
test("A person's short name is optional, trimmed and at most three characters", () => {
  const short = (short_name) => directory([{ id: "g", name: "George", short_name }], []).people[0];
  assert.equal(short(" GD ").short_name, "GD");
  assert.equal(short("Geo").short_name, "Geo");
  assert.equal(short(" ").short_name, undefined);
  assert.equal(short(undefined).short_name, undefined);
  assert.throws(() => short("Geor"), /Short names/);
  assert.throws(() => short(3), /Short names/);
});
test("Capacity counts each overlapping task once, includes unestimated work, and separates unscheduled tasks", () => {
  const base = { status: "todo", assignee_id: "a" };
  const data = capacityData(
    [
      {
        ...base,
        id: "1",
        estimate: 80,
        start: "2026-10-05",
        due: "2026-10-16",
      },
      { ...base, id: "2", estimate: 4, due: "2026-10-17" },
      { ...base, id: "3", estimate: 10 },
      { ...base, id: "4", due: "2026-10-14" },
      { ...base, id: "5", estimate: 100, due: "2026-10-14", status: "done" },
      { ...base, id: "6", estimate: 100, due: "2026-10-14", archived: true },
      {
        id: "7",
        estimate: 8,
        due: "2026-10-14",
        status: "todo",
        assignee: "Outsider",
      },
    ],
    people,
    "2026-10-14",
  );
  assert.equal(weekStart("2026-10-18"), "2026-10-12");
  assert.equal(data.rows[0].count, 3);
  assert.deepEqual(data.rows[0].days, [1, 1, 2, 1, 1, 1, 0]);
  assert.equal(data.rows[1].count, 0);
  assert.equal(data.unassigned.count, 1);
  assert.deepEqual(
    data.unscheduled.map((t) => t.id),
    ["3"],
  );
  assert.deepEqual(
    data.rows[0].unscheduled.map((t) => t.id),
    ["3"],
  );
});
test("Teams, assignments and capacity survive restart; foreign teams and assignees are rejected without losing old assignments", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-teams-"));
  const s = new Store(root);
  try {
    await s.init();
    const org = await s.createOrganisation({ title: "Studio", people, teams });
    const p = await s.createProject({
      title: "Work",
      organisation: org.id,
      teams: ["design", "delivery"],
      default_view: "capacity",
    });
    const task = await s.createTask(p.id, {
      title: "Design",
      assignee: "Alice",
    });
    assert.equal(task.assignee_id, "a");
    const mutable = await s.createTask(p.id, {
      title: "Switch owner",
      assignee: "Alice",
    });
    const switched = await s.updateTask(p.id, mutable.id, {
      ...mutable,
      assignee: "Bob",
    });
    assert.equal(switched.assignee_id, "b");
    const empty = await s.updateTask(p.id, mutable.id, {
      ...switched,
      assignee: "",
    });
    assert.equal(empty.assignee_id, null);
    const again = await s.updateTask(p.id, mutable.id, {
      ...empty,
      assignee: "Alice",
    });
    assert.equal(again.assignee_id, "a");

    await assert.rejects(
      () => s.createTask(p.id, { title: "Nope", assignee: "Eve" }),
      /Choose an assignee/,
    );
    await assert.rejects(
      () => s.createProject({ title: "Bad", teams: ["design"] }),
      /belong/,
    );
    await assert.rejects(
      () =>
        s.updateOrganisation(org.id, {
          revision: org.revision,
          teams: [teams[0]],
        }),
      /Remove a team/,
    );
    const renamed = await s.updateOrganisation(org.id, {
      revision: org.revision,
      people: [{ ...people[0], name: "Alicia" }, people[1]],
    });
    assert.equal(
      (await s.snapshot(p.id)).tasks.find((t) => t.id === task.id).assignee,
      "Alicia",
    );
    const p2 = await s.updateProject(p.id, {
      revision: p.revision,
      teams: [],
      default_view: "capacity",
    });
    const old = await s.updateTask(p.id, task.id, {
      revision: task.revision,
      assignee_id: "a",
      assignee: "Alicia",
      title: "Keep assignment",
    });
    assert.equal(old.assignee_id, "a");
    await assert.rejects(
      () =>
        s.createTask(p.id, { title: "No new assignment", assignee_id: "a" }),
      /Choose an assignee/,
    );
    const cleared = await s.updateTask(p.id, task.id, {
      revision: old.revision,
      assignee: "",
    });
    assert.equal(cleared.assignee_id, null);
    const restart = new Store(root);
    await restart.init();
    assert.equal(
      (await restart.getOrganisation(org.id)).people[0].name,
      "Alicia",
    );
    assert.equal(
      (await restart.snapshot(p.id)).project.default_view,
      "capacity",
    );
  } finally {
    s.close?.();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Legacy assignments remain editable after teams are introduced", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-legacy-teams-"),
  );
  const s = new Store(root);
  try {
    await s.init();
    const project = await s.createProject({ title: "Legacy project" });
    const task = await s.createTask(project.id, {
      title: "Legacy task",
      assignee: "Former teammate",
    });
    const org = await s.getOrganisation(project.organisation);
    await s.updateOrganisation(org.id, {
      revision: org.revision,
      people,
      teams,
    });
    const saved = await s.updateTask(project.id, task.id, {
      ...task,
      title: "Still editable",
    });
    assert.equal(saved.assignee, "Former teammate");
    assert.equal(saved.title, "Still editable");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
