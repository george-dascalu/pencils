// Owner request, 29 October 2026 (like Obsidian's Style Settings): Settings → You → Style changes
// fixed CSS tokens (accent, document text, fonts, corners, heading and callout colours), shows
// each default, resets one or all, and keeps the choices in this browser.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Styled", key: "ST" });
  const doc = await store.createDocument(project.id, { title: "Notes", body: "# Plan\n\n- ! Ship it\n\n> [!note] Remember\n> This" });
  return { project, doc };
});
// The colour the words themselves are drawn in (CodeMirror wraps them in highlight spans).
const textColor = (locator) => locator.evaluate((el) => {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) if (node.textContent.trim()) return getComputedStyle(node.parentElement).color;
});
const rootStyle = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
async function openStyle(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator('.main[data-layout-view="list"]').waitFor();
  await openSettingsPage(page, "personal");
  return page.getByRole("group", { name: "Style" });
}

onDevices(["desktop", "phone"], () => test("style options change the documents and the workspace, and reset", async ({ page }) => {
  const style = await openStyle(page);
  const size = style.getByRole("slider", { name: "Document text size" });
  await expect(style.getByText("Default: 15px")).toBeVisible();
  await size.fill("19");
  await style.getByRole("slider", { name: "Corner roundness" }).fill("0");
  await style.getByRole("combobox", { name: "Document font" }).selectOption({ label: "Lora" });
  // The shared colour picker: open the accent's palette and choose a swatch.
  await style.locator('summary[aria-label="Accent colour"]').click();
  await style.getByRole("group", { name: "Accent colour" }).getByRole("button", { name: "Rose" }).click();
  expect(await rootStyle(page, "--green")).toBe("#f1a9a0");
  await page.reload();
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  const editor = page.locator(".document-codemirror .cm-content");
  expect(await editor.evaluate((el) => getComputedStyle(el).fontSize), "kept after a reload, and reaching the text on touch screens").toBe("19px");
  expect(await editor.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Lora");
  expect(await page.locator("button.button").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("0px");
  // Reset all brings every default back, and keeps focus on the button.
  const again = await openStyle(page);
  await again.getByRole("button", { name: "Reset all style options", exact: true }).click();
  await expect(again.getByRole("button", { name: "Reset all style options", exact: true })).toBeFocused();
  expect(await rootStyle(page, "--green")).toBe("#4d6c55");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pencils:appearance")).style)).toEqual({});
}));

test("heading, callout and list callout colours apply in light and dark, one reset at a time", async ({ page }) => {
  const style = await openStyle(page);
  const pick = async (label, swatch) => {
    await style.locator(`summary[aria-label="${label}"]`).click();
    await style.getByRole("group", { name: label }).getByRole("button", { name: swatch }).click();
  };
  await pick("Heading colour", "Sky");
  await pick("Callout colour", "Lilac");
  await style.locator("summary", { hasText: "List callout colours" }).click();
  await pick("Important", "Sage");
  await style.getByRole("button", { name: "Reset callout colour", exact: true }).click();
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
    expect(await textColor(page.locator(".cm-content .document-heading-1").first()), theme).toBe("rgb(174, 215, 220)");
    expect(await page.locator(".cm-content .document-list-callout-mark").first().evaluate((el) => getComputedStyle(el).color), theme).toBe("rgb(214, 228, 211)");
  }
  expect(await rootStyle(page, "--style-callout-color"), "reset on its own").toBe("");
  // Unset colours start from what's shown in this theme.
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  const darkStyle = await openStyle(page);
  expect(await darkStyle.locator('input[name="style-accent"]').inputValue()).toBe("#a7cf9b");
});
