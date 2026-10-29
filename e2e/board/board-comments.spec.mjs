// Board comments: author colour and full timestamps, five reactions that toggle and persist,
// threaded and nested replies with quotes and collapsible threads, reply drafts kept while the
// panel is closed, deleting a parent keeps its replies (and undo restores it), and replies delete
// individually on a dark phone screen until no comments remain.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { taskFieldColor } from "../../public/task-colors.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Popover lab" });
  const b = (await store.snapshot(project.id)).boards[0];
  const board = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: [{ id: "note", type: "sticky", text: "Discuss this idea", x: 150, y: 120, w: 220, h: 220 }],
    edges: [],
  });
  return { project, board };
});
// One conversation: the first comment gains reactions, a reply and a nested reply, then is deleted.
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const board = (await app.store.snapshot(app.project.id)).boards[0];
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: app.board.nodes, edges: [] });
});

const current = async () => (await app.store.snapshot(app.project.id)).boards.find((x) => x.id === app.board.id);
const comments = async () => (await current()).nodes[0].comments || [];
const panel = (page) => page.locator(".board-comments");
const composer = (page) => panel(page).locator(".inline-rich");
const comment = (page, id) => panel(page).locator(`[data-comment-id="${id}"]`);
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function openComments(page) {
  await page.locator("[data-node=note]").click();
  await page.locator("#selection-tools [data-pro=comments]").click();
  await panel(page).waitFor();
}
let first, reply, nested;

test("a comment shows its author's colour and a full timestamp under the text, without resolve buttons", async ({ page }) => {
  await openBoard(page);
  await openComments(page);
  await composer(page).fill("First comment");
  await composer(page).press("Control+Enter");
  await expect.poll(async () => (await comments()).length).toBe(1);
  const record = (await comments())[0];
  first = record.id;
  await expect(comment(page, first).locator(".comment-author")).toBeVisible();
  expect(await comment(page, first).locator(".comment-author").evaluate((el) => el.style.getPropertyValue("--task-field-color"))).toBe(taskFieldColor({}, "assignee", record.author));
  const timestamp = comment(page, first).locator(".comment-footer time");
  await expect(timestamp).toHaveAttribute("datetime", record.created);
  expect((await timestamp.getAttribute("title")).length, "the tooltip gives the full time").toBeGreaterThan((await timestamp.innerText()).length);
  const timeBounds = await timestamp.boundingBox(), bodyBounds = await comment(page, first).locator(".comment-body").boundingBox(), articleBounds = await comment(page, first).boundingBox();
  expect(timeBounds.y, "the time sits under the text").toBeGreaterThanOrEqual(bodyBounds.y + bodyBounds.height);
  expect(Math.abs(timeBounds.x + timeBounds.width - (articleBounds.x + articleBounds.width - 10)), "the time aligns to the right").toBeLessThan(2);
  await expect(panel(page).getByRole("button", { name: /^(Resolve|Reopen)$/ })).toHaveCount(0);
  await expect(comment(page, first).locator(".comment-reaction")).toHaveCount(5);
});

test("all five reactions toggle on and save", async ({ page }) => {
  await openBoard(page);
  await openComments(page);
  for (const emoji of ["👍", "❤️", "😂", "🎉", "👀"]) {
    await comment(page, first).getByLabel("Add reaction", { exact: true }).click();
    await comment(page, first).locator(`.comment-emoji-picker [data-emoji="${emoji}"]`).click();
    await expect.poll(async () => (await comments())[0].reactions?.some((r) => r.emoji === emoji), { message: `${emoji} saved` }).toBe(true);
  }
});

test("a reply draft survives closing the panel, and replies nest in a collapsible thread", async ({ page }) => {
  await openBoard(page);
  await openComments(page);
  await comment(page, first).locator("[data-comment-reply]").click();
  await composer(page).fill("Reply draft");
  await panel(page).locator("[data-comments-close]").click();
  await openComments(page);
  await expect(composer(page)).toHaveText("Reply draft");
  await expect(panel(page).locator(".comment-reply-context")).toBeVisible();
  await composer(page).fill("A reply");
  await composer(page).press("Control+Enter");
  await expect.poll(async () => (await comments()).length).toBe(2);
  reply = (await comments())[1];
  expect(reply.replyTo).toBe(first);
  await expect(comment(page, reply.id)).toHaveClass(/board-comment-reply/);
  await comment(page, reply.id).locator("[data-comment-reply]").click();
  await composer(page).fill("Nested reply");
  await composer(page).press("Control+Enter");
  await expect.poll(async () => (await comments()).length).toBe(3);
  nested = (await comments())[2];
  expect(nested.replyTo).toBe(reply.id);
  const thread = panel(page).locator(`[data-comment-thread="${first}"]`);
  await expect(thread.locator(":scope > summary")).toHaveText("2 replies");
  await expect(comment(page, nested.id).locator(".comment-reply-quote")).toHaveText(/A reply/);
  await comment(page, nested.id).locator(".comment-reply-quote").click();
  await expect(comment(page, reply.id), "the quote leads to the quoted reply").toBeFocused();
  await thread.locator(":scope > summary").click();
  await expect(comment(page, reply.id)).toBeHidden();
  // A reaction refresh preserves a collapsed thread instead of reopening it.
  await comment(page, first).locator('.comment-reactions [data-emoji="👍"]').click();
  await expect.poll(async () => (await comments())[0].reactions.length).toBe(4);
  await expect(comment(page, first).locator(".comment-reactions [aria-pressed=true]")).toHaveCount(4);
  expect(await thread.evaluate((el) => el.open), "the thread stays collapsed").toBe(false);
  await comment(page, first).getByLabel("Add reaction", { exact: true }).click();
  await comment(page, first).locator('.comment-emoji-picker [data-emoji="👍"]').click();
  await expect.poll(async () => (await comments())[0].reactions.length).toBe(5);
  await thread.locator(":scope > summary").click();
});

test("reactions persist across a reload and toggle off", async ({ page }) => {
  await openBoard(page);
  await openComments(page);
  await expect(comment(page, first).locator(".comment-reactions [aria-pressed=true]")).toHaveCount(5);
  await comment(page, first).locator('.comment-reactions [data-emoji="👍"]').click();
  await expect.poll(async () => (await comments())[0].reactions.length).toBe(4);
});

test("deleting a parent keeps its replies, and undo restores it", async ({ page }) => {
  await openBoard(page);
  await openComments(page);
  await comment(page, first).locator("[data-comment-delete]").click();
  await expect.poll(async () => (await comments())[0].deleted).toBeTruthy();
  await expect(comment(page, first)).toHaveText("Comment deleted", { useInnerText: true });
  await expect(comment(page, reply.id)).toBeVisible();
  await expect(comment(page, nested.id)).toBeVisible();
  await panel(page).locator("[data-comments-close]").click();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await comments())[0].deleted).toBeFalsy();
  await openComments(page);
  await expect(comment(page, first)).toHaveText(/First comment/);
});

onDevices(["phone"], () => {
  test("replies delete individually on a dark phone screen, with no orphaned placeholder", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await openComments(page);
    await comment(page, reply.id).locator("[data-comment-delete]").click();
    await expect.poll(async () => (await comments()).find((c) => c.id === reply.id)?.deleted).toBeTruthy();
    await comment(page, nested.id).locator("[data-comment-delete]").click();
    await expect.poll(async () => (await comments()).length).toBe(1);
    await comment(page, first).locator("[data-comment-delete]").click();
    await expect.poll(async () => (await comments()).length).toBe(0);
    await expect(panel(page).locator(".board-comments-list")).toHaveText(/No comments yet/);
  });
});
