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

onDevices(["desktop", "phone"], () => test("a card picks its project's tags in one field of chips, creates one into the list and removes tags", { tag: "@gate" }, async ({ page, device }) => {
  const project = await tagged(`Tagged ${device}`), saved = async (id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id)?.tags;
  const card = await app.store.createTask(project.id, { title: `Tag me ${device}`, tags: ["research"] });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const tags = page.getByRole("group", { name: "Tags", exact: true }), input = tags.getByRole("combobox", { name: "Add tag", exact: true });
  const menu = page.locator(".tag-combo-menu"), field = tags.locator(".tag-combo");
  const clear = tags.getByRole("button", { name: "Clear all tags", exact: true }), chevron = tags.getByRole("button", { name: "Show all tags", exact: true });
  await expect(tags.locator(".tag-chip")).toHaveText(["research"]);
  // One field at the shared control height holds the chips, the input, clear-all and the chevron.
  const height = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--control-height")));
  expect((await field.boundingBox()).height).toBeGreaterThanOrEqual(height);
  expect(await field.evaluate((el) => el.contains(document.querySelector("[data-task-tags] input")))).toBe(true);
  if (device !== "desktop") for (const control of [tags.getByRole("button", { name: "Remove tag research", exact: true }), clear, chevron])
    expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // The whole list opens with every project tag as a chip; the card's own are marked chosen.
  await chevron.click();
  await expect(chevron).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("option")).toHaveText(["design", "research"]);
  await expect(menu.getByRole("option", { name: "research", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(menu.getByRole("option", { name: "design", exact: true })).toHaveAttribute("aria-selected", "false");
  await expect(menu.locator(".tag-chip").first()).toHaveCSS("background-color", "rgb(174, 215, 220)");
  await menu.getByRole("option", { name: "design", exact: true }).click();
  await expect(tags.locator(".tag-chip")).toHaveText(["research", "design"]);
  await expect(tags.locator(".tag-chip").nth(1)).toHaveCSS("background-color", "rgb(174, 215, 220)");
  await expect(menu.getByRole("option", { name: "design", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => saved(card.id)).toEqual(["research", "design"]);
  // What's typed filters the list; what isn't a tag yet can be created, by its option or with Enter.
  await input.fill("launch");
  await expect(menu.getByRole("option")).toHaveText(["Create tag “launch”"]);
  await menu.getByRole("option", { name: "Create tag “launch”", exact: true }).click();
  await expect(input).toHaveValue("");
  await input.fill("qa");
  await input.press("Enter");
  await expect(tags.locator(".tag-chip")).toHaveText(["research", "design", "launch", "qa"]);
  await expect(menu.getByRole("option", { name: "launch", exact: true })).toHaveAttribute("aria-selected", "true");
  // Backspace in the empty input removes the last chip; a chip's × removes its own.
  await input.press("Backspace");
  await expect(tags.locator(".tag-chip")).toHaveText(["research", "design", "launch"]);
  await tags.getByRole("button", { name: "Remove tag research", exact: true }).click();
  await expect(tags.locator(".tag-chip")).toHaveText(["design", "launch"]);
  await expect.poll(() => saved(card.id)).toEqual(["design", "launch"]);
  // Enter picks the highlighted option; Escape closes the list and focus stays in the input.
  await input.fill("res");
  await expect(menu.getByRole("option", { name: "research", exact: true })).toHaveClass(/active/);
  await input.press("Enter");
  await expect(tags.locator(".tag-chip")).toHaveText(["design", "launch", "research"]);
  await input.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(input).toBeFocused();
  await clear.click();
  await expect(tags.locator(".tag-chip")).toHaveCount(0);
  await expect(clear).toHaveCount(0);
  await expect.poll(() => saved(card.id)).toEqual([]);
  // The list is the project's own: a tag only cards used is gone once none does.
  await page.reload();
  const next = await app.store.createTask(project.id, { title: `Next ${device}` });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${next.id}"]:visible`).first().click();
  await page.getByRole("group", { name: "Tags", exact: true }).getByRole("button", { name: "Show all tags", exact: true }).click();
  await expect(menu.getByRole("option")).toHaveText(["design", "research"]);
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
  await page.locator(".tag-combo-menu").getByRole("option", { name: "design", exact: true }).click();
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
  // A tag already in the list isn't offered to create again, whatever its case.
  await tags.getByRole("combobox", { name: "Add tag", exact: true }).fill("DESIGN");
  await expect(page.locator(".tag-combo-menu").getByRole("option")).toHaveText(["design"]);
  await page.locator(".tag-combo-menu").getByRole("option", { name: "design", exact: true }).click();
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === card.id)?.tags).toEqual(["a, b", "design"]);
});


// Review fixes: the list from the chevron takes the input's focus, follows scrolling, never removes
// a tag on Enter with typed text, and the 30-tag limit locks adding.
test("the tag list opened with the chevron works from the keyboard, follows scrolling and Enter with text never removes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  const project = await tagged("Tag keys");
  const card = await app.store.createTask(project.id, { title: "Keys", tags: ["research"] });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const tags = page.getByRole("group", { name: "Tags", exact: true }), input = tags.getByRole("combobox", { name: "Add tag", exact: true }), menu = page.locator(".tag-combo-menu");
  await tags.getByRole("button", { name: "Show all tags", exact: true }).click();
  await expect(menu).toHaveAttribute("aria-multiselectable", "true");
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator("#task-form")).toBeVisible();
  // Closed by Escape, a re-focus after removing a chip does not reopen it.
  await tags.getByRole("button", { name: "Remove tag research", exact: true }).click();
  await expect(menu).toHaveCount(0);
  // Typed text and Enter add; they never remove a chosen tag.
  await input.fill("des");
  await input.press("Enter");
  await expect(tags.locator(".tag-chip")).toHaveText(["design"]);
  await input.fill("des");
  await input.press("Enter");
  await expect(tags.locator(".tag-chip")).toHaveText(["design"]);
  // The list stays at its field when the dialog scrolls.
  await input.press("ArrowDown");
  await expect(menu).toBeVisible();
  const scrolled = await page.evaluate(() => {
    for (let el = document.querySelector("[data-task-tags]").parentElement; el; el = el.parentElement)
      if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) { el.scrollTop = 40; return true; }
    return false;
  });
  expect(scrolled, "the dialog scrolls at this height").toBe(true);
  await expect.poll(async () => {
    const f = await tags.locator(".tag-combo").boundingBox(), m = await menu.boundingBox();
    return Math.min(Math.abs(m.y - (f.y + f.height + 4)), Math.abs(m.y + m.height - (f.y - 4)));
  }).toBeLessThan(3);
});

test("a card at the tag limit cannot add more, but its chips can still be removed", async ({ page }) => {
  const project = await tagged("Tag limit");
  const names = Array.from({ length: 30 }, (_, i) => `t${i}`);
  const card = await app.store.createTask(project.id, { title: "Full", tags: names });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const tags = page.getByRole("group", { name: "Tags", exact: true });
  await expect(tags.getByRole("combobox", { name: "Add tag", exact: true })).toBeDisabled();
  await expect(tags.getByRole("button", { name: "Show all tags", exact: true })).toBeDisabled();
  await tags.getByRole("button", { name: "Remove tag t0", exact: true }).click();
  await expect(tags.locator(".tag-chip")).toHaveCount(29);
  await expect(tags.getByRole("combobox", { name: "Add tag", exact: true })).toBeEnabled();
});
