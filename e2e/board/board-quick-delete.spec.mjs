// F0.22-11: a note deleted while the save that created it is still being answered is deleted on the
// server too, with no conflict to review. The server lists a note's fields in its own order, and the
// same note was taken for one changed there.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Quick delete" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
const stickies = async () => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === app.board.id).nodes.filter((n) => n.type === "sticky").length;

test("a note deleted while its creation is still being saved is deleted on the server, with no conflict", async ({ page }) => {
  let release, first = true;
  const held = new Promise((resolve) => (release = resolve));
  // The server saves the new note at once; its answer reaches the page only after the delete.
  await page.route(`**/api/projects/${app.project.id}/boards/**`, async (route) => {
    if (route.request().method() !== "PATCH" || !first) return route.continue();
    first = false;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas").waitFor();
  await page.locator('.board-tools [data-tool="sticky"]').click();
  const canvas = await page.locator("#canvas").boundingBox();
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect.poll(stickies).toBe(1);
  await expect(page.locator(".inline-editing")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await expect(page.locator("#canvas [data-node]")).toHaveCount(0);
  release();
  await expect.poll(stickies, { message: "the delete reaches the server" }).toBe(0);
  await expect(page.locator(".app-save-warning"), "no conflict to review").toBeHidden();
});
