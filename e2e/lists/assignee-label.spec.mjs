// Owner request, 30 October 2026: an assignee shows the first three letters of their name, such as
// Geo for George, instead of initials, and they fit their box, even wide letters in Compact
// density; the full name stays in the tooltip.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Assignee labels", key: "AL" });
  await store.createTask(project.id, { title: "Lower case", assignee: "george" });
  await store.createTask(project.id, { title: "Full name", assignee: "Wilhelmina Moss" });
  await store.createTask(project.id, { title: "Wide letters", assignee: "Mmmwide" });
  return { project };
});

onDevices(["desktop", "phone"], () => test("assignees show three letters that fit their box", async ({ page, device }) => {
  const densities = device === "desktop" ? ["comfortable", "compact"] : ["comfortable"];
  for (const density of densities) for (const view of ["list", "kanban", "table"]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.evaluate((density) => window.PencilsAppearance.write({ density }), density);
    const avatars = page.locator("#view-content .task-assignee:visible");
    await expect(avatars.first()).toBeVisible();
    const labels = await avatars.evaluateAll((els) => els.map((el) => ({ text: el.textContent, title: el.title, fits: el.scrollWidth <= el.clientWidth })));
    expect(labels.map((l) => [l.title, l.text]).sort(), `${device} ${view}`).toEqual([["Mmmwide", "Mmm"], ["Wilhelmina Moss", "Wil"], ["george", "Geo"]]);
    for (const l of labels) expect(l.fits, `${device} ${density} ${view}: ${l.text} fits`).toBe(true);
  }
}));
