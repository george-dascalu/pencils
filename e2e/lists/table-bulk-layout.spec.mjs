// Owner request, 2 November 2026: compact aligned Bulk edit fields and a clear
// confirmation that replaces the menu rather than covering another popup.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bulk edit layout", key: "BULK" });
  for (const title of ["One", "Two", "Three", "Four"]) await store.createTask(project.id, { title, status: "todo" });
  return { project };
});
test.beforeEach(async () => {
  for (const task of (await app.store.snapshot(app.project.id)).tasks)
    if (task.status !== "todo" || task.archived) await app.store.updateTask(app.project.id, task.id, { revision: task.revision, status: "todo", archived: false });
});
const records = async () => (await app.store.snapshot(app.project.id)).tasks;
const bulk = (page) => page.locator('[data-board-menu="table-bulk"]');
async function open(page) {
  await reveal(page.locator("#bulk-scope"));
  await page.locator("#grid-bulk").evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {}))); });
}
async function choose(page, device, id, name) {
  const activate = (control) => device === "desktop" ? control.click() : control.tap();
  await activate(page.locator(id));
  await activate(page.locator("#shared-select-menu").getByRole("option", { name, exact: true }));
}

onDevices(["desktop", "ipad", "phone"], () => test("Bulk edit aligns compact fields and shows one confirmation at a time @gate", async ({ page, device }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await expect(page.locator("tr[data-table-task]")).toHaveCount(4);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => window.PencilsAppearance.write({ look: "paper", theme }), theme);
    await open(page);
    const layout = await page.locator("#grid-bulk").evaluate((el) => {
      const cs = getComputedStyle(el), box = el.getBoundingClientRect();
      const sample = document.createElement("span"); sample.style.cssText = "border-top:1px solid var(--control-border);color:var(--ink)"; el.append(sample);
      const border = getComputedStyle(sample).borderTopColor, ink = getComputedStyle(sample).color; sample.remove();
      const controls = [...el.querySelectorAll(".field > select")].map((control) => {
        const r = control.getBoundingClientRect(), style = getComputedStyle(control); return { x: r.x, width: r.width, height: r.height, border: style.borderTopColor, ink: style.color };
      });
      return { display: cs.display, padding: cs.paddingTop, height: box.height, width: box.width, controlHeight: parseFloat(cs.getPropertyValue("--control-height")), controls, border, ink, animation: cs.transitionDuration };
    });
    expect(layout.display).toBe("grid");
    expect(layout.padding).toBe("8px");
    expect(layout.width).toBeLessThanOrEqual(device === "phone" ? page.viewportSize().width - 32 : 320);
    expect(layout.height).toBeLessThanOrEqual(layout.controlHeight * 3 + 60);
    expect(Math.abs(layout.controls[0].x - layout.controls[1].x)).toBeLessThan(1);
    expect(Math.abs(layout.controls[0].width - layout.controls[1].width)).toBeLessThan(1);
    expect(parseFloat(layout.animation)).toBeGreaterThan(0);
    for (const control of layout.controls) { expect(control.border).toBe(layout.border); expect(control.ink).toBe(layout.ink); }
    if (device !== "desktop") for (const control of layout.controls) expect(control.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(page.locator("#grid-bulk")).toHaveCSS("display", "none");
  }
  await open(page);
  await choose(page, device, "#bulk-status", "Done");
  const confirmation = page.getByRole("alertdialog", { name: "Change status?", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(page.locator("#grid-bulk")).toBeHidden();
  await expect(confirmation.locator(".confirm-message")).toHaveText("Set 4 cards on this page to Done.");
  expect((await records()).every((task) => task.status === "todo")).toBe(true);
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  const opener = device === "phone" ? page.locator(".mobile-view-options > summary") : bulk(page).locator(":scope > summary");
  await expect(opener).toBeFocused();
  await open(page);
  await expect(page.locator("#bulk-status")).toHaveValue("");
  await choose(page, device, "#bulk-scope", "All matching (4)");
  await choose(page, device, "#bulk-status", "Done");
  await expect(confirmation.locator(".confirm-message")).toHaveText("Set all 4 matching cards to Done.");
  await confirmation.getByRole("button", { name: "Change status", exact: true }).click();
  await expect.poll(async () => (await records()).every((task) => task.status === "done")).toBe(true);
  await open(page);
  const archive = page.locator('[data-feature="bulk-archive"]');
  await expect(archive.locator(".icon")).toHaveCount(1);
  await archive.click();
  const archiveConfirmation = page.getByRole("alertdialog", { name: "Archive these cards?", exact: true });
  await expect(archiveConfirmation).toBeVisible();
  await expect(page.locator("#grid-bulk")).toBeHidden();
  await archiveConfirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await records()).some((task) => task.archived)).toBe(false);
  await open(page);
  await page.locator('[data-feature="bulk-archive"]').click();
  await archiveConfirmation.getByRole("button", { name: "Archive", exact: true }).click();
  await expect.poll(async () => (await records()).every((task) => task.archived)).toBe(true);
}));
