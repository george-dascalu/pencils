import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { Store } from "../server/store.js";

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "An offline project" });
  return { root, store, project };
}
test("projects, tasks and canvases persist as portable Markdown and survive restart", async (t) => {
  const { root, store, project } = await workspace(t);
  const task = await store.createTask(project.id, {
    title: "A useful task",
    body: "# Notes\n\n- [ ] Offline first\n\n[[another-note]]\n",
    tags: ["design"],
  });
  const raw = await fs.readFile(path.join(root, task.file), "utf8");
  assert.equal(task.priority, "medium");
  assert.match(raw, /^---\nid:/);
  assert.match(raw, /\[\[another-note\]\]/);
  const reopened = new Store(root),
    snapshot = await reopened.snapshot(project.id);
  assert.equal(snapshot.tasks[0].title, task.title);
  assert.equal(snapshot.tasks[0].priority, "medium");
  assert.deepEqual(snapshot.tasks[0].tags, ["design"]);
  assert.equal(snapshot.boards.length, 1);
  assert.equal(snapshot.warnings.length, 0);
});
test("updates preserve Markdown and unknown YAML fields and comments", async (t) => {
  const { root, store, project } = await workspace(t);
  const task = await store.createTask(project.id, {
    title: "A task",
    priority: "none",
    body: "\n## Exact Markdown\n\n<script>raw content</script>\n",
  });
  const file = path.join(root, task.file);
  let raw = await fs.readFile(file, "utf8");
  raw = raw
    .replace(/aliases:\n(?:  - .*\n)+/, "")
    .replace(
      "kind: task",
      "kind: task # Keep this comment\ncustom:\n  nested: yes # Keep nested comments\naliases: [a, b]",
    );
  await fs.writeFile(file, raw);
  const current = (await store.snapshot(project.id)).tasks[0];
  const updated = await store.updateTask(project.id, task.id, {
    revision: current.revision,
    status: "done",
  });
  assert.equal(updated.body, task.body);
  assert.equal(updated.priority, "none", "Explicit Lowest priority is retained on edit");
  assert.deepEqual(updated.custom, { nested: "yes" });
  assert.deepEqual(updated.aliases, ["a", "b"]);
  const result = await fs.readFile(file, "utf8");
  assert.match(result, /# Keep this comment/);
  assert.match(result, /# Keep nested comments/);
});
test("hierarchies support multiple types, reject cycles and reject cross-project parents", async (t) => {
  const { store, project } = await workspace(t);
  const a = await store.createTask(project.id, { title: "Epic", type: "epic" });
  const b = await store.createTask(project.id, {
    title: "Story",
    type: "story",
    parent: a.id,
  });
  const c = await store.createTask(project.id, { title: "Task", parent: b.id });
  await assert.rejects(
    store.updateTask(project.id, a.id, { revision: a.revision, parent: c.id }),
    /ancestor/,
  );
  await assert.rejects(
    store.updateTask(project.id, a.id, { revision: a.revision, parent: a.id }),
    /ancestor/,
  );
  const other = await store.createProject({ title: "Other" });
  await assert.rejects(
    store.createTask(other.id, { title: "Wrong project", parent: a.id }),
    /does not exist/,
  );
});
test("stale browser and Obsidian updates cannot silently overwrite each other", async (t) => {
  const { root, store, project } = await workspace(t);
  const task = await store.createTask(project.id, { title: "Original" });
  const updated = await store.updateTask(project.id, task.id, {
    revision: task.revision,
    title: "First browser",
  });
  await assert.rejects(
    store.updateTask(project.id, task.id, {
      revision: task.revision,
      title: "Stale browser",
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    store.updateTask(project.id, task.id, { title: "Missing revision" }),
    (e) => e.status === 428,
  );
  const file = path.join(root, task.file),
    raw = await fs.readFile(file, "utf8");
  await fs.writeFile(file, raw.replace("First browser", "Obsidian title"));
  await assert.rejects(
    store.updateTask(project.id, task.id, {
      revision: updated.revision,
      title: "Stale app",
    }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await store.snapshot(project.id)).tasks[0].title,
    "Obsidian title",
  );
});
test("serialized simultaneous writes accept only the first revision", async (t) => {
  const { store, project } = await workspace(t),
    task = await store.createTask(project.id, { title: "Shared" });
  const results = await Promise.allSettled(
    ["First", "Second"].map((title) =>
      store.mutate(() =>
        store.updateTask(project.id, task.id, {
          revision: task.revision,
          title,
        }),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
});
test("invalid fields are rejected without modifying the file", async (t) => {
  const { store, project } = await workspace(t),
    task = await store.createTask(project.id, { title: "Valid" });
  for (const change of [
    { title: "" },
    { status: "unknown" },
    { type: "unknown" },
    { priority: "huge" },
    { due: "2026-02-31" },
    { tags: "not an array" },
    { assignee: 45 },
  ]) {
    await assert.rejects(
      store.updateTask(project.id, task.id, {
        ...change,
        revision: task.revision,
      }),
      (e) => e.status === 400,
    );
  }
  assert.equal(
    (await store.snapshot(project.id)).tasks[0].revision,
    task.revision,
  );
});
test("malformed externally edited files are reported without blocking good tasks", async (t) => {
  const { root, store, project } = await workspace(t);
  const valid = await store.createTask(project.id, { title: "Readable" }),
    bad = await store.createTask(project.id, { title: "Broken" });
  await fs.writeFile(path.join(root, bad.file), "---\nid: [broken\n---\nNotes");
  const snapshot = await store.snapshot(project.id);
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].id, valid.id);
  assert.equal(snapshot.warnings.length, 1);
  await assert.rejects(
    store.deleteTask(project.id, valid.id, valid.revision),
    /unreadable/,
  );
});
test("external parent cycles are reported and repairable", async (t) => {
  const { root, store, project } = await workspace(t);
  const task = await store.createTask(project.id, { title: "Cycle" }),
    file = path.join(root, task.file);
  await fs.writeFile(
    file,
    (await fs.readFile(file, "utf8")).replace(
      "parent: null",
      `parent: ${task.id}`,
    ),
  );
  const snapshot = await store.snapshot(project.id);
  assert.match(snapshot.warnings[0], /cycle/);
  await store.updateTask(project.id, task.id, {
    revision: snapshot.tasks[0].revision,
    parent: null,
  });
  assert.equal((await store.snapshot(project.id)).warnings.length, 0);
});
test("task removal is recoverable and does not orphan children", async (t) => {
  const { root, store, project } = await workspace(t);
  const parent = await store.createTask(project.id, { title: "Parent" }),
    child = await store.createTask(project.id, {
      title: "Child",
      parent: parent.id,
    });
  await assert.rejects(
    store.deleteTask(project.id, parent.id, parent.revision),
    /subtasks/,
  );
  await store.deleteTask(project.id, child.id, child.revision);
  const trash = await fs.readdir(path.join(root, ".trash"));
  assert.equal(trash.length, 1);
  assert.match(
    await fs.readFile(path.join(root, ".trash", trash[0]), "utf8"),
    /title: Child/,
  );
  await fs.rename(
    path.join(root, ".trash", trash[0]),
    path.join(root, child.file),
  );
  assert.equal((await store.snapshot(project.id)).tasks.length, 2);
});
test("board notes, layout, colors and connectors round-trip with revision checking", async (t) => {
  const { root, store, project } = await workspace(t),
    board = (await store.snapshot(project.id)).boards[0];
  const nodes = [
    {
      id: "n-one",
      type: "sticky",
      text: "An idea\nwith two lines",
      x: -40,
      y: 95,
      w: 220,
      h: 180,
      color: "#f5e7a2",
    },
    { id: "n-two", type: "shape", text: "Plan", x: 300, y: 30, w: 200, h: 120 },
  ];
  const edges = [{ id: "e-one", from: "n-one", to: "n-two" }];
  const result = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes,
    edges,
  });
  assert.deepEqual(result.nodes, nodes);
  assert.deepEqual(result.edges, edges);
  const raw = await fs.readFile(path.join(root, result.file), "utf8");
  assert.ok(result.file.endsWith(".canvas"));
  assert.equal(JSON.parse(raw).nodes[0].text, nodes[0].text);
  assert.equal(JSON.parse(raw).nodes[0].width, nodes[0].w);
  await assert.rejects(
    store.updateBoard(project.id, board.id, {
      revision: board.revision,
      nodes: [],
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    store.updateBoard(project.id, board.id, {
      revision: result.revision,
      edges: [{ id: "e-bad", from: "missing", to: "n-two" }],
    }),
    /connector/,
  );
});
test("path traversal and symlinked project directories cannot escape the vault", async (t) => {
  const { root, store, project } = await workspace(t);
  await assert.rejects(store.snapshot("../outside"), /identifier/);
  await assert.rejects(
    store.updateTask(project.id, "../../outside", {}),
    /identifier/,
  );
  const external = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-outside-"));
  t.after(() => fs.rm(external, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "Projects", project.id, "tasks"), {
    recursive: true,
  });
  await fs.rmdir(path.join(root, "Projects", project.id, "tasks"));
  await fs.symlink(external, path.join(root, "Projects", project.id, "tasks"));
  await assert.rejects(
    store.createTask(project.id, { title: "Do not escape" }),
    /Symlinks/,
  );
  assert.deepEqual(await fs.readdir(external), []);
});
test("the optional example project contains useful tasks and a connected canvas", async (t) => {
  const { store } = await workspace(t),
    demo = await store.demo(),
    snapshot = await store.snapshot(demo.id);
  assert.equal(snapshot.tasks.length, 8);
  assert.equal(snapshot.boards[0].nodes.length, 4);
  assert.equal(snapshot.boards[0].edges.length, 2);
  assert.deepEqual(snapshot.warnings, []);
});
// Guards that no test failed without (npm run test:mutants).
test("paths outside the vault are refused even where a caller builds them", async (t) => {
  const { root, store } = await workspace(t);
  for (const file of [path.dirname(root), path.join(root, "..", "elsewhere.md")])
    await assert.rejects(store.safe(file), { status: 400, message: "Path is outside the vault." }, file);
});
test("files Pencils can't trust are reported and left out: broken frontmatter, the wrong identity, invalid fields", async (t) => {
  const { root, store, project } = await workspace(t);
  const good = await store.createTask(project.id, { title: "Readable" }),
    raw = await fs.readFile(path.join(root, good.file), "utf8"),
    tasks = path.join(root, "Projects", project.id, "tasks");
  const files = {
    "t-open": "---\nid: t-open\ntitle: Never closed\n",
    "t-list": "---\n- a list\n---\n",
    "t-json": "{ not a canvas",
    "t-renamed": raw,
    "t-moved": raw.replaceAll(good.id, "t-moved").replace(`project: ${project.id}`, "project: p-elsewhere"),
    "t-shipped": raw.replaceAll(good.id, "t-shipped").replace("status: todo", "status: shipped"),
  };
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(tasks, `${name}.md`), text);
  const { items, warnings } = await store.children(project.id, "tasks");
  assert.deepEqual(items.map((task) => task.id), [good.id]);
  const reasons = Object.fromEntries(warnings.map((warning) => warning.match(/^tasks\/(.+?)\.md: (.*)$/).slice(1)));
  assert.match(reasons["t-open"], /Invalid YAML frontmatter/);
  assert.match(reasons["t-list"], /must be a YAML mapping/);
  assert.match(reasons["t-json"], /Invalid canvas/);
  assert.match(reasons["t-renamed"], /ID must match the filename/);
  assert.match(reasons["t-moved"], /Project ID does not match the folder/);
  assert.match(reasons["t-shipped"], /status/i);
  const document = await store.createDocument(project.id, { title: "Notes" }), file = path.join(root, document.file);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("kind: document", "kind: task"));
  assert.match((await store.children(project.id, "documents")).warnings.join("\n"), /Expected a document/);
  await assert.rejects(store.write(path.join(root, good.file), { title: "Again" }, ""), { status: 409, message: "File already exists." });
});
test("a reopened vault undoes an interrupted write before anything reads it", async (t) => {
  const { root, store, project } = await workspace(t);
  const task = await store.createTask(project.id, { title: "Original" });
  await store.journal.start();
  await store.updateTask(project.id, task.id, { revision: task.revision, title: "Uncommitted" });
  // The server stops mid-write.
  store.journal.active = null;
  await store.journal.release();
  store.close();
  const reopened = new Store(root);
  t.after(() => reopened.close());
  assert.equal((await reopened.snapshot(project.id)).tasks[0].title, "Original");
});
test("project settings save what they're given and refuse what they can't keep", async (t) => {
  const { root, store, project } = await workspace(t);
  let current = await store.updateProject(project.id, { title: "Renamed", color: "#336699", revision: project.revision });
  assert.equal(current.title, "Renamed");
  assert.equal(current.color, "#336699");
  const update = (input) => store.updateProject(project.id, { ...input, revision: current.revision });
  await assert.rejects(update({ archived: "yes" }), { status: 400, message: /Archived must be true or false/ });
  const template = { name: "Bug", task: { title: "Bug" } }, sized = (length) => ({ name: "T", task: { title: "x".repeat(length - JSON.stringify({ name: "T", task: { title: "" } }).length) } });
  const bad = [template, Array(101).fill(template), [{ ...template, name: 5 }], [{ ...template, name: " " }], [{ ...template, name: "x".repeat(101) }], [{ name: "Bug" }], [sized(250_001)]];
  for (const templates of bad) await assert.rejects(update({ templates }), { status: 400, message: /Invalid card templates/ }, JSON.stringify(templates).slice(0, 60));
  // Distinct objects, as JSON gives: YAML would write one object used twice as an alias.
  current = await update({ templates: [sized(250_000), { ...template, name: "x".repeat(100) }, ...Array.from({ length: 98 }, () => structuredClone(template))] });
  assert.equal(current.templates.length, 100);
  // Changing the workflow or folders needs every task, document and board readable.
  const task = await store.createTask(project.id, { title: "Readable" }), document = await store.createDocument(project.id, { title: "Notes" });
  await fs.mkdir(path.join(root, "Projects", project.id, "boards"), { recursive: true });
  await fs.writeFile(path.join(root, "Projects", project.id, "boards", "Broken.canvas"), "{ broken");
  await assert.rejects(update({ board_folders: [] }), { status: 409, message: /unreadable boards/ });
  await fs.writeFile(path.join(root, document.file), "---\nid: [broken\n---\n");
  await assert.rejects(update({ document_folders: [] }), { status: 409, message: /unreadable documents/ });
  await fs.writeFile(path.join(root, task.file), "---\nid: [broken\n---\n");
  await assert.rejects(update({ schema: { statuses: ["todo", "done"], done: ["done"] } }), { status: 409, message: /unreadable cards/ });
});
test("organisation and project files that don't match their names, and broken parent chains, are reported", async (t) => {
  const { root, store, project } = await workspace(t);
  const second = await store.createOrganisation({ title: "Second" }), raw = await fs.readFile(path.join(root, second.file), "utf8");
  const organisations = {
    "o-copied": raw,
    "o-kind": raw.replaceAll(second.id, "o-kind").replace("kind: organisation", "kind: project"),
    "o-untitled": raw.replaceAll(second.id, "o-untitled").replace("title: Second", 'title: ""'),
    "o-colour": raw.replaceAll(second.id, "o-colour").replace(/^color: .*$/m, "color: red"),
  };
  for (const [id, text] of Object.entries(organisations)) await fs.writeFile(path.join(root, "Organisations", `${id}.md`), text);
  await fs.mkdir(path.join(root, "Projects", "p-copied"));
  await fs.copyFile(path.join(root, project.file), path.join(root, "Projects", "p-copied", "project.md"));
  const { projects, warnings } = await store.list();
  assert.deepEqual(projects.map((p) => p.id), [project.id]);
  for (const id of Object.keys(organisations)) assert.match(warnings.join("\n"), new RegExp(`Organisations/${id}\\.md: `), id);
  assert.match(warnings.join("\n"), /Organisations\/o-copied\.md: Organisation ID and kind must match its file/);
  assert.match(warnings.join("\n"), /Project ID must match its folder name/);
  // A task whose parent is gone, and one whose ancestors loop without it.
  const [orphan, start, b, c] = await Promise.all(["Orphan", "Start", "B", "C"].map((title) => store.createTask(project.id, { title })));
  const parent = async (task, id) => fs.writeFile(path.join(root, task.file), (await fs.readFile(path.join(root, task.file), "utf8")).replace("parent: null", `parent: ${id}`));
  await parent(orphan, "t-missing");
  await parent(start, b.id);
  await parent(b, c.id);
  await parent(c, b.id);
  const found = (await store.snapshot(project.id)).warnings.join("\n");
  assert.match(found, /Missing parent for Orphan/);
  assert.match(found, /Hierarchy cycle involving Start/);
});
test("the changes feed sends everything again when asked from a version it can't answer from", async (t) => {
  const { store, project } = await workspace(t);
  for (const since of [-1, 1.5, store.version + 1]) assert.equal((await store.delta(project.id, since)).full, true, String(since));
  assert.equal((await store.delta(project.id, store.version)).full, false);
});

test('timed cards keep their hours in Markdown, updates, history and a reopened vault', async t => {
  const {root,store,project}=await workspace(t);
  const hours={start:'2026-11-02',due:'2026-11-02',start_time:'09:15',due_time:'10:45'};
  const card=await store.createTask(project.id,{title:'Scheduled review',...hours});
  assert.match(await fs.readFile(path.join(root,card.file),'utf8'),/start_time: ["']?09:15/);
  const edited=await store.updateTask(project.id,card.id,{revision:card.revision,due_time:'11:00'});
  const reopened=new Store(root), found=(await reopened.snapshot(project.id)).tasks.find(t=>t.id===card.id);
  assert.equal(found.start_time,'09:15');assert.equal(found.due_time,'11:00');
  await assert.rejects(()=>store.updateTask(project.id,card.id,{revision:edited.revision,due_time:'09:15'}),{status:400});
  const allDay=await store.updateTask(project.id,card.id,{revision:edited.revision,start_time:null,due_time:null});
  assert.equal(allDay.start,hours.start);assert.equal(allDay.start_time,null);
});
