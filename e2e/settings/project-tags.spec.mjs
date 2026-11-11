// Owner request, 3 November 2026 (F0.21-73): Settings → Tags lists the project's tags, starting
// from those its cards use. Adding one or choosing its colour saves as it changes; renaming or
// deleting one changes every card that has it, after a confirmation with the count.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { settingsSaved } from "../helpers/menu-controls.mjs";

const app = useApp(async () => ({}));

onDevices(["desktop", "phone"], () => test("Settings → Tags adds, colours, renames and deletes the project's tags across its cards", { tag: "@gate" }, async ({ page, device }) => {
  const project = await app.store.createProject({ title: `Tag settings ${device}` });
  const a = await app.store.createTask(project.id, { title: "A", tags: ["ux", "api"] });
  const b = await app.store.createTask(project.id, { title: "B", tags: ["ux"] });
  const snapshot = () => app.store.snapshot(project.id);
  const tagsOf = async () => Object.fromEntries((await snapshot()).tasks.map((t) => [t.id, t.tags]));
  const listed = async () => (await snapshot()).project.schema.tags;
  await page.goto(`${app.base}/#project/${project.id}/settings/tags`);
  const rows = page.locator(".project-tag");
  // The cards' tags start the list, A to Z, with how many cards have each.
  await expect(rows).toHaveCount(2);
  expect(await rows.locator("[data-tag-name]").evaluateAll((els) => els.map((el) => el.value))).toEqual(["api", "ux"]);
  await expect(rows.locator(".project-tag-count")).toHaveText(["1 card", "2 cards"]);
  if (device !== "desktop") expect((await page.getByRole("button", { name: "Delete tag ux", exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.locator(".project-tags-settings").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await page.getByLabel("New tag name", { exact: true }).fill("launch");
  await page.getByLabel("New tag name", { exact: true }).press("Enter");
  await settingsSaved(page);
  expect((await listed()).map((t) => t.name)).toEqual(["api", "ux", "launch"]);

  await page.locator('.project-tag[data-tag="ux"] .color-picker > summary').click();
  await page.locator('.project-tag[data-tag="ux"] [data-color-choice="#aed7dc"]').click();
  await expect.poll(async () => (await listed()).find((t) => t.name === "ux")?.color).toBe("#aed7dc");

  // Renaming and deleting ask first, beside the tag, saying how many cards change.
  const ask = page.getByRole("alertdialog");
  await page.getByLabel("Tag name: launch", { exact: true }).fill("later");
  await page.getByLabel("Tag name: launch", { exact: true }).press("Tab");
  await ask.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Tag name: launch", { exact: true }), "a cancelled rename changes nothing").toHaveValue("launch");

  await page.getByLabel("Tag name: ux", { exact: true }).fill("design");
  await page.getByLabel("Tag name: ux", { exact: true }).press("Tab");
  await expect(ask).toContainText("2 cards change.");
  await ask.getByRole("button", { name: "Rename tag", exact: true }).click();
  await expect.poll(tagsOf).toEqual({ [a.id]: ["design", "api"], [b.id]: ["design"] });
  expect((await listed()).find((t) => t.name === "design")?.color, "the colour stays with the renamed tag").toBe("#aed7dc");
  await expect(page.getByLabel("Tag name: design", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete tag api", exact: true }).click();
  await expect(ask).toContainText("It is removed from 1 card.");
  await ask.getByRole("button", { name: "Delete tag", exact: true }).click();
  await expect.poll(tagsOf).toEqual({ [a.id]: ["design"], [b.id]: ["design"] });
  await expect(rows.locator("[data-tag-name]")).toHaveCount(2);
  expect((await listed()).map((t) => t.name)).toEqual(["design", "launch"]);
}));

test("a tag written outside the app with a comma keeps its row but doesn't stop the list saving", async ({ page }) => {
  const project = await app.store.createProject({ title: "Odd tags" });
  await app.store.createTask(project.id, { title: "Imported", tags: ["a, b"] });
  await page.goto(`${app.base}/#project/${project.id}/settings/tags`);
  await expect(page.locator(".project-tag")).toHaveCount(1);
  await page.getByLabel("New tag name", { exact: true }).fill("fresh");
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  await settingsSaved(page);
  expect((await app.store.snapshot(project.id)).project.schema.tags).toEqual([{ name: "fresh" }]);
});


// Owner request (F0.23-22): a tag without a colour of its own shows the automatic colour its chips
// wear; White keeps it plain, and a colour chosen before stays chosen.
test("a tag's swatch shows its automatic colour, White keeps it plain, and a chosen colour is kept", async ({ page }) => {
  const created = await app.store.createProject({ title: "Tag colours" });
  // #aed7dc is also the colour "design" would get by itself.
  await app.store.updateProject(created.id, { revision: created.revision, schema: { ...created.schema, tags: [{ name: "design", color: "#aed7dc" }] } });
  const card = await app.store.createTask(created.id, { title: "Plain", tags: ["research", "design"] });
  const listed = async () => (await app.store.snapshot(created.id)).project.schema.tags;
  await page.goto(`${app.base}/#project/${created.id}/settings/tags`);
  const swatch = (name) => page.locator(`.project-tag[data-tag="${name}"] [data-color-value]`);
  await expect(swatch("research")).toHaveValue(/^#(?!ffffff)[0-9a-f]{6}$/);
  await page.locator('.project-tag[data-tag="research"] .color-picker > summary').click();
  await page.locator('.project-tag[data-tag="research"] [data-color-choice="#ffffff"]').click();
  await expect.poll(async () => (await listed()).find((t) => t.name === "research")?.color).toBe("#ffffff");
  expect((await listed()).find((t) => t.name === "design")?.color, "a colour chosen before stays, though it matches the automatic one").toBe("#aed7dc");
  await page.goto(`${app.base}/#project/${created.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator(".task-tags .tag-chip", { hasText: "research" })).not.toHaveAttribute("style");
  await expect(page.locator(".task-tags .tag-chip", { hasText: "design" })).toHaveCSS("background-color", "rgb(174, 215, 220)");
});
