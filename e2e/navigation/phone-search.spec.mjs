// Owner request, 30 October 2026: on phones Search is a compact sheet like Obsidian's, with the
// results above and the field at the bottom, focused at once so the keyboard opens for typing.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Phone search", key: "PS" });
  const doc = await store.createDocument(project.id, { title: "Roadmap plan", body: "Plans" });
  for (let i = 0; i < 12; i++) await store.createTask(project.id, { title: `Roadmap item ${i}` });
  return { project, doc };
});
const sheet = (page) => page.locator("dialog[open].search-dialog");
async function openSearch(page) {
  await page.locator('.topbar .tabs [data-feature="global-search"]').tap();
  await expect(sheet(page)).toBeVisible();
}

onDevices(["phone", "small"], () => test("Search opens a compact sheet with the field at the bottom, ready for typing", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await openSearch(page);
  const input = page.locator("#global-search-input");
  await expect(input, `${device}: the field takes focus, so the keyboard opens`).toBeFocused();
  const { width, height } = page.viewportSize();
  const box = await sheet(page).boundingBox(), field = await input.boundingBox();
  expect(box.y + box.height, `${device}: the sheet sits at the bottom`).toBeGreaterThan(height - 24);
  expect(box.x >= 0 && box.x + box.width <= width, `${device}: the sheet fits the width`).toBe(true);
  expect(field.y + field.height, `${device}: the field is the sheet's last row`).toBeGreaterThan(box.y + box.height - 60);
  expect(field.height).toBeGreaterThanOrEqual(44);
  await expect(sheet(page).locator(".dialog-head:visible, .dialog-foot:visible"), "no title or footer").toHaveCount(0);
  await input.fill("roadmap");
  const result = sheet(page).locator(".search-result", { hasText: "Roadmap plan" });
  await expect(result).toBeVisible();
  const row = await result.boundingBox();
  expect(row.y + row.height, `${device}: results sit above the field`).toBeLessThanOrEqual(field.y + 1);
  expect(row.height, `${device}: compact rows`).toBeLessThanOrEqual(56);
  expect(row.height).toBeGreaterThanOrEqual(44);
  // The ✕ clears the text, then closes the sheet.
  await sheet(page).getByRole("button", { name: "Clear search", exact: true }).tap();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await sheet(page).getByRole("button", { name: "Close search", exact: true }).tap();
  await expect(sheet(page)).toHaveCount(0);
  // A tap outside closes it too.
  await openSearch(page);
  await page.mouse.click(width / 2, 8);
  await expect(sheet(page)).toHaveCount(0);
  // Choosing a result opens it.
  await openSearch(page);
  await page.locator("#global-search-input").fill("roadmap plan");
  await sheet(page).locator(".search-result", { hasText: "Roadmap plan" }).tap();
  await expect(page).toHaveURL(new RegExp(`/documents/${app.doc.id}$`));
}));

onDevices(["desktop"], () => test("wider screens keep the search dialog with its title, field at the top", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await page.locator('.topbar .tabs [data-feature="global-search"]').click();
  await expect(page.locator("#global-search-input")).toBeFocused();
  await expect(sheet(page).locator(".dialog-head")).toBeVisible();
  const field = await page.locator("#global-search-input").boundingBox(), body = await sheet(page).locator(".dialog-body").boundingBox();
  expect(field.y, "the field leads the dialog").toBeLessThan(body.y + 60);
  await page.mouse.click(5, 5);
  await expect(sheet(page), "a click outside closes it").toHaveCount(0);
}));

onDevices(["phone"], () => test("the sheet keeps its name for screen readers", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await openSearch(page);
  await expect(page.getByRole("dialog", { name: "Search and commands", exact: true })).toBeVisible();
}));

onDevices(["desktop"], () => test("dragging from the field to outside keeps Search open, ArrowUp from the field reaches the last result, and a refused open doesn't fail", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await page.keyboard.press("Control+k");
  const input = page.locator("#global-search-input");
  await input.fill("roadmap item");
  await expect(sheet(page).locator("#global-search-results .search-result").first()).toBeVisible();
  // Selecting the text with a drag that ends outside the dialog doesn't close it.
  const field = await input.boundingBox();
  await page.mouse.move(field.x + field.width - 4, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 4 });
  await page.mouse.up();
  await expect(sheet(page)).toHaveCount(1);
  await input.focus();
  await page.keyboard.press("ArrowUp");
  const results = sheet(page).locator("#bookmark-results button, #command-results button, #global-search-results button");
  await expect(results.last(), "ArrowUp from the field goes to the last result").toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  // With a card whose title is cleared, Ctrl/⌘ K leaves the card open without an error.
  await page.locator(".task-row [data-action=task-open]:visible").first().click();
  await page.locator("#task-form [name=title]").fill("");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#task-form")).toBeVisible();
  expect(errors).toEqual([]);
}));

// Owner report, 30 October 2026: with the keyboard put away (the ✓ above it on iPhone) the sheet's
// field sat on the home indicator. Like the bottom bar, the sheet keeps above the safe area.
onDevices(["phone"], () => test("with the keyboard away the sheet keeps above the home indicator", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34 } });
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  const bar = await page.locator(".topbar .tabs").boundingBox();
  await openSearch(page);
  const box = await sheet(page).boundingBox();
  expect(box.y + box.height, "the sheet clears the safe area as the bar does").toBeLessThanOrEqual(bar.y + bar.height + 0.5);
}));
