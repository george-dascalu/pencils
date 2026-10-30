// Owner report, 30 October 2026 (phone): scrolling the timeline sideways drew task bars over the
// sticky Task column. The column (and the header above it) stay on top of the bars.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Timeline layers" });
  return { project, task: await store.createTask(project.id, { title: "Define project", start: day(-2), due: day(14) }) };
});

onDevices(["phone"], () => test("task bars pass under the sticky Task column when the timeline scrolls sideways", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  const area = page.locator("#view-content > .task-timeline > .timeline-scroll");
  const bar = page.locator(`.timeline-bar[data-timeline-task="${app.task.id}"]`);
  await expect(bar).toBeVisible();
  const label = page.locator(".timeline-row", { has: bar }).locator(".timeline-task-label");
  const [barBox, labelBox] = [await bar.boundingBox(), await label.boundingBox()];
  // Slide the bar's start 40px under the Task column.
  await area.evaluate((el, by) => { el.scrollLeft += by; }, barBox.x - (labelBox.x + labelBox.width) + 40);
  await expect.poll(() => area.evaluate((el) => el.scrollLeft), "the timeline scrolled").toBeGreaterThan(0);
  const moved = await bar.boundingBox();
  expect(moved.x, "the bar now starts under the Task column").toBeLessThan(labelBox.x + labelBox.width - 20);
  const point = { x: labelBox.x + labelBox.width - 20, y: barBox.y + barBox.height / 2 };
  await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".timeline-task-label, .timeline-bar")?.className || "", point)).toContain("timeline-task-label");
}));
