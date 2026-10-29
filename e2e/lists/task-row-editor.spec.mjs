// List and Tree rows edit tasks in place: titles save on Enter or blur and cancel on
// Escape, assignee/priority/status use the shared menus within the workflow, dates use
// the contextual date editor, fields managed by a connected source stay locked, type and
// ID open the card editor, a draft survives another row's save, failed saves wait in the
// offline queue, and rows fit desktop, phone and touch layouts in both themes.
//
// Rows repaint after every save, once the server answers. A repaint is held back while a
// menu, the date editor or the card editor is open, or while a title has unsaved text, and
// runs as soon as that ends. Tests therefore wait for the browser's save queue to drain
// (idle) and for the row to show the saved state before the next pointer or key action;
// a repaint landing between key down and key up loses the key (the old suite's flake).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({
    title: "Inline studio",
    people: [{ id: "george", name: "George" }, { id: "alex", name: "Alex" }],
    teams: [{ id: "team", name: "Team", members: ["george", "alex"] }],
  });
  const project = await store.createProject({
    title: "Inline tasks",
    organisation: organisation.id,
    teams: ["team"],
    schema: { statuses: ["todo", "in-progress", "done"], initial_status: "todo", done: ["done"], transitions: { todo: ["in-progress"], "in-progress": ["done"], done: ["todo"] } },
  });
  const parent = await store.createTask(project.id, { title: "Parent", order: 0 });
  const task = await store.createTask(project.id, { title: "Editable task", parent: parent.id, order: 1 });
  const remote = await store.createTask(project.id, { title: "Source task", order: 2 });
  const file = store.file(project.id, "tasks", remote.id), record = await store.read(file);
  await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one", key: "JIRA-1" } }, record.body, record);
  return { project, parent, task, remote };
});

const saved = async (id = app.task.id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id);
const row = (page, id = app.task.id) => page.locator(`[data-task-order-row="${id}"]`);
const field = (page, name, id = app.task.id) => row(page, id).locator(`[data-row-field="${name}"]`);
const dates = (page) => page.locator("#task-dates-form");

