import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-selects-"));
const store = new Store(root);
await store.init();
const org = await store.createOrganisation({
  title: "Dropdown studio",
  people: [
    { id: "g", name: "George" },
    { id: "a", name: "Alice" },
  ],
  teams: [{ id: "team", name: "Team", members: ["g", "a"] }],
});
const project = await store.createProject({
  title: "Dropdown lab",
  organisation: org.id,
  teams: ["team"],
});
const task = await store.createTask(project.id, { title: "Check dropdowns" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
  hasTouch: true,
});
const errors = [];

page.on("pageerror", (e) => errors.push(e.message));
const menu = page.locator("#shared-select-menu");
const pick = async (select, name) => {
  await select.click();
  await menu.waitFor();

  await menu.getByRole("option", { name, exact: true }).click();
  assert.equal(await menu.count(), 0);
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await pick(page.locator("#organisation-select"), "Dropdown studio");
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page
    .locator(`[data-action=task-open][data-id="${task.id}"]`)
    .first()
    .click();
  const status = page.locator("#task-form [name=status]");
  await status.click();
  assert.equal(await menu.evaluate((el) => el.matches(":popover-open")), true);
  assert.equal(
    await menu.getByRole("option", { selected: true }).innerText(),
    "To do",
  );
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  assert.equal(
    await status.inputValue(),
    "todo",
    "Escape cancels without changing the field",
  );
  assert.equal(
    await status.evaluate((el) => el === document.activeElement),
    true,
  );
  await status.press("ArrowDown");
  await page.keyboard.press("d");
  await page.keyboard.press("Enter");
  assert.equal(
    await status.inputValue(),
    "done",
    "Type-ahead and Enter choose an option",
  );
  await pick(page.locator("#task-form [name=assignee]"), "George");
  for (const width of [1400, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (theme) => window.PencilsAppearance.write({ theme }),
        theme,
      );
      await status.tap();
      const box = await menu.boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.x + box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= 1000,
      );
      const selected = menu.getByRole("option", { selected: true });
      assert.equal(await selected.innerText(), "Done");
      assert.equal(
        await selected
          .locator("svg")
          .last()
          .evaluate((el) => getComputedStyle(el).visibility),
        "visible",
      );
      await page.screenshot({
        path: `/tmp/pencils-select-menu-${width}-${theme}.png`,
      });
      await page.keyboard.press("Tab");
      assert.equal(await menu.count(), 0);
      assert.equal(
        await page.locator(".task-dialog[open]").count(),
        1,
        "Closing the menu keeps the task editor open",
      );
    }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "light" }));
  await page.locator("#task-form").evaluate((form) => form.requestSubmit());
  await page
    .locator("[data-autosave-status]")
    .filter({ hasText: /^Saved automatically$/ })
    .waitFor();
  await page.locator("[data-action=dialog-close]").click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  const saved = (await store.snapshot(project.id)).tasks.find(
    (t) => t.id === task.id,
  );
  assert.equal(saved.status, "done");
  assert.equal(saved.assignee, "George");
  // Filtering and sorting use the same menu in every project view that has select filters.
  for (const view of [
    "list",
    "tree",
    "table",
    "kanban",
    "calendar",
    "timeline",
    "capacity",
    "overview",
  ]) {
    await selectProjectView(page, view);
    const filter = page.locator("#filter-status");
    if (await filter.count()) {
      await pick(filter, "Done");
      assert.equal(await page.locator("#filter-status").inputValue(), "done");
      await pick(page.locator("#filter-status"), "All statuses");
    }
  }
  await page.locator("[data-view=board]").click();
  await page.locator("[data-action=board-task]").click();
  await page.locator(`[data-action=board-pick][data-id="${task.id}"]`).click();
  const card = page.locator(".board-node.task").first();
  await card.waitFor();
  await pick(card.locator("[data-canvas-task-field=priority]"), "High");
  await page.waitForFunction(() =>
    document.querySelector(".canvas-task-priority.high"),
  );
  await page.locator("[data-action=zoom-in]").click();
  await page.locator("[data-action=zoom-in]").click();
  const boardStatus = card.locator("[data-canvas-status]");
  await boardStatus.click();
  const box = await menu.boundingBox();
  assert.equal(
    Math.round(box.width),
    Math.round(Math.max(220, (await boardStatus.boundingBox()).width)),
    "Board zoom does not scale the menu",
  );
  await page.keyboard.press("Escape");
  await card.locator("[data-pro=task-details]").click();
  await pick(page.locator("#task-form [name=assignee]"), "Alice");
  await page.locator("#task-form [data-date-picker]").first().click();
  await pick(page.locator("#date-picker-month"), "December");
  assert.equal(
    await page.locator("#shared-date-picker").count(),
    1,
    "Month selection keeps the date picker open",
  );
  await page.keyboard.press("Escape");
  // Disabled options, groups, dynamic changes and removal are handled without stale menus.
  await page.evaluate(() => {
    const select = document.createElement("select");
    select.id = "dropdown-fixture";
    select.setAttribute("aria-label", "Fixture");
    select.innerHTML =
      '<option value="a">Alpha</option><optgroup label="Group"><option value="b" disabled>Blocked</option><option value="c">Charlie</option></optgroup>';
    document.querySelector("#task-form .dialog-body").prepend(select);
  });
  const fixture = page.locator("#dropdown-fixture");
  await fixture.click();
  assert.equal(
    await menu.getByRole("option", { name: "Blocked" }).isDisabled(),
    true,
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await fixture.inputValue(), "c");
  await fixture.click();
  await fixture.evaluate((el) => el.add(new Option("Delta", "d")));
  await menu.getByRole("option", { name: "Delta" }).waitFor();
  await fixture.evaluate((el) => el.remove());
  await menu.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shared dropdowns, persisted edits, all view filters, board zoom, modal/date nesting, keyboard/touch, disabled/dynamic options and desktop/mobile themes.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
