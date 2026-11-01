// Phone Kanban from the UI review (owner request T40, 1 November 2026; T71): Kanban opens on the first
// column with cards instead of an empty Backlog filling the screen. With swimlanes too.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal, selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "First cards" });
  await store.createTask(project.id, { title: "Under review", status: "review", assignee: "George" });
  await store.createTask(project.id, { title: "Finished", status: "done", assignee: "Pat" });
  return { project };
});
// The column whose left edge is at the board's left edge.
const firstShown = (page) => page.locator("#view-content > .kanban").evaluate((el) => {
  const left = el.getBoundingClientRect().left;
  const columns = [...el.querySelectorAll(el.classList.contains("kanban-swimlanes") ? ".kanban-lanes-header > .column-header" : ":scope > .kanban-column")];
  const shown = columns.find((c) => Math.abs(c.getBoundingClientRect().left - left) < 2);
  return (shown?.querySelector(".column-header") || shown)?.textContent.replace(/\d+$/, "").trim();
});

onDevices(["phone"], () => test("Kanban opens on the first column with cards", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await page.locator(".kanban-card").first().waitFor({ state: "attached" });
  await expect.poll(() => firstShown(page)).toBe("In review");
  await (await reveal(page.locator("#kanban-group"))).selectOption("assignee");
  await page.locator(".mobile-view-options").evaluateAll((els) => els.forEach((el) => (el.open = false)));
  await page.locator(".kanban-swimlanes").waitFor();
  await selectProjectView(page, "list");
  await selectProjectView(page, "kanban");
  await page.locator(".kanban-swimlanes .kanban-card").first().waitFor({ state: "attached" });
  await expect.poll(() => firstShown(page), "with swimlanes").toBe("In review");
}));
