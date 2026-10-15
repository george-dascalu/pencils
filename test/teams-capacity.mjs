import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-capacity-ui-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Team planning" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-action=organisation-edit]").click();
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page.getByLabel("Person name", { exact: true }).fill("Alice");
  await page.locator("[data-person-field=task_capacity]").fill("0");
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Design");
  await page
    .getByRole("button", { name: "Save organisation", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const org = await store.getOrganisation(project.organisation);
  assert.equal(org.people[0].task_capacity, 0);
  assert.deepEqual(org.teams[0].members, []);
  await page.locator("[data-action=project-edit]").click();
  await page.locator("[data-project-team]").check();
  await page.getByRole("button", { name: /Save project/ }).click();
  await page.getByText("Project updated.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Back to project", exact: true })
    .click();
  await page.locator("[data-action=task-new]").first().click();
  assert.deepEqual(
    await page.locator("#task-form [name=assignee] option").allTextContents(),
    ["Unassigned"],
  );
  assert.match(
    await page.locator("#task-assignee-help").textContent(),
    /teams have no members/,
  );
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator('.directory-link[data-page="teams"]').click();
  await page.locator("[data-member]").check();
  await page.getByRole("button", { name: "Save teams", exact: true }).click();
  await page.getByText("Teams saved.", { exact: true }).waitFor();
  assert.deepEqual(
    (await store.getOrganisation(project.organisation)).teams[0].members,
    [org.people[0].id],
  );
  await page.locator(".project-link").click();
  await page.locator("[data-action=task-new]").first().click();
  assert.equal(await page.locator("#task-assignee-help").count(), 0);
  await page.locator("#task-form [name=title]").fill("Planned work");
  assert.deepEqual(
    await page.locator("#task-form [name=assignee] option").allTextContents(),
    ["Unassigned", "Alice"],
  );
  await page.getByLabel("Assignee", { exact: true }).selectOption("Alice");
  const date = new Date().toLocaleDateString("en-CA");
  await page.getByLabel("Due date", { exact: true }).fill(date);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const task = (await store.snapshot(project.id)).tasks[0];
  assert.equal(task.assignee_id, org.people[0].id);
  // Board cards edit the project task; another card for the same task updates too.
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      {
        id: "task-one",
        type: "task",
        task: task.id,
        x: 120,
        y: 180,
        w: 220,
        h: 220,
      },
      {
        id: "task-two",
        type: "task",
        task: task.id,
        x: 430,
        y: 180,
        w: 310,
        h: 220,
      },
    ],
    edges: [],
  });
  await page.reload();
  await page.locator("[data-view=board]").click();
  const card = page.locator('[data-node="task-one"]');
  const priority = card.locator('[data-canvas-task-field="priority"]');
  const assignee = card.locator('[data-canvas-task-field="assignee"]');
  const camera = await page.locator("#canvas-world").getAttribute("style");
  assert.deepEqual(await assignee.locator("option").allTextContents(), [
    "Unassigned",
    "Alice",
  ]);
  await priority.selectOption("high");
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-canvas-task-field="priority"]')].every(
      (el) => el.value === "high",
    ),
  );
  await assignee.selectOption("");
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-canvas-task-field="assignee"]')].every(
      (el) => el.value === "",
    ),
  );
  await assignee.selectOption("Alice");
  for (let i = 0; i < 100; i++) {
    const updated = (await store.snapshot(project.id)).tasks[0];
    if (updated.priority === "high" && updated.assignee_id === org.people[0].id)
      break;
    await page.waitForTimeout(50);
  }
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  assert.equal(await page.locator("dialog").count(), 0);
  for (const select of await card.locator(".live-card-state select").all()) {
    const box = await select.boundingBox(),
      bounds = await card.boundingBox();
    assert.ok(
      box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width,
      "Metadata controls fit a minimum-width task card",
    );
  }
  const checkCardFocus = async () => {
    for (const control of await card.locator(".live-card-state select, .live-card-heading button").all()) {
      await control.focus();
      const ring = await control.evaluate((el) => {
        const target = el.closest(".canvas-task-priority") || el;
        const style = getComputedStyle(target);
        const bounds = target.getBoundingClientRect();
        const overflow = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
        const clipped = [];
        for (let parent = target.parentElement; parent && !parent.matches("#canvas"); parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          const r = parent.getBoundingClientRect();
          if (/(hidden|clip|auto|scroll)/.test(css.overflowX) &&
              (bounds.left - overflow < r.left - 1 || bounds.right + overflow > r.right + 1)) clipped.push(parent.className);
          if (/(hidden|clip|auto|scroll)/.test(css.overflowY) &&
              (bounds.top - overflow < r.top - 1 || bounds.bottom + overflow > r.bottom + 1)) clipped.push(parent.className);
        }
        return {width: style.outlineWidth, offset: style.outlineOffset, clipped, target: target.outerHTML, focused: document.activeElement === el, visible: el.matches(":focus-visible")};
      });
      assert.equal(ring.width, "1px", JSON.stringify(ring));
      assert.equal(ring.offset, "-1px");
      assert.deepEqual(ring.clipped, [], "All four sides of the focus ring fit inside clipping containers");
    }
    await assignee.focus();
  };
  await checkCardFocus();
  await page.screenshot({ path: "/tmp/pencils-board-task-controls.png" });
  const zoomTarget = await card.boundingBox();
  await page.mouse.move(zoomTarget.x + zoomTarget.width / 2, zoomTarget.y + zoomTarget.height / 2);
  await page.mouse.wheel(0, -700);
  await page.waitForFunction(() => parseInt(document.querySelector("#zoom-label").textContent) > 150);
  await page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
  await checkCardFocus();
  await page.screenshot({path: "/tmp/pencils-board-focus-zoomed.png"});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.locator('[data-action="board-fit"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#canvas").classList.contains("zooming"),
  );
  assert.ok(await assignee.isVisible());
  const narrowBounds = await card.boundingBox();
  for (const select of await card.locator(".live-card-state select").all()) {
    const box = await select.boundingBox();
    assert.ok(
      box.x >= narrowBounds.x &&
        box.x + box.width <= narrowBounds.x + narrowBounds.width,
    );
  }
  await checkCardFocus();
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/pencils-board-task-controls-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.reload();
  await card.waitFor();
  assert.equal(await priority.inputValue(), "high");
  assert.equal(await assignee.inputValue(), "Alice");
  await page.locator("[data-view=capacity]").click();
  await page.getByRole("region", { name: "Team capacity" }).waitFor();
  assert.ok(
    await page
      .locator(".capacity-summary")
      .getByText("1 task scheduled", { exact: true })
      .isVisible(),
  );
  assert.ok(
    await page
      .locator(".capacity-table")
      .getByText("1 over limit", { exact: true })
      .isVisible(),
  );
  assert.deepEqual(
    await page
      .locator('[aria-label="Schedule views"] [data-view]')
      .evaluateAll((els) => els.map((el) => el.dataset.view)),
    ["calendar", "timeline", "capacity"],
  );
  await page.getByLabel("Next week", { exact: true }).click();
  assert.ok(
    await page
      .locator(".capacity-summary")
      .getByText("0 tasks scheduled", { exact: true })
      .isVisible(),
  );
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await page.reload();
  await page
    .locator(".capacity-summary")
    .getByText("1 task scheduled", { exact: true })
    .waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `/tmp/pencils-capacity-${width}-${theme}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".capacity-work summary").first().click();
  await page.locator(".capacity-work [data-action=task-open]").click();
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "Planned work",
  );
  assert.equal(
    await page.locator('#task-form [name="priority"]').inputValue(),
    "high",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: people/team creation, project team assignment, member assignees, capacity calculations/navigation, reload, mobile/light/dark and task links.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-capacity-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
