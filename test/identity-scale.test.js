import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { Store } from "../server/store.js";

// Owner request (F0.22-51): a new card costs about the same in a project of thousands of cards as in
// a small one. Each create used to parse and rewrite the whole card number register twice over.
async function project(root, count) {
  const seed = new Store(root);
  await seed.init();
  const p = await seed.createProject({ title: `Cards ${count}` });
  const first = await seed.createTask(p.id, { title: "Card 1" });
  const source = await fs.readFile(path.join(root, first.file), "utf8");
  const dir = path.dirname(path.join(root, first.file)), tasks = { [first.id]: 1 };
  // The rest are written as files, as a vault that grew over time would hold them.
  for (let n = 2; n <= count; n++) {
    const id = `t-${(0x10000000 + n).toString(16)}`;
    tasks[id] = n;
    await fs.writeFile(path.join(dir, `${id}.md`), source.replaceAll(first.id, id).replace(/^number: 1$/m, `number: ${n}`).replaceAll(first.key, `${first.key.split("-")[0]}-${n}`));
  }
  const ledger = path.join(root, "Projects", p.id, "identity.md");
  await fs.writeFile(ledger, `---\n${new YAML.Document({ kind: "task-identities", project: p.id, next: count + 1, tasks }).toString({ lineWidth: 0 })}---\nTask number registry. Keep this file with the project when moving or backing up the vault.\n`);
  seed.close();
  return p.id;
}
async function open(count) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-identity-scale-"));
  const id = await project(root, count), store = new Store(root);
  await store.init();
  store.watch();
  // Opening the project reconciles the register with the files, as the app does.
  await store.snapshot(id);
  await store.createTask(id, { title: "Warm-up", creation_request: "warm" });
  let made = 0;
  return {
    // A person adds cards seconds apart, after the store's short-lived list of cards has lapsed.
    async create() {
      store.childrenCache.clear();
      const start = performance.now();
      const card = await store.createTask(id, { title: `New ${made}`, creation_request: `r-${made}` });
      const time = performance.now() - start;
      assert.equal(card.number, count + 2 + made++, "numbers keep counting up");
      return time;
    },
    async close() { store.close(); await fs.rm(root, { recursive: true, force: true }); },
  };
}
const median = (times) => times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

test("creating a card in a project of 3,000 cards costs about what it does in one of 30", async (t) => {
  const small = await open(30), big = await open(3000);
  t.after(() => Promise.all([small.close(), big.close()]));
  // Alternating the two keeps a busy machine from slowing only one of them.
  const times = { small: [], big: [] };
  for (let i = 0; i < 12; i++) { times.small.push(await small.create()); times.big.push(await big.create()); }
  const [a, b] = [median(times.small), median(times.big)];
  assert.ok(b < a * 3 + 5, `median create: ${b.toFixed(1)} ms at 3,000 cards, ${a.toFixed(1)} ms at 30`);
});

test("a repeated create request returns its card as a copy, not the store's own list", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-identity-shared-"));
  const store = new Store(root);
  await store.init();
  store.watch();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const p = await store.createProject({ title: "Retries" });
  const card = await store.createTask(p.id, { title: "Once", creation_request: "same", tags: ["kept"] });
  await store.children(p.id, "tasks");
  const again = await store.createTask(p.id, { title: "Twice", creation_request: "same" });
  assert.equal(again.id, card.id);
  again.title = "Changed by the caller";
  again.tags.push("added by the caller");
  assert.equal((await store.children(p.id, "tasks", { shared: true })).items.find((t) => t.id === card.id).title, "Once");
  assert.deepEqual((await store.createTask(p.id, { title: "Thrice", creation_request: "same" })).tags, ["kept"]);
});
