// Owner requests (F0.21-91, 4 November 2026): every view that groups cards groups them by tag too
// (a card with several tags shows in each tag's group, one with none under No tag, and moving a card
// between tag groups swaps that tag); Timeline groups by a card field or tag; and Week board's Rows
// is Group by, in Filters like List's.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import fs from "node:fs/promises";
import { reveal } from "../helpers/menu-controls.mjs";

async function seed(store, key, orders = {}) {
  let project = await store.createProject({ title: `Tag groups ${key}`, key });
  project = await store.updateProject(project.id, { revision: project.revision, schema: { ...project.schema, tags: [{ name: "design" }, { name: "build" }] } });
  const today = new Date().toLocaleDateString("en-CA");
  const card = (title, tags, order) => store.createTask(project.id, { title, ...(tags ? { tags } : {}), start: today, due: today, order: orders[title] ?? order });
  return { project, both: await card("Both tags", ["build", "design"], 0), design: await card("Design only", ["design"], 1024), none: await card("No tags", null, 2048), other: await card("Other tag", ["zebra"], 3072) };
}
const app = useApp(async (store) => ({ list: await seed(store, "TA"), drag: await seed(store, "TB"), kanban: await seed(store, "TC"), week: await seed(store, "TD"), weekPhone: await seed(store, "TG"), timeline: await seed(store, "TE"), table: await seed(store, "TF"), keys: await seed(store, "TH", { "Design only": 0, "Both tags": 1024 }) }));
const saved = async (seed, id) => (await app.store.snapshot(seed.project.id)).tasks.find((t) => t.id === id);
const closeOptions = async (page) => {
  const close = page.getByRole("button", { name: "Close view options", exact: true });
  if (await close.isVisible()) await close.click();
  const filters = page.locator('[data-board-menu="filters"][open] > summary');
  if (await filters.isVisible()) await filters.click();
};
async function choose(page, selector, value) {
  await (await reveal(page.locator(selector).first())).selectOption(value);
  await closeOptions(page);
}
// Each group's name and the cards in it, in order (Week board's rows are display: contents, so their head says if they show).
const groups = (page, section, title, card, attribute) => page.locator(section).evaluateAll((els, [title, card, attribute]) => els.filter((el) => (el.firstElementChild || el).getClientRects().length && el.querySelector(card)).map((el) => [el.querySelector(title).textContent.replace(/\s*\(?\d+\)?\s*(cards?)?$/, "").trim(), [...el.querySelectorAll(card)].map((c) => c.getAttribute(attribute))]), [title, card, attribute]);
const expected = (s) => [["design", [s.both.id, s.design.id]], ["build", [s.both.id]], ["zebra", [s.other.id]], ["No tag", [s.none.id]]];

onDevices(["desktop", "phone"], () => test("List groups by tag: the project's tags in order, then others, then No tag, a card in each of its tags", async ({ page }) => {
  const s = app.list;
  await page.goto(`${app.base}/#project/${s.project.id}/list`);
  await page.locator(`[data-task-order-row="${s.none.id}"]`).first().waitFor();
  await choose(page, "#group-by", "tags");
  await expect.poll(() => groups(page, "#view-content section[data-task-drop-field]", ".section-title", "[data-task-order-row]", "data-task-order-row")).toEqual(expected(s));
}));

test("dragging a List card between tag groups swaps that tag, and onto No tag clears its tags", async ({ page }) => {
  const s = app.drag;
  await page.goto(`${app.base}/#project/${s.project.id}/list`);
  await page.locator(`[data-task-order-row="${s.none.id}"]`).first().waitFor();
  await choose(page, "#group-by", "tags");
  const drop = async (id, from, to) => {
    const handle = page.locator(`#view-content [data-task-drop-value="${from}"] [data-task-order-row="${id}"] [data-task-reorder]`), r = await handle.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + 10, { steps: 3 });
    const target = page.locator(`#view-content [data-task-drop-value="${to}"] .section-title`);
    await target.scrollIntoViewIfNeeded();
    const t = await target.boundingBox();
    await page.mouse.move(t.x + 25, t.y + t.height * 0.25, { steps: 8 });
    await page.mouse.up();
  };
  // A card with two tags keeps the one it wasn't dragged from.
  await drop(s.both.id, "build", "zebra");
  await expect.poll(async () => (await saved(s, s.both.id)).tags).toEqual(["design", "zebra"]);
  await drop(s.design.id, "design", "");
  await expect.poll(async () => (await saved(s, s.design.id)).tags ?? []).toEqual([]);
  await drop(s.none.id, "", "build");
  await expect.poll(async () => (await saved(s, s.none.id)).tags).toEqual(["build"]);
});

