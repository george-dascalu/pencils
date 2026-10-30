// Task cards and their conversation: a collapsed board card shows assignee, status, priority
// and due in order with a one-line title; comments format rich text and Markdown safely,
// take emoji reactions and share one conversation with the card editor; history shows
// before/after values; the save state names the running version and flags a newer one
// without covering project navigation. Panels pass WCAG 2.1 AA checks.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, useApp } from "../fixtures.mjs";
import { APP_VERSION } from "../../public/app-version.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Task details" });
  const original = await store.createTask(project.id, { title: "Collect inspiration and early ideas for a calmer workspace", assignee: "Alex", priority: "low", status: "todo", body: "First draft\n\nKeep this paragraph." });
  const task = await store.updateTask(project.id, original.id, {
    revision: original.revision,
    assignee: "George",
    priority: "high",
    status: "in-progress",
    body: "Final draft\n\nKeep this paragraph.",
    comments: [{ id: "legacy", text: "**A literal old comment**", author: "Alex", created: "2026-10-20T12:00:00Z" }],
  });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card", type: "task", task: task.id, x: 150, y: 120, w: 340, h: 150, taskCollapsed: true }], edges: [] });
  return { project, task, board };
});
const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);
const commentCount = async () => (await saved()).comments.length;
const card = (page) => page.locator("[data-node=card]");
const openBoard = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await card(page).locator(".live-card-state").waitFor();
};
const axe = async (page, selector) => {
  const results = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), `${selector} accessibility`).toEqual([]);
};

// Owner request, 30 October 2026: the top bar shows no version or update notice; the sidebar, which
// already shows the version, flags a newer one.
test("the sidebar names the running version and flags a newer one; the top bar shows neither", async ({ page }) => {
  expect((await (await fetch(`${app.base}/api/health`)).json()).version).toBe(APP_VERSION);
  await openBoard(page);
  await expect(page.locator(".side-footer .app-version")).toContainText(`v${APP_VERSION}`);
  await expect(page.locator("#save-state")).not.toContainText(`v${APP_VERSION}`);
  await expect(page.locator("#save-state")).not.toContainText("Connected to local server");
  await page.route("**/api/health", (route) => route.fulfill({ json: { ok: true, version: "99.0.0" } }));
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(page.locator(".side-footer .app-update-available")).toBeAttached();
  await expect(page.locator("#save-state")).not.toContainText("Update available");
  await page.locator(".topbar .mobile-menu").click();
  await expect(page.locator(".side-footer").getByText("Update available")).toBeVisible();
  const [sidebar, notice] = [await page.locator(".sidebar").boundingBox(), await page.locator(".side-footer .app-update-available").boundingBox()];
  expect(notice.x + notice.width, "the notice fits in the sidebar").toBeLessThanOrEqual(sidebar.x + sidebar.width);
});

test("a collapsed board card shows assignee, status, priority and due in order with a one-line title", async ({ page }) => {
  await openBoard(page);
  expect(await card(page).locator(".live-card-state").evaluate((el) => [...el.querySelectorAll(":scope > *, :scope > .field-box > *")].map((c) => c.className))).toEqual(["field-box", "canvas-task-assignee", "canvas-task-status", "canvas-task-priority priority high", "canvas-task-dates"]);
  await expect(card(page).locator(".canvas-task-assignee .task-assignee")).toHaveText("G");
  const title = await card(page).locator(".task-title").evaluate((el) => ({ wrap: getComputedStyle(el).whiteSpace, size: getComputedStyle(el).fontSize, tooltip: el.title }));
  expect(title).toEqual({ wrap: "nowrap", size: "14px", tooltip: app.task.title });
});

