// AGENTS.md: every colour field uses the shared colour picker from public/color-picker.js
// (circular swatch, dropdown palette and custom hex editor). Covers projects, organisations,
// board objects, connectors, borders and board backgrounds: palette and custom colours save,
// invalid hex is rejected, visual picking previews locally until applied, recent colours are
// shared and persist, and the panel stays on screen with keyboard access on desktop and phone.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Colours" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "one", type: "sticky", text: "First idea", x: 100, y: 230, w: 220, h: 180, color: "#f5e7a2" },
      { id: "two", type: "sticky", text: "Second idea", x: 600, y: 230, w: 220, h: 180 },
    ],
    edges: [{ id: "edge", from: "one", to: "two", label: "Connect" }],
  });
  return { project };
});

// Later tests build on the colours saved by earlier ones.
test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1500, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const recents = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pencils:recent-colours")));
async function choose(page, title, host = page.locator("dialog")) {
  const picker = host.locator(".color-picker").first();
  await picker.locator("summary").click();
  await expect(picker.locator("[data-color-choice]")).toHaveCount(7);
  await expect(picker.locator("[data-color-recents] > *")).toHaveCount(6);
  await expect(picker.locator("[data-color-plane]")).toBeHidden();
  await picker.getByRole("button", { name: title, exact: true }).click();
}
async function custom(page, value, host = page.locator("dialog")) {
  const picker = host.locator(".color-picker").first();
  await picker.locator("summary").click();
  await picker.locator("[data-color-custom-toggle]").click();
  await picker.locator("[data-color-hex]").fill(value);
  await picker.locator("[data-color-apply]").click();
}
const openProject = (page) => page.goto(`${app.base}/#project/${app.project.id}/list`);

test("projects and organisations take palette and validated custom colours", async ({ page }) => {
  await openProject(page);
  // Since 0.19.31 the top bar's single Settings button replaces the project gear.
  await page.locator(".top-actions [data-action=settings]").click();
  await choose(page, "Peach", page.locator("#project-form"));
  // Since 0.15.18 Project settings is a page with its own save bar ("Save changes").
  await page.locator("#project-form [type=submit]").click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Back to project", exact: true }).click();
  expect((await app.store.snapshot(app.project.id)).project.color).toBe("#edc48b");
  // Since 0.19.31 the sidebar's organisation button opens the Organisation section of the
  // Settings page instead of a dialog.
  const organisation = page.locator("#organisation-form");
  await page.locator("[data-action=organisation-edit]").click();
  await custom(page, "oops", organisation);
  await expect(page.locator(".color-error")).toBeVisible();
  await page.locator("[data-color-hex]").fill("#123abc");
  await page.locator("[data-color-hex]").press("Enter");
  await expect(organisation.locator("[name=color]")).toHaveValue("#123abc");
  await organisation.locator(".dialog-foot button.primary").click();
  await expect(page.locator("#toasts")).toContainText("Organisation saved.");
  expect(await recents(page), "invalid hex never becomes a recent colour").not.toContain("oops");
  await page.locator("[data-action=settings-close]").click();
  await page.locator("[data-action=organisation-edit]").click();
  await expect(organisation.locator("[name=color]")).toHaveValue("#123abc");
  await page.locator("[data-action=settings-close]").click();
});

test("board objects and connectors take palette and custom colours", async ({ page }) => {
  await openProject(page);
  await page.locator(".tabs [data-view=board]").click();
  await page.locator('[data-node="one"]').click();
  await choose(page, "Sky", page.locator("#selection-tools"));
  await expect.poll(async () => (await current()).nodes[0].color).toBe("#aed7dc");
  await custom(page, "#7755aa", page.locator("#selection-tools"));
  await expect.poll(async () => (await current()).nodes[0].color).toBe("#7755aa");
  await page.locator('.edge-label[data-edge="edge"]').dblclick();
  await choose(page, "Rose", page.locator("#selection-tools"));
  await expect.poll(async () => (await current()).edges[0].color).toBe("#f1a9a0");
});

