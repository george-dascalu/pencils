// Card edits save automatically: the title keeps focus while saving, workflow transitions
// and untouched planning values hold, blank titles stay as browser drafts, failed saves
// queue and retry by themselves, closing flushes the last edit, comments (replies and
// reactions) and history share one pane beside the editor, and the board's task panel
// updates its card live with the header actions in order.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({
  project: await store.createProject({
    title: "Autosave lab",
    schema: {
      statuses: ["todo", "review", "done"],
      done: ["done"],
      initial_status: "todo",
      transitions: { todo: ["review"], review: ["done"], done: ["review"] },
    },
  }),
}));
const createCard = (title = "Original title") => app.store.createTask(app.project.id, { title, body: "Original description", estimate: 3 });
const snap = () => app.store.snapshot(app.project.id);
const saved = async (id) => (await snap()).tasks.find((t) => t.id === id);
const title = (page) => page.locator("#task-form [name=title]");
const status = (page) => page.locator("[data-autosave-status]");
const comments = (page) => page.locator(".board-comments");
const open = (page, id) => page.locator(`[data-action=task-open][data-id="${id}"]`).first().click();
const visit = async (page, id) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, id);
  await title(page).waitFor();
};

test("edits save automatically while the title keeps focus, following the workflow and keeping planning values", async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  await title(page).fill("Saved while focused");
  await expect.poll(async () => (await saved(card.id)).title).toBe("Saved while focused");
  await expect(title(page)).toBeFocused();
  await page.locator('[aria-label="Task description"]').fill("**New description**");
  await expect.poll(async () => (await saved(card.id)).body).toContain("New description");
  await page.locator("#task-form [name=status]").selectOption("review");
  await expect.poll(async () => (await saved(card.id)).status).toBe("review");
  // The workflow offers Done once the card is in review.
  await expect(page.locator('#task-form [name=status] option[value="done"]')).toHaveCount(1);
  await page.locator("#task-form [name=status]").selectOption("done");
  await expect.poll(async () => (await saved(card.id)).status).toBe("done");
  expect((await saved(card.id)).estimate, "Unedited planning values survive autosave").toBe(3);
});

test("a pending valid save does not discard a later blank title, which stays a browser draft until fixed", async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await title(page).fill("Before blank");
  // Let the debounced save start before blanking the title.
  await expect(status(page)).not.toHaveText(/Unsaved changes/);
  await title(page).fill("");
  // The status reports the missing title once the debounced save has been refused.
  await expect(status(page)).toContainText(/required fields/);
  expect((await saved(card.id)).title).not.toBe("");
  await title(page).fill("Recovered title");
  await expect.poll(async () => (await saved(card.id)).title).toBe("Recovered title");
});

test("failed saves stay queued in the browser and retry without another edit", async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await page.route("**/api/projects/*/tasks/*", (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { error: "Test offline" } }) : route.continue(),
  );
  await title(page).fill("Queued edit");
  await status(page).filter({ hasText: "Pending — changes kept in this browser" }).waitFor();
  expect((await saved(card.id)).title).not.toBe("Queued edit");
  await page.unroute("**/api/projects/*/tasks/*");
  await expect.poll(async () => (await saved(card.id)).title, { timeout: 15000 }).toBe("Queued edit");
  await expect(status(page)).toHaveText(/^Saved automatically$/);
});

test("comments open beside the right-docked editor with replies and reactions, in the same place as history", async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  const editorBeforeComments = await page.locator(".task-dialog").boundingBox();
  await page.locator("[data-feature=task-comments]").click();
  await comments(page).waitFor();
  await expect(comments(page)).not.toHaveAttribute("popover");
  const commentsBox = await comments(page).boundingBox();
  const dialogBox = await page.locator(".task-dialog").boundingBox();
  expect(commentsBox.x + commentsBox.width, "Comments open to the left of a right-docked editor").toBeLessThanOrEqual(dialogBox.x);
  expect(commentsBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox, "Opening comments keeps the editor in place").toEqual(editorBeforeComments);
  expect(await comments(page).locator("textarea").evaluate((el) => el.form)).toBe(null);
  await comments(page).locator('[contenteditable="true"]').fill("A task comment");
  await comments(page).getByRole("button", { name: "Add comment", exact: true }).click();
  await expect.poll(async () => (await saved(card.id)).comments?.length).toBe(1);
  await comments(page).getByRole("button", { name: "Reply", exact: true }).click();
  await comments(page).locator('[contenteditable="true"]').fill("A reply");
  await comments(page).locator("[data-comment-submit]").click();
  await expect.poll(async () => (await saved(card.id)).comments?.length).toBe(2);
  await comments(page).getByLabel("Add reaction", { exact: true }).first().click();
  await comments(page).locator("[data-comment-react]:visible").first().click();
  await expect.poll(async () => (await saved(card.id)).comments?.[0].reactions?.length).toBe(1);
  await page.locator("[data-feature=task-history]").click();
  await expect(comments(page)).toHaveCount(0);
  await page.locator(".task-history-panel .recovery-item").first().waitFor();
  const historyBox = await page.locator(".task-history-panel").boundingBox();
  for (const key of ["x", "y", "width", "height"]) expect(Math.abs(historyBox[key] - commentsBox[key]), `${key}: comments match history`).toBeLessThan(2);
});

