import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-row-editor-"));
const store = new Store(root);
await store.init();
const organisation = await store.createOrganisation({
  title: "Inline studio",
  people: [
    { id: "george", name: "George" },
    { id: "alex", name: "Alex" },
  ],
  teams: [{ id: "team", name: "Team", members: ["george", "alex"] }],
});
const project = await store.createProject({
  title: "Inline tasks",
  organisation: organisation.id,
  teams: ["team"],
  schema: {
    statuses: ["todo", "in-progress", "done"],
    initial_status: "todo",
    done: ["done"],
    transitions: {
      todo: ["in-progress"],
      "in-progress": ["done"],
      done: ["todo"],
    },
  },
});
const parent = await store.createTask(project.id, {
  title: "Parent",
  order: 0,
});
const task = await store.createTask(project.id, {
  title: "Editable task",
  parent: parent.id,
  order: 1,
});
const remote = await store.createTask(project.id, {
  title: "Source task",
  order: 2,
});
const file = store.file(project.id, "tasks", remote.id),
  record = await store.read(file);
await store.write(
  file,
  {
    ...record.data,
    source: { provider: "jira", external_id: "one", key: "JIRA-1" },
  },
  record.body,
  record,
);
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await { chromium, webkit }[
  process.env.BROWSER || "chromium"
].launch();
const context = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const row = (id = task.id) => page.locator(`[data-task-order-row="${id}"]`);
const field = (name, id = task.id) =>
  row(id).locator(`[data-row-field="${name}"]`);
