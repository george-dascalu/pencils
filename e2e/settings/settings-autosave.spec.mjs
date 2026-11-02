// Settings save as they change (owner request T40, 1 November 2026; T72): no save bar, no Save or
// Discard buttons. A change saves its section, a change made while a save is under way is kept and
// saved after it, leaving the page saves a field still being typed in, and moving the project to
// another organisation asks first.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const other = await store.createOrganisation({ title: "Elsewhere" });
  const project = await store.createProject({ title: "Autosaved", key: "AS" });
  return { project, other };
});
const url = (section) => `${app.base}/#project/${app.project.id}/settings/${section}`;
const status = (page) => page.locator("[data-settings-save-state]");
const saved = async (id) => (await (await fetch(`${app.base}/api/projects/${id}`)).json()).project;
const organisation = async (id) => (await (await fetch(`${app.base}/api/organisations`)).json()).organisations.find((o) => o.id === id);

test("a change saves its section with no save bar", async ({ page }) => {
  await page.goto(url("general"));
  const name = page.locator('#project-form [name="title"]');
  await expect(name).toBeVisible();
  let saves = 0;
  page.on("request", (request) => request.method() === "PATCH" && saves++);
  await expect(page.locator(".settings-save-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Save changes|Discard changes)$/ })).toHaveCount(0);
  await name.fill("Autosaved project");
  await name.blur();
  await expect(status(page)).toHaveText("Saved");
  await expect.poll(async () => (await saved(app.project.id)).title).toBe("Autosaved project");
  expect(saves, "one change, one save").toBe(1);
});

test("a change made while a save is under way is kept and saved after it", async ({ page }) => {
  await page.goto(url("general"));
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(url => url.pathname === `/api/projects/${app.project.id}`, async (route) => {
    if (route.request().method() === "PATCH") await held;
    await route.continue();
  });
  await page.locator('#project-form [name="key"]').fill("ASYNC");
  await page.locator('#project-form [name="key"]').blur();
  await expect(status(page)).toHaveText("Saving…");
  const name = page.locator('#project-form [name="title"]');
  await name.fill("Typed during the save");
  await name.blur();
  release();
  await expect(status(page)).toHaveText("Saved");
  await expect(name, "the field keeps what was typed").toHaveValue("Typed during the save");
  await expect.poll(async () => { const p = await saved(app.project.id); return [p.title, p.key]; }).toEqual(["Typed during the save", "ASYNC"]);
});

test("leaving Settings saves the field being typed in", async ({ page }) => {
  await page.goto(url("general"));
  const name = page.locator('#project-form [name="title"]');
  await name.fill("Saved on the way out");
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.locator("#settings-panel")).toHaveCount(0);
  await expect.poll(async () => (await saved(app.project.id)).title).toBe("Saved on the way out");
});

test("moving the project to another organisation asks first", async ({ page }) => {
  await page.goto(url("teams"));
  const select = page.locator('#project-form [name="organisation"]');
  page.once("dialog", (dialog) => dialog.dismiss());
  await select.selectOption(app.other.id);
  await expect(select, "a cancelled move stays put").not.toHaveValue(app.other.id);
  expect((await saved(app.project.id)).organisation).not.toBe(app.other.id);
});

test("the organisation saves as it changes, with no Save button", async ({ page }) => {
  await page.goto(url("organisation"));
  const body = page.locator('#organisation-form [name="body"]');
  await expect(body).toBeVisible();
  await expect(page.getByRole("button", { name: "Save organisation" })).toHaveCount(0);
  const id = await page.locator("#organisation-form").getAttribute("data-id");
  await body.fill("Saved without a button.");
  await body.blur();
  await expect(status(page)).toHaveText("Saved");
  await expect.poll(async () => (await organisation(id)).body).toBe("Saved without a button.");
});

test("focus stays on the next field when a save redraws the page", async ({ page }) => {
  await page.goto(url("organisation"));
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page.getByLabel("Person name", { exact: true }).fill("Alice");
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => document.activeElement.dataset.personField);
  await expect(status(page)).toHaveText("Saved");
  await expect.poll(() => page.evaluate(() => document.activeElement.dataset.personField), "focus is back on the field it moved to").toBe(next);
  expect(next).toBeTruthy();
});