test("Kanban swimlanes by tag, and a card dropped in another lane swaps that lane's tag", async ({ page }) => {
  const s = app.kanban;
  await page.goto(`${app.base}/#project/${s.project.id}/kanban`);
  await page.locator("#kanban-group").waitFor({ state: "attached" });
  await page.locator("#kanban-group").selectOption("tags");
  await expect.poll(() => groups(page, ".kanban-lane", ".kanban-lane-heading span:not(.count):not(.status-dot)", "[data-drag-task]", "data-drag-task")).toEqual(expected(s));
  const status = (await saved(s, s.both.id)).status;
  const lane = page.locator(`.kanban-lane[data-lane-value="zebra"] [data-drop-status="${status}"]`);
  await page.locator(`.kanban-lane[data-lane-value="build"] [data-drag-task="${s.both.id}"]`).dragTo(lane, { sourcePosition: { x: 24, y: 16 }, targetPosition: { x: 40, y: 24 } });
  await expect.poll(async () => (await saved(s, s.both.id)).tags).toEqual(["design", "zebra"]);
  // Add card in a tag's lane starts the card with that tag; in No tag, with none.
  await page.locator(`.kanban-lane[data-lane-value="design"] [data-drop-status="${status}"] .add-row`).click();
  await expect(page.locator("#task-form [name=tags]")).toHaveValue('["design"]');
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator(`.kanban-lane[data-lane-value=""] [data-drop-status="${status}"] .add-row`).click();
  await expect(page.locator("#task-form [name=tags]")).toHaveValue("[]");
  await page.locator('[data-action="dialog-close"]').click();
});

test("Alt+Arrow moves a card past its own copy in the next tag group, and focus stays on the copy that moved", async ({ page }) => {
  const s = app.keys;
  await page.goto(`${app.base}/#project/${s.project.id}/list`);
  await page.locator(`[data-task-order-row="${s.none.id}"]`).first().waitFor();
  await choose(page, "#group-by", "tags");
  // design: Design only, Both tags; build: Both tags. Down from design's copy skips build's copy of the same card.
  await page.locator(`#view-content [data-task-drop-value="design"] [data-task-reorder="${s.both.id}"]`).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(async () => (await saved(s, s.both.id)).tags).toEqual(["build", "zebra"]);
  await expect(page.locator(`#view-content [data-task-drop-value="zebra"] [data-task-reorder="${s.both.id}"]`)).toBeFocused();
});

onDevices(["desktop", "phone"], () => test("Week board's Group by sits in Filters (View options on phones) and groups by tag", async ({ page, device }) => {
  const s = device === "phone" ? app.weekPhone : app.week;
  await page.goto(`${app.base}/#project/${s.project.id}/calendar`);
  await choose(page, "#calendar-mode", "board");
  await expect(page.locator(".week-board")).toBeVisible();
  const select = page.locator("#week-board-rows");
  if (device === "desktop") {
    await expect(page.locator('#view-toolbar [data-board-menu="filters"] #week-board-rows'), "in Filters").toHaveCount(1);
    await expect(page.locator("#view-toolbar .planning-options #week-board-rows")).toHaveCount(0);
  } else await expect(page.locator(".mobile-view-options #week-board-rows")).toHaveCount(1);
  await expect(select.locator("option")).toHaveText(["Assignee", "Status", "Priority", "Card type", "Tag", "No grouping"]);
  await expect(select, "named while Filters is closed too").toHaveAttribute("aria-label", "Group by");
  await choose(page, "#week-board-rows", "tags");
  await expect.poll(() => groups(page, ".week-board-row", ".week-board-row-head > span:not(.count)", "[data-calendar-card]", "data-calendar-card")).toEqual(expected(s));
  // Dragging a card from one tag's row to another's swaps that tag.
  const grip = page.locator(`.week-board-cell[data-week-board-value="build"] [data-calendar-card="${s.both.id}"] [data-calendar-move]`);
  await grip.scrollIntoViewIfNeeded();
  const from = await grip.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  const target = page.locator(`.week-board-cell[data-week-board-value="zebra"][data-calendar-date="${s.both.start}"]`);
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await saved(s, s.both.id)).tags).toEqual(["design", "zebra"]);
}));

