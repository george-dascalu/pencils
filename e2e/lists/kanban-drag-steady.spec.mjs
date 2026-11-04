// Owner request, 4 November 2026 (F0.22-9): dragging a Kanban card stutters no more. The landing
// place stays where it is while the pointer crosses the gaps between columns and lanes, instead of
// going away and letting the lanes below jump, and a drop there lands in it; over a column the card
// can't enter, the landing place goes back to where the card came from, and a drop changes nothing.
import { test, expect, useApp } from "../fixtures.mjs";
import { DEFAULT_SCHEMA } from "../../server/model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({
    title: "Steady drag",
    // From To do, a card may go to In progress but not straight to Review or Done.
    schema: { ...DEFAULT_SCHEMA, transitions: { backlog: ["todo"], todo: ["backlog", "in-progress"], "in-progress": ["todo", "review"], review: ["in-progress", "done"], done: ["review"] } },
  });
  await store.createTask(project.id, { title: "Neighbour", status: "todo", assignee: "George" });
  await store.createTask(project.id, { title: "Below", status: "todo", assignee: "Pat" });
  return { project };
});
test.use({ viewportSize: { width: 1600, height: 1000 } });

const lane = (page, value) => page.locator(`.kanban-lane[data-lane-value="${value}"]`);
const cell = (page, value, status) => lane(page, value).locator(`[data-drop-status="${status}"]`);
const placeholder = (page) => page.locator(".kanban-drop-placeholder");
const where = (page) => page.evaluate(() => { const el = document.querySelector(".kanban-drop-placeholder"); return el ? `${el.closest(".kanban-lane")?.dataset.laneValue}/${el.closest("[data-drop-status]")?.dataset.dropStatus}` : "none"; });
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id);

// Each test moves a card of its own, in To do.
async function lift(page) {
  const mover = await app.store.createTask(app.project.id, { title: "Mover", status: "todo", assignee: "George" });
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await page.locator("#kanban-group").selectOption("assignee");
  const from = await lane(page, "George").locator(`[data-drag-task="${mover.id}"]`).boundingBox();
  await page.mouse.move(from.x + 24, from.y + 16);
  await page.mouse.down();
  await page.mouse.move(from.x + 24, from.y + 36, { steps: 5 });
  await expect(placeholder(page)).toHaveCount(1);
  return mover;
}
// Chromium delivers dragover for only some synthetic moves: hover there until the app has seen a
// few at that point (counted by a listener of the test's own).
async function hover(page, x, y) {
  await page.evaluate(([x, y]) => {
    window.overs = 0;
    window.countOvers ||= (e) => { if (Math.abs(e.clientX - window.overX) < 3 && Math.abs(e.clientY - window.overY) < 3) window.overs++; };
    Object.assign(window, { overX: x, overY: y });
    document.addEventListener("dragover", window.countOvers);
  }, [x, y]);
  let i = 0;
  await expect.poll(async () => {
    await page.mouse.move(x, y + (i++ % 2));
    return page.evaluate(() => window.overs);
  }).toBeGreaterThan(2);
}

test("the landing place stays put while the pointer crosses the gap between columns, and a drop there lands in it", async ({ page }) => {
  const mover = await lift(page);
  const target = await cell(page, "George", "in-progress").boundingBox(), next = await cell(page, "George", "review").boundingBox();
  await hover(page, target.x + 40, target.y + 24);
  await expect.poll(() => where(page)).toBe("George/in-progress");
  const below = (await lane(page, "Pat").boundingBox()).y;
  const gap = (target.x + target.width + next.x) / 2;
  expect(next.x - (target.x + target.width), "the columns have a gap between them").toBeGreaterThan(4);
  expect(await page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest("[data-drop-status]"), [gap, target.y + 24])).toBe(true);
  await hover(page, gap, target.y + 24);
  expect(await where(page), "the landing place stays in the last column").toBe("George/in-progress");
  await expect(cell(page, "George", "in-progress")).toHaveClass(/\bover\b/);
  expect((await lane(page, "Pat").boundingBox()).y, "the lanes below keep their place").toBeCloseTo(below, 0);
  await page.mouse.up();
  await expect.poll(async () => (await saved(mover.id)).status).toBe("in-progress");
});

test("over a column the card can't enter, the landing place goes back where the card was, and a drop changes nothing", async ({ page }) => {
  const writes = [];
  page.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/tasks")) writes.push(r.url()); });
  const mover = await lift(page);
  const blocked = await cell(page, "George", "review").boundingBox();
  await expect(cell(page, "George", "review")).toHaveClass(/workflow-blocked/);
  await hover(page, blocked.x + 40, blocked.y + 24);
  expect(await where(page)).toBe("George/todo");
  expect(await placeholder(page).evaluate((el) => el.nextElementSibling?.dataset.dragTask), "in the card's own place").toBe(mover.id);
  await page.mouse.up();
  await expect(placeholder(page)).toHaveCount(0);
  expect((await saved(mover.id)).status).toBe("todo");
  expect(writes, "no card is saved").toEqual([]);
});

test("outside the board the landing place goes away, and a drop there changes nothing", async ({ page }) => {
  const writes = [];
  page.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/tasks")) writes.push(r.url()); });
  const mover = await lift(page);
  const top = await page.locator(".topbar").boundingBox();
  await hover(page, top.x + top.width / 2, top.y + top.height / 2);
  expect(await where(page)).toBe("none");
  await page.mouse.up();
  expect((await saved(mover.id)).status).toBe("todo");
  expect(writes, "no card is saved").toEqual([]);
});

test("with motion on, lanes the landing place pushes slide as a whole, without their cards sliding twice, and the drop lands", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Record each slide: the element and where it starts from.
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    window.slides = [];
    Element.prototype.animate = function (frames, options) {
      if (this.closest?.(".kanban")) window.slides.push({ lane: this.matches(".kanban-lane") ? this.dataset.laneValue : null, card: this.dataset.dragTask || null, from: frames[0]?.transform });
      return animate.call(this, frames, options);
    };
  });
  const mover = await lift(page);
  const below = await page.locator(".kanban-lane").evaluateAll((els) => {
    const lanes = els.map((el) => el.dataset.laneValue);
    return lanes[lanes.indexOf("George") + 1];
  });
  // Pat's In progress is empty, so the card under Pat's To do moves only with its lane.
  const target = await cell(page, "Pat", "in-progress").boundingBox();
  await page.evaluate(() => (window.slides = []));
  await hover(page, target.x + 40, target.y + 24);
  await expect.poll(() => where(page)).toBe("Pat/in-progress");
  const slides = await page.evaluate(() => window.slides);
  // The George lane gave up the card's place, so the lane under it moved up and slides down from below.
  const lane = slides.find((s) => s.lane === below);
  expect(lane?.from, `the lane under George slides ${JSON.stringify(slides)}`).toMatch(/^translateY\(\d+(\.\d+)?px\)$/);
  const inside = await lane_cards(page, below);
  expect(slides.filter((s) => inside.includes(s.card)), "its cards move with it, not again on their own").toEqual([]);
  await page.mouse.up();
  await expect.poll(async () => { const t = await saved(mover.id); return `${t?.assignee}/${t?.status}`; }).toBe("Pat/in-progress");
});
const lane_cards = (page, value) => lane(page, value).locator("[data-drag-task]").evaluateAll((els) => els.map((el) => el.dataset.dragTask));
