import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-popovers-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Popover lab" });
const b = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, b.id, {
  revision: b.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "Discuss this idea",
      x: 150,
      y: 120,
      w: 220,
      h: 220,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () =>
  (await store.snapshot(project.id)).boards.find((x) => x.id === b.id);
const until = async (fn) => {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await page.waitForTimeout(50);
  }
  throw Error("Timed out");
};
const saved = () =>
  page.waitForFunction(
    () =>
      document.querySelector("#board-save")?.textContent ===
      "All changes saved",
  );
const keyboard = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  const open = async () => {
    await page.locator("[data-node=note]").click();
    await page.locator("#selection-tools [data-pro=comments]").click();
  };
  await open();
  const panel = page.locator(".board-comments"),
    composer = panel.locator("textarea");
  const comment = (id) => panel.locator(`[data-comment-id="${id}"]`);
  await composer.fill("First comment");
  await composer.press("Control+Enter");
  await until(async () => (await current()).nodes[0].comments?.length === 1);
  const first = (await current()).nodes[0].comments[0].id;
  assert.equal(
    await panel.getByRole("button", { name: /^(Resolve|Reopen)$/ }).count(),
    0,
  );
  assert.equal(await comment(first).locator(".comment-reaction").count(), 5);
  for (const emoji of ["👍", "❤️", "😂", "🎉", "👀"]) {
    await comment(first).locator(`[data-emoji="${emoji}"]`).click();
    await until(async () =>
      (await current()).nodes[0].comments[0].reactions?.some(
        (r) => r.emoji === emoji,
      ),
    );
  }
  await comment(first).locator("[data-comment-reply]").click();
  await composer.fill("Reply draft");
  await panel.locator("[data-comments-close]").click();
  await open();
  assert.equal(await composer.inputValue(), "Reply draft");
  assert.ok(await panel.locator(".comment-reply-context").isVisible());
  await composer.fill("A reply");
  await composer.press("Control+Enter");
  await until(async () => (await current()).nodes[0].comments.length === 2);
  const reply = (await current()).nodes[0].comments[1];
  assert.equal(reply.replyTo, first);
  assert.ok(
    await comment(reply.id).evaluate((el) =>
      el.classList.contains("board-comment-reply"),
    ),
  );
  await comment(reply.id).locator("[data-comment-reply]").click();
  await composer.fill("Nested reply");
  await composer.press("Control+Enter");
  await until(async () => (await current()).nodes[0].comments.length === 3);
  const nested = (await current()).nodes[0].comments[2];
  assert.equal(nested.replyTo, reply.id);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await open();
  assert.equal(await comment(first).locator("[aria-pressed=true]").count(), 5);
  await comment(first).locator('[data-emoji="👍"]').click();
  await until(
    async () => (await current()).nodes[0].comments[0].reactions.length === 4,
  );
  // Delete just the parent; keep its replies and permit undo of the deletion.
  await comment(first).locator("[data-comment-delete]").click();
  await until(async () => (await current()).nodes[0].comments[0].deleted);
  assert.equal(await comment(first).innerText(), "Comment deleted");
  assert.ok(await comment(reply.id).isVisible());
  assert.ok(await comment(nested.id).isVisible());
  await panel.locator("[data-comments-close]").click();
  await page.keyboard.press("Control+z");
  await until(async () => !(await current()).nodes[0].comments[0].deleted);
  await open();
  assert.match(await comment(first).innerText(), /First comment/);
  await page.screenshot({ path: "/tmp/pencils-comment-replies.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.screenshot({ path: "/tmp/pencils-comment-replies-mobile.png" });
  // Individual replies delete independently, with no orphaned visible placeholder.
  await comment(reply.id).locator("[data-comment-delete]").click();
  await until(
    async () =>
      (await current()).nodes[0].comments.find((c) => c.id === reply.id)
        ?.deleted,
  );
  await comment(nested.id).locator("[data-comment-delete]").click();
  await until(async () => (await current()).nodes[0].comments.length === 1);
  await comment(first).locator("[data-comment-delete]").click();
  await until(async () => (await current()).nodes[0].comments.length === 0);
  assert.match(
    await panel.locator(".board-comments-list").innerText(),
    /No comments yet/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: five reaction toggles persist, threaded/nested replies, reply drafts, parent deletion preserves replies, undo restores comments, individual deletion and mobile theme",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-comment-replies-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
