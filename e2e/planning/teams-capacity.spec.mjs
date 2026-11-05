// Teams and capacity: board task cards edit the shared task (fitting their card with unclipped focus rings, zoomed and on phones), and the
// Capacity view counts scheduled work against each person's limit, moves between weeks, fits
// desktop and phone screens in both themes and opens tasks in the shared editor.
// The people and assignee rules moved to project-people-assignees.spec.mjs (split by tier, F0.22-21).
// Part of the cross-browser release gate.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const today = new Date().toLocaleDateString("en-CA");
// An organisation whose Design team (with Alice, whose weekly limit is 0) works on one project
// with one task due today.
async function staffed(store, title, task = {}) {
  const organisation = await store.createOrganisation({ title, people: [{ id: "alice", name: "Alice", task_capacity: 0 }], teams: [{ id: "design", name: "Design", members: ["alice"] }] });
  const project = await store.createProject({ title: `${title} project`, organisation: organisation.id, teams: ["design"] });
  const planned = await store.createTask(project.id, { title: "Planned work", assignee: "Alice", due: today, ...task });
  return { organisation, project, planned };
}
const app = useApp(async (store) => {
  const board = await staffed(store, "Board cards");
  const snapshot = await store.snapshot(board.project.id);
  await store.updateBoard(board.project.id, snapshot.boards[0].id, {
    revision: snapshot.boards[0].revision,
    nodes: [
      { id: "task-one", type: "task", task: board.planned.id, x: 120, y: 180, w: 220, h: 220 },
      { id: "task-two", type: "task", task: board.planned.id, x: 430, y: 180, w: 310, h: 220 },
    ],
    edges: [],
  });
  return { board, capacity: await staffed(store, "Capacity", { priority: "high" }) };
});

test.use({ viewportSize: { width: 1440, height: 1000 } });

const snapshotTask = async (project, id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id);

test("board task cards edit the shared task without moving the camera, fit their card and keep focus rings unclipped", { tag: "@gate" }, async ({ page }) => {
  const { project, planned } = app.board;
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await selectProjectView(page, "board");
  const card = page.locator('[data-node="task-one"]');
  const priority = card.locator('[data-canvas-task-field="priority"]');
  const assignee = card.locator('[data-canvas-task-field="assignee"]');
  await card.waitFor();
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await expect(assignee.locator("option")).toHaveText(["Unassigned", "Alice"]);
  // Board cards edit the project task; another card for the same task updates too.
  await priority.selectOption("high");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-canvas-task-field="priority"]')].every((el) => el.value === "high"));
  await assignee.selectOption("");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-canvas-task-field="assignee"]')].every((el) => el.value === ""));
  await assignee.selectOption("Alice");
  await expect.poll(async () => {
    const updated = await snapshotTask(project, planned.id);
    return [updated.priority, updated.assignee_id];
  }).toEqual(["high", "alice"]);
  await expect(page.locator("#canvas-world")).toHaveAttribute("style", camera);
  await expect(page.locator("dialog")).toHaveCount(0);
  for (const select of await card.locator(".live-card-state select").all()) {
    const box = await select.boundingBox(), bounds = await card.boundingBox();
    expect(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width, "Metadata controls fit a minimum-width task card").toBe(true);
  }
  const checkCardFocus = async () => {
    for (const control of await card.locator(".live-card-state select, .live-card-heading button").all()) {
      const ring = await control.evaluate((el) => {
        el.focus({ focusVisible: true });
        const target = el.closest(".canvas-task-priority,.canvas-task-assignee") || el;
        const style = getComputedStyle(target);
        const bounds = target.getBoundingClientRect();
        const overflow = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
        const clipped = [];
        for (let parent = target.parentElement; parent && !parent.matches("#canvas"); parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          const r = parent.getBoundingClientRect();
          if (/(hidden|clip|auto|scroll)/.test(css.overflowX) && (bounds.left - overflow < r.left - 1 || bounds.right + overflow > r.right + 1)) clipped.push(parent.className);
          if (/(hidden|clip|auto|scroll)/.test(css.overflowY) && (bounds.top - overflow < r.top - 1 || bounds.bottom + overflow > r.bottom + 1)) clipped.push(parent.className);
        }
        return { width: style.outlineWidth, offset: style.outlineOffset, clipped, target: target.outerHTML, bounds: bounds.toJSON(), focused: document.activeElement === el, visible: el.matches(":focus-visible") };
      });
      expect(ring.width, JSON.stringify(ring)).toBe("1px");
      expect(ring.offset).toBe("-1px");
      expect(ring.clipped, `All four sides of the focus ring fit inside clipping containers: ${JSON.stringify(ring)}`).toEqual([]);
    }
    await assignee.evaluate((el) => el.focus({ focusVisible: true }));
  };
  await checkCardFocus();
  // Zoomed in.
  const zoomTarget = await card.boundingBox();
  await page.mouse.move(zoomTarget.x + zoomTarget.width / 2, zoomTarget.y + zoomTarget.height / 2);
  await page.mouse.wheel(0, -700);
  await page.waitForFunction(() => parseInt(document.querySelector("#zoom-label").textContent) > 150);
  await page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
  await checkCardFocus();
  // On a phone-width window in the dark theme.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.locator("#zoom-label").dblclick();
  await page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
  await expect(assignee).toBeVisible();
  const { narrowBounds, selectBounds } = await card.evaluate((el) => ({
    narrowBounds: el.getBoundingClientRect().toJSON(),
    selectBounds: [...el.querySelectorAll(".live-card-state select")].map((select) => select.getBoundingClientRect().toJSON()),
  }));
  for (const box of selectBounds) expect(box.width > 0 && box.height > 0 && box.x >= narrowBounds.x && box.x + box.width <= narrowBounds.x + narrowBounds.width, JSON.stringify({ box, narrowBounds })).toBe(true);
  await checkCardFocus();
  // The edits persist.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.reload();
  await card.waitFor();
  await expect(priority).toHaveValue("high");
  await expect(assignee).toHaveValue("Alice");
});

