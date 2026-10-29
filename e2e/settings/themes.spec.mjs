// Owner request, 29 October 2026: themes adapted from Obsidian (Minimal, Paper, Catppuccin,
// Typewriter) beside Light, Dark and System. Each sets the shared tokens for light and dark, Style
// settings still apply on top, and Typewriter brings the bundled iA Writer fonts.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Themed", key: "TH" });
  const doc = await store.createDocument(project.id, { title: "Draft", body: "# Title\n\nSome **bold** words." });
  return { project, doc };
});
// The colour the words themselves are drawn in (CodeMirror wraps them in highlight spans).
const textColor = (locator) => locator.evaluate((el) => {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) if (node.textContent.trim()) return getComputedStyle(node.parentElement).color;
});
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

onDevices(["desktop", "phone"], () => test("a theme is chosen beside Light, Dark and System and kept", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator('.main[data-layout-view="list"]').waitFor();
  await openSettingsPage(page, "personal");
  const themes = page.getByRole("radiogroup", { name: "Theme" });
  await expect(themes.getByRole("radio")).toHaveCount(5);
  for (const label of await themes.locator("label").all()) expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await themes.getByText("Paper", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-look", "paper");
  expect(await token(page, "--green")).toBe("#85600f");
  await page.getByText("Dark", { exact: true }).click();
  expect(await token(page, "--green")).toBe("#e0b45c");
  // Style settings still win over the theme.
  await page.evaluate(() => window.PencilsAppearance.write({ style: { accent: "#123456" } }));
  expect(await token(page, "--green")).toBe("#123456");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-look", "paper");
}));

test("Typewriter brings its fonts and Catppuccin can colour each heading level", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  await page.evaluate(() => window.PencilsAppearance.write({ look: "typewriter", theme: "light", style: {} }));
  const content = page.locator(".document-codemirror .cm-content");
  expect(await content.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("iA Writer Quattro S");
  await expect.poll(() => page.evaluate(() => document.fonts.load('16px "iA Writer Quattro S"').then((faces) => faces.length))).toBeGreaterThan(0);
  const font = await page.request.get(`${app.base}/fonts/ia-writer-quattro/iAWriterQuattroS-Regular.woff2`);
  expect(font.headers()["content-type"]).toBe("font/woff2");
  expect((await page.request.get(`${app.base}/fonts/ia-writer-quattro/LICENSE.md`)).ok(), "the licence ships with the font").toBe(true);
  // Choosing the workspace font in Style settings wins over the theme's.
  await page.evaluate(() => window.PencilsAppearance.write({ style: { documentFont: "workspace", codeFont: "system" } }));
  expect(await content.evaluate((el) => getComputedStyle(el).fontFamily)).not.toContain("iA Writer");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim())).toBe("monospace");
  await page.evaluate(() => window.PencilsAppearance.write({ look: "catppuccin", rainbow: true }));
  expect(await textColor(page.locator(".cm-content .document-heading-1").first())).toBe("rgb(210, 15, 57)");
});