onDevices(["desktop", "phone"], () => test("Timeline groups its scheduled rows by a card field or tag, from Filters (View options on phones)", async ({ page, device }) => {
  const s = app.timeline;
  await page.goto(`${app.base}/#project/${s.project.id}/timeline`);
  await page.locator(".timeline-row").first().waitFor();
  if (device === "desktop") await expect(page.locator('#view-toolbar [data-board-menu="filters"] [data-timeline-group]'), "in Filters").toHaveCount(1);
  await expect(page.locator("[data-timeline-group] option")).toHaveText(["No grouping", "Status", "Type", "Assignee", "Priority", "Tag"]);
  await choose(page, "[data-timeline-group]", "tags");
  const bands = () => page.locator("[data-timeline] .timeline-scroll").evaluate((scroll) => {
    const out = [];
    for (const el of scroll.querySelectorAll(".timeline-group-label, .timeline-row:not(.timeline-unplanned)")) {
      if (el.matches(".timeline-group-label")) out.push([el.textContent.replace(/\s*\(\d+\)$/, "").trim(), []]);
      else out.at(-1)?.[1].push(el.dataset.timelineRow);
    }
    return out;
  });
  await expect.poll(bands).toEqual(expected(s));
  // A card shown twice opens its date editor beside the copy that was chosen.
  const second = page.locator(`[data-timeline-row="${s.both.id}"]`).nth(1).locator("[data-task-dates]");
  await second.click();
  const editor = page.locator("#task-dates-popover");
  await expect(editor).toBeVisible();
  const [anchor, panel] = [await second.boundingBox(), await editor.boundingBox()];
  if (device === "desktop") expect(Math.abs(panel.y - (anchor.y + anchor.height)) < 40 || Math.abs(panel.y + panel.height - anchor.y) < 40, "beside the chosen copy").toBe(true);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect.poll(bands, "remembered").toEqual(expected(s));
  await choose(page, "[data-timeline-group]", "status");
  await expect(page.locator(".timeline-group-label")).toHaveText([/^To do \(4\)$/i]);
  await choose(page, "[data-timeline-group]", "none");
  await expect(page.locator(".timeline-group-label")).toHaveCount(0);
}));

test("Table grouped by tags puts a card under each of its tags", async ({ page }) => {
  const s = app.table;
  await page.goto(`${app.base}/#project/${s.project.id}/table`);
  await page.locator("tr[data-table-task]").first().waitFor();
  const menu = page.locator('[data-board-menu="table-groups"]');
  await menu.locator(":scope > summary").click();
  await menu.locator('[data-table-group="0"]').selectOption("tags");
  await menu.locator(":scope > summary").click();
  const rows = () => page.locator(".task-table tbody tr").evaluateAll((els) => {
    const out = [];
    for (const el of els) {
      if (el.matches(".table-group-row")) out.push([el.querySelector("strong").textContent.trim(), []]);
      else out.at(-1)?.[1].push(el.dataset.tableTask);
    }
    return out;
  });
  // The tag list's order, as in List: the project's tags, then others, then cards without.
  await expect.poll(rows).toEqual([["design", [s.both.id, s.design.id]], ["build", [s.both.id]], ["zebra", [s.other.id]], [expect.any(String), [s.none.id]]]);
  // Export and Bulk edit count each card once.
  const exportButton = await reveal(page.locator('[data-feature="table-export"]'));
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  const csv = await fs.readFile(await download.path(), "utf8");
  expect(csv.trim().split(/\r\n/).length, "a header and four cards").toBe(5);
  await expect(page.getByText("Exported 4 matching cards across all pages.")).toBeVisible();
  await (await reveal(page.locator("#bulk-scope"))).selectOption("page");
  await expect(page.locator('#bulk-scope option[value="page"]')).toHaveText("This page (4)");
});
