// Owner report, 31 October 2026 (iPhone): scrolling Timeline sideways carried the "Unplanned"
// heading off screen; it stays at the left, as the task names do.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Timeline label", key: "TL" });
  await store.createTask(project.id, { title: "Planned", start: "2026-10-01", due: "2026-12-20" });
  await store.createTask(project.id, { title: "Someday" });
  return { project };
});

onDevices(["phone", "desktop"], () => test("the Unplanned heading stays in view when Timeline scrolls sideways", { tag: "@gate" }, async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  const scroller = page.locator(".timeline-scroll"), heading = page.locator(".timeline-section-label");
  await expect(heading).toHaveText(/Unplanned/);
  await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft), { message: `${device}: scrolled` }).toBeGreaterThan(200);
  // Where the words are, not the full-width band behind them.
  const label = await heading.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const { x, width } = range.getBoundingClientRect();
    return { x, width };
  });
  const view = await scroller.boundingBox();
  expect(label.x, `${device}: still at the left`).toBeGreaterThanOrEqual(view.x);
  expect(label.x + label.width, `${device}: in view`).toBeLessThanOrEqual(view.x + view.width);
}));
