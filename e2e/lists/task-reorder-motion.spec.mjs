// Owner request, 30 October 2026: dragging rows in List and Tree feels direct, with small
// animations. The row lifts as a copy of itself that moves with the pointer, the insertion line
// glides between rows, a drop slides the rows into place and highlights the moved one, and a
// cancelled drag glides back. Alt+Up/Down moves animate the same way. Reduced motion stays still.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Reorder motion" });
  const tasks = [];
  for (const [i, title] of ["Alpha", "Beta", "Charlie", "Delta"].entries()) tasks.push(await store.createTask(project.id, { title, order: i * 1024 }));
  return { project, tasks };
});
test.use({ viewportSize: { width: 1300, height: 900 } });

const row = (page, id) => page.locator(`#view-content [data-task-order-row="${id}"]`);
const ids = (page) => page.locator("#view-content [data-task-order-row]").evaluateAll((rows) => rows.map((r) => r.dataset.taskOrderRow));
const animating = (page, id) => row(page, id).evaluate((el) => el.getAnimations().length);
async function pick(page, id) {
  const box = await page.locator(`[data-task-reorder="${id}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 8, { steps: 3 });
  await page.locator(".task-reorder-ghost").waitFor();
  return box;
}

for (const view of ["list", "tree"]) {
  test(`${view}: the dragged row lifts as a copy that moves with the pointer, and a drop slides the rows into place`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const [a, b, c] = app.tasks.map((t) => t.id);
    await row(page, a).waitFor();
    const source = await row(page, a).boundingBox();
    const handle = await pick(page, a);
    const ghost = page.locator(".task-reorder-ghost");
    await expect(ghost).toContainText("Alpha");
    await ghost.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const lifted = await ghost.boundingBox();
    const copy = await ghost.evaluate((el, id) => {
      const row = document.querySelector(`#view-content [data-task-order-row="${id}"]`);
      return { padding: [getComputedStyle(el).paddingLeft, getComputedStyle(row).paddingLeft], grip: getComputedStyle(el.querySelector(".task-reorder-handle > .icon")).opacity, links: el.querySelectorAll("[data-action], [data-id]").length };
    }, a);
    expect(copy.padding[0], "the copy keeps the row's padding").toBe(copy.padding[1]);
    expect(copy.grip, "its grip shows").toBe("1");
    expect(copy.links, "nothing in the copy answers to the row's actions").toBe(0);
    expect(Math.abs(lifted.width - source.width), "as wide as the row").toBeLessThanOrEqual(2);
    expect(Math.abs(lifted.x + lifted.width / 2 - (source.x + source.width / 2)), "in line with the rows").toBeLessThanOrEqual(2);
    await page.mouse.move(handle.x + 200, handle.y + handle.height / 2 + 68, { steps: 4 });
    const moved = await ghost.boundingBox();
    expect(Math.abs(moved.x - lifted.x), "it moves up and down only").toBeLessThanOrEqual(1);
    expect(Math.abs(moved.y - lifted.y - 60), "it follows the pointer").toBeLessThanOrEqual(2);
    await expect(row(page, a), "the source row stays in place").toHaveClass(/task-reorder-source/);
    expect(await page.locator(".task-reorder-marker").evaluate((el) => getComputedStyle(el).transitionProperty), "the line glides").toContain("top");
    // Over the header, outside the rows, the copy fades to show it won't drop there.
    await page.mouse.move(handle.x + handle.width / 2, 20, { steps: 3 });
    await expect(ghost).toHaveCSS("opacity", "0.5");
    // Drop below Beta: the rows slide into place and Alpha is highlighted.
    const target = await row(page, b).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, target.y + target.height * 0.8, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => ids(page).then((list) => list.indexOf(a) > list.indexOf(b))).toBe(true);
    await expect(row(page, a)).toHaveClass(/task-reorder-moved/);
    expect(await animating(page, a) + await animating(page, b), "rows slide into place").toBeGreaterThan(0);
    // Alt+Down animates too.
    await page.locator(`[data-task-reorder="${b}"]`).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect.poll(() => ids(page).then((list) => list.indexOf(b) > list.indexOf(a))).toBe(true);
    await expect(row(page, b)).toHaveClass(/task-reorder-moved/);
    // Escape glides the copy back before it goes.
    await pick(page, c);
    await page.mouse.move(handle.x, handle.y - 40, { steps: 3 });
    await page.keyboard.press("Escape");
    expect(await ghost.evaluate((el) => el.getAnimations().length), "the copy glides back").toBeGreaterThan(0);
    await expect(ghost).toHaveCount(0);
    await page.mouse.up();
  });
}

test("with reduced motion, rows move without animating", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator("#view-content [data-task-order-row]").first().waitFor();
  const [first, second] = await ids(page);
  await page.locator(`[data-task-reorder="${first}"]`).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => ids(page).then((list) => list.indexOf(first) > list.indexOf(second))).toBe(true);
  expect(await animating(page, first) + await animating(page, second)).toBe(0);
  await pick(page, second);
  await page.keyboard.press("Escape");
  await expect(page.locator(".task-reorder-ghost"), "the copy goes at once").toHaveCount(0);
  await page.mouse.up();
});

test.describe("phone", () => {
  test.use({ viewportSize: { width: 390, height: 800 } });
  test("the lifted copy doesn't scroll inside, and the insertion line keeps its dot", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator("#view-content [data-task-order-row]").first().waitFor();
    const [first] = await ids(page);
    await pick(page, first);
    expect(await page.locator(".task-reorder-ghost").evaluate((el) => getComputedStyle(el).overflowY)).toBe("visible");
    expect(await page.locator(".task-reorder-marker").evaluate((el) => !el.closest(".main")), "the line sits outside the page's scrollers").toBe(true);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
});
