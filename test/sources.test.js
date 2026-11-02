import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { Sources, sourceAccess } from "../server/sources.js";
test("source sync keeps IDs/comments/notes, exposes conflicts and retains disconnected records", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-sources-")),
    notes = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-notes-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(notes, { recursive: true, force: true });
  });
  const project = await store.createProject({ title: "Private sources" }),
    auth = new Auth(store, true),
    user = { username: "owner", admin: true, organisations: {} };
  const sources = new Sources(store, auth, { env: { OBSIDIAN_ROOT: notes } });
  await fs.writeFile(
    path.join(notes, "task.md"),
    "---\nid: abc\ntitle: Source title\nstatus: todo\n---\nRemote description",
  );
  const source = await sources.configure(project.id, user, {
    provider: "obsidian",
    scope: { folder: "." },
  });
  const preview = await sources.preview(project.id, source.id);
  assert.equal(preview.count, 1);
  assert.equal((await store.snapshot(project.id)).tasks.length, 0);
  await sources.sync(project.id, source.id);
  const task = (await store.snapshot(project.id)).tasks[0];
  assert.equal(task.source.external_id, "abc");
  assert.equal(task.body, "");
  assert.equal(task.source.description, "Remote description");
  const changed = await store.updateTask(project.id, task.id, {
    revision: task.revision,
    body: "Local annotation",
  });
  await assert.rejects(
    store.updateTask(project.id, task.id, {
      revision: changed.revision,
      title: "Direct edit",
    }),
    /belongs/,
  );
  await fs.writeFile(
    path.join(notes, "task.md"),
    "---\nid: abc\ntitle: Source renamed\nstatus: done\n---\nRemote description",
  );
  await sources.sync(project.id, source.id);
  let next = (await store.snapshot(project.id)).tasks[0];
  assert.equal(next.id, task.id);
  assert.equal(next.title, "Source renamed");
  assert.equal(next.body, "Local annotation");
  const file = store.file(project.id, "tasks", task.id),
    record = await store.read(file);
  await store.write(
    file,
    { ...record.data, title: "Local external editor" },
    record.body,
    record,
  );
  await fs.writeFile(
    path.join(notes, "task.md"),
    "---\nid: abc\ntitle: Remote conflict\nstatus: done\n---\n",
  );
  await sources.sync(project.id, source.id);
  const info = (await sources.list(project.id)).sources[0];
  assert.equal(info.conflicts.length, 1);
  next = (await store.snapshot(project.id)).tasks[0];
  await sources.resolve(project.id, source.id, {
    task: next.id,
    revision: next.revision,
    choice: "remote",
  });
  assert.equal(
    (await store.snapshot(project.id)).tasks[0].title,
    "Remote conflict",
  );
  await sources.disconnect(project.id, source.id);
  assert.equal((await store.snapshot(project.id)).tasks.length, 1);
  assert.equal(
    sourceAccess(
      { username: "other", admin: false },
      (await store.snapshot(project.id)).project,
    ),
    false,
  );
  const encrypted = await sources.encrypt({ access_token: "secret-value" });
  assert.ok(!encrypted.includes("secret-value"));
  assert.equal((await sources.decrypt(encrypted)).access_token, "secret-value");
});
test("Obsidian publication checks the full file version and preserves body/YAML comments", async (t) => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "pencils-source-write-"),
    ),
    notes = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-note-write-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(notes, { recursive: true, force: true });
  });
  const project = await store.createProject({ title: "Publish" }),
    sources = new Sources(store, new Auth(store, true), {
      env: { OBSIDIAN_ROOT: notes },
    }),
    user = { username: "owner", admin: true };
  const file = path.join(notes, "note.md");
  await fs.writeFile(
    file,
    "---\nid: stable\ntitle: Original # keep comment\ncustom: untouched\n---\nBody unchanged\n",
  );
  const s = await sources.configure(project.id, user, {
    provider: "obsidian",
    scope: { folder: "." },
    capabilities: { edit: true },
  });
  await sources.sync(project.id, s.id);
  await sources.writeback(project.id, s.id, {
    action: "edit",
    external_id: "stable",
    title: "Published title",
  });
  const text = await fs.readFile(file, "utf8");
  assert.match(text, /Published title # keep comment/);
  assert.match(text, /custom: untouched/);
  assert.match(text, /Body unchanged/);
  await assert.rejects(
    sources.writeback(project.id, s.id, {
      action: "edit",
      external_id: "stable",
      title: "Stale publication",
    }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await sources.list(project.id)).sources[0].jobs[0].state,
    "Conflict",
  );
});
test("Jira paginated read retains raw rich text and rejects writes without capability", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-jira-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const project = await store.createProject({ title: "Jira test" }),
    auth = new Auth(store, true),
    calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    let data;
    if (url.endsWith("accessible-resources"))
      data = [
        {
          id: "cloud-one",
          url: "https://example.atlassian.net",
          name: "Test site",
        },
      ];
    else {
      const page = JSON.parse(options.body);
      data = {
        issues: [
          {
            id: page.nextPageToken ? "2" : "1",
            key: page.nextPageToken ? "DEMO-2" : "DEMO-1",
            fields: {
              summary: "Same title",
              status: { name: "todo" },
              issuetype: { name: "task" },
              description: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Rich text",
                        marks: [{ type: "strong" }],
                      },
                    ],
                  },
                ],
              },
              updated: "2026-10-17T00:00:00Z",
            },
          },
        ],
        ...(page.nextPageToken
          ? { isLast: true }
          : { nextPageToken: "page-two" }),
      };
    }
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  };
  const sources = new Sources(store, auth, { fetch }),
    s = await sources.configure(
      project.id,
      { username: "owner", admin: true },
      {
        provider: "jira",
        scope: { cloudId: "cloud-one", jql: "project = DEMO" },
      },
    ),
    data = await sources.load(project.id);
  data.sources[0].credentials = await sources.encrypt({
    access_token: "test-token",
    expires: Date.now() + 3600000,
  });
  await sources.save(project.id, data);
  await sources.sync(project.id, s.id);
  const tasks = (await store.snapshot(project.id)).tasks;
  assert.equal(tasks.length, 2);
  assert.notEqual(tasks[0].id, tasks[1].id);
  assert.equal(calls.filter((c) => c.url.endsWith("search/jql")).length, 2);
  assert.equal(
    (await sources.load(project.id)).sources[0].records["1"].raw.fields
      .description.content[0].content[0].marks[0].type,
    "strong",
  );
  assert.ok(
    !JSON.stringify(await sources.list(project.id)).includes("test-token"),
  );
  await assert.rejects(
    sources.writeback(project.id, s.id, {
      action: "edit",
      external_id: "1",
      title: "Blocked",
    }),
    (e) => e.status === 403,
  );
});

