import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { MiroImport } from "../server/miro-import.js";
import {
  convertMiro,
  miroId,
  miroMarkdown,
  miroBoardId,
} from "../server/miro-convert.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
import { miroFixture, miroFetch, miroBoard } from "./miro-fixture.js";
const config = {
  types: ["task"],
  statuses: ["backlog", "done"],
  initial_status: "backlog",
};
async function fixture(t, fetcher) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-miro-"));
  const store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Import destination" });
  const auth = new Auth(store, "local", "George"),
    user = auth.localUser,
    calls = [];
  const importer = new MiroImport(store, auth, {
    fetch: fetcher || miroFetch(miroFixture(), calls),
    env: {
      APP_ORIGIN: "http://localhost:3000",
      MIRO_CLIENT_ID: "client",
      MIRO_CLIENT_SECRET: "secret",
    },
  });
  t.after(async () => {
    importer.close();
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  await importer.connect(project.id, user, "fixture-access-token");
  return { root, store, project, auth, user, importer, calls };
}
test("Miro conversion preserves editable content, nested coordinates, colours and connectors", () => {
  const s = miroFixture();
  const converted = convertMiro(s, {}, config, [
    { id: "p-alice", name: "Alice" },
  ]);
  const get = (id) => converted.nodes.find((n) => n.miro.item === id);
  assert.equal(get("note").type, "sticky");
  assert.equal(get("note").color, "#fff9b1");
  assert.match(get("note").text, /\*\*A useful idea\*\*/);
  assert.equal(get("note").verticalAlign, "middle");
  assert.equal(get("card").frame, get("nested").id);
  assert.equal(get("card").x - get("nested").x, 20);
  assert.equal(get("card").draft.due, "2026-11-01");
  assert.equal(get("card").draft.assignee, "Alice");
  assert.equal(get("card").draft.priority, "medium");
  assert.equal(get("shape").shape, "diamond");
  assert.equal(converted.edges[0].toEnd, "diamond");
  assert.equal(converted.edges[0].routing, "elbow");
  assert.equal(converted.edges[0].relationship, undefined);
  assert.equal(get("stroke").type, "link");
  assert.ok(
    converted.issues.some((i) => i.id === "loose" && i.kind === "skipped"),
  );
  const roundtrip = decodeCanvas(
    encodeCanvas({ project: "p-test", title: "Import", ...converted }),
  );
  assert.equal(
    roundtrip.nodes.find((n) => n.id === get("card").id).draft.title,
    "Deliver release",
  );
});
test("frame selection includes descendants and reports outgoing connectors", () => {
  const c = convertMiro(miroFixture(), { frames: ["nested"] }, config);
  assert.deepEqual(
    c.nodes.map((n) => n.miro.item),
    ["nested", "card"],
  );
  assert.equal(c.nodes[0].frame, undefined);
  assert.ok(c.issues.some((i) => i.id === "line"));
  assert.throws(
    () => convertMiro(miroFixture(), { frames: [] }, config),
    /Choose at least/,
  );
});
test("hostile content and invalid geometry do not become executable markup", () => {
  assert.doesNotMatch(
    miroMarkdown(
      '<script>alert(1)</script><p>Hello <a href="javascript:alert(1)">bad</a><img src="https://tracker.test/image" onerror="alert(1)"></p>',
    ),
    /javascript|script|tracker|alert/,
  );
  assert.equal(
    miroBoardId(`https://miro.com/app/board/${miroBoard}/?moveToWidget=1`),
    miroBoard,
  );
  assert.throws(
    () => miroBoardId("https://evil.test/app/board/1"),
    /Miro board/,
  );
  const s = miroFixture();
  s.items[0].parent = { id: "note" };
  s.items[0].position.relativeTo = "parent_top_left";
  assert.throws(() => convertMiro(s, {}, config), /circular/);
});
test("preview reads every page and object style, downloads media without writes", async (t) => {
  const { store, project, user, importer, calls } = await fixture(t);
  const before = await store.snapshot(project.id);
  const p = await importer.preview(project.id, user, { board: miroBoard });
  assert.equal(
    (await store.snapshot(project.id)).boards.length,
    before.boards.length,
  );
  assert.equal((await store.snapshot(project.id)).tasks.length, 0);
  assert.equal(
    p.nodes.find((n) => n.id === miroId(miroBoard, "note")).color,
    "#fff9b1",
  );
  assert.equal(
    p.nodes.find((n) => n.id === miroId(miroBoard, "image")).type,
    "image",
  );
  assert.equal(
    p.nodes.find((n) => n.id === miroId(miroBoard, "pdf")).type,
    "file",
  );
  assert.equal(
    calls.filter((c) => new URL(c.url).pathname.endsWith("/items")).length,
    3,
  );
  assert.ok(calls.some((c) => c.url.includes("/sticky_notes/note")));
  assert.ok(calls.every((c) => c.method === "GET"));
});
test("confirmed import stores native canvas, Markdown tasks and media atomically and retries safely", async (t) => {
  const { root, store, project, user, importer } = await fixture(t);
  const p = await importer.preview(project.id, user, {
    board: miroBoard,
    cards: "tasks",
  });
  const input = { preview: p.preview, version: p.version };
  const r = await store.mutate(() => importer.commit(project.id, user, input));
  importer.completed(project.id, user, input, r);
  assert.equal(importer.status(project.id, user).connected, false);
  assert.equal(r.tasks, 2);
  const s = await store.snapshot(project.id),
    b = s.boards.find((b) => b.id === r.board);
  assert.equal(s.tasks.length, 2);
  assert.equal(b.nodes.filter((n) => n.type === "task").length, 2);
  assert.equal(s.tasks[0].priority, "medium");
  assert.equal(s.tasks[0].source, undefined);
  const image = b.nodes.find((n) => n.type === "image");
  assert.ok(
    (await fs.readFile(path.join(root, "Projects", project.id, image.src)))
      .length,
  );
  const disk = JSON.parse(
    await fs.readFile(store.file(project.id, "boards", b.id), "utf8"),
  );
  assert.equal(disk.nodes.find((n) => n.id === image.id).type, "file");
  assert.doesNotMatch(
    JSON.stringify(disk),
    /fixture-access-token|client_secret/,
  );
  assert.deepEqual(
    await store.mutate(() => importer.commit(project.id, user, input)),
    r,
  );
  assert.equal((await store.snapshot(project.id)).boards.length, 2);
});
test("failed import rolls back tasks, canvas and media; retry succeeds", async (t) => {
  const { root, store, project, user, importer } = await fixture(t);
  const p = await importer.preview(project.id, user, {
    board: miroBoard,
    cards: "tasks",
  });
  const original = store.createBoard.bind(store);
  store.createBoard = () => {
    throw new Error("simulated write failure");
  };
  await assert.rejects(
    store.mutate(() =>
      importer.commit(project.id, user, {
        preview: p.preview,
        version: p.version,
      }),
    ),
    /simulated/,
  );
  assert.equal((await store.snapshot(project.id)).tasks.length, 0);
  const files = await fs
    .readdir(path.join(root, "Projects", project.id, "attachments"))
    .catch(() => []);
  assert.equal(files.length, 0);
  store.createBoard = original;
  const result = await store.mutate(() =>
    importer.commit(project.id, user, {
      preview: p.preview,
      version: p.version,
    }),
  );
  assert.equal(result.tasks, 2);
});
test("existing-canvas imports reject stale revisions and skip previous imported objects", async (t) => {
  const { store, project, user, importer } = await fixture(t);
  let b = (await store.snapshot(project.id)).boards[0];
  const p = await importer.preview(project.id, user, {
    board: miroBoard,
    destination: b.id,
  });
  b = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    title: "Changed during preview",
  });
  await assert.rejects(
    store.mutate(() =>
      importer.commit(project.id, user, {
        preview: p.preview,
        version: p.version,
      }),
    ),
    /canvas changed/,
  );
  const p2 = await importer.preview(project.id, user, {
    preview: p.preview,
    destination: b.id,
  });
  await store.mutate(() =>
    importer.commit(project.id, user, {
      preview: p2.preview,
      version: p2.version,
    }),
  );
  const p3 = await importer.preview(project.id, user, {
    board: miroBoard,
    destination: b.id,
  });
  assert.equal(p3.counts.objects, 0);
  assert.equal(p3.counts.connectors, 0);
  assert.ok(p3.issues.some((i) => /previously imported/.test(i.message)));
});
test("previews and OAuth state are bound to the initiating account and project", async (t) => {
  const { store, project, user, auth, importer } = await fixture(t);
  const p = await importer.preview(project.id, user, { board: miroBoard });
  await assert.rejects(
    store.mutate(() =>
      importer.commit(
        project.id,
        { username: "another", admin: true },
        { preview: p.preview, version: p.version },
      ),
    ),
    /expired/,
  );
  const authorization = await importer.authorize(project.id, user);
  const state = new URL(authorization.url).searchParams.get("state");
  assert.equal(
    new URL(authorization.url).searchParams.get("scope"),
    "boards:read",
  );
  await importer.callback({ state, code: "test-code" });
  await assert.rejects(
    importer.callback({ state, code: "test-code" }),
    /expired/,
  );
  auth.mode = "shared";
  auth.enabled = false;
  await assert.rejects(
    importer.connect(project.id, user, "fixture-access-token"),
    /sign-in/,
  );
});
test("new frame contents follow a previously imported frame without moving local objects", async (t) => {
  const source = miroFixture();
  const { store, project, user, importer } = await fixture(
    t,
    miroFetch(source),
  );
  const p = await importer.preview(project.id, user, { board: miroBoard });
  const r = await store.mutate(() =>
    importer.commit(project.id, user, {
      preview: p.preview,
      version: p.version,
    }),
  );
  let b = (await store.snapshot(project.id)).boards.find(
    (b) => b.id === r.board,
  );
  b.nodes.forEach((n) => {
    n.x += 900;
    n.y += 200;
  });
  b = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: b.nodes,
  });
  const card = source.items.find((i) => i.id === "card");
  source.items.push({
    ...card,
    id: "new-card",
    position: { ...card.position, y: card.position.y + 40 },
  });
  const next = await importer.preview(project.id, user, {
    board: miroBoard,
    destination: b.id,
  });
  assert.equal(next.counts.objects, 1);
  const n = next.nodes[0],
    old = b.nodes.find((n) => n.id === miroId(miroBoard, "card"));
  assert.equal(n.x, old.x);
  assert.equal(n.y, old.y + 40);
  await store.mutate(() =>
    importer.commit(project.id, user, {
      preview: next.preview,
      version: next.version,
    }),
  );
  const saved = (await store.snapshot(project.id)).boards.find(
    (v) => v.id === b.id,
  );
  assert.deepEqual(
    saved.nodes.filter((n) => n.id !== miroId(miroBoard, "new-card")),
    b.nodes,
  );
});
test("card options obey project membership, workflow defaults and enforced hierarchy", async (t) => {
  const { store, project, user, importer } = await fixture(t);
  const org = await store.getOrganisation(project.organisation);
  await store.updateOrganisation(org.id, {
    revision: org.revision,
    people: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
      { id: "outsider", name: "Outside team" },
    ],
    teams: [{ id: "team", name: "Project team", members: ["alice", "bob"] }],
  });
  const schema = {
    types: ["epic", "task"],
    statuses: ["backlog", "review", "done"],
    initial_status: "review",
    status_labels: { review: "Needs review" },
    hierarchy: {
      mode: "enforced",
      roots: ["epic"],
      children: { epic: ["task"], task: [] },
    },
  };
  await store.updateProject(project.id, {
    revision: project.revision,
    teams: ["team"],
    schema,
  });
  const p = await importer.preview(project.id, user, { board: miroBoard });
  assert.deepEqual(
    p.people.map((p) => p.id),
    ["alice", "bob"],
  );
  assert.equal(p.status, "review");
  assert.equal(p.statuses.find((s) => s.id === "review").name, "Needs review");
  await assert.rejects(
    importer.preview(project.id, user, { preview: p.preview, cards: "tasks" }),
    /allowed without a parent/,
  );
  await assert.rejects(
    importer.preview(project.id, user, {
      preview: p.preview,
      assignees: { "user-a": "outsider" },
    }),
    /project's teams/,
  );
  const ready = await importer.preview(project.id, user, {
    preview: p.preview,
    cards: "tasks",
    type: "epic",
    assignees: { "user-a": "bob" },
  });
  await store.mutate(() =>
    importer.commit(project.id, user, {
      preview: ready.preview,
      version: ready.version,
    }),
  );
  const task = (await store.snapshot(project.id)).tasks.find(
    (t) => t.title === "Deliver release",
  );
  assert.equal(task.assignee_id, "bob");
  assert.equal(task.status, "review");
  assert.equal(task.type, "epic");
});
test("media fetch refuses arbitrary hosts and never forwards bearer tokens to a CDN", async (t) => {
  const s = miroFixture();
  s.items.find((i) => i.type === "image").data.imageUrl =
    "https://127.0.0.1/private";
  const calls = [];
  const { project, user, importer } = await fixture(t, miroFetch(s, calls));
  const p = await importer.preview(project.id, user, { board: miroBoard });
  assert.equal(
    p.nodes.find((n) => n.id === miroId(miroBoard, "image")).type,
    "link",
  );
  assert.ok(
    p.issues.some((i) => i.id === "image" && /resource/.test(i.message)),
  );
  assert.ok(calls.every((c) => !c.url.includes("127.0.0.1")));
});
test("Miro rate limits and permission errors are actionable and do not leak provider bodies", async (t) => {
  let reject = false;
  const real = miroFetch(),
    fetcher = (url, opts) =>
      reject
        ? new Response("private-provider-error", {
            status: 429,
            headers: { "retry-after": "12" },
          })
        : real(url, opts);
  const { project, user, importer } = await fixture(t, fetcher);
  reject = true;
  await assert.rejects(
    importer.preview(project.id, user, { board: miroBoard }),
    (e) =>
      e.status === 429 &&
      /12 seconds/.test(e.message) &&
      !e.message.includes("private"),
  );
});
