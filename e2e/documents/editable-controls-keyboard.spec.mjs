// Owner report, 28 October 2026: tapping Fit width or Scroll in a document
// opened the keyboard. iOS Safari does not focus a tapped button; it focuses
// the nearest focusable ancestor, which inside a document is the editor. A
// shared guard cancels mousedown on controls inside editable areas so focus
// stays put, and Add row / Add column leave the keyboard closed on touch
// (open-focus.js) while still focusing the new cell for keyboard users.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Controls", key: "EC" }) }));
const body = "# Controls\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> [!note]- Folded callout\n> Hidden body.\n\n```js\nconst a = 1;\n```\n";
const open = (page) => openNewDocument(page, app, app.project.id, { body, waitFor: ".document-codemirror .document-table-layout" });
const textFocused = () => {
  const el = document.activeElement;
  return !!el && (el.isContentEditable || el.matches("input:not([type=button],[type=submit],[type=checkbox],[type=radio]), textarea"));
};
const layoutButton = (page, name) => page.locator(".document-codemirror .document-table-layout button", { hasText: name });
const action = (page, name) => page.locator(".document-codemirror .document-component-actions button", { hasText: name });

onDevices(["phone", "desktop"], () => test("controls inside a document block keep focus where it is", async ({ page }) => {
  await open(page);
  // The mousedown that would move focus to the editor is cancelled.
  const prevented = await page.evaluate(() => [...document.querySelectorAll(".document-codemirror .document-editable-component button, .document-codemirror .document-editable-component summary")]
    .filter((el) => el.getClientRects().length)
    .map((el) => {
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
      el.dispatchEvent(event);
      return [el.getAttribute("aria-label") || el.textContent.trim(), event.defaultPrevented];
    }));
  expect(prevented.length, JSON.stringify(prevented)).toBeGreaterThanOrEqual(4);
  expect(prevented.filter(([, done]) => !done), "every block control keeps focus").toEqual([]);
}));

onDevices(["phone"], () => {
  test("Fit width and Scroll still switch, without focusing text", async ({ page }) => {
    await open(page);
    await layoutButton(page, "Scroll").tap();
    await expect(layoutButton(page, "Scroll")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(textFocused)).toBe(false);
    await layoutButton(page, "Fit width").tap();
    await expect(layoutButton(page, "Fit width")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(textFocused)).toBe(false);
  });

  test("Add row and Add column leave the keyboard closed on touch", async ({ page }) => {
    await open(page);
    const rows = page.locator(".document-codemirror table tr");
    const headers = page.locator(".document-codemirror table tr").first().locator("th, td");
    await action(page, "Add row").tap();
    await expect(rows, "the row was added").toHaveCount(3);
    expect(await page.evaluate(textFocused), "Add row does not focus a cell on touch").toBe(false);
    await action(page, "Add column").tap();
    await expect(headers, "the column was added").toHaveCount(3);
    expect(await page.evaluate(textFocused), "Add column does not focus a cell on touch").toBe(false);
    await expect(rows).toHaveCount(3);
  });
});

test("Add row still focuses the new cell for keyboard and mouse users", async ({ page }) => {
  await open(page);
  await action(page, "Add row").click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("TD");
});