test('local assignee, status, priority and dates survive every source sync without publishing', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-local-source-'));
  const store = new Store(root); await store.init();
  t.after(async () => { await store.close(); await fs.rm(root, { recursive:true, force:true }); });
  const project = await store.createProject({title:'Local planning'});
  const sources = new Sources(store, new Auth(store,true), {env:{}});
  const source = await sources.configure(project.id, {username:'owner',admin:true}, {provider:'jira',scope:{cloudId:'test',jql:'project = TEST'}});
  let remote = {title:'Remote title',type:'task',status:'todo',priority:'medium',assignee:'Remote person',due:'2026-11-02'};
  sources.read = async () => [{id:'one',key:'TEST-1',version:'1',fields:remote}];
  sources.request = () => { throw Error('Local edits must never call Jira'); };
  await sources.sync(project.id,source.id);
  const current = async () => (await store.snapshot(project.id)).tasks[0];
  let task = await current();
  const edits = {status:'done',priority:'high',assignee:'',due:null,start:'2026-11-04'};
  await store.updateTask(project.id,task.id,{revision:task.revision,...edits});
  for (let i=0;i<2;i++) {
    remote={...remote,title:`Remote title ${i}`,status:'in-progress',priority:'low',assignee:'Another person',due:'2026-12-02'};
    await sources.sync(project.id,source.id);
    task=await current();
    for (const [key,value] of Object.entries(edits)) assert.equal(task[key],value,key);
    assert.equal(task.title,remote.title);
    assert.deepEqual(task.source.local_fields.sort(),['assignee','due','priority','status']);
    assert.equal((await sources.list(project.id)).sources[0].conflicts.length,0);
  }
  await assert.rejects(store.updateTask(project.id,task.id,{revision:task.revision,title:'Local title'}),/belongs/);
  await assert.rejects(store.updateTask(project.id,task.id,{revision:task.revision,status:'invalid'}),/status/i);
  await assert.rejects(store.updateTask(project.id,task.id,{revision:task.revision,due:'bad date'}),/date/i);
  assert.equal((await current()).revision,task.revision);
});
