// Owner request, 31 October 2026 (board menus, like Miro, FigJam and Obsidian Canvas): the left
// tool bar holds what More held. Navigate gets Frames (the outline, with Layers as its second
// tab), Tasks gets Live task view, and Create gets one Insert menu (Live note, Templates, Bulk
// notes). Connections opens from the selection toolbar and Import .canvas from the sidebar's New
// board menu (board-sidebar.spec.mjs), so the board bar has no More.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Left tools", key: "LT" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "First idea", x: 300, y: 200, w: 240, h: 180, color: "#f5e7a2" },
      { id: "other", type: "sticky", text: "Second idea", x: 700, y: 200, w: 240, h: 180, color: "#f5e7a2" },
    ],
    edges: [],
  });
  return { project };
});
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
};
const group = (page, name) => page.locator(`.board-tool-group[aria-label="${name}"]`);
const texts = (locator) => locator.evaluateAll((els) => els.map((el) => el.textContent.trim()));
const layers = async () => (await app.store.snapshot(app.project.id)).boards[0].layers || [];

test("the tool bar holds Frames, Live task view and Insert, and the board bar has no More", async ({ page }) => {
  await open(page);
  await expect(group(page, "Navigate").locator("[data-pro=outline]")).toHaveAccessibleName("Frames");
  await expect(group(page, "Tasks").locator("[data-pro=query-add]")).toHaveAccessibleName("Live task view");
  const insert = group(page, "Create").locator("[data-board-menu=insert]");
  await expect(insert.locator("summary")).toHaveAccessibleName("Insert");
  await insert.locator("summary").click();
  await expect(insert.locator(".board-menu-panel"), "Insert opens on a click").toBeVisible();
  const rows = insert.locator(".board-menu-panel > button");
  expect(await texts(rows)).toEqual(["Live note", "Templates", "Bulk notes"]);
  // The menu opens beside the bar, with rows as wide as any board menu's.
  const bar = await page.locator(".board-tools").boundingBox(), panel = await insert.locator(".board-menu-panel").boundingBox();
  expect(panel.x, "beside the tool bar").toBeGreaterThanOrEqual(bar.x + bar.width);
  expect((await rows.first().boundingBox()).width, "rows fill the menu").toBeGreaterThan(150);
  await rows.filter({ hasText: "Bulk notes" }).click();
  await expect(page.locator("#bulk-stickies-form")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-board-menu=more]")).toHaveCount(0);
});

test("Frames opens the outline, whose Layers tab makes layers", async ({ page }) => {
  await open(page);
  const frames = group(page, "Navigate").locator("[data-pro=outline]");
  await frames.click();
  await expect(page.locator("#canvas-outline")).toBeVisible();
  await expect(frames).toHaveAttribute("aria-expanded", "true");
  await page.locator("#canvas-outline [data-tab=layers]").click();
  await expect(page.locator("#canvas-outline [data-tab=layers]")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#canvas-outline #board-layers-form [name=name]").fill("Ideas");
  await page.locator("#canvas-outline #board-layers-form [type=submit]").click();
  await expect.poll(async () => (await layers()).map((l) => l.name)).toEqual(["Ideas"]);
  // The panel stays on Layers, listing the new layer, ready for the next name.
  await expect(page.locator("#canvas-outline .layer-row")).toContainText("Ideas");
  await expect(page.locator("#canvas-outline #board-layers-form [name=name]")).toBeFocused();
  await page.locator("#canvas-outline [data-tab=frames]").click();
  await expect(page.locator("#canvas-outline #board-layers-form")).toHaveCount(0);
  // Insert opens over the outline beside the bar.
  await page.locator("[data-board-menu=insert] > summary").click();
  const row = page.locator("[data-board-menu=insert] [data-layout-tool=bulk-notes]");
  await expect.poll(() => row.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), { message: "Insert's rows above the outline" }).toBe(true);
  await page.keyboard.press("Escape");
  // Escape closes the outline from inside it, back to Frames.
  await page.locator("#canvas-outline [data-tab=frames]").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#canvas-outline")).toBeHidden();
  await expect(frames).toHaveAttribute("aria-expanded", "false");
  await expect(frames).toBeFocused();
});

test("Connections opens from the selection toolbar for the selected object", async ({ page }) => {
  await open(page);
  await page.locator('.board-node[data-node="note"]').click();
  await page.locator('#selection-tools [data-pro="connections"]').click();
  await expect(page.locator("#keyboard-connector [name=from]")).toHaveValue("note");
});

onDevices(["phone"], () => test("phones reach Frames, Live task view and Insert's actions in Canvas tools, each named", async ({ page }) => {
  await open(page);
  await page.locator(".phone-board-more").click();
  const palette = page.locator("#phone-board-palette");
  for (const name of ["Frames", "Live task view", "Live note", "Templates", "Bulk notes"]) {
    const button = palette.getByRole("button", { name, exact: true });
    await expect(button, name).toBeVisible();
    // Each shows its name inside the panel: its text, or its label drawn after its icon.
    const shown = await button.evaluate((el) => el.textContent.trim() || getComputedStyle(el, "::after").content.replace(/^"|"$/g, ""));
    expect(shown, `${name} shows its name`).toBe(name);
    const inside = await button.evaluate((el) => { const r = el.getBoundingClientRect(), p = el.closest("#phone-board-palette").getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1; });
    expect(inside, `${name} inside the panel`).toBe(true);
  }
  await palette.getByRole("button", { name: "Bulk notes", exact: true }).click();
  await expect(page.locator("#bulk-stickies-form")).toBeVisible();
}));
