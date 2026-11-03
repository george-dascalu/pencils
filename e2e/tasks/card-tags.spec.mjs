// Owner request, 3 November 2026 (F0.21-73): each project has its own list of tags. A card picks
// from it, creates a tag into it and removes tags; other projects' tags are not offered.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const other = await store.createProject({ title: "Elsewhere" });
  await store.createTask(other.id, { title: "Other card", tags: ["outside"] });
  return {};
});
// Each test has its own project, as tags created in one would show in the next.
async function tagged(title) {
  const created = await app.store.createProject({ title });
  return app.store.updateProject(created.id, { revision: created.revision, schema: { ...created.schema, tags: [{ name: "design", color: "#aed7dc" }, { name: "research" }] } });
}

onDevices(["desktop", "phone"], () => test("a card picks its project's tags, creates one into the list and removes one", { tag: "@gate" }, async ({ page, device }) => {
  const project = await tagged(`Tagged ${device}`), saved = async (id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id)?.tags;
  const card = await app.store.createTask(project.id, { title: `Tag me ${device}`, tags: ["research"] });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const tags = page.getByRole("group", { name: "Tags", exact: true }), add = tags.getByRole("combobox", { name: "Add tag", exact: true });
  const menu = page.locator(".select-menu-searchable"), search = menu.getByRole("searchbox", { name: "Find a tag", exact: true });
  await expect(tags.locator(".tag-chip")).toHaveText(["research"]);
  if (device !== "desktop") for (const control of [add, tags.getByRole("button", { name: "Remove tag research", exact: true })])
    expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // Only this project's tags are offered, less the card's own.
  await add.click();
  await expect(menu.getByRole("option")).toHaveText(["design"]);
  await menu.getByRole("option", { name: "design", exact: true }).click();
  await expect(tags.locator(".tag-chip")).toHaveText(["research", "design"]);
  await expect(tags.locator(".tag-chip").nth(1)).toHaveCSS("background-color", "rgb(174, 215, 220)");
  await expect.poll(() => saved(card.id)).toEqual(["research", "design"]);
  // What's typed and not a tag yet can be created, by its option or with Enter.
  await tags.getByRole("combobox", { name: "Add tag", exact: true }).click();
  await search.fill("launch");
  await menu.getByRole("option", { name: "Create tag “launch”", exact: true }).click();
  await tags.getByRole("combobox", { name: "Add tag", exact: true }).click();
  await search.fill("qa");
  await search.press("Enter");
  await expect(tags.locator(".tag-chip")).toHaveText(["research", "design", "launch", "qa"]);
  await tags.getByRole("button", { name: "Remove tag research", exact: true }).click();
  await expect(tags.locator(".tag-chip")).toHaveText(["design", "launch", "qa"]);
  await expect.poll(() => saved(card.id)).toEqual(["design", "launch", "qa"]);
  // A tag created on a card is one of the project's tags for its other cards.
  await page.reload();
  const next = await app.store.createTask(project.id, { title: `Next ${device}` });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${next.id}"]:visible`).first().click();
  await page.getByRole("group", { name: "Tags", exact: true }).getByRole("combobox", { name: "Add tag", exact: true }).click();
  await expect(menu.getByRole("option")).toHaveText(["design", "research", "launch", "qa"]);
}));

test("a project with Tags turned off shows no tags in the card editor", async ({ page }) => {
  const created = await app.store.createProject({ title: "No tags" });
  await app.store.updateProject(created.id, { revision: created.revision, schema: { ...created.schema, off: ["tags"] } });
  const card = await app.store.createTask(created.id, { title: "Plain", tags: ["kept"] });
  await page.goto(`${app.base}/#project/${created.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator("#task-form")).toBeVisible();
  await expect(page.locator(".task-tags")).toBeHidden();
});

test("a new card is created with the tags picked in its editor", async ({ page }) => {
  const project = await tagged("New with tags");
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await newCard(page);
  await page.locator("#task-form [name=title]").fill("Born tagged");
  await page.getByRole("group", { name: "Tags", exact: true }).getByRole("combobox", { name: "Add tag", exact: true }).click();
  await page.locator(".select-menu-searchable").getByRole("option", { name: "design", exact: true }).click();
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find((t) => t.title === "Born tagged")?.tags).toEqual(["design"]);
});

test("a tag with a comma, written outside the app, stays whole when the card's tags change", async ({ page }) => {
  const project = await tagged("Comma tags");
  const card = await app.store.createTask(project.id, { title: "Imported", tags: ["a, b"] });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const tags = page.getByRole("group", { name: "Tags", exact: true });
  await expect(tags.locator(".tag-chip")).toHaveText(["a, b"]);
  await tags.getByRole("combobox", { name: "Add tag", exact: true }).click();
  // The card's own tags aren't offered to create again, whatever their case.
  await page.locator(".select-menu-searchable").getByRole("searchbox", { name: "Find a tag", exact: true }).fill("DESIGN");
  await expect(page.locator(".select-menu-searchable [data-select-create]")).toHaveCount(0);
  await page.locator(".select-menu-searchable").getByRole("option", { name: "design", exact: true }).click();
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === card.id)?.tags).toEqual(["a, b", "design"]);
});

