// Owner request, 2 November 2026: a wider new-project dialog with Details, Card types and Workflow steps.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: "Studio", people: [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }], teams: [{ id: "design", name: "Design", members: ["alice"] }] });
  const other = await store.createOrganisation({ title: "Other studio" });
  const project = await store.createProject({ title: "Existing project", organisation: organisation.id });
  return { organisation, other, project };
});
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await clickControl(page.locator('.sidebar [data-action="project-new"]'));
  return page.locator("#project-form");
}
const next = form => form.getByRole("button", { name: "Next", exact: true }).click();

onDevices(["desktop", "ipad", "phone"], () => test("project setup keeps details, people, types and workflow between steps and creates once", { tag: "@gate" }, async ({ page, device }) => {
  const form = await open(page), posts = [];
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/api/projects")) posts.push(r.postDataJSON()); });
  await expect(form).toHaveAttribute("data-step", "1");
  const dialog = page.locator(".project-create-dialog"), rect = await dialog.boundingBox();
  expect(rect.width).toBeGreaterThan(Math.min(900, page.viewportSize().width - 40));
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize().width);
  await expect(dialog).toHaveCSS("overflow", "hidden");
  if (device !== "desktop") expect(await page.evaluate(() => document.activeElement.matches("input, textarea"))).toBe(false);
  await form.getByLabel("Project name", { exact: true }).fill(`New ${device} project`);
  await form.getByLabel("Project key", { exact: false }).fill(`NEW${device[0].toUpperCase()}`);
  // Bob is in no team; the Design team adds Alice (F0.21-72).
  await form.getByRole("checkbox", { name: "Bob", exact: true }).check();
  await form.locator("[data-project-team-add]").selectOption("design");
  await expect(form.getByRole("checkbox", { name: "Alice", exact: true })).toBeChecked();
  await expect(form.locator("[data-project-team-add]"), "the menu is ready for another team").toHaveValue("");
  if (device !== "desktop") expect((await form.locator('.team-members label').first().boundingBox()).height).toBeGreaterThanOrEqual(44);
  await form.getByLabel("Description", { exact: true }).fill("A project with its own rules.");
  await next(form);
  await expect(form).toHaveAttribute("data-step", "2");
  await expect(form.locator(".hierarchy-editor")).toBeVisible();
  await expect(form.locator("[data-workflow-section]")).toBeHidden();
  if (device !== "desktop") expect(await page.evaluate(() => document.activeElement.matches("input, textarea"))).toBe(false);
  await form.getByLabel("New type name", { exact: true }).fill("initiative");
  await form.getByRole("button", { name: "Add type", exact: true }).click();
  await form.getByRole("button", { name: "Remove bug", exact: true }).click();
  await form.locator("[data-hierarchy-mode]").selectOption("enforced");
  await next(form);
  await expect(form).toHaveAttribute("data-step", "3");
  await expect(form.locator(".hierarchy-editor")).toBeHidden();
  await expect(form.locator("[data-workflow-section]")).toBeVisible();
  await form.locator("[data-status-details] > summary").click();
  await form.getByLabel("New status name", { exact: true }).fill("Blocked");
  await form.getByRole("button", { name: "Add status", exact: true }).click();
  if (device !== "desktop") expect(await page.evaluate(() => document.activeElement.matches("input, textarea"))).toBe(false);
  await form.locator('[data-workflow-status="backlog"] [data-status-name]').fill("Ideas");
  await form.locator('[data-workflow-status="review"] [data-status-initial]').check();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (device !== "phone") expect(await form.locator("[data-workflow-diagram] .rule-diagram-scroll").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await form.getByRole("button", { name: "Back", exact: true }).click();
  await expect(form.locator("[data-type-chips]")).toContainText("initiative");
  await expect(form.locator("[data-hierarchy-mode]")).toHaveValue("enforced");
  await form.getByRole("button", { name: "Back", exact: true }).click();
  for (const name of ["Alice", "Bob"]) await expect(form.getByRole("checkbox", { name, exact: true })).toBeChecked();
  await expect(form.getByLabel("Description", { exact: true })).toHaveValue("A project with its own rules.");
  await next(form); await next(form);
  expect(posts).toHaveLength(0);
  await form.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(posts).toHaveLength(1);
  const created = (await app.store.list(app.organisation.id)).projects.find(p => p.title === `New ${device} project`);
  expect(created.people).toEqual(["bob", "alice"]);
  expect(created.teams).toEqual([]);
  expect(created.schema.types).toContain("initiative");
  expect(created.schema.types).not.toContain("bug");
  expect(created.schema.hierarchy.mode).toBe("enforced");
  expect(created.schema.status_labels.backlog).toBe("Ideas");
  expect(created.schema.initial_status).toBe("review");
  expect(created.schema.statuses).toContain("blocked");
}));

