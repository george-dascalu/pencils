// Home's panels (owner request T22): Task list, Stat and Breakdown read a project; Note and
// Document render Markdown; Bookmarks, Recent, Most visited and Commands list what the person
// keeps, opens and can run; each panel's settings save and redraw it.
import { test, expect, useApp } from "../fixtures.mjs";

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Panel lab", key: "PL" });
  const mine = await store.createTask(project.id, { title: "Mine overdue", assignee: "George", due: day(-30), status: "todo", priority: "high" });
  const soon = await store.createTask(project.id, { title: "Due soon", due: day(2), status: "in-progress" });
  await store.createTask(project.id, { title: "Done one", status: "done", assignee: "George" });
  const doc = await store.createDocument(project.id, { title: "Plan", body: "# Plan\n\nIntro text.\n\n## Goals\n\nShip **Home**." });
  return { project, mine, soon, doc };
});
const panel = (page, type) => page.locator(`.home-panel[data-type="${type}"]`);
async function setPanels(page, panels) {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await page.evaluate((panels) => fetch("/api/home", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ panels }) }), panels);
  await page.reload();
  await page.locator(".home-grid").waitFor();
}
const at = (id, type, y, settings = {}, w = 6, h = 5) => ({ id, type, x: 0, y, w, h, settings });

test("Card list, Stat, Breakdown, Note and Document read the project and render Markdown", async ({ page }) => {
  const { project, doc } = app;
  await setPanels(page, [
    at("t", "tasks", 0, { project: project.id, due: "next7" }),
    at("s", "stat", 5, { project: project.id, assignee: "me", threshold: 1 }, 3, 3),
    at("b", "breakdown", 8, { project: project.id, by: "status" }),
    at("n", "note", 13, { text: "A **bold** note" }),
    at("d", "document", 18, { project: project.id, document: doc.id, heading: "Goals" }),
  ]);
  await expect(panel(page, "tasks").locator(".home-count")).toHaveText("1 card · Panel lab");
  await expect(panel(page, "tasks").locator(".home-task")).toHaveText([/Due soon/]);
  await expect(panel(page, "stat").locator("strong")).toHaveText("2");
  await expect(panel(page, "stat").locator(".home-stat")).toHaveClass(/over/);
  const bars = panel(page, "breakdown").locator(".home-bar");
  await expect(bars).toHaveCount(3);
  expect(await bars.evaluateAll((els) => els.map((el) => [el.querySelector("span").textContent, el.querySelector("b").textContent]))).toEqual([["To do", "1"], ["In progress", "1"], ["Done", "1"]]);
  await expect(panel(page, "note").locator("strong")).toHaveText("bold");
  await expect(panel(page, "document").locator(".home-note")).toContainText("Ship Home.");
  await expect(panel(page, "document").locator(".home-note")).not.toContainText("Intro text");
  // A card opens in its project; the Stat opens the project's list.
  await panel(page, "tasks").locator(".home-task").click();
  await expect(page.locator("#task-form .title-input")).toHaveValue("Due soon");
  await page.keyboard.press("Escape");
  await page.goto(app.base);
  await panel(page, "stat").locator(".home-stat").click();
  await expect(page.locator(".task-row")).toHaveCount(3);
});

test("Bookmarks, Recent, Most visited and Commands list what the person keeps, opens and can run", async ({ page }) => {
  const { project, mine, doc } = app;
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await page.evaluate(async ({ project, mine, doc }) => {
    for (const body of [{ kind: "card", project, id: mine }, { kind: "doc", project, id: doc }])
      await fetch("/api/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }, { project: project.id, mine: mine.id, doc: doc.id });
  // Visits: the card's editor and the document.
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${mine.id}"]:visible`).first().click();
  await page.locator("#task-form").waitFor();
  await page.keyboard.press("Escape");
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
  await setPanels(page, [at("bk", "bookmarks", 0), at("r", "recent", 5), at("v", "visited", 10, { days: 7 }), at("c", "commands", 15)]);
  // Bookmarks list newest first, as the search popup does.
  await expect(panel(page, "bookmarks").locator(".home-item")).toHaveText([/Plan/, /Mine overdue/]);
  await expect(panel(page, "recent").locator(".home-item").first()).toContainText("Plan");
  await expect(panel(page, "recent").locator(".home-item")).toContainText([/Plan/, /Mine overdue/]);
  await expect(panel(page, "visited").locator(".home-item small").first()).toHaveText(/^\d+$/);
  await expect(panel(page, "commands").locator('[data-command="today"]')).toBeVisible();
  await panel(page, "bookmarks").locator(".home-item", { hasText: "Plan" }).click();
  await page.locator(".cm-content").waitFor();
});

test("a panel's settings save and redraw it", async ({ page }) => {
  const { project } = app;
  await setPanels(page, [at("s", "stat", 0, { project: project.id }, 3, 3)]);
  await expect(panel(page, "stat").locator("strong")).toHaveText("3");
  await page.locator('[data-home="edit"]').click();
  await panel(page, "stat").locator('[data-board-menu^="panel-"] > summary').click();
  await page.locator('[data-home-panel-action="settings"]:visible').click();
  const form = page.locator("#home-panel-settings");
  await form.locator('[name="title"]').fill("Open for me");
  await form.locator('[name="assignee"]').selectOption("me");
  await form.locator('[name="status"]').fill("todo");
  await form.locator('[type="submit"]').click();
  await expect(form).toHaveCount(0);
  await expect(panel(page, "stat").locator("h2")).toHaveText("Open for me");
  await expect(panel(page, "stat").locator("strong")).toHaveText("1");
  expect(await page.evaluate(async () => (await (await fetch("/api/home")).json()).panels[0].settings)).toEqual({ project: project.id, title: "Open for me", assignee: "me", status: "todo" });
});

test("the Web page check refuses private and local addresses and the app's own pages", async ({ page }) => {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  const check = (url) => page.evaluate(async (url) => { const r = await fetch(`/api/home/embed?url=${encodeURIComponent(url)}`); return [r.status, (await r.json()).error]; }, url);
  expect(await check("http://127.0.0.1:1/")).toEqual([400, "Private and local addresses can't be shown here."]);
  expect(await check("http://[::ffff:7f00:1]/")).toEqual([400, "Private and local addresses can't be shown here."]);
  expect(await check(`${app.base}/`)).toEqual([400, "Pencils' own pages can't be shown in a panel."]);
  expect(await check("ftp://example.com/")).toEqual([400, "Only http and https pages can be shown."]);
});
