// F0.21-72: projects have people; teams only add their members as a shortcut.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { membersForProject } from "../server/teams.js";

const people = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }, { id: "c", name: "Cleo" }];
const teams = [{ id: "design", name: "Design", members: ["a"] }, { id: "delivery", name: "Delivery", members: ["a", "b"] }];

test("a project's people are its own list; older projects still take their teams' members", () => {
  assert.deepEqual(membersForProject({ people: ["c", "a"] }, { people, teams }).map(p => p.id), ["a", "c"]);
  assert.deepEqual(membersForProject({ people: [], teams: ["delivery"] }, { people, teams }), [], "a list, even empty, wins");
  assert.deepEqual(membersForProject({ teams: ["delivery"] }, { people, teams }).map(p => p.id), ["a", "b"], "no list yet: the teams' members");
  assert.deepEqual(membersForProject({ people: ["gone", "b"] }, { people, teams }).map(p => p.id), ["b"], "people who left the organisation drop out");
});

test("projects save people without a team, teams expand into people once, and moving organisation clears them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-people-"));
  try {
    const s = new Store(root);
    await s.init();
    const org = await s.createOrganisation({ title: "Studio", people, teams });
    const direct = await s.createProject({ title: "Direct", organisation: org.id, people: ["c"] });
    assert.deepEqual(direct.people, ["c"]);
    assert.deepEqual(direct.teams, []);
    assert.ok(await s.createTask(direct.id, { title: "For Cleo", assignee: "Cleo" }));
    await assert.rejects(() => s.createTask(direct.id, { title: "Nope", assignee: "Bob" }), /Choose an assignee/);
    await assert.rejects(() => s.createProject({ title: "Bad", organisation: org.id, people: ["eve"] }), /people/i);
    // An older client (or seed) that sends teams gets their members as people.
    const legacy = await s.createProject({ title: "Legacy", organisation: org.id, teams: ["delivery"] });
    assert.deepEqual(legacy.people, ["a", "b"]);
    assert.deepEqual(legacy.teams, []);
    const updated = await s.updateProject(direct.id, { revision: direct.revision, people: ["a", "c", "a"] });
    assert.deepEqual(updated.people, ["a", "c"]);
    // Teams are categories: deleting one leaves projects their people.
    const fewer = await s.updateOrganisation(org.id, { revision: (await s.getOrganisation(org.id)).revision, teams: [teams[0]] });
    assert.deepEqual(fewer.teams.map(t => t.id), ["design"]);
    assert.deepEqual((await s.snapshot(legacy.id)).project.people, ["a", "b"]);
    const moved = await s.updateProject(updated.id, { revision: updated.revision, organisation: "o-default" });
    assert.deepEqual(moved.people, []);
    // Without teams the organisation still limits a project with people to them.
    const flat = await s.createOrganisation({ title: "Flat", people });
    const solo = await s.createProject({ title: "Solo", organisation: flat.id, people: ["a"] });
    await assert.rejects(() => s.createTask(solo.id, { title: "Nope", assignee: "Bob" }), /Choose an assignee from this project's people/);
    assert.equal((await s.createTask(solo.id, { title: "Mine", assignee: "Alice" })).assignee_id, "a");
    // An organisation with people but no teams: a project without people takes no free-text names.
    const bare = await s.createProject({ title: "Bare", organisation: flat.id });
    await assert.rejects(() => s.createTask(bare.id, { title: "Nope", assignee: "Someone" }), /Choose an assignee/);
    await assert.rejects(() => s.updateProject(solo.id, { revision: solo.revision, people: null }), /Project people/);
    // Moving organisation with people chosen there keeps them.
    const there = await s.updateProject(solo.id, { revision: solo.revision, organisation: org.id, people: ["b"] });
    assert.deepEqual(there.people, ["b"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("changing teams first gives older projects their teams' members as people, so a team can go", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-people-"));
  try {
    const s = new Store(root);
    await s.init();
    const org = await s.createOrganisation({ title: "Studio", people, teams });
    const project = await s.createProject({ title: "Old", organisation: org.id });
    // A project saved before F0.21-72 has teams and no people.
    const file = s.file(project.id, "project"), text = await fs.readFile(file, "utf8");
    assert.match(text, /\npeople: \[\]\nteams: \[\]\n/);
    await fs.writeFile(file, text.replace(/\npeople: \[\]\nteams: \[\]\n/, "\nteams:\n  - delivery\n"));
    assert.equal((await s.read(file)).data.people, undefined);
    const current = await s.getOrganisation(org.id);
    await s.updateOrganisation(org.id, { revision: current.revision, teams: [{ id: "design", name: "Design", members: ["a"] }] });
    const saved = (await s.snapshot(project.id)).project;
    assert.deepEqual(saved.people, ["a", "b"], "Delivery's members stay on the project after the team goes");
    assert.deepEqual(saved.teams, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
