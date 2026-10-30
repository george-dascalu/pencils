// Owner question, 30 October 2026: in Overview's Upcoming and overdue list, each card's assignee
// box was as wide as its title. The box fits its name.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Overview deadlines" });
  await store.createTask(project.id, { title: "A long card title that runs on well past any name", assignee: "Al", due: "2026-11-02" });
  await store.createTask(project.id, { title: "Short", assignee: "Al", due: "2026-11-03" });
  return { project };
});

onDevices(["desktop", "phone"], () => test("assignee boxes fit their names, whatever the title", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/overview`);
  const badges = page.locator(".dashboard-deadlines > button .task-color-badge");
  await expect(badges).toHaveCount(2);
  await expect(badges.first()).toBeVisible();
  const boxes = await badges.evaluateAll((els) => els.map((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return { width: Math.round(el.getBoundingClientRect().width), name: range.getBoundingClientRect().width };
  }));
  expect(boxes[0].width, `${device}: same name, same width ${JSON.stringify(boxes)}`).toBe(boxes[1].width);
  // The name plus the badge's padding and border (6px and 1px a side).
  expect(Math.abs(boxes[0].width - boxes[0].name - 14), `${device}: as wide as the name ${JSON.stringify(boxes)}`).toBeLessThanOrEqual(2);
}));