test("Capacity counts scheduled work against each limit, moves between weeks and survives a reload", { tag: "@gate" }, async ({ page }) => {
  const { project } = app.capacity;
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
  await selectProjectView(page, "capacity");
  await page.getByRole("region", { name: "Team capacity" }).waitFor();
  await expect(page.locator(".capacity-summary").getByText("1 card scheduled", { exact: true })).toBeVisible();
  await expect(page.locator(".capacity-table").getByText("1 over limit", { exact: true })).toBeVisible();
  expect(await page.locator(".planning-view-switcher [data-view]").evaluateAll((els) => els.map((el) => el.dataset.view))).toEqual(["calendar", "timeline", "capacity"]);
  await page.getByLabel("Next week", { exact: true }).click();
  await expect(page.locator(".capacity-summary").getByText("0 cards scheduled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await page.reload();
  await page.locator(".capacity-summary").getByText("1 card scheduled", { exact: true }).waitFor();
});

for (const width of [1440, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewportSize: { width, height: 1000 } });
    test("Capacity fits the window in both themes", { tag: "@gate" }, async ({ page }) => {
      await page.goto(`${app.base}/#project/${app.capacity.project.id}/capacity`);
      await page.locator(".capacity-summary").getByText("1 card scheduled", { exact: true }).waitFor();
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${theme}: no horizontal overflow`).toBe(false);
      }
    });
  });
}

// Owner request T40, 1 November 2026 (T77, audit B14): the toolbar keeps to one row, with the less-used
// Measure, Scope and Team in Filters (phones list them in View options).
onDevices(["desktop", "ipad"], () => test("Capacity's toolbar is one row, with Measure, Scope and Team in Filters", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.capacity.project.id}/capacity`);
  await page.locator(".capacity-summary").getByText("1 card scheduled", { exact: true }).waitFor();
  const filters = page.locator('#view-toolbar details[data-board-menu="filters"]');
  for (const id of ["capacity-unit", "capacity-scope", "capacity-team"]) await expect(filters.locator(`#${id}`), `${device}: ${id}`).toBeAttached();
  expect((await page.locator("#view-toolbar").boundingBox()).height, `${device}: one row`).toBeLessThanOrEqual(56);
  await filters.locator("summary").click();
  await filters.locator("#capacity-unit").selectOption("hours");
  await page.reload();
  await expect(page.locator("#capacity-unit"), `${device}: the choice is kept`).toHaveValue("hours");
  await page.locator('#view-toolbar details[data-board-menu="filters"] > summary').click();
  await page.locator("#capacity-unit").selectOption("tasks");
}));

// Out of sight in Filters, Scope and Team count as filters, and Clear filters resets them.
test("Capacity's Scope and Team count as filters, and Clear filters resets them", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.capacity.project.id}/capacity`);
  await page.locator(".capacity-summary").getByText("1 card scheduled", { exact: true }).waitFor();
  const summary = page.locator('#view-toolbar details[data-board-menu="filters"] > summary');
  await summary.click();
  await page.locator("#capacity-team").selectOption("design");
  await expect(summary).toHaveAttribute("aria-label", "Filters (1 active)");
  await expect(summary.locator(".filter-count")).toHaveText("1");
  await page.locator('#view-toolbar details[data-board-menu="filters"] [data-action="filters-reset"]').click();
  await expect(page.locator("#capacity-team")).toHaveValue("");
  await expect(summary).toHaveAttribute("aria-label", "Filters");
});

test("a capacity task opens in the shared task editor", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.capacity.project.id}/capacity`);
  await page.locator(".capacity-work summary").first().click();
  await page.locator(".capacity-work [data-feature=global-open]").click();
  await expect(page.locator("#task-form [name=title]")).toHaveValue("Planned work");
  await expect(page.locator('#task-form [name="priority"]')).toHaveValue("high");
});
