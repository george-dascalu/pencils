// F0.22-41: a change made elsewhere patches the open view instead of rebuilding it, so the rows that
// didn't change keep their elements (the browser restyles only what changed) and the scroll stays.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Live", key: "LV" });
  const cards = [];
  for (let i = 1; i <= 30; i++) cards.push(await store.createTask(project.id, { title: `Card ${i}`, status: "todo" }));
  await store.updateTask(project.id, cards[1].id, { parent: cards[0].id, revision: cards[1].revision });
  return { project, cards };
});
const rows = { list: ".task-row", tree: ".tree-row", kanban: ".kanban-card" };

for (const view of ["list", "tree", "kanban"])
  test(`${view}: a change from elsewhere keeps the other rows' elements and the scroll`, async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const row = (title) => page.locator(rows[view]).filter({ hasText: new RegExp(`${title}(?!\\d)`) }).first();
    await row("Card 3").waitFor();
    // Mark an unchanged row's element and scroll the page a little.
    // A property, not an attribute: patching takes away attributes the HTML doesn't have.
    await row("Card 3").evaluate((el) => { el.kept = true; });
    const scroller = await page.evaluate(() => {
      const el = [...document.querySelectorAll("#view-content, #view-content *, .main")].find((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== "visible");
      if (!el) return null;
      el.scrollTop = 40;
      window.scroller = el;
      return el.scrollTop;
    });
    const current = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.cards[4].id);
    await app.store.updateTask(app.project.id, app.cards[4].id, { title: "Card 5 renamed", revision: (await current()).revision });
    await expect(page.locator(rows[view]).filter({ hasText: "Card 5 renamed" })).toHaveCount(1);
    expect(await page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((el) => el.kept).length, rows[view]), "the unchanged row is the same element").toBe(1);
    if (scroller !== null) expect(await page.evaluate(() => window.scroller.isConnected && window.scroller.scrollTop), "the same scroller, scrolled as it was").toBe(scroller);
    // Put the title back for the next view's test.
    await app.store.updateTask(app.project.id, app.cards[4].id, { title: "Card 5", revision: (await current()).revision });
    await expect(page.locator(rows[view]).filter({ hasText: "Card 5 renamed" })).toHaveCount(0);
  });

// F0.22-42: background redraws and the 30-second check wait for the same things, one list in
// features.js; a hidden tab waits until it's shown again, as the check always did.
test("a change from elsewhere waits while the tab is hidden and shows when it's back", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").filter({ hasText: /Card 7(?!\d)/ }).waitFor();
  const hide = (hidden) => page.evaluate((hidden) => { Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden }); document.dispatchEvent(new Event("visibilitychange")); }, hidden);
  await hide(true);
  const card = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.cards[6].id);
  await app.store.updateTask(app.project.id, card.id, { title: "Card 7 while away", revision: card.revision });
  // Nothing observable happens while hidden: give a redraw time to (wrongly) start.
  await page.waitForTimeout(800);
  await expect(page.locator(".task-row").filter({ hasText: "Card 7 while away" })).toHaveCount(0);
  await hide(false);
  await expect(page.locator(".task-row").filter({ hasText: "Card 7 while away" })).toHaveCount(1);
  const renamed = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === card.id);
  await app.store.updateTask(app.project.id, card.id, { title: "Card 7", revision: renamed.revision });
});