test("comments and history share one pane clear of the sidebar at desktop, laptop and phone widths", async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await title(page).fill("A version for history");
  await expect.poll(async () => (await saved(card.id)).title).toBe("A version for history");
  // The open editor is resized through each width.
  for (const width of [1400, 1100, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("[data-feature=task-comments]").click();
    await comments(page).waitFor();
    const box = await comments(page).boundingBox();
    expect(box.x >= 0 && box.x + box.width <= width, `comments fit at ${width}px`).toBe(true);
    if (width >= 1100) {
      const editor = await page.locator(".task-dialog").boundingBox();
      // Since 0.19.0 the pane stays clear of the sidebar: it floats beside the
      // editor on wide screens (>= 1320px) and docks inside it below that.
      if (width >= 1320) expect(box.x + box.width).toBeLessThanOrEqual(editor.x);
      else expect(box.x >= editor.x && box.x + box.width <= editor.x + editor.width + 1, "Comments dock inside the editor when there is no room beside it").toBe(true);
      const sidebar = await page.locator(".sidebar").boundingBox();
      if (sidebar && sidebar.x + sidebar.width > 1) expect(box.x, "Comments stay clear of the sidebar").toBeGreaterThanOrEqual(sidebar.x + sidebar.width - 1);
      expect(
        await comments(page).evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(rect.left + 16, rect.top + 16));
        }),
        "The comments panel remains above the navigation sidebar",
      ).toBe(true);
    }
    await page.locator("[data-feature=task-history]").click();
    await page.locator(".task-history-panel .recovery-item").first().waitFor();
    const history = await page.locator(".task-history-panel").boundingBox();
    // Phone panes use the page scroller and grow with their own content.
    for (const key of width < 600 ? ["x", "y", "width"] : ["x", "y", "width", "height"]) expect(Math.abs(history[key] - box[key]), `Modal ${width}: matching ${key}`).toBeLessThan(2);
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await expect(page.locator("#task-form")).toHaveCount(1);
  // Since 0.19.0 History is a pane without its own close button; since 0.20.14 a second tap on it
  // returns to the details, as wide screens have no Info button.
  await page.locator("[data-feature=task-history]").click();
  await expect(page.locator(".task-history-panel")).toBeHidden();
});

test("closing before the debounce still saves the last edit", async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await title(page).fill("Close before debounce");
  await page.locator("[data-action=dialog-close]").click();
  await expect.poll(async () => (await saved(card.id)).title).toBe("Close before debounce");
  await page.reload();
  await open(page, card.id);
  await expect(title(page)).toHaveValue("Close before debounce");
});

test("the board's task panel updates its card live, keeps its header actions in order and comments beside it", async ({ page }) => {
  const card = await createCard("Board card");
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("[data-action=board-task]").click();
  await page.locator(`[data-action=board-pick][data-id="${card.id}"]`).click();
  await expect.poll(async () => (await snap()).boards[0].nodes.find((n) => n.task === card.id)?.id).toBeTruthy();
  const nodeId = (await snap()).boards[0].nodes.find((n) => n.task === card.id).id;
  const node = page.locator(`[data-node="${nodeId}"]`);
  await node.locator("[data-pro=task-details]").click();
  const panel = page.locator(".board-task-editor");
  await title(page).fill("Live on the board");
  await expect(node.locator(".task-title")).toHaveText("Live on the board");
  await expect(title(page)).toHaveValue("Live on the board");
  const actions = await panel.locator('.task-editor-actions button, .board-task-editor-heading [data-action="dialog-close"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  expect(actions).toEqual(["Task details", "Version history", "Task comments", "Duplicate task", "Archive task", "Delete task", "Close task"]);
  for (const width of [1400, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((theme) => {
        window.PencilsAppearance.write({ theme });
        document.querySelector(".sidebar")?.classList.remove("open");
        document.querySelector(".sidebar-overlay")?.classList.remove("visible");
      }, theme);
      if (width < 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
      await page.locator("[data-feature=task-comments]").click();
      await comments(page).waitFor();
      const box = await comments(page).boundingBox();
      expect(box.x >= 0 && box.x + box.width <= width, `comments fit at ${width}px ${theme}`).toBe(true);
      if (width === 1400) {
        const p = await panel.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(p.x + p.width);
      }
      expect(await comments(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      // Since 0.19.0 Comments is a pane without its own close button; a second tap returns to the details (0.20.14).
      await page.locator("[data-feature=task-comments]").click();
      await expect(comments(page)).toHaveCount(0);
    }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await title(page).fill("Latest before duplicate");
  await page.locator("[data-feature=task-duplicate]").click();
  await expect.poll(async () => (await snap()).tasks.some((t) => t.title === "Latest before duplicate (copy)")).toBe(true);
  expect((await saved(card.id)).title).toBe("Latest before duplicate");
});
