import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store, DEFAULT_ORGANISATION } from "../server/store.js";

async function workspace(t) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-organisations-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.init();
  return { root, store };
}

test("initialisation creates one default organisation and is safe to repeat", async (t) => {
  const { root, store } = await workspace(t);
  await Promise.all([
    store.init(),
    store.init(),
    store.list(),
    store.listOrganisations(),
  ]);
  const initial = await store.getOrganisation(DEFAULT_ORGANISATION);
  const reopened = new Store(root);
  await reopened.init();
  assert.equal((await reopened.listOrganisations()).organisations.length, 1);
  assert.equal(
    (await reopened.getOrganisation(DEFAULT_ORGANISATION)).revision,
    initial.revision,
  );
  assert.equal(
    (await store.createProject({ title: "Legacy API caller" })).organisation,
    DEFAULT_ORGANISATION,
  );
});

test("legacy migration preserves paths, Markdown, unknown properties, task hierarchies and canvases", async (t) => {
  const { root, store } = await workspace(t);
  const project = await store.demo(),
    before = await store.snapshot(project.id),
    file = path.join(root, project.file);
  const legacy = (await fs.readFile(file, "utf8"))
    .replace(/^organisation:.*\n/m, "")
    .replace("kind: project", "kind: project # keep this\ncustom: original");
  await fs.writeFile(file, legacy);
  const reopened = new Store(root);
  await reopened.init();
  const after = await reopened.snapshot(project.id);
  assert.equal(after.project.organisation, DEFAULT_ORGANISATION);
  assert.equal(after.project.body, before.project.body);
  assert.equal(after.project.file, before.project.file);
  assert.equal(after.project.updated, before.project.updated);
  assert.equal(after.project.custom, "original");
  assert.match(await fs.readFile(file, "utf8"), /# keep this/);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.boards, before.boards);
  const again = new Store(root);
  await again.init();
  assert.equal(
    (await again.snapshot(project.id)).project.revision,
    after.project.revision,
  );
});

test("organisations have independent project lists and moves keep task and canvas files intact", async (t) => {
  const { root, store } = await workspace(t);
  const studio = await store.createOrganisation({
    title: "Studio",
    body: "## About\n\nOur company.",
    color: "#336655",
  });
  const personal = await store.createOrganisation({ title: "Personal" });
  const one = await store.demo({ organisation: studio.id });
  const two = await store.createProject({
    title: "Another studio project",
    organisation: studio.id,
  });
  const three = await store.createProject({
    title: "Home",
    organisation: personal.id,
  });
  assert.deepEqual(
    new Set((await store.list(studio.id)).projects.map((p) => p.id)),
    new Set([one.id, two.id]),
  );
  assert.deepEqual(
    (await store.list(personal.id)).projects.map((p) => p.id),
    [three.id],
  );
  assert.deepEqual((await store.list(DEFAULT_ORGANISATION)).projects, []);
  const before = await store.snapshot(one.id);
  const moved = await store.updateProject(one.id, {
    revision: one.revision,
    organisation: personal.id,
  });
  const after = await store.snapshot(one.id);
  assert.equal(moved.file, one.file);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.boards, before.boards);
  assert.deepEqual(
    (await store.list(studio.id)).projects.map((p) => p.id),
    [two.id],
  );
  assert.equal((await store.list(personal.id)).projects.length, 2);
  const reopened = new Store(root);
  assert.equal((await reopened.list(personal.id)).projects.length, 2);
  assert.match(
    await fs.readFile(path.join(root, studio.file), "utf8"),
    /## About/,
  );
});

test("organisation edits preserve custom properties, reject stale saves and do not modify projects", async (t) => {
  const { root, store } = await workspace(t),
    organisation = await store.createOrganisation({ title: "Original" });
  const project = await store.createProject({
    title: "A project",
    organisation: organisation.id,
  });
  const file = path.join(root, organisation.file);
  await fs.writeFile(
    file,
    (await fs.readFile(file, "utf8")).replace(
      "kind: organisation",
      "kind: organisation\ncustom: value # preserved",
    ),
  );
  const current = await store.getOrganisation(organisation.id);
  const edited = await store.updateOrganisation(organisation.id, {
    revision: current.revision,
    title: "Renamed",
    body: "A new description",
    color: "#123456",
  });
  assert.equal(edited.custom, "value");
  assert.match(await fs.readFile(file, "utf8"), /# preserved/);
  assert.equal(
    (await store.snapshot(project.id)).project.revision,
    project.revision,
  );
  await assert.rejects(
    store.updateOrganisation(organisation.id, {
      revision: current.revision,
      title: "Stale",
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    store.updateOrganisation(organisation.id, { title: "Missing revision" }),
    (e) => e.status === 428,
  );
  await assert.rejects(
    store.updateOrganisation(organisation.id, {
      revision: edited.revision,
      title: "",
    }),
    (e) => e.status === 400,
  );
});

test("invalid organisation references are rejected and external mistakes are reported without reassignment", async (t) => {
  const { root, store } = await workspace(t),
    project = await store.createProject({ title: "Keep safe" });
  await assert.rejects(
    store.createProject({ title: "Invalid", organisation: "o-missing" }),
    (e) => e.status === 404,
  );
  await assert.rejects(store.list("../escape"), (e) => e.status === 400);
  await assert.rejects(store.list("o-missing"), (e) => e.status === 404);
  await assert.rejects(
    store.updateProject(project.id, {
      revision: project.revision,
      organisation: "o-missing",
    }),
    (e) => e.status === 404,
  );
  assert.equal(
    (await store.snapshot(project.id)).project.revision,
    project.revision,
  );
  const file = path.join(root, project.file),
    invalid = (await fs.readFile(file, "utf8")).replace(
      `organisation: ${DEFAULT_ORGANISATION}`,
      "organisation: o-missing",
    );
  await fs.writeFile(file, invalid);
  const reopened = new Store(root),
    result = await reopened.list();
  assert.equal(result.projects.length, 0);
  assert.match(result.warnings[0], /organisation is missing or invalid/);
  assert.equal(await fs.readFile(file, "utf8"), invalid);
});

test("broken organisation files do not block valid organisations or overwrite legacy notes", async (t) => {
  const { root, store } = await workspace(t),
    organisation = await store.createOrganisation({ title: "Broken" });
  await fs.writeFile(
    path.join(root, organisation.file),
    "---\nid: [broken\n---\n",
  );
  const brokenFile = path.join(root, "Projects", "p-broken", "project.md");
  await fs.mkdir(path.dirname(brokenFile), { recursive: true });
  await fs.writeFile(brokenFile, "Do not overwrite this note.");
  const reopened = new Store(root),
    list = await reopened.listOrganisations(),
    projects = await reopened.list();
  assert.equal(list.organisations.length, 1);
  assert.equal(list.warnings.length, 1);
  assert.equal(projects.warnings.length, 2);
  assert.equal(
    await fs.readFile(brokenFile, "utf8"),
    "Do not overwrite this note.",
  );
});