const saved = async (id = task.id) =>
  (await store.snapshot(project.id)).tasks.find((t) => t.id === id);
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw Error("Timed out");
}
async function choose(name, value) {
  await field(name).click();
  await page
    .locator("#shared-select-menu")
    .getByRole("option", { name: value, exact: true })
    .click();
}
async function open(view) {
  await page.goto(`${base}/#project/${project.id}/${view}`);
  await row().waitFor();
}
try {
  for (const view of ["list", "tree"]) {
    await open(view);
    assert.equal(
      await field("priority").inputValue(),
      view === "list" ? "medium" : "urgent",
    );
    assert.deepEqual(
      await field("status").locator("option").allTextContents(),
      ["To do", "In progress"],
    );
    assert.ok(
      (await field("title", remote.id).getAttribute("readonly")) !== null,
    );
    for (const name of ["assignee", "priority", "status"])
      assert.ok(await field(name, remote.id).isDisabled());
    const title = field("title");
    const original = (await saved()).title;
    await title.click();
    assert.equal(await page.locator("#task-form").count(), 0);
    await title.fill("Unfinished");
    await title.press("Escape");
    assert.equal(await title.inputValue(), original);
    assert.equal((await saved()).title, original);
    await title.fill("   ");
    await title.press("Enter");
    assert.equal(await title.getAttribute("aria-invalid"), "true");
    assert.equal((await saved()).title, original);
    await title.press("Escape");
    await title.fill(`Renamed in ${view}`);
    await title.press("Enter");
    await until(async () => (await saved()).title === `Renamed in ${view}`);
    await title.fill(`Blur saved in ${view}`);
    await title.press("Tab");
    await until(async () => (await saved()).title === `Blur saved in ${view}`);
    await choose("assignee", view === "list" ? "George" : "Alex");
    await until(
      async () =>
        (await saved()).assignee === (view === "list" ? "George" : "Alex"),
    );
    await until(
      async () =>
        (await row().locator(".row-assignee").getAttribute("title")) ===
        (view === "list" ? "George" : "Alex"),
    );
    assert.equal(await row().locator(".task-assignee").textContent(), view === "list" ? "G" : "A");
    assert.equal(await row().locator(".row-assignee-name").count(), 0);
    await choose("priority", "Lowest");
    await until(async () => (await saved()).priority === "none");
    await field("priority").focus();
    await field("priority").press("Enter");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await until(async () => (await saved()).priority === "urgent");
    await choose("status", "In progress");
    await until(async () => (await saved()).status === "in-progress");
    await until(
      async () =>
        (await row().locator(".row-status").getAttribute("title")) ===
        "In progress",
    );
    if (view === "list")
      assert.match(
        await row().locator("..").locator("..").locator("h2").textContent(),
        /In progress/,
      );
    await row().locator("[data-row-dates]").click();
    const dates = page.locator("#task-dates-form");
    await dates.locator("[name=start]").fill("2026-10-20");
    await dates.locator("[name=due]").fill("2026-10-19");
    assert.match(
      await dates.locator(".form-error").textContent(),
      /on or after/,
    );
    await dates.locator("[name=due]").fill("2026-10-24");
    await until(async () => (await saved()).due === "2026-10-24");
    assert.equal((await saved()).start, "2026-10-20");
    assert.equal(await dates.count(), 1, "Autosave keeps both fields available");
    await dates.getByRole("button", { name: "Close date editor" }).click();
    await dates.waitFor({ state: "detached" });
    await until(async () =>
      (await row().locator(".row-due").textContent()).includes("24"),
    );
    await row().locator("[data-row-dates]").click();
    await dates.getByRole("button", { name: "Clear dates" }).click();
    await until(async () => !(await saved()).due && !(await saved()).start);
    await dates.getByRole("button", { name: "Close date editor" }).click();
    await dates.waitFor({ state: "detached" });
    // Type, ID and the dedicated open control all reach the same task editor.
    for (const selector of [".row-open", ".task-type", ".task-id"]) {
      await row().locator(selector).click();
      await page.locator("#task-form").waitFor();
      assert.equal(
        await page.locator("#task-form [name=title]").inputValue(),
        `Blur saved in ${view}`,
      );
      await page.locator("[data-action=dialog-close]").click();
    }
    for (const [selector, key] of [[".task-type", "Enter"], [".task-id", "Space"]]) {
      await row().locator(selector).press(key);
      await page.locator("#task-form").waitFor();
      await page.locator("[data-action=dialog-close]").click();
    }
    await row(remote.id).locator("[data-row-dates]").click();
    assert.ok(await dates.locator("[name=due]").isDisabled());
    await dates.getByRole("button", { name: "Close date editor" }).click();
    await choose("status", "Done");
    await until(async () => (await saved()).status === "done");
    await choose("status", "To do");
    await until(async () => (await saved()).status === "todo");
    for (const width of [1500, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width === 390)
        await page.waitForFunction(
          () =>
            document.querySelector(".sidebar").getBoundingClientRect().right <=
            1,
        );
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        for (const name of ["assignee", "priority", "status"]) {
          await field(name).click();
          const menu = page.locator("#shared-select-menu");
          const b = await menu.boundingBox();
          assert.ok(b.x >= 0 && b.x + b.width <= width + 1);
          await page.keyboard.press("Escape");
          assert.ok(
            await field(name).evaluate((el) => el === document.activeElement),
          );
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        if (width > 900) assert.ok(
          (await row().boundingBox()).height <= await row().evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue("--control-height")) + 4),
          "Desktop pointer rows stay compact",
        );
        else {
          const titleBox = await row().locator(".row-title").boundingBox();
          assert.ok(titleBox.x < width - 100 && titleBox.width >= 100, "Narrow rows keep their title visible");
        }
        await page.screenshot({
          path: `/tmp/pencils-inline-${view}-${width}-${theme}-${process.env.BROWSER || "chromium"}.png`,
        });
      }
    }
    await page.setViewportSize({ width: 1500, height: 1000 });
  }
  // A save completing while another title is being typed must not destroy that draft.
  const url = `**/api/projects/${project.id}/tasks/${task.id}`;
  await page.route(url, async (route) => {
    if (route.request().method() === "PATCH")
      await new Promise((r) => setTimeout(r, 350));
    await route.continue();
  });
  await choose("priority", "High");
  await field("title", parent.id).fill("Draft survives another save");
  await until(async () => (await saved()).priority === "high");
  assert.equal(
    await field("title", parent.id).inputValue(),
    "Draft survives another save",
  );
  await field("title", parent.id).press("Escape");
  await page.unroute(url);
  // Failed/offline updates stay in the existing durable queue and retry safely.
  await page.route(url, (route) => route.abort());
  await field("title").fill("Offline title");
  await field("title").press("Enter");
  await page.waitForFunction(() =>
    Object.keys(localStorage).some(
      (key) =>
        key.startsWith("pencils:pending:") &&
        !key.endsWith(":lease") &&
        JSON.parse(localStorage.getItem(key) || "[]").some(
          (entry) => entry.local.title === "Offline title",
        ),
    ),
  );
  await page.unroute(url);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(async () => (await saved()).title === "Offline title");
  await page.reload();
  await row().waitFor();
  assert.equal(await field("title").inputValue(), "Offline title");
  assert.equal((await saved()).parent, parent.id);
  assert.equal((await saved(remote.id)).title, "Source task");
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const tablet = await touch.newPage();
  tablet.setDefaultTimeout(10000);
  await tablet.addInitScript(() => {
    window.rowEvents = [];
    for (const type of [
      "pointerdown",
      "pointerup",
      "click",
      "touchstart",
      "touchend",
    ])
      document.addEventListener(
        type,
        (event) => {
          window.rowEvents.push([
            type,
            event.target.tagName,
            event.target.dataset.rowField || event.target.className,
          ]);
          if (window.rowEvents.length > 20) window.rowEvents.shift();
        },
        true,
      );
  });
  tablet.on("pageerror", (e) => errors.push(e.message));
  for (const width of [390, 1024]) {
    await tablet.setViewportSize({ width, height: 844 });
    for (const view of ["list", "tree"]) {
      await tablet.goto(`${base}/#project/${project.id}/${view}`);
      const taskRow = tablet.locator(`[data-task-order-row="${task.id}"]`);
      await taskRow.waitFor();
      if (width === 390)
        await tablet.waitForFunction(
          () =>
            document.querySelector(".sidebar").getBoundingClientRect().right <=
            1,
        );
      for (const name of ["assignee", "priority", "status"]) {
        await taskRow.locator(`[data-row-field="${name}"]`).tap();
        const menu = tablet.locator("#shared-select-menu");
        try {
          await menu.waitFor();
        } catch (error) {
          console.log({
            width,
            view,
            name,
            events: await tablet.evaluate(() => window.rowEvents),
          });
          await tablet.screenshot({
            path: "/tmp/pencils-row-touch-failure.png",
          });
          throw error;
        }
        const bounds = await menu.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
        await tablet.keyboard.press("Escape");
      }
      const height = (await taskRow.boundingBox()).height;
      assert.ok(height >= 44 && height <= (width <= 900 ? 150 : 48), `Touch row fits its responsive layout: ${height}px`);
      const titleBox = await taskRow.locator(".row-title").boundingBox();
      if (width <= 900) assert.ok(titleBox.x < width - 100 && titleBox.width >= 100);
      await taskRow.locator("[data-row-dates]").tap();
      await tablet.locator("#task-dates-form [data-task-dates-close]").tap();
      for (const selector of [".row-open", ".task-type", ".task-id"]) {
        await taskRow.locator(selector).tap();
        await tablet.locator("#task-form").waitFor();
        assert.equal(await tablet.locator("#task-form [name=title]").inputValue(), (await saved()).title);
        await tablet.locator("[data-action=dialog-close]").tap();
      }
      assert.ok(
        await tablet.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
  }
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: List/Tree inline edits, Enter/blur/Escape, workflow limits, dates, source protections, side-panel action, draft preservation, offline retry, desktop/mobile and both themes.",
  );
} catch (error) {
  await page.screenshot({
    path: `/tmp/pencils-row-editor-failure-${process.env.BROWSER || "chromium"}.png`,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