test("visual picking previews locally; applying saves one colour that recent lists share across menus and reloads", async ({ page }) => {
  await openProject(page);
  // The recent colours this browser picked in the earlier tests, newest first.
  await page.evaluate(() => localStorage.setItem("pencils:recent-colours", JSON.stringify(["#f1a9a0", "#7755aa", "#aed7dc", "#123abc", "#edc48b"])));
  await page.reload();
  await page.locator(".tabs [data-view=board]").click();
  // Visual picking previews locally; applying creates one saved colour and a recent entry.
  await page.locator('[data-node="one"]').click();
  const objectPicker = page.locator('#selection-tools [data-selection-menu="color"]');
  await objectPicker.locator("summary").click();
  await expect(objectPicker.locator("[data-color-plane]")).toBeHidden();
  await objectPicker.locator("[data-color-custom-toggle]").click();
  const cameraBefore = await page.locator("#canvas-world").getAttribute("style");
  const plane = objectPicker.locator("[data-color-plane]");
  const box = await plane.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await objectPicker.locator("[data-color-hue]").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(objectPicker.locator("[data-color-hue]")).toHaveValue("1");
  await plane.focus();
  await page.keyboard.press("Shift+ArrowDown");
  const picked = await objectPicker.locator("[data-color-hex]").inputValue();
  expect(picked).toMatch(/^#[a-f0-9]{6}$/);
  expect(picked).not.toBe("#7755aa");
  expect((await current()).nodes[0].color, "the preview is not saved").toBe("#7755aa");
  await expect(page.locator("#canvas-world"), "picking does not move the board").toHaveAttribute("style", cameraBefore);
  await objectPicker.locator("[data-color-apply]").click();
  await expect.poll(async () => (await current()).nodes[0].color).toBe(picked);
  let recent = await recents(page);
  expect(recent[0]).toBe(picked);
  expect(recent).toHaveLength(6);
  await page.locator('[data-node="two"]').click();
  await objectPicker.locator("summary").click();
  await objectPicker.locator(`[data-color-recent="${picked}"]`).click();
  await expect.poll(async () => (await current()).nodes[1].color).toBe(picked);
  recent = await recents(page);
  expect(recent.filter((v) => v === picked)).toHaveLength(1);
  // Nested border menus share recent colours and stay inside the viewport.
  await page.locator('[data-selection-menu="geometry"] > summary').click();
  const borderPicker = page.locator("#selection-tools .color-picker").filter({ has: page.locator('[name="object-border"]') });
  await borderPicker.locator("summary").click();
  const borderBox = await borderPicker.locator(".color-picker-panel").boundingBox();
  expect(borderBox.y >= 0 && borderBox.y + borderBox.height <= 1100, `border picker on screen ${JSON.stringify(borderBox)}`).toBe(true);
  await borderPicker.locator(`[data-color-recent="${picked}"]`).click();
  await expect.poll(async () => (await current()).nodes[1].borderColor).toBe(picked);
  await page.keyboard.press("Escape");
  // Escape discards an unapplied visual edit; reopening matches the saved fill.
  await objectPicker.locator("summary").click();
  await objectPicker.locator("[data-color-custom-toggle]").click();
  await objectPicker.locator("[data-color-plane]").focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Escape");
  await objectPicker.locator("summary").click();
  await expect(objectPicker.locator("[data-color-hex]")).toHaveValue(picked);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  const backgroundPicker = page.locator("#board-settings-form .color-picker").first();
  await backgroundPicker.locator("summary").click();
  await expect(backgroundPicker.locator("[data-color-plane]")).toBeHidden();
  await backgroundPicker.locator(`[data-color-recent="${picked}"]`).click();
  await expect(page.locator('#board-settings-form [name="background-color"]')).toHaveValue(picked);
  await page.getByRole("button", { name: "Close board settings", exact: true }).click();
  await expect.poll(async () => (await current()).settings.background.color).toBe(picked);
  await page.reload();
  await page.locator(".top-actions [data-action=settings]").click();
  await expect(page.locator("[name=color]")).toHaveValue("#edc48b");
  await expect(page.locator(`[data-color-recent="${picked}"]`), "recent colours persist across a reload").toHaveCount(1);
});

test("the picker stays on screen on desktop and phone, opens the custom editor by keyboard, and Escape closes only the picker", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/settings/general`);
  await page.locator("#project-form").waitFor();
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390) await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    const inside = (b) => b.x >= 0 && b.x + b.width <= width && b.y >= 0 && b.y + b.height <= 1000;
    await page.locator(".color-picker > summary").click();
    const box = await page.locator(".color-picker-panel").boundingBox();
    expect(inside(box), `${width}: panel ${JSON.stringify(box)}`).toBe(true);
    await page.locator("[data-color-custom-toggle]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-color-plane]")).toBeVisible();
    const expanded = await page.locator(".color-picker-panel").boundingBox();
    expect(inside(expanded), `${width}: expanded panel ${JSON.stringify(expanded)}`).toBe(true);
    await page.locator("[data-color-custom-toggle]").click();
    await expect(page.locator("[data-color-plane]")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#project-form"), "Escape closes picker before leaving settings").toBeVisible();
    expect(await page.locator(".color-picker").evaluate((el) => el.open)).toBe(false);
  }
  await expect(page.locator('input[type="color"]'), "no native colour inputs").toHaveCount(0);
});
