// Wording from the UI review (owner request T40, 1 November 2026; T67): the work item is a "card"
// everywhere (the Tasks tab keeps its name), Timeline's undated group is "Unscheduled", and its scale
// options are in sentence case.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Wording", key: "WD" });
  const card = await store.createTask(project.id, { title: "Dated work", type: "story", start: "2026-11-02", due: "2026-11-06" });
  await store.createTask(project.id, { title: "Someday", type: "story" });
  const board = await store.createBoard(project.id, { title: "Plan" });
  return { project, card, board };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;

// Every word on screen and in names, tooltips and placeholders that says "task", except the Tasks tab
// and the card types listed in menus (the cards here are stories, so no type label says Task).
const taskWords = (page) => page.evaluate(() => {
  const found = new Set();
  const say = (text, el) => {
    for (const m of text.matchAll(/[^.\n]*\btasks?\b[^.\n]*/gi)) {
      if (/^\s*Tasks\s*$/.test(m[0]) || m[0] === "Tasks layout" || el.closest("[data-area='tasks'], .tabs, .tabs-scroll, option")) continue;
      found.add(m[0].trim());
    }
  };
  for (const el of document.querySelectorAll("body *")) {
    for (const name of ["aria-label", "title", "placeholder"]) if (el.hasAttribute(name)) say(el.getAttribute(name), el);
    for (const node of el.childNodes) if (node.nodeType === 3 && el.checkVisibility()) say(node.textContent, el);
  }
  return [...found];
});

test("the work item is called a card", async ({ page }) => {
  const views = { list: ".task-row", table: ".spreadsheet", kanban: ".kanban-card", timeline: ".timeline-row", [`board/${app.board.id}`]: "#canvas" };
  for (const [view, ready] of Object.entries(views)) {
    await page.goto(url(view));
    await page.locator(ready).first().waitFor({ state: "attached" });
    expect(await taskWords(page), view).toEqual([]);
  }
  await page.goto(url("list"));
  await page.locator(`[data-action="task-open"][data-id="${app.card.id}"]:visible`).first().click();
  await page.locator("#task-form .task-description .inline-rich").waitFor();
  expect(await taskWords(page), "card editor").toEqual([]);
});

test("Timeline names undated cards Unscheduled and its scales in sentence case", async ({ page }) => {
  await page.goto(url("timeline"));
  await expect(page.locator(".timeline-section-label")).toHaveText(/^Unscheduled \(1\)$/);
  await expect(page.locator("[data-timeline-scale] option")).toHaveText(["Day", "Week", "Month"]);
});
