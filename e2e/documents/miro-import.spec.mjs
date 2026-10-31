// One-time Miro import from Boards (Board settings until 0.20.73): connect with an access token (never
// kept in the browser), browse and preview a board without writing anything,
// refresh the preview when options change, then import the canvas with its tasks
// and media and open it, returning focus to Board settings. The panel fits and
// passes accessibility checks on desktop and phones in both themes, and the
// import only ever reads from Miro.
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { miroFetch, miroFixture, miroBoard } from "../helpers/miro-fixture.js";
import { Auth } from "../../server/auth.js";
import { axeViolations } from "../helpers/documents.mjs";

const calls = [];
const app = useCustomApp({
  server: (store) => ({ auth: new Auth(store, "local", "George"), miro: { fetch: miroFetch(miroFixture(), calls), env: {} } }),
});
test.use({ viewportSize: { width: 1440, height: 1000 } });
test.beforeEach(({ page }) => page.setDefaultTimeout(15000));
test.afterEach(() => {
  expect(calls.filter((c) => c.method !== "GET"), "one-time import never writes to Miro").toEqual([]);
});

const panel = (page) => page.locator("#miro-import-panel");
async function openImport(page) {
  // Boards → Import from Miro since 0.20.73.
  await clickControl(page.locator('.board-toolbar [data-board-menu="board"] [data-feature="miro-import"]'));
  await panel(page).getByText("Use an access token", { exact: true }).waitFor();
}
// A project per test (the Miro connection belongs to the project), opened on its board
// with a connected preview of the fixture board loaded.
async function preview(page) {
  const project = await app.store.createProject({ title: "Miro import checks" });
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
  await openImport(page);
  await panel(page).locator("summary").click();
  await panel(page).locator('[name="token"]').fill("fixture-access-token");
  await panel(page).getByRole("button", { name: "Connect with token" }).click();
  await panel(page).getByText("Connected to Miro", { exact: true }).waitFor();
  await panel(page).getByRole("button", { name: "Browse available boards" }).click();
  await panel(page).locator("[data-miro-board]").selectOption(miroBoard);
  await panel(page).getByRole("button", { name: "Load board", exact: true }).click();
  await panel(page).locator("#miro-options").waitFor();
  return project;
}

test("connecting and previewing keep the token out of the browser and write nothing", async ({ page }) => {
  const project = await preview(page);
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes("fixture-access-token")), "the token is not stored in the browser").toBe(false);
  const snapshot = await app.store.snapshot(project.id);
  expect(snapshot.boards, "preview must not write a canvas").toHaveLength(1);
  expect(snapshot.tasks).toHaveLength(0);
  await expect(panel(page).locator(".miro-import-counts")).not.toHaveText("");
});

test("the import panel fits desktop and phone widths and passes accessibility checks in both themes", async ({ page }) => {
  await preview(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => {
      const r = document.querySelector("#miro-import-panel").getBoundingClientRect();
      return r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1;
    });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      const box = await panel(page).boundingBox();
      expect(box.x >= 0 && box.x + box.width <= width + 1, `panel fits ${width}: ${JSON.stringify(box)}`).toBe(true);
      expect(box.y >= 0 && box.y + box.height <= 1001, "panel stays inside viewport").toBe(true);
      expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await axeViolations(page, "#miro-import-panel", ["wcag2a", "wcag2aa"]), `${width} ${theme}`).toEqual([]);
    }
  }
});

test("importing creates the canvas with its tasks and media, opens it and returns focus", async ({ page }) => {
  const project = await preview(page);
  await panel(page).locator('[name="cards"]').selectOption("tasks");
  await expect(panel(page).locator('[data-miro="import"]'), "changed options require a fresh preview").toBeDisabled();
  await panel(page).getByRole("button", { name: "Update preview" }).click();
  await expect(panel(page).locator('[data-miro="import"]')).toBeEnabled();
  await panel(page).getByRole("button", { name: "Import", exact: true }).click();
  await panel(page).getByRole("button", { name: "Open imported canvas" }).waitFor();
  const snapshot = await app.store.snapshot(project.id);
  expect(snapshot.boards).toHaveLength(2);
  expect(snapshot.tasks).toHaveLength(2);
  const board = snapshot.boards.find((b) => b.nodes.length);
  expect(board.nodes.filter((n) => n.type === "image")).toHaveLength(1);
  await expect(page.locator("#board-select")).toHaveValue(board.id);
  // Closing the panel applies the refresh it held back (the import wrote attachment files),
  // which reloads the project and rebuilds the board. Keyboard focus stays on Board settings.
  const reloaded = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/projects/${project.id}`);
  await panel(page).getByRole("button", { name: "Open imported canvas" }).click();
  await expect(panel(page)).toHaveCount(0);
  await reloaded;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('.board-toolbar [data-board-menu="board"] > summary')).toBeFocused();
  const textNode = board.nodes.find((n) => n.miro?.item === "text");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  expect(await page.locator(`[data-node="${textNode.id}"]`).evaluate((el) => getComputedStyle(el).color), "text stays readable on a pale imported frame in dark mode").toBe("rgb(0, 0, 0)");
  await page.locator('[data-pro="attachment-open"]').click();
  await page.locator("#attachment-preview [data-preview-download]:visible").waitFor();
  // A change from elsewhere waits while the preview is open instead of rebuilding it away.
  await app.store.createTask(project.id, { title: `Elsewhere ${Date.now()}` });
  await page.waitForTimeout(2000);
  await expect(page.locator("#attachment-preview-title")).toHaveText(/pdf/i);
  await page.getByRole("button", { name: "Close attachment preview" }).click();
  await openImport(page);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
});
