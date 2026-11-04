// Owner requests (F0.21-90, 4 November 2026): Timeline bars show handles to resize them, and dots
// at their ends, shown on hover or when the mouse comes close, that drag an arrow from one card to
// another: from a bar's end to a card that waits for it, from its start to a card it waits for.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

// Each test has its own project, so none depends on another's links.
async function seed(store, key, links = false) {
  const project = await store.createProject({ title: `Timeline links ${key}`, key });
  const design = await store.createTask(project.id, { title: "Design", start: "2026-10-05", due: "2026-10-07" });
  const build = await store.createTask(project.id, { title: "Build", start: "2026-10-12", due: "2026-10-14", ...(links ? { dependencies: [design.id] } : {}) });
  const launch = await store.createTask(project.id, { title: "Launch", start: "2026-10-19", due: "2026-10-20", ...(links ? { dependencies: [build.id] } : {}) });
  return { project, design, build, launch };
}
async function long(store) {
  const project = await store.createProject({ title: "Timeline long", key: "TG" });
  const rows = [];
  for (let i = 0; i < 7; i++) rows.push(await store.createTask(project.id, { title: `Step ${i + 1}`, start: `2026-10-${String(5 + i).padStart(2, "0")}`, due: `2026-10-${String(6 + i).padStart(2, "0")}` }));
  const later = await store.createTask(project.id, { title: "Someday" });
  return { project, design: rows[0], rows, later };
}
const app = useApp(async (store) => ({ hover: await seed(store, "TH"), links: await seed(store, "TL"), loops: await seed(store, "TO", true), touch: await seed(store, "TT"), long: await long(store) }));
const bar = (page, id) => page.locator(`[data-timeline-task="${id}"]`);
const deps = async (seed, id) => (await app.store.snapshot(seed.project.id)).tasks.find((t) => t.id === id).dependencies || [];
const opacity = (locator) => locator.evaluate((el) => Number(getComputedStyle(el, "::after").opacity));
const shown = (locator) => locator.evaluate((el) => getComputedStyle(el).visibility === "visible");
const centre = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}
const open = async (page, seed) => {
  await page.goto(`${app.base}/#project/${seed.project.id}/timeline`);
  await bar(page, seed.design.id).waitFor();
};

test("resize grips and link dots show on hover or when the mouse comes close", async ({ page }) => {
  const seed = app.hover;
  await open(page, seed);
  const design = bar(page, seed.design.id), grip = design.locator('[data-date-end="due"]'), dot = design.locator('[data-link-end="due"]');
  await page.mouse.move(5, 5);
  expect(await opacity(grip), "grips wait for the pointer").toBe(0);
  expect(await shown(dot), "dots wait for the pointer").toBe(false);
  const box = await design.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => opacity(grip)).toBeGreaterThan(0.4);
  await expect.poll(() => shown(dot)).toBe(true);
  // Close beside the end, off the bar: the dot still shows.
  await page.mouse.move(box.x + box.width + 10, box.y + box.height / 2);
  await expect.poll(() => shown(dot)).toBe(true);
  // Further away, it goes.
  await page.mouse.move(box.x + box.width + 80, box.y + box.height / 2);
  await expect.poll(() => shown(dot)).toBe(false);
  // The grip resizes the start as well as the end.
  const unit = await page.locator("[data-timeline]").first().evaluate((el) => +el.dataset.unit);
  const start = await centre(design.locator('[data-date-end="start"]'));
  await drag(page, start, { x: start.x - unit, y: start.y });
  await expect(design).toHaveAttribute("aria-valuetext", "2026-10-04 to 2026-10-07");
});

test("dragging a bar's end dot onto another card makes it wait; the start dot makes this one wait", async ({ page }) => {
  const seed = app.links;
  await open(page, seed);
  const design = bar(page, seed.design.id), build = bar(page, seed.build.id), launch = bar(page, seed.launch.id);
  await design.hover();
  await drag(page, await centre(design.locator('[data-link-end="due"]')), await centre(build));
  await expect.poll(() => deps(seed, seed.build.id), "Build waits for Design").toEqual([seed.design.id]);
  await expect(page.locator(`.timeline-dependency-path[data-from="${seed.design.id}"][data-to="${seed.build.id}"]`)).toHaveCount(1);
  expect(await deps(seed, seed.design.id)).toEqual([]);
  // A drop anywhere on the card's row counts, even past its bar.
  await launch.hover();
  const row = await page.locator(`[data-timeline-row="${seed.build.id}"] .timeline-track`).boundingBox();
  await drag(page, await centre(launch.locator('[data-link-end="start"]')), { x: row.x + row.width - 40, y: row.y + row.height / 2 });
  await expect.poll(() => deps(seed, seed.launch.id), "Launch waits for Build").toEqual([seed.build.id]);
  // The preview arrow goes when the drag ends; the bars' dates never change.
  await expect(page.locator(".timeline-link-preview")).toHaveCount(0);
  await expect(design).toHaveAttribute("aria-valuetext", /to 2026-10-07$/);
  // Design starts at the timeline's left edge, so its start dot would fall off it.
  await design.hover();
  await expect(design.locator('[data-link-end="start"]')).toBeHidden();
  await expect(design.locator('[data-link-end="due"]')).toBeVisible();
});