test("card comments format rich text and Markdown safely and take emoji reactions", async ({ page }) => {
  await openBoard(page);
  const before = await commentCount();
  await card(page).locator("[data-pro=comments]").click();
  const panel = page.locator(".board-comments");
  const rich = panel.getByRole("textbox", { name: "Comment", exact: true });
  // Old comments stay literal text.
  await expect(panel.locator("[data-comment-id=legacy]")).toBeVisible();
  await expect(panel.locator("[data-comment-id=legacy] .comment-body strong")).toHaveCount(0);
  await rich.fill("Formatted comment");
  await rich.press("Control+a");
  await panel.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(rich.locator("b,strong")).toHaveText("Formatted comment");
  await rich.press("Control+Enter");
  await expect.poll(commentCount).toBe(before + 1);
  const added = (await saved()).comments.at(-1);
  expect(added.format).toBe("markdown");
  expect(added.text).toBe("**Formatted comment**");
  const comment = panel.locator(`[data-comment-id="${added.id}"]`);
  await expect(comment.locator(".comment-body strong")).toHaveText("Formatted comment");
  expect(await comment.locator(".comment-actions").evaluate((el) => [...el.children].map((n) => (n.matches("details") ? "emoji" : n.hasAttribute("data-comment-reply") ? "reply" : "delete")))).toEqual(["reply", "emoji", "delete"]);
  await expect(comment.locator("[data-comment-delete]")).toHaveCSS("color", "rgb(179, 68, 56)");
  await comment.getByLabel("Add reaction", { exact: true }).click();
  await expect(comment.locator(".comment-emoji-picker")).toBeVisible();
  await comment.locator('.comment-emoji-picker [data-emoji="🎉"]').click();
  await expect.poll(async () => (await saved()).comments.at(-1).reactions?.length).toBe(1);
  await panel.getByRole("button", { name: "Markdown", exact: true }).click();
  await panel.getByRole("textbox", { name: "Comment Markdown", exact: true }).fill("## Update\n\n- First point\n- **Second** point\n\n[Reference](https://example.com)\n\n<script>window.commentAttack=1</script>");
  await panel.getByRole("button", { name: "Rich text", exact: true }).click();
  await expect(rich.locator("li")).toHaveCount(2);
  await expect(rich.locator("h2")).toHaveText("Update");
  await rich.press("Control+Enter");
  await expect.poll(commentCount).toBe(before + 2);
  await expect(panel.locator(".comment-body li")).toHaveCount(2);
  expect(await page.evaluate(() => window.commentAttack)).toBe(undefined);
  await expect(panel.locator(".comment-body script")).toHaveCount(0);
  await axe(page, ".board-comments");
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
});

test("the card editor is compact and its history shows before and after values", async ({ page }) => {
  await openBoard(page);
  await card(page).locator("[data-pro=task-details]").click();
  await page.locator("#task-form").waitFor();
  const geometry = await page.locator("#task-form").evaluate((form) => {
    const rect = (selector) => form.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      head: rect(".task-editor-header-row"),
      title: rect("[name=title]"),
      fields: [...form.querySelectorAll(".task-metadata-main > .field")].map((el) => el.getBoundingClientRect().y),
      tools: [...form.querySelectorAll(".task-description .task-rich-tools > .selection-group,.task-description .rich-toolbar")].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect().y),
    };
  });
  expect(geometry.title.y).toBeGreaterThanOrEqual(geometry.head.y + geometry.head.height);
  expect(Math.max(...geometry.fields) - Math.min(...geometry.fields)).toBeLessThan(2);
  expect(Math.max(...geometry.tools) - Math.min(...geometry.tools)).toBeLessThan(5);
  await page.getByRole("button", { name: "Version history", exact: true }).click();
  const history = page.getByLabel("Task version history", { exact: true });
  await history.locator(".task-history-version").first().waitFor();
  await history.locator("details").evaluateAll((items) => items.forEach((el) => (el.open = true)));
  await expect(history).toContainText("Before");
  await expect(history).toContainText("After");
  await expect(history.locator(".task-history-before").filter({ hasText: "Alex" }).first()).toBeAttached();
  await expect(history.locator(".task-history-after").filter({ hasText: "George" }).first()).toBeAttached();
  await expect(history.locator(".task-history-before").filter({ hasText: "Low" }).first()).toBeAttached();
  await expect(history.locator(".task-history-after").filter({ hasText: "High" }).first()).toBeAttached();
  await expect(history.locator("pre:empty")).toHaveCount(0);
  await axe(page, ".task-history-panel");
});

test("the editor's comments pane shares the card conversation and fits a phone in both themes", async ({ page }) => {
  await openBoard(page);
  const before = await commentCount();
  await card(page).locator("[data-pro=task-details]").click();
  await page.getByRole("button", { name: "Task comments", exact: true }).click();
  const embedded = page.locator(".task-comments-panel");
  await embedded.getByRole("textbox", { name: "Comment", exact: true }).fill("Reply from the task editor");
  await embedded.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect.poll(commentCount).toBe(before + 1);
  expect((await saved()).body).toBe(app.task.body);
  // The open editor is resized to a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-editor-pane=details]").click();
  await expect(page.locator("[data-editor-pane=details]")).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#task-form").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator("[data-editor-pane=comments]").click();
  await embedded.getByRole("textbox", { name: "Comment", exact: true }).fill("Mobile draft");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
    expect(await embedded.evaluate((el) => el.scrollWidth <= el.clientWidth), `${theme}: no horizontal overflow`).toBe(true);
    await axe(page, ".task-comments-panel");
  }
});
