// Owner request F0.21-95: the dragged copy looks the same in every view that drags.
// Calendar, List, Table and Kanban each show a copy of the item on the shared surface, with the
// shared shadow and a little see-through; Kanban's native mouse drag image keeps no shadow or
// see-through, which Safari paints black, and shows it only on touch.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Drag ghosts" });
  const a = await store.createTask(project.id, { title: "Alpha ghost", order: 0, start: "2026-11-04", due: "2026-11-05" });
  await store.createTask(project.id, { title: "Beta ghost", order: 1024, start: "2026-11-10", due: "2026-11-10" });
  return { project, a };
});

// What the shared ghost rule should resolve to, read from a probe in the same page.
const shared = (page) => page.evaluate(() => {
  const probe = document.createElement("div");
  probe.className = "drag-ghost"; probe.style.cssText = "position:fixed;visibility:hidden";
  document.body.append(probe);
  const cs = getComputedStyle(probe), out = { background: cs.backgroundColor, shadow: cs.boxShadow, opacity: cs.opacity };
  probe.remove();
  return out;
});
const look = (ghost) => ghost.evaluate((el) => { const cs = getComputedStyle(el); return { background: cs.backgroundColor, shadow: cs.boxShadow, opacity: cs.opacity, text: el.textContent, pointer: cs.pointerEvents }; });

async function expectGhost(page, ghost, { shadow = true } = {}) {
  await expect(ghost).toHaveClass(/\bdrag-ghost\b/);
  const want = await shared(page), got = await look(ghost);
  expect(want.shadow, "the shared shadow exists").not.toBe("none");
  expect(got.background).toBe(want.background);
  if (shadow) { expect(got.shadow).toBe(want.shadow); expect(got.opacity).toBe("0.92"); }
  expect(got.text).toContain("Alpha ghost");
  expect(got.pointer).toBe("none");
}

// A failed assertion mid-drag must not leave the mouse pressed for the next test.
test.afterEach(({ page }) => page.mouse.up().catch(() => {}));

for (const theme of ["light", "dark"]) test(`the Calendar's dragged copy is the card on the shared ghost look in ${theme}`, async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-04T12:00:00"));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  const card = page.locator(`.calendar-task[data-id="${app.a.id}"]`).first();
  const b = await card.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 + 60, { steps: 8 });
  const ghost = page.locator(".calendar-drag-preview .drag-ghost");
  await expectGhost(page, ghost);
  await expect(page.locator(".calendar-drag-preview")).toContainText("2026-11-");
  await expect(page.locator(".calendar-placement").first()).toHaveCSS("border-top-style", "dashed");
  // Over nothing it can land on, the copy fades like the other views'.
  await page.mouse.move(5, 5, { steps: 4 });
  await expect(ghost).toHaveClass(/\binvalid\b/);
  await expect(ghost).toHaveCSS("opacity", "0.5");
  await page.mouse.up();
});

test("the Calendar's dragged copy and its dates stay inside the window at the right edge", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.clock.setFixedTime(new Date("2026-11-04T12:00:00"));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  const card = page.locator(`.calendar-task[data-id="${app.a.id}"]`).first();
  const b = await card.boundingBox();
  await page.mouse.move(b.x + 10, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(995, b.y + b.height / 2 + 40, { steps: 8 });
  // The copy has followed the pointer to the edge (the frame loop moves it), and still fits.
  await expect.poll(async () => (await page.locator(".calendar-drag-preview").boundingBox()).x).toBeGreaterThan(700);
  const box = await page.locator(".calendar-drag-preview").boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(1000);
  await page.mouse.up();
});

for (const view of ["list", "table"]) test(`${view}'s dragged copy is on the shared ghost look in dark`, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  const handle = page.locator(`[data-task-reorder="${app.a.id}"]`);
  await handle.waitFor();
  const b = await handle.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 8, { steps: 3 });
  const ghost = page.locator(".task-reorder-ghost");
  await expectGhost(page, ghost);
  await expect(ghost).toContainText(/-\d+/); // the card ID
  await page.mouse.up();
});

test("Kanban's dragged card image is the card on the shared ghost look", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  const card = page.locator(`[data-drag-task="${app.a.id}"]`);
  await card.waitFor();
  // The drag image is read as the drag starts: it is gone once the drag ends.
  await page.evaluate(() => document.addEventListener("dragstart", () => {
    const g = document.querySelector(".kanban-drag-image");
    window.__ghost = g && { cls: g.className, text: g.textContent, ...(({ backgroundColor, boxShadow, opacity }) => ({ backgroundColor, boxShadow, opacity }))(getComputedStyle(g)) };
  }));
  await card.evaluate((el) => el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: 10, clientY: 10 })));
  const g = await page.evaluate(() => window.__ghost), want = await shared(page);
  expect(g.cls).toMatch(/\bdrag-ghost\b/);
  expect(g.backgroundColor).toBe(want.background);
  expect(g.boxShadow, "no shadow on the native mouse drag image").toBe("none");
  expect(g.opacity, "and not see-through").toBe("1");
  expect(g.text).toContain("Alpha ghost");
});
