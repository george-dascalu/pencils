// Owner request (T34, 31 October 2026): phones' View options use one font size for names, values,
// checkboxes and the bookmark, and Clear filters is an icon button left of Close in its header.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Options", key: "OP" });
  await store.createTask(project.id, { title: "A card", status: "todo" });
  return { project };
});

onDevices(["phone"], () => test("View options keeps one font size, with Clear filters as an icon beside Close", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await page.locator(".mobile-view-options > summary").click();
  const panel = page.locator(".mobile-view-options-panel");
  await expect(panel).toBeVisible();
  const header = panel.locator(":scope > header button");
  await expect(header).toHaveCount(2);
  expect(await header.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(["Clear filters", "Close view options"]);
  await expect(header.first().locator("svg"), "an icon").toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Clear filters", exact: true }), "only in the header").toHaveCount(1);
  const sizes = await panel.evaluate((el) => [...el.querySelectorAll(".field, .field > select, .field > input, .filter-checks > label, .bookmark-button")]
    .filter((e) => e.getClientRects().length).map((e) => getComputedStyle(e).fontSize));
  expect(sizes.length).toBeGreaterThan(5);
  expect(new Set(sizes), sizes.join(" ")).toEqual(new Set(["16px"]));
  // The icon clears the filters.
  await panel.locator("#filter-tag").fill("nothing");
  await panel.locator("#filter-tag").press("Enter");
  await header.first().click();
  await expect(panel.locator("#filter-tag")).toHaveValue("");
}));
