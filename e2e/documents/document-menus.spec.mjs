// Menus from the UI review (owner request T40, 1 November 2026; T73): Document tools and Insert are
// menus of rows like the board's, with 4px padding, rows edge to edge and dividers between groups
// instead of a header and group headings (AGENTS.md: keep the app as compact as Obsidian).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Menus" });
  const doc = await store.createDocument(project.id, { title: "Menu document", body: "Some text." });
  return { project, doc };
});

// The menu's padding, headings, columns and the space between neighbouring rows of a group.
const shape = (menu) => menu.evaluate((el) => {
  const groups = [...el.querySelectorAll(":scope > section, :scope > div > section")];
  const gaps = groups.flatMap((group) => {
    const rows = [...group.querySelectorAll(":scope > .document-panel-item")].map((row) => row.getBoundingClientRect());
    return rows.slice(1).map((row, i) => Math.round(row.top - rows[i].bottom));
  });
  const dividers = groups.slice(1).map((group) => getComputedStyle(group).borderTopWidth);
  return {
    padding: getComputedStyle(el).paddingTop,
    headings: el.querySelectorAll("h2, h3").length,
    columns: new Set([...el.querySelectorAll(".document-panel-item")].map((row) => Math.round(row.getBoundingClientRect().left))).size,
    gaps: [...new Set(gaps)],
    dividers: [...new Set(dividers)],
  };
});

onDevices(["desktop", "phone"], () => test("Document tools and Insert are compact menus with dividers", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  for (const name of ["Document tools", "Insert"]) {
    await page.getByRole("button", { name, exact: true }).click();
    const menu = page.getByRole("dialog", { name });
    await expect(menu).toBeVisible();
    expect(await shape(menu), name).toEqual({ padding: "4px", headings: 0, columns: 1, gaps: [0], dividers: ["1px"] });
    // The keyboard starts in the menu; on touch, focus stays on the button (no keyboard).
    if (device === "desktop") await expect(menu.locator(":focus"), `${name}: focus is in the menu`).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }
}));
