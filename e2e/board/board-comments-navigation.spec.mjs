// Bug found 28 October 2026: pressing Back (or swiping back on iPhone) while a
// board's comments panel was open left the panel over the previous view. Any
// navigation away from the board now closes it.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Comments", key: "CN" });
  const task = await store.createTask(project.id, { title: "Task with comments" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "c1", type: "task", task: task.id, x: 40, y: 60, w: 300, h: 160 }] });
  return { project };
});
const panel = (page) => page.locator(".board-comments");

// From the List, open the board and the card's comments, so Back returns to the List.
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await selectProjectView(page, "board");
  await page.locator('[data-node="c1"]').waitFor();
  await page.waitForFunction(() => location.hash.includes("/board"));
  await page.locator('[data-node="c1"] [data-pro="comments"]').click();
  await panel(page).waitFor();
}

onDevices(["phone", "desktop"], () => {
  test("Back closes the comments panel with the board, and Forward does not reopen it", async ({ page }) => {
    await open(page);
    await page.goBack();
    await page.locator(".task-row").first().waitFor();
    await expect(panel(page), "no comments panel over the List").toHaveCount(0);
    // Forward returns to the board without reopening the panel.
    await page.goForward();
    await page.locator('[data-node="c1"]').waitFor();
    // Nothing should appear, so give a late reopening the chance to show itself.
    await page.waitForTimeout(300);
    await expect(panel(page)).toHaveCount(0);
  });
});

test("staying on the board keeps the panel open", async ({ page }) => {
  await open(page);
  await page.locator("#board-comment-form .inline-rich").click();
  await page.keyboard.type("Draft");
  // Let the board's next background heartbeat (which may refresh the page) come and go.
  await page.waitForResponse((r) => r.url().endsWith("/presence") && r.request().method() === "POST");
  await expect(panel(page)).toHaveCount(1);
});
