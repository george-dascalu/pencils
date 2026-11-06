// Card children (F0.22-23): with Child chosen in the Relationships add menu, a typed title that
// names no card creates a new child card, from its Create option or with Enter, in the usual card
// type; it saves with this card as its parent and shows under Children. A card not yet created
// can't hold one until it is saved, nor can a card the hierarchy lets hold none. Each group but
// Parent has its own + that opens the add menu on its kind (F0.22-26).
import { test, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Children", key: "KID" });
  const epic = await store.createTask(project.id, { title: "Argus 2.1", type: "epic" });
  // A hierarchy where a task holds no cards.
  const strict = await store.createProject({ title: "Strict", key: "STR", schema: { types: ["epic", "task"], hierarchy: { mode: "enforced", roots: ["epic", "task"], children: { epic: ["task"], task: [] } } } });
  const leaf = await store.createTask(strict.id, { title: "Leaf", type: "task" });
  return { project, epic, strict, leaf };
});

const section = (page) => page.getByRole("region", { name: "Relationships", exact: true });
const search = (page) => section(page).getByLabel("Find a card to link", { exact: true });
const create = (page) => section(page).locator("[data-relationship-create]");
async function childPicker(page) {
  await section(page).locator("[data-relationship-toggle]").click();
  await section(page).getByLabel("Relationship type", { exact: true }).click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Child", exact: true }).click();
}
const children = async () =>
  (await app.store.snapshot(app.project.id)).tasks.filter((t) => t.parent === app.epic.id).map((t) => [t.title, t.type]).sort();

test("a typed title under Child creates a new child card, from its option or with Enter", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action=task-open][data-id="${app.epic.id}"]`).first().click();
  await childPicker(page);
  await search(page).fill("Collect logs");
  await expect(create(page)).toContainText("Collect logs");
  await create(page).click();
  await expect.poll(children).toEqual([["Collect logs", "task"]]);
  await expect(section(page).locator("[data-relationship-picker]")).toBeHidden();
  const group = section(page).locator(".task-relationship-group").filter({ has: page.getByRole("heading", { name: "Children", exact: true }) });
  await expect(group).toContainText("Collect logs");
  // The add menu keeps Child chosen. Enter on a title a card already has adds nothing; on a new one it creates the card.
  await section(page).locator("[data-relationship-toggle]").click();
  await search(page).fill("collect logs");
  await search(page).press("Enter");
  await search(page).fill("Write report");
  await search(page).press("Enter");
  await expect.poll(children).toEqual([["Collect logs", "task"], ["Write report", "task"]]);
  await expect(group).toContainText("Write report");
  // The group's own + opens the add menu on Child.
  await section(page).locator("[data-relationship-picker] select").evaluate((select) => { select.value = "related"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  const groupAdd = group.getByRole("button", { name: "Add to Children", exact: true });
  await groupAdd.click();
  await expect(groupAdd).toHaveAttribute("aria-expanded", "true");
  // Escape returns to the group's +, which reopens the menu as open again.
  await search(page).press("Escape");
  await expect(groupAdd).toHaveAttribute("aria-expanded", "false");
  await expect(groupAdd).toBeFocused();
  await groupAdd.click();
  await expect(groupAdd).toHaveAttribute("aria-expanded", "true");
  await expect(section(page).locator("[data-relationship-picker]")).toBeVisible();
  await expect(section(page).locator("[data-relationship-picker] select")).toHaveValue("child");
  await search(page).fill("Book travel");
  await search(page).press("Enter");
  await expect.poll(async () => (await children()).length).toBe(3);
  // A card has one parent, so the Parent group has no + of its own.
  await group.locator("[data-relationship-open]").first().click();
  const parentGroup = section(page).locator(".task-relationship-group").filter({ has: page.getByRole("heading", { name: "Parent", exact: true }) });
  await expect(parentGroup).toContainText("Argus 2.1");
  await expect(parentGroup.getByRole("button", { name: /^Add to/ })).toHaveCount(0);
});

test("a card not yet created, or one the hierarchy lets hold no cards, can't create a child", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await newCard(page);
  await childPicker(page);
  await search(page).fill("Too early");
  await expect(create(page)).toBeDisabled();
  await expect(create(page)).toContainText("Save this card first");
  await page.goto(`${app.base}/#project/${app.strict.id}/list`);
  await page.locator(`[data-action=task-open][data-id="${app.leaf.id}"]`).first().click();
  await childPicker(page);
  await search(page).fill("Not allowed");
  await expect(create(page)).toBeDisabled();
  await expect(create(page)).toContainText("task cannot parent");
});
