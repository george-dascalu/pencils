// Owner request, 29 October 2026 (item 19): on phones, content runs behind the floating bottom bar
// instead of stopping above it, and the end of each view still scrolls clear of the bar.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bottom bar", key: "BB" });
  for (let i = 0; i < 16; i++) await store.createTask(project.id, { title: `Card ${i}`, status: "todo", priority: "low" });
  const doc = await store.createDocument(project.id, { title: "Long", body: Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n\n") });
  return { project, doc };
});
// [view, scroller, the view's last item, its text when the view renders only part of its content]
const views = [
  ["list", "#view-content", ".task-row"],
  ["overview", "#view-content", "#view-content > :last-child"],
  ["documents", ".cm-scroller", ".cm-line", "Line 59"],
  ["table", ".table-scroll", ".spreadsheet tbody tr"],
  ["kanban", ".kanban-column:has(.kanban-card)", ".kanban-column:has(.kanban-card) .kanban-card"],
  ["settings/workflow", "#view-content", ".project-settings-page .dialog-foot"],
];
// Scrolls the view's scroller to its end and returns the bottom of its last item.
const endBottom = (page, scroller, last, text) => page.evaluate(([scroller, last, text]) => {
  const area = document.querySelector(scroller);
  if (area) area.scrollTop = area.scrollHeight;
  const end = [...document.querySelectorAll(last)].at(-1);
  return end && (!text || end.textContent.trim() === text) ? end.getBoundingClientRect().bottom : Infinity;
}, [scroller, last, text]);

onDevices(["phone"], () => test("views run behind the bottom bar and scroll their end clear of it", { tag: "@gate" }, async ({ page }) => {
  for (const [view, scroller, last, text] of views) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view === "documents" ? `documents/${app.doc.id}` : view}`);
    await expect(page.locator(last).last()).toBeAttached();
    const bar = await page.locator(".topbar .tabs").boundingBox();
    const box = await page.locator(scroller).first().boundingBox();
    expect(box.y + box.height, `${view}: content runs behind the bar`).toBeGreaterThan(bar.y + bar.height / 2);
    if (view.startsWith("settings")) {
      const foot = await page.locator(last).boundingBox();
      expect(foot.y + foot.height, "the sticky Save bar stays above the bar before the end").toBeLessThanOrEqual(bar.y);
    }
    await expect.poll(() => endBottom(page, scroller, last, text), `${view}: the end scrolls above the bar`).toBeLessThanOrEqual(bar.y);
    if (view === "documents") {
      const stats = await page.locator("[data-document-stats]").boundingBox();
      expect(stats.y + stats.height, "the word count stays above the bar").toBeLessThanOrEqual(bar.y);
    }
  }
}));

onDevices(["phone"], () => test("help opened from a project scrolls its end clear of the bottom bar", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".mobile-menu").click();
  await page.locator('.phone-drawer-utilities [data-action="help"]').click();
  const help = page.locator(".help-page");
  await help.waitFor();
  await help.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const bar = await page.locator(".topbar .tabs").boundingBox();
  await expect.poll(async () => { const box = await help.locator(":scope > :last-child").boundingBox(); return box.y + box.height; }).toBeLessThanOrEqual(bar.y);
}));
