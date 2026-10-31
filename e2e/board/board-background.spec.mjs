// Board background (board settings): plain, dots, grid and fine-grid patterns with the shared
// colour picker and a live preview; the pattern follows zoom and pan; each board keeps its own
// background, saved in the board file and seen by fresh browsers; hiding the grid is a display
// preference; the settings fit a phone; reset returns to the theme's background, light or dark.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, openSettingsPage } from "../helpers/menu-controls.mjs";
import { chooseBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Settings" });
  const board = (await store.snapshot(project.id)).boards[0];
  const other = await store.createBoard(project.id, { title: "Other canvas" });
  return { project, board, other };
});
const peach = { pattern: "grid", color: "#edc48b", lineColor: "auto", spacing: 40 };

const boardRecord = async () => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === app.board.id);
// The board's shared background each test starts from (none: the theme's default).
async function seed(background) {
  const board = await boardRecord();
  const settings = { ...board.settings };
  if (background) settings.background = background;
  else delete settings.background;
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, settings });
}
async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator(`.board-tools[data-board="${app.board.id}"]`).waitFor();
}
async function open(page) {
  // Board appearance sits at the foot of the tool bar since 0.20.73; phones keep it in Canvas tools.
  await clickControl(page.locator('[data-feature="board-settings"]'));
  await page.locator("#board-settings-form").waitFor();
}
const close = (page) => page.getByRole("button", { name: "Close board appearance", exact: true }).click();
const saved = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");
const appearance = (page) => page.locator("#canvas").evaluate((el) => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage, size: getComputedStyle(el).backgroundSize }));
const previewStyle = (page, property) => page.locator(".background-preview").evaluate((el, property) => getComputedStyle(el)[property], property);

test("a grid in a palette colour previews live and persists on the canvas and in the board file", async ({ page }) => {
  await seed();
  await enter(page);
  await open(page);
  await page.locator('[name="pattern"][value="grid"]').check();
  const picker = page.locator(".color-picker").first();
  await picker.locator("summary").click();
  await picker.getByRole("button", { name: "Peach", exact: true }).click();
  await page.locator('[name="spacing"]').fill("40");
  await page.locator('[name="spacing"]').dispatchEvent("input");
  await expect(page.locator('input[name="theme-color"]')).not.toBeChecked();
  expect(await previewStyle(page, "backgroundColor")).toBe("rgb(237, 196, 139)");
  await close(page);
  await saved(page);
  await expect.poll(async () => (await boardRecord()).settings.background).toEqual(peach);
  await page.reload();
  await page.locator("#canvas").waitFor();
  expect((await appearance(page)).color).toBe("rgb(237, 196, 139)");
  expect((await appearance(page)).image).toMatch(/linear-gradient/);
  expect((await boardRecord()).settings.background).toEqual(peach);
});

test("the fine grid previews five minor squares per major one and follows zoom and pan", async ({ page }) => {
  await seed(peach);
  await enter(page);
  await open(page);
  await page.getByRole("radio", { name: "Fine grid", exact: true }).check();
  expect(await previewStyle(page, "backgroundSize")).toBe("200px 200px, 200px 200px, 40px 40px, 40px 40px");
  await close(page);
  await saved(page);
  await expect.poll(async () => (await boardRecord()).settings.background.pattern).toBe("fine-grid");
  await page.reload();
  await page.locator("#canvas").waitFor();
  const expectGridInStep = async () => {
    const values = await page.locator("#canvas").evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector("#canvas-world")).transform);
      return { size: el.style.backgroundSize, position: el.style.backgroundPosition, x: m.e, y: m.f, z: m.a };
    });
    const sizes = values.size.split(",").map((v) => parseFloat(v));
    expect(sizes).toHaveLength(4);
    expect(Math.abs(sizes[0] - 200 * values.z)).toBeLessThan(0.02);
    expect(Math.abs(sizes[2] - 40 * values.z)).toBeLessThan(0.02);
    expect(Math.abs(sizes[0] / sizes[2] - 5)).toBeLessThan(0.001);
    const position = values.position.split(" ").map(parseFloat);
    expect(Math.abs(position[0] - values.x) < 0.02 && Math.abs(position[1] - values.y) < 0.02, JSON.stringify(values)).toBe(true);
  };
  await expectGridInStep();
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+=");
  await page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
  await expectGridInStep();
  const bounds = await page.locator("#canvas").boundingBox();
  await page.keyboard.down("Space");
  await page.mouse.move(bounds.x + 500, bounds.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 570, bounds.y + 350, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expectGridInStep();
});

test("each board keeps its own background, and Plain removes the pattern", async ({ page }) => {
  await seed({ ...peach, pattern: "fine-grid" });
  await enter(page);
  await chooseBoard(page, app.other.id);
  await expect.poll(async () => (await appearance(page)).image).toMatch(/radial-gradient/);
  await chooseBoard(page, app.board.id);
  await open(page);
  await page.locator('[name="pattern"][value="plain"]').check();
  await close(page);
  expect((await appearance(page)).image).toBe("none");
});

onDevices(["phone"], () => {
  test("background settings fit a phone screen", async ({ page }) => {
    await seed({ ...peach, pattern: "plain" });
    await enter(page);
    await open(page);
    const box = await page.locator("#board-settings-form").boundingBox();
    expect(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box)).toBe(true);
    await page.locator('[name="pattern"][value="fine-grid"]').check();
    await close(page);
    await saved(page);
    await expect.poll(async () => (await boardRecord()).settings.background.pattern).toBe("fine-grid");
  });
});

test("hiding the grid hides the pattern until one is chosen, and a fresh browser shows the board colour", async ({ page, browser }) => {
  await seed({ ...peach, pattern: "fine-grid" });
  await enter(page);
  await page.locator("#canvas").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("g");
  expect((await appearance(page)).image).toBe("none");
  await open(page);
  await page.locator('[name="pattern"][value="dots"]').check();
  await close(page);
  await saved(page);
  expect((await appearance(page)).image).toMatch(/radial-gradient/);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await context.newPage();
  const errors = [];
  fresh.on("pageerror", (e) => errors.push(e.message));
  await enter(fresh);
  await expect.poll(() => fresh.locator("#canvas").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(237, 196, 139)");
  await context.close();
  expect(errors, "no page errors in the fresh browser").toEqual([]);
});

test("reset returns to the theme's background, which follows the dark theme", async ({ page }) => {
  await seed({ ...peach, pattern: "dots" });
  await enter(page);
  await open(page);
  await page.locator("[data-board-settings-reset]").click();
  await close(page);
  await saved(page);
  // Since 0.19.31 the former Personal settings are the Settings page's "You" section, and
  // "Back to project" returns to the board.
  await openSettingsPage(page, "personal");
  await page.locator('[name="personal-theme"][value="dark"]').check();
  await page.locator('[data-action="settings-close"]').click();
  await page.locator("#canvas").waitFor();
  expect((await appearance(page)).color).toBe("rgb(23, 34, 28)");
  await open(page);
  await page.getByRole("radio", { name: "Fine grid", exact: true }).check();
  await close(page);
  await saved(page);
  expect((await appearance(page)).image.match(/linear-gradient/g)).toHaveLength(4);
});
