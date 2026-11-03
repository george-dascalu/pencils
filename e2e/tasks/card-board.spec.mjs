// Owner request, 3 November 2026 (F0.21-74): every card has a board, opened from the card editor,
// that shows its description (with attachments), notes, relationships, documents and boards as
// fixed panels. Nothing is placed by hand; each panel edits the card as the editor does.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { chooseCardPane } from "../helpers/card-panes.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Card boards" });
  const parent = await store.createTask(project.id, { title: "Parent card", type: "epic" });
  return { project, parent };
});
const panels = ["Description", "Notes", "Relationships", "Documents", "Boards"];

onDevices(["desktop", "ipad", "phone"], () => test("a card's board shows its parts as panels that still edit the card", { tag: "@gate" }, async ({ page, device }) => {
  const card = await app.store.createTask(app.project.id, { title: `Boarded ${device}`, body: "First words", parent: app.parent.id });
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  // The board is one of the card's sections: a button on wide screens, an option in Card section otherwise.
  const dialog = page.locator(".task-dialog"), open = dialog.getByRole("button", { name: "Card board", exact: true });
  const picker = dialog.getByRole("combobox", { name: "Card section", exact: true });
  await chooseCardPane(page, "board");
  if (await open.isVisible()) await expect(open).toHaveAttribute("aria-pressed", "true");
  else await expect(picker).toHaveValue("board");
  if (device !== "desktop") expect((await ((await open.isVisible()) ? open : picker).boundingBox()).height).toBeGreaterThanOrEqual(44);
  // It is a page over the app, as a card is on a phone: the app behind is out of reach.
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(await page.evaluate(() => document.querySelector("#app").inert)).toBe(true);
  // The board covers the page below the top bar, and its panels sit on it in columns.
  const box = await dialog.boundingBox(), view = page.viewportSize();
  expect(box.width).toBeGreaterThanOrEqual(view.width - 1);
  const body = dialog.locator(".task-editor-content > .dialog-body");
  await expect(body).toHaveCSS("display", "flex");
  await expect(body).toHaveCSS("flex-wrap", "wrap");
  for (const name of panels) {
    const panel = body.getByRole("region", { name, exact: true });
    await expect(panel, name).toBeVisible();
    await expect(panel).toHaveCSS("border-top-style", "solid");
  }
  if (device === "desktop") {
    const [first, second] = await Promise.all(["Description", "Notes"].map((name) => body.getByRole("region", { name, exact: true }).boundingBox()));
    expect(second.x, "panels sit side by side on a wide board").toBeGreaterThan(first.x + first.width - 1);
  }
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(body.getByRole("region", { name: "Relationships", exact: true })).toContainText("Parent card");
  // A panel edits the card in place.
  const description = body.getByRole("region", { name: "Description", exact: true }).getByRole("textbox").first();
  await description.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and more");
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === card.id)?.body).toContain("First words and more");
  // Another section leaves the board, and closing the card leaves nothing behind.
  await chooseCardPane(page, "history");
  await chooseCardPane(page, "board");
  await chooseCardPane(page, "details");
  if (device === "desktop") expect(await page.evaluate(() => document.querySelector("#app").inert)).toBe(false);
  await chooseCardPane(page, "board");
  await page.locator('#task-form [data-action="dialog-close"]').click();
  await expect(page.locator("#task-form")).toHaveCount(0);
  expect(await page.evaluate(() => [document.querySelector("#app").inert, document.documentElement.classList.contains("task-page-open")])).toEqual([false, false]);
}));

test("a new card has no board until it is created", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar .new-menu:not(.phone-new-task) > summary:visible").first().click();
  await page.locator('.topbar .new-menu-panel:visible [data-action="task-new"]').first().click();
  await expect(page.locator("#task-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Card board", exact: true })).toHaveCount(0);
});