// Another section opened during a save would show the project from before it, and a change made
// there would be lost or undo the save.
test("a section opened during a save shows the project once the save has finished", async ({ page }) => {
  await page.goto(url("workflow"));
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(url => url.pathname === `/api/projects/${app.project.id}`, async (route) => {
    if (route.request().method() === "PATCH") await held;
    await route.continue();
  });
  await page.getByRole("group", { name: "Card fields" }).getByRole("checkbox", { name: "Start date", exact: true }).uncheck();
  await expect(status(page)).toHaveText("Saving…");
  await page.locator('nav[aria-label="Settings sections"] [data-settings-section="general"]').click();
  await expect(page.locator("#settings-panel .settings-loading")).toBeVisible();
  const name = page.locator('#project-form [name="title"]');
  await expect(name, "nothing to edit until the save is in").toHaveCount(0);
  release();
  await name.fill("Changed on the next page");
  await name.blur();
  await expect(status(page)).toHaveText("Saved");
  await expect(page.locator("#project-form .form-error")).toBeHidden();
  const project = await saved(app.project.id);
  expect([project.title, project.schema.off]).toEqual(["Changed on the next page", expect.arrayContaining(["start"])]);
});

test("a view turned off and on again is saved on", async ({ page }) => {
  await page.goto(url("views"));
  const kanban = page.getByRole("checkbox", { name: "Kanban", exact: true });
  await kanban.uncheck();
  await expect(status(page)).toHaveText("Saved");
  await expect.poll(async () => (await saved(app.project.id)).schema.views_off ?? []).toContain("kanban");
  await kanban.check();
  await expect.poll(async () => (await saved(app.project.id)).schema.views_off ?? []).not.toContain("kanban");
});

test("a later save does not overwrite an edit made elsewhere, even one made during a save", async ({ page }) => {
  await page.goto(url("general"));
  const name = page.locator('#project-form [name="title"]');
  // The edit elsewhere lands after this save and before the page reloads the project.
  let release, armed = false, held = false;
  const gate = new Promise((resolve) => (release = resolve));
  const hold = async (route) => {
    if (route.request().method() === "PATCH") armed = true;
    else if (armed && !held) { held = true; await gate; }
    await route.continue();
  };
  await page.route(url => url.pathname === `/api/projects/${app.project.id}`, hold);
  await page.route(`**/api/projects/${app.project.id}/**`, hold);
  await name.fill("First save");
  await name.blur();
  await expect.poll(() => held).toBe(true);
  const current = await app.store.snapshot(app.project.id);
  await app.store.updateProject(app.project.id, { revision: current.project.revision, body: "Changed elsewhere" });
  release();
  await expect(status(page)).toHaveText("Saved");
  await name.fill("Second save");
  await name.blur();
  await expect(status(page)).toHaveText("Not saved");
  await expect(page.locator("#project-form .form-error")).toBeVisible();
  expect((await saved(app.project.id)).body).toBe("Changed elsewhere");
});

test("an edit that can't be saved says so, and leaving asks first", async ({ page }) => {
  await page.goto(url("general"));
  const key = page.locator('#project-form [name="key"]');
  await key.fill("1 bad");
  await key.blur();
  await expect(status(page)).toHaveText("Not saved");
  let asked = "";
  page.once("dialog", (dialog) => { asked = dialog.message(); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect.poll(() => asked).toMatch(/can't be saved/);
  await expect(key).toHaveValue("1 bad");
});

test("a save that fails says so, and leaving asks first", async ({ page }) => {
  await page.goto(url("general"));
  await page.route(url => url.pathname === `/api/projects/${app.project.id}`, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { error: "The vault is unavailable." } }) : route.continue());
  const name = page.locator('#project-form [name="title"]');
  await name.fill("Will not save");
  await name.blur();
  await expect(status(page)).toHaveText("Not saved");
  let asked = "";
  page.once("dialog", (dialog) => { asked = dialog.message(); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect.poll(() => asked).toMatch(/can't be saved/);
  await expect(name).toHaveValue("Will not save");
});

test("leaving while a save is under way, with an edit made since, waits", async ({ page }) => {
  await page.goto(url("general"));
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(url => url.pathname === `/api/projects/${app.project.id}`, async (route) => {
    if (route.request().method() === "PATCH") await held;
    await route.continue();
  });
  await page.locator('#project-form [name="body"]').fill("Changed while saving");
  await page.locator('#project-form [name="body"]').blur();
  await expect(status(page)).toHaveText("Saving…");
  const name = page.locator('#project-form [name="title"]');
  await name.fill("Made during the save");
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.locator("#toasts")).toContainText("Wait for these settings to finish saving.");
  await expect(name, "still on Settings with the edit").toHaveValue("Made during the save");
  release();
  await expect.poll(async () => (await saved(app.project.id)).title).toBe("Made during the save");
});

test("adding a card type saves once", async ({ page }) => {
  await page.goto(url("hierarchy"));
  let saves = 0;
  page.on("request", (request) => request.method() === "PATCH" && saves++);
  await page.locator("#workflow-form [data-type-input]").fill("research");
  await page.locator("#workflow-form [data-type-add]").click();
  await expect(status(page)).toHaveText("Saved");
  await expect.poll(async () => (await saved(app.project.id)).schema.types).toContain("research");
  expect(saves, "one change, one save").toBe(1);
});
