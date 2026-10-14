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
  await page.locator("[data-member]").check();
  await page
    .getByRole("button", { name: "Save organisation", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const org = await store.getOrganisation(project.organisation);
  assert.equal(org.people[0].task_capacity, 0);
  assert.deepEqual(org.teams[0].members, [org.people[0].id]);
  await page.locator("[data-action=project-edit]").click();
  await page.locator("[data-project-team]").check();
  await page.getByRole("button", { name: /Save project/ }).click();
  await page.getByText("Project updated.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Back to project", exact: true })
    .click();
  await page.locator("[data-action=task-new]").first().click();
  await page.locator("#task-form [name=title]").fill("Planned work");
  assert.deepEqual(
    await page.locator("#task-form [name=assignee] option").allTextContents(),
    ["Unassigned", "Alice"],
  );
  await page.getByLabel("Assignee", { exact: true }).selectOption("Alice");
  const date = new Date().toLocaleDateString("en-CA");
  await page.getByLabel("Due date", { exact: true }).fill(date);
  await page.getByText("Planning & relationships", { exact: true }).click();
  await page.getByLabel("Estimate (hours)", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const task = (await store.snapshot(project.id)).tasks[0];
  assert.equal(task.assignee_id, org.people[0].id);
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