// The browser has its answers for every save and has run the repaint that follows.
async function idle(page) {
  await page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("pencils:pending:") && !k.endsWith(":lease")).every((k) => !JSON.parse(localStorage.getItem(k) || "[]").length));
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function choose(page, name, value) {
  await field(page, name).click();
  await page.locator("#shared-select-menu").getByRole("option", { name: value, exact: true }).click();
}
async function open(page, view) {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await row(page).waitFor();
}
// Closing the card editor returns focus to the row that opened it.
async function closeEditor(page, { tap = false } = {}) {
  const close = page.locator("[data-action=dialog-close]");
  await (tap ? close.tap() : close.click());
  await page.waitForFunction(() => !document.querySelector("#task-form") && document.activeElement?.closest("[data-task-order-row]"));
}
async function phoneTaskFields(page, taskRow) {
  const { width } = page.viewportSize();
  await taskRow.locator(".phone-task-open").click();
  await page.locator("#task-form").waitFor();
  for (const name of ["assignee", "priority", "status"]) {
    const picker = page.locator(`#task-form [data-task-picker="${name}"] .task-picker-trigger`);
    const custom = await picker.count();
    await (custom ? picker : page.locator(`#task-form [name="${name}"]`)).click();
    const menu = page.locator(custom ? "[data-task-picker] .task-picker-popover:not([hidden])" : "#shared-select-menu");
    await menu.waitFor();
    const bounds = await menu.boundingBox();
    expect(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${name} menu fits ${JSON.stringify(bounds)}`).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
  await expect(page.locator("#task-form [name=due]")).toBeVisible();
  await expect(page.locator("#task-form [name=title]")).toHaveValue((await saved()).title);
  await page.locator("[data-action=dialog-close]").click();
  await page.waitForFunction(() => document.activeElement?.matches(".phone-task-open"));
  await expect(taskRow.locator(".phone-task-open")).toBeFocused();
}

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  for (const view of ["list", "tree"]) {
    test(`${view}: rows show the saved priority, workflow status choices and locked source fields`, async ({ page }) => {
      await open(page, view);
      await expect(field(page, "priority")).toHaveValue((await saved()).priority || "medium");
      await expect(field(page, "status").locator("option")).toHaveText(["To do", "In progress"]);
      await expect(field(page, "title", app.remote.id)).toHaveAttribute("readonly", "");
      for (const name of ["assignee", "priority", "status"]) await expect(field(page, name, app.remote.id)).toBeDisabled();
    });

    test(`${view}: titles save on Enter or blur, Escape cancels and blank titles are refused`, async ({ page }) => {
      await open(page, view);
      const title = field(page, "title");
      const original = (await saved()).title;
      await title.click();
      await expect(page.locator("#task-form")).toHaveCount(0);
      await title.fill("Unfinished");
      await title.press("Escape");
      await expect(title).toHaveValue(original);
      expect((await saved()).title).toBe(original);
      await title.fill("   ");
      await title.press("Enter");
      await expect(title).toHaveAttribute("aria-invalid", "true");
      expect((await saved()).title).toBe(original);
      await title.press("Escape");
      await title.fill(`Renamed in ${view}`);
      await title.press("Enter");
      await expect.poll(async () => (await saved()).title).toBe(`Renamed in ${view}`);
      await idle(page);
      await title.fill(`Blur saved in ${view}`);
      await title.press("Tab");
      await expect.poll(async () => (await saved()).title).toBe(`Blur saved in ${view}`);
      await idle(page);
    });

    test(`${view}: assignee, priority and status save from their menus, by pointer or keyboard, within the workflow`, async ({ page }) => {
      await open(page, view);
      const assignee = (await saved()).assignee === "George" ? "Alex" : "George";
      await choose(page, "assignee", assignee);
      await expect.poll(async () => (await saved()).assignee).toBe(assignee);
      await expect(row(page).locator(".row-assignee")).toHaveAttribute("title", assignee);
      await expect(row(page).locator(".row-assignee .task-assignee")).toHaveText(assignee[0]);
      await expect(row(page).locator(".row-assignee-name")).toHaveCount(0);
      await choose(page, "priority", "Lowest");
      await expect.poll(async () => (await saved()).priority).toBe("none");
      await idle(page);
      await field(page, "priority").focus();
      await field(page, "priority").press("Enter");
      await page.keyboard.press("Home");
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await saved()).priority).toBe("urgent");
      await idle(page);
      await choose(page, "status", "In progress");
      await expect.poll(async () => (await saved()).status).toBe("in-progress");
      await expect(row(page).locator(".row-status")).toHaveAttribute("title", "In progress");
      if (view === "list") await expect(row(page).locator("..").locator("..").locator("h2")).toHaveText(/In progress/);
      await idle(page);
      await choose(page, "status", "Done");
      await expect.poll(async () => (await saved()).status).toBe("done");
      await idle(page);
      await choose(page, "status", "To do");
      await expect.poll(async () => (await saved()).status).toBe("todo");
      await idle(page);
    });

    test(`${view}: the date editor checks the order, saves as you type and clears; source tasks keep dates locked`, async ({ page }) => {
      await open(page, view);
      await row(page).locator("[data-row-dates]").click();
      await dates(page).locator("[name=start]").fill("2026-10-20");
      await dates(page).locator("[name=due]").fill("2026-10-19");
      await expect(dates(page).locator(".form-error")).toHaveText(/on or after/);
      await dates(page).locator("[name=due]").fill("2026-10-24");
      await expect.poll(async () => (await saved()).due).toBe("2026-10-24");
      expect((await saved()).start).toBe("2026-10-20");
      await expect(dates(page), "Autosave keeps both fields available").toHaveCount(1);
      await idle(page);
      await dates(page).getByRole("button", { name: "Close date editor" }).click();
      await dates(page).waitFor({ state: "detached" });
      await expect(row(page).locator(".row-due")).toContainText("24");
      await row(page).locator("[data-row-dates]").click();
      await dates(page).getByRole("button", { name: "Clear dates" }).click();
      await expect.poll(async () => { const t = await saved(); return !t.due && !t.start; }).toBe(true);
      await idle(page);
      await dates(page).getByRole("button", { name: "Close date editor" }).click();
      await dates(page).waitFor({ state: "detached" });
      // The repaint held back while the editor was open shows the cleared dates.
      await expect(row(page).locator(".row-due")).toHaveAttribute("title", "Start: Not set · Due: Not set");
      await row(page, app.remote.id).locator("[data-row-dates]").click();
      await expect(dates(page).locator("[name=due]")).toBeDisabled();
      await dates(page).getByRole("button", { name: "Close date editor" }).click();
      await dates(page).waitFor({ state: "detached" });
    });

    test(`${view}: type and ID open the card editor by click, Enter and Space`, async ({ page }) => {
      await open(page, view);
      const title = (await saved()).title;
      // Type and ID both reach the same task editor (no separate open control since 0.19.7).
      for (const selector of [".task-type", ".task-id"]) {
        await row(page).locator(selector).click();
        await page.locator("#task-form").waitFor();
        await expect(page.locator("#task-form [name=title]")).toHaveValue(title);
        await closeEditor(page);
      }
      for (const [selector, key] of [[".task-type", "Enter"], [".task-id", "Space"]]) {
        await row(page).locator(selector).press(key);
        await page.locator("#task-form").waitFor();
        await closeEditor(page);
      }
    });

    test(`${view}: menus and rows fit desktop and phone width in both themes`, async ({ page }) => {
      await open(page, view);
      for (const width of [1500, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 390) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
        for (const theme of ["light", "dark"]) {
          await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
          if (width <= 600) {
            await phoneTaskFields(page, row(page));
            expect((await row(page).boundingBox()).height).toBeLessThanOrEqual(76);
            continue;
          }
          for (const name of ["assignee", "priority", "status"]) {
            await field(page, name).click();
            const b = await page.locator("#shared-select-menu").boundingBox();
            expect(b.x >= 0 && b.x + b.width <= width + 1, `${name} menu fits ${JSON.stringify(b)}`).toBe(true);
            await page.keyboard.press("Escape");
            await expect(field(page, name)).toBeFocused();
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no page overflow").toBe(true);
          if (width > 900) expect((await row(page).boundingBox()).height, "Desktop pointer rows stay compact").toBeLessThanOrEqual(await row(page).evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--control-height")) + 4));
          else {
            const titleBox = await row(page).locator(".row-title").boundingBox();
            expect(titleBox.x < width - 100 && titleBox.width >= 100, "Narrow rows keep their title visible").toBe(true);
          }
        }
      }
    });
  }

  test("a save finishing while another title is being typed keeps that draft", async ({ page }) => {
    await open(page, "tree");
    const url = `**/api/projects/${app.project.id}/tasks/${app.task.id}`;
    // A slow server: the save answers while the other title is being typed.
    await page.route(url, async (route) => {
      if (route.request().method() === "PATCH") await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });
    const priority = (await saved()).priority === "high" ? "Low" : "High";
    await choose(page, "priority", priority);
    await field(page, "title", app.parent.id).fill("Draft survives another save");
    await expect.poll(async () => (await saved()).priority).toBe(priority.toLowerCase());
    await idle(page);
    await expect(field(page, "title", app.parent.id)).toHaveValue("Draft survives another save");
    await field(page, "title", app.parent.id).press("Escape");
    await page.unroute(url);
  });

  test("failed updates wait in the offline queue and retry when the browser is back online", async ({ page }) => {
    await open(page, "tree");
    const url = `**/api/projects/${app.project.id}/tasks/${app.task.id}`;
    await page.route(url, (route) => route.abort());
    await field(page, "title").fill("Offline title");
    await field(page, "title").press("Enter");
    await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("pencils:pending:") && !key.endsWith(":lease") && JSON.parse(localStorage.getItem(key) || "[]").some((entry) => entry.local.title === "Offline title")));
    await page.unroute(url);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await saved()).title).toBe("Offline title");
    await page.reload();
    await row(page).waitFor();
    await expect(field(page, "title")).toHaveValue("Offline title");
    expect((await saved()).parent).toBe(app.parent.id);
    expect((await saved(app.remote.id)).title).toBe("Source task");
  });
});

onDevices(["phone", "ipad"], () => {
  for (const view of ["list", "tree"]) {
    test(`${view}: touch rows open their menus, the date editor and the card editor`, async ({ page, device }) => {
      const { width } = page.viewportSize();
      await open(page, view);
      const taskRow = row(page);
      if (device === "phone") {
        await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
        await phoneTaskFields(page, taskRow);
        const height = (await taskRow.boundingBox()).height;
        expect(height >= 44 && height <= 76, `phone row height ${height}`).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no page overflow").toBe(true);
        return;
      }
      for (const name of ["assignee", "priority", "status"]) {
        await taskRow.locator(`[data-row-field="${name}"]`).tap();
        const menu = page.locator("#shared-select-menu");
        await menu.waitFor();
        const bounds = await menu.boundingBox();
        expect(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${name} menu fits ${JSON.stringify(bounds)}`).toBe(true);
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
      }
      const height = (await taskRow.boundingBox()).height;
      // Rows reflow to two lines under 900px, or under 1110px while the sidebar is open.
      // Narrow rows wrap onto two lines (a grid until 0.19.11, wrapping flex lines since 0.19.12).
      const reflowed = await taskRow.evaluate((el) => { const cs = getComputedStyle(el); return cs.display === "grid" || cs.flexWrap === "wrap"; });
      expect(height >= 44 && height <= (reflowed ? 150 : 48), `Touch row fits its responsive layout: ${height}px`).toBe(true);
      const titleBox = await taskRow.locator(".row-title").boundingBox();
      if (width <= 900) expect(titleBox.x < width - 100 && titleBox.width >= 100).toBe(true);
      await taskRow.locator("[data-row-dates]").tap();
      await page.locator("#task-dates-form [data-task-dates-close]").tap();
      await dates(page).waitFor({ state: "detached" });
      for (const selector of [".task-type", ".task-id"]) {
        await taskRow.locator(selector).tap();
        await page.locator("#task-form").waitFor();
        await expect(page.locator("#task-form [name=title]")).toHaveValue((await saved()).title);
        await closeEditor(page, { tap: true });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no page overflow").toBe(true);
    });
  }
});