test("a link that would make a loop is refused, and Escape or dropping on the same card does nothing", async ({ page }) => {
  const seed = app.loops;
  await open(page, seed);
  const design = bar(page, seed.design.id), launch = bar(page, seed.launch.id);
  // Launch waits for Build, which waits for Design: Design can't wait for Launch.
  await launch.hover();
  await drag(page, await centre(launch.locator('[data-link-end="due"]')), await centre(design));
  await expect(page.getByText("This would create a blocking cycle.")).toBeVisible();
  expect(await deps(seed, seed.design.id)).toEqual([]);
  await design.hover();
  const dot = await centre(design.locator('[data-link-end="due"]'));
  await drag(page, dot, await centre(design));
  await design.hover();
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(dot.x + 200, dot.y + 60, { steps: 4 });
  await expect(page.locator(".timeline-link-preview")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".timeline-link-preview")).toHaveCount(0);
  await page.mouse.up();
  expect(await deps(seed, seed.design.id)).toEqual([]);
  await expect(page.locator("#task-dates-popover"), "no date editor opens after a link drag").toHaveCount(0);
});

// Touch screens show the grips; links come from the card's Dependencies, so a tap beside a bar
// still schedules its row rather than landing on a dot.
onDevices(["ipad"], () => test("touch screens always show the grips, and a tap beside a bar's end schedules the row", async ({ page }) => {
  const seed = app.touch;
  await open(page, seed);
  const design = bar(page, seed.design.id);
  expect(await opacity(design.locator('[data-date-end="due"]'))).toBeGreaterThan(0.4);
  expect(await shown(design.locator('[data-link-end="due"]')), "no dots for a finger").toBe(false);
  const box = await design.boundingBox(), unit = await page.locator("[data-timeline]").first().evaluate((el) => +el.dataset.unit);
  await page.touchscreen.tap(box.x + box.width + unit / 2, box.y + box.height / 2);
  await expect(page.locator(".timeline-hint").first(), "the tap starts choosing dates on the row").toHaveText(/^Start: 2026-10-08\./);
}));

test("an arrow reaches cards far down the list, unscheduled ones too, and linking a pair again changes nothing", { tag: "@gate" }, async ({ page }) => {
  const seed = app.long, [first, , , , , , last] = seed.rows;
  await open(page, seed);
  const from = bar(page, first.id);
  // The arrows' layer runs down to the last row.
  const [layer, lastRow] = await Promise.all([page.locator(".timeline-dependencies").boundingBox(), page.locator(`[data-timeline-row="${seed.later.id}"]`).boundingBox()]);
  expect(layer.y + layer.height, "the arrows' layer covers every row").toBeGreaterThanOrEqual(lastRow.y + lastRow.height - 1);
  await from.hover();
  const dot = await centre(from.locator('[data-link-end="due"]'));
  const row = await page.locator(`[data-timeline-row="${seed.later.id}"] .timeline-track`).boundingBox();
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(row.x + 200, row.y + row.height / 2, { steps: 6 });
  await expect(page.locator(`[data-timeline-row="${seed.later.id}"]`)).toHaveAttribute("data-link-target", "");
  const preview = await page.locator(".timeline-link-preview").boundingBox();
  expect(preview.y + preview.height, "the preview reaches the unscheduled row").toBeGreaterThan(row.y);
  await page.mouse.up();
  await expect.poll(() => deps(seed, seed.later.id)).toEqual([first.id]);
  await expect(page.locator("[data-link-target], [data-linking]")).toHaveCount(0);
  // The same link again sends nothing.
  const writes = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && r.url().includes("/tasks/")) writes.push(r.url()); });
  await from.hover();
  await drag(page, await centre(from.locator('[data-link-end="due"]')), { x: row.x + 200, y: row.y + row.height / 2 });
  await bar(page, last.id).hover();
  expect(writes, "no write for a link that exists").toEqual([]);
  // Leaving the window hides the dots.
  await page.mouse.move(-5, -5);
  await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
  await expect(page.locator(".timeline-bar[data-near]")).toHaveCount(0);
});
