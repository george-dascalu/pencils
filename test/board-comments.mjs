import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { taskFieldColor } from "../public/task-colors.js";
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
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === '1' });
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
      "Saved automatically",
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
    composer = panel.locator(".inline-rich");
  const comment = (id) => panel.locator(`[data-comment-id="${id}"]`);
  await composer.fill("First comment");
  await composer.press("Control+Enter");
  await until(async () => (await current()).nodes[0].comments?.length === 1);
  const first = (await current()).nodes[0].comments[0].id;
  const firstRecord = (await current()).nodes[0].comments[0];
  assert.equal(await comment(first).locator('.comment-author').evaluate(el => el.style.getPropertyValue('--task-field-color')), taskFieldColor({}, 'assignee', firstRecord.author));
  const timestamp = comment(first).locator('.comment-footer time');
  assert.equal(await timestamp.getAttribute('datetime'), firstRecord.created);
  assert.ok((await timestamp.getAttribute('title')).length > (await timestamp.innerText()).length);
  const timeBounds = await timestamp.boundingBox(), bodyBounds = await comment(first).locator('.comment-body').boundingBox(), articleBounds = await comment(first).boundingBox();
  assert.ok(timeBounds.y >= bodyBounds.y + bodyBounds.height);
  assert.ok(Math.abs(timeBounds.x + timeBounds.width - (articleBounds.x + articleBounds.width - 10)) < 2);
  assert.equal(
    await panel.getByRole("button", { name: /^(Resolve|Reopen)$/ }).count(),
    0,
  );
  assert.equal(await comment(first).locator(".comment-reaction").count(), 5);
  for (const emoji of ["👍", "❤️", "😂", "🎉", "👀"]) {
    await comment(first).getByLabel("Add reaction", { exact: true }).click();
    await comment(first).locator(`.comment-emoji-picker [data-emoji="${emoji}"]`).click();
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
  assert.equal(await composer.innerText(), "Reply draft");
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
  const thread = panel.locator(`[data-comment-thread="${first}"]`);
  assert.equal(await thread.locator(':scope > summary').innerText(), '2 replies');
  assert.match(await comment(nested.id).locator('.comment-reply-quote').innerText(), /A reply/);
  await comment(nested.id).locator('.comment-reply-quote').click();
  assert.ok(await comment(reply.id).evaluate(el => document.activeElement === el));
  await thread.locator(':scope > summary').click();
  assert.equal(await comment(reply.id).isVisible(), false);
  // A reaction refresh preserves a collapsed thread instead of reopening it.
  await comment(first).locator('.comment-reactions [data-emoji="👍"]').click();
  await until(async () => (await current()).nodes[0].comments[0].reactions.length === 4);
  assert.equal(await thread.evaluate(el => el.open), false);
  await comment(first).getByLabel('Add reaction', { exact: true }).click();
  await comment(first).locator('.comment-emoji-picker [data-emoji="👍"]').click();
  await until(async () => (await current()).nodes[0].comments[0].reactions.length === 5);
  await thread.locator(':scope > summary').click();
  await page.reload();
  await page.locator("#canvas").waitFor();
  await open();
  assert.equal(await comment(first).locator(".comment-reactions [aria-pressed=true]").count(), 5);
  await comment(first).locator('.comment-reactions [data-emoji="👍"]').click();
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
  await panel.locator('.board-comments-list').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: "/tmp/pencils-comment-replies.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await panel.locator('.board-comments-list').evaluate(el => el.scrollTop = 0);
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
