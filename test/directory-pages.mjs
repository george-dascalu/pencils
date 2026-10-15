import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-directory-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Directory project" });
const other = await store.createOrganisation({ title: "Other organisation" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const navigate = (kind) =>
  page.locator(`.directory-link[data-page="${kind}"]`).click();
const save = (kind) =>
  Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" && r.url().includes("/organisations/"),
    ),
    page.getByRole("button", { name: `Save ${kind}`, exact: true }).click(),
  ]);
try {
  await page.goto(base);
  await page.locator("#organisation-select").selectOption(project.organisation);
  await page.locator(".project-link").click();
  assert.deepEqual(
    await page
      .getByRole("navigation", { name: "Teams and people" })
      .locator("button")
      .evaluateAll((els) => els.map((el) => el.dataset.page)),
    ["teams", "people"],
  );
  await navigate("people");
  assert.equal(await page.locator("dialog").count(), 0);
  assert.ok(
    await page
      .getByRole("heading", { name: "People", exact: true, level: 1 })
      .isVisible(),
  );
  assert.ok(await page.locator("[data-directory-section=teams]").isHidden());
  await page.locator("[data-add-person]").click();
  await page.getByLabel("Person name", { exact: true }).fill("George");
  await page.locator("[data-person-field=task_capacity]").fill("7");
  const [saved] = await save("people");
  assert.equal(saved.status(), 200);
  await page.getByText("People saved.", { exact: true }).waitFor();
  let org = await store.getOrganisation(project.organisation);
  assert.equal(org.people[0].name, "George");
  assert.equal(org.people[0].task_capacity, 7);
  await navigate("teams");
  assert.ok(await page.locator("[data-directory-section=people]").isHidden());
  await page.locator("[data-add-team]").click();
  await page.getByLabel("Team name", { exact: true }).fill("Product");
  await page.locator("[data-member]").check();
  await save("teams");
  await page.getByText("Teams saved.", { exact: true }).waitFor();
  org = await store.getOrganisation(project.organisation);
  assert.deepEqual(org.teams[0].members, [org.people[0].id]);
  await page.reload();
  await page
    .getByRole("heading", { name: "Teams", exact: true, level: 1 })
    .waitFor();
  assert.equal(
    await page.getByLabel("Team name", { exact: true }).inputValue(),
    "Product",
  );
  assert.equal(
    await page
      .locator(".directory-link[aria-current=page]")
      .getAttribute("data-page"),
    "teams",
  );
  // Switching organisations keeps the directory page but changes its scope.
  await page.locator("#organisation-select").selectOption(other.id);
  await page.getByText("No teams yet.", { exact: false }).waitFor();
  assert.ok(page.url().includes(other.id));
  await navigate("people");
  assert.equal(await page.locator(".person-row").count(), 0);
  await page.locator("#organisation-select").selectOption(project.organisation);
  await page.getByLabel("Person name", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Person name", { exact: true }).inputValue(),
    "George",
  );
  // Switching pages retains a recoverable draft without silently writing it.
  await page.getByLabel("Person name", { exact: true }).fill("George draft");
  await navigate("teams");
  await navigate("people");
  await page.locator("[data-feature=form-restore]").click();
  assert.equal(
    await page.getByLabel("Person name", { exact: true }).inputValue(),
    "George draft",
  );
  assert.equal(
    (await store.getOrganisation(project.organisation)).people[0].name,
    "George",
  );
  await save("people");
  await page.getByText("People saved.", { exact: true }).waitFor();
  assert.equal(
    (await store.getOrganisation(project.organisation)).people[0].name,
    "George draft",
  );
  // Restoring an older draft must not overwrite someone else's saved changes.
  await page.getByLabel("Person name", { exact: true }).fill("Old draft");
  await navigate("teams");
  org = await store.getOrganisation(project.organisation);
  await store.updateOrganisation(org.id, {
    revision: org.revision,
    teams: [{ ...org.teams[0], name: "Product updated elsewhere" }],
  });
  await page.reload();
  await navigate("people");
  await page.locator("[data-feature=form-restore]").click();
  const [conflict] = await save("people");
  assert.equal(conflict.status(), 409);
  await page.locator(".form-error:not(.hidden)").waitFor();
  org = await store.getOrganisation(project.organisation);
  assert.equal(org.people[0].name, "George draft");
  assert.equal(org.teams[0].name, "Product updated elsewhere");
  await navigate("teams");
  await navigate("people");
  await page.locator("[data-feature=form-discard]").click();
  for (const kind of ["people", "teams"]) {
    await navigate(kind);
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
          path: `/tmp/pencils-directory-${kind}-${width}-${theme}.png`,
          animations: "disabled",
        });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  // Mobile drawer links close the drawer and open the chosen page.
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("button", { name: "Toggle sidebar", exact: true })
    .click();
  await navigate("people");
  assert.ok(
    await page
      .getByRole("heading", { name: "People", exact: true, level: 1 })
      .isVisible(),
  );
  assert.equal(
    await page
      .locator(".sidebar")
      .evaluate((e) => e.classList.contains("open")),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".project-link").click();
  await page.waitForURL((url) => !url.hash.startsWith("#organisation/"));
  await page.reload();
  await page.locator("[data-view=list]").waitFor();
  assert.equal(await page.locator(".directory-page").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Teams/People sidebar pages, create/edit/save, membership preservation, routes/reload, organisation isolation, drafts, mobile drawer and themes.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-directory-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
