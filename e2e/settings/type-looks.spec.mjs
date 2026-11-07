// Owner request (F0.22-67): Settings → Card types lets each card type have its own icon and colour,
// which every card of that type then shows; F0.22-72: one colour for light mode and one for dark.
import { readFileSync } from "node:fs";
import { test, expect, useApp } from "../fixtures.mjs";
import { openSettingsPage, settingsSaved } from "../helpers/menu-controls.mjs";
import { themeMatch } from "../../public/color-model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Type looks", schema: { types: ["task", "bug", "chore"] } });
  await store.createTask(project.id, { title: "Sweep the floor", type: "chore" });
  return { project };
});
const schema = async () => (await app.store.snapshot(app.project.id)).project.schema;
const looks = (page) => page.locator("[data-type-looks]");
const names = (page) => looks(page).locator(".field").evaluateAll((els) => els.map((el) => el.firstChild.textContent));
const rgb = (hex) => `rgb(${hex.slice(1).match(/../g).map((v) => parseInt(v, 16)).join(", ")})`;
const leafPath = /\n  leaf: "([^"]+)"/.exec(readFileSync(new URL("../../public/app.js", import.meta.url), "utf8"))[1];

test("each card type gets an icon and a colour in Settings → Card types, shown on its cards @gate", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSettingsPage(page, "hierarchy");
  // A row per type, after the type list, each type showing its own icon to start with.
  await expect.poll(() => names(page)).toEqual(["Task", "Bug", "Chore"]);
  await expect(looks(page).getByLabel("Bug icon", { exact: true })).toHaveValue("bug");
  await expect(looks(page).getByLabel("Chore icon", { exact: true })).toHaveValue("task");
  await looks(page).getByLabel("Chore icon", { exact: true }).selectOption("leaf");
  await settingsSaved(page);
  // Its first colour, chosen for light mode, picks a matching one for dark mode (F0.22-72).
  await looks(page).locator('summary[aria-label="Chore colour in light mode"]').click();
  await page.locator('[data-type-looks] [data-color-choice="#aed7dc"]:visible').click();
  await settingsSaved(page);
  const sky = themeMatch("#aed7dc", true);
  await expect.poll(async () => { const s = await schema(); return [s.type_icons, s.type_colors, s.type_colors_dark]; }).toEqual([{ chore: "leaf" }, { chore: "#aed7dc" }, { chore: sky }]);
  await expect(looks(page).locator('[name="type-dark-color-chore"]')).toHaveValue(sky);
  // After that, each mode's colour changes alone.
  await looks(page).locator('summary[aria-label="Chore colour in light mode"]').click();
  await page.locator('[data-type-looks] [data-color-choice="#d4bee5"]:visible').click();
  await settingsSaved(page);
  await looks(page).locator('summary[aria-label="Bug colour in dark mode"]').click();
  await page.locator('[data-type-looks] [data-color-choice="#f1a9a0"]:visible').click();
  await settingsSaved(page);
  await expect.poll(async () => { const s = await schema(); return [s.type_colors, s.type_colors_dark]; }).toEqual([{ chore: "#d4bee5", bug: themeMatch("#f1a9a0", false) }, { chore: sky, bug: "#f1a9a0" }]);
  // A type added in the list gets its row.
  await page.locator("[data-type-input]").fill("spike");
  await page.locator("[data-type-add]").click();
  await expect.poll(() => names(page)).toEqual(["Task", "Bug", "Chore", "Spike"]);
  await expect(looks(page).getByLabel("Chore icon", { exact: true })).toHaveValue("leaf");
  await settingsSaved(page);
  // The card shows them.
  await page.locator("[data-action=settings-close]").click();
  const svg = page.locator(".task-row", { hasText: "Sweep the floor" }).locator(".task-type svg");
  await expect(svg).toHaveCSS("color", "rgb(212, 190, 229)");
  await expect(svg.locator("path")).toHaveAttribute("d", leafPath);
  // In dark mode the card shows the dark-mode colour.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(svg).toHaveCSS("color", rgb(sky));
});
