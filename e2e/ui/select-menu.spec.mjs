// Shared dropdown rule: every select opens the app's shared menu (#shared-select-menu),
// never the platform picker. Covers the organisation picker, task editor fields (keyboard,
// type-ahead, Escape), filters in every view, board card fields under zoom, nesting inside
// the date picker, disabled/grouped/dynamic options, and touch on desktop and phone widths
// in both themes. Edits made through the menu persist.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal, selectProjectView, openSidebar, chooseProject } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const org = await store.createOrganisation({
    title: "Dropdown studio",
    people: [{ id: "g", name: "George" }, { id: "a", name: "Alice" }],
    teams: [{ id: "team", name: "Team", members: ["g", "a"] }],
  });
  const project = await store.createProject({ title: "Dropdown lab", organisation: org.id, teams: ["team"] });
  const task = await store.createTask(project.id, { title: "Check dropdowns" });
  const done = await store.createTask(project.id, { title: "Finished dropdown", status: "done" });
  return { project, task, done };
});

test.use({ viewportSize: { width: 1400, height: 1000 } });

const menu = (page) => page.locator("#shared-select-menu");
async function pick(page, select, name) {
  await select.click();
  await menu(page).waitFor();
  await menu(page).getByRole("option", { name, exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
}
const openList = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
};
const openTask = async (page, id) => {
  await page.locator(`[data-action=task-open][data-id="${id}"]:visible`).first().click();
  await page.locator("#task-form").waitFor();
};

test("task editor selects use the shared menu: Escape cancels, type-ahead and Enter choose, and choices save", async ({ page }) => {
  await page.goto(app.base);
  await openSidebar(page);
  await pick(page, page.locator("#organisation-select"), "Dropdown studio");
  await chooseProject(page, app.project.id);
  await openTask(page, app.task.id);
  const status = page.locator("#task-form [name=status]");
  await status.click();
  expect(await menu(page).evaluate((el) => el.matches(":popover-open"))).toBe(true);
  await expect(menu(page).getByRole("option", { selected: true })).toHaveText("To do");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(status, "Escape cancels without changing the field").toHaveValue("todo");
  await expect(status).toBeFocused();
  await status.press("ArrowDown");
  await page.keyboard.press("d");
  await page.keyboard.press("Enter");
  await expect(status, "Type-ahead and Enter choose an option").toHaveValue("done");
  await pick(page, page.locator("#task-form [name=assignee]"), "George");
  await page.locator("#task-form").evaluate((form) => form.requestSubmit());
  await page.locator("[data-autosave-status]").filter({ hasText: /^Saved automatically$/ }).waitFor();
  await page.locator("[data-action=dialog-close]").click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  const saved = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);
  expect(saved.status).toBe("done");
  expect(saved.assignee).toBe("George");
});

test("status filters in every project view use the shared menu", async ({ page }) => {
  await openList(page);
  // Filtering and sorting use the same menu in every project view that has select filters.
  for (const view of ["list", "tree", "table", "kanban", "calendar", "timeline", "capacity", "overview"]) {
    await selectProjectView(page, view);
    const filter = page.locator("#filter-status");
    if (await filter.count()) {
      // The status filter lives in the shared Filters menu on desktop.
      await pick(page, await reveal(filter), "Done");
      await expect(page.locator("#filter-status"), view).toHaveValue("done");
      await pick(page, await reveal(page.locator("#filter-status")), "All statuses");
    }
  }
});

test("board card fields use the shared menu, which board zoom does not scale", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("[data-action=board-task]").click();
  await page.locator(`[data-action=board-pick][data-id="${app.task.id}"]`).click();
  const card = page.locator(".board-node.task").first();
  await card.waitFor();
  await pick(page, card.locator("[data-canvas-task-field=priority]"), "High");
  await page.locator(".canvas-task-priority.high").first().waitFor();
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+=");
  const boardStatus = card.locator("[data-canvas-status]");
  await boardStatus.click();
  const box = await menu(page).boundingBox();
  expect(Math.round(box.width), "Board zoom does not scale the menu").toBe(Math.round(Math.max(220, (await boardStatus.boundingBox()).width)));
  await page.keyboard.press("Escape");
  await card.locator("[data-pro=task-details]").click();
  await pick(page, page.locator("#task-form [name=assignee]"), "Alice");
});

test("a month chosen inside the date picker keeps the picker open", async ({ page }) => {
  await openList(page);
  await openTask(page, app.task.id);
  await page.locator("#task-form [data-date-picker]").first().click();
  await pick(page, page.locator("#date-picker-month"), "December");
  await expect(page.locator("#shared-date-picker"), "Month selection keeps the date picker open").toHaveCount(1);
  await page.keyboard.press("Escape");
});

test("disabled options, groups, dynamic changes and removal leave no stale menu", async ({ page }) => {
  await openList(page);
  await openTask(page, app.task.id);
  await page.evaluate(() => {
    const select = document.createElement("select");
    select.id = "dropdown-fixture";
    select.setAttribute("aria-label", "Fixture");
    select.innerHTML = '<option value="a">Alpha</option><optgroup label="Group"><option value="b" disabled>Blocked</option><option value="c">Charlie</option></optgroup>';
    document.querySelector("#task-form .dialog-body").prepend(select);
  });
  const fixture = page.locator("#dropdown-fixture");
  await fixture.click();
  await expect(menu(page).getByRole("option", { name: "Blocked" })).toBeDisabled();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(fixture).toHaveValue("c");
  await fixture.click();
  await fixture.evaluate((el) => el.add(new Option("Delta", "d")));
  await menu(page).getByRole("option", { name: "Delta" }).waitFor();
  await fixture.evaluate((el) => el.remove());
  await menu(page).waitFor({ state: "detached" });
});

// The old suite tapped on a 1400px and a 390px window with touch enabled; the touch presets
// now cover the tap, and desktop clicks.
onDevices(["desktop", "ipad", "phone"], () => {
  test.use({ viewportSize: null });
  test("the menu stays on screen in both themes, marks the choice and closes on Tab while the editor stays open", async ({ page, device }) => {
  await openList(page);
  await openTask(page, app.done.id);
  const status = page.locator("#task-form [name=status]");
  const { width, height } = page.viewportSize();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
    await (device === "desktop" ? status.click() : status.tap());
    await menu(page).waitFor();
    const box = await menu(page).boundingBox();
    expect(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, `${theme}: menu ${JSON.stringify(box)}`).toBe(true);
    const selected = menu(page).getByRole("option", { selected: true });
    await expect(selected).toHaveText("Done");
    await expect(selected.locator("svg").last()).toHaveCSS("visibility", "visible");
    await page.keyboard.press("Tab");
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator(".task-dialog[open]"), "Closing the menu keeps the task editor open").toHaveCount(1);
  }
  });
});