test("project setup validates each step, resets people on organisation change and preserves edits after a failed create", async ({ page }) => {
  const form = await open(page);
  await next(form);
  await expect(form).toHaveAttribute("data-step", "1");
  await expect(form.locator(".form-error[role=alert]")).toBeVisible();
  await form.locator('[name="title"]').fill("Retry project");
  await form.locator('[name="key"]').fill("1invalid");
  await next(form);
  await expect(form).toHaveAttribute("data-step", "1");
  await form.locator('[name="key"]').fill("TRY");
  await form.locator('[data-project-person="alice"]').check();
  await form.locator('[name="organisation"]').selectOption(app.other.id);
  await expect(form.locator('[name="people"]')).toHaveValue("[]");
  await next(form);
  while (await form.locator("[data-type-remove]").count()) await form.locator("[data-type-remove]").first().click();
  await next(form);
  await expect(form).toHaveAttribute("data-step", "2");
  await expect(form.locator(".form-error[role=alert]")).toContainText("at least one card type");
  await form.getByLabel("New type name", { exact: true }).fill("task");
  await form.getByRole("button", { name: "Add type", exact: true }).click();
  await next(form);
  await page.route("**/api/projects", route => route.request().method() === "POST" ? route.fulfill({ status: 409, json: { error: "Project key already used." } }) : route.continue());
  await form.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(form.locator(".form-error[role=alert]")).toContainText("Project key already used");
  await expect(form.getByRole("button", { name: "Create project", exact: true })).toBeEnabled();
  await form.getByRole("button", { name: "Back", exact: true }).click();
  await form.getByRole("button", { name: "Back", exact: true }).click();
  await expect(form.locator('[name="title"]')).toHaveValue("Retry project");
});

onDevices(["desktop", "phone"], () => test("a project draft restores every step without creating a project", async ({ page }) => {
  let form = await open(page);
  const before = (await app.store.list(app.organisation.id)).projects.length;
  await form.locator('[name="title"]').fill("Restored project");
  await form.locator('[data-project-person="bob"]').check();
  await form.locator('[name="title"]').press("Enter");
  await expect(form).toHaveAttribute("data-step", "2");
  await form.getByLabel("New type name", { exact: true }).fill("research");
  await form.getByRole("button", { name: "Add type", exact: true }).click();
  await next(form);
  await form.locator("[data-workflow-rules]").check();
  // Reload keeps the existing browser draft without submitting a partial project.
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await clickControl(page.locator('.sidebar [data-action="project-new"]'));
  form = page.locator("#project-form");
  await form.locator("[data-feature=form-restore]").click();
  await expect(form).toHaveAttribute("data-step", "1");
  await expect(form.locator('[name="title"]')).toHaveValue("Restored project");
  await expect(form.locator('[data-project-person="bob"]')).toBeChecked();
  await next(form);
  await expect(form.locator("[data-type-chips]")).toContainText("research");
  await next(form);
  await expect(form.locator("[data-workflow-rules]")).toBeChecked();
  expect((await app.store.list(app.organisation.id)).projects).toHaveLength(before);
  if (page.viewportSize().width < 600) expect(await page.evaluate(() => document.activeElement.matches("input, textarea"))).toBe(false);
}));
