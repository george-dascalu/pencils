// Owner report (T33, 31 October 2026): on phones Home had a gap at the top, its Edit layout row
// stacked under the floating menu button. Like project pages, the row sits in the header's row.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async () => ({}));

onDevices(["phone"], () => test("Home's own row sits beside the menu button, with the panels right under it", async ({ page }) => {
  await page.goto(app.base);
  await page.locator(".home-panel").first().waitFor();
  const [menu, edit, panel] = await Promise.all([".mobile-menu", "#home-edit", ".home-panel"].map((s) => page.locator(s).first().boundingBox()));
  expect(Math.abs(edit.y + edit.height / 2 - (menu.y + menu.height / 2)), "Edit layout in the menu button's row").toBeLessThan(4);
  expect(panel.y - (menu.y + menu.height), "the panels start right under the header").toBeLessThan(24);
  expect(edit.x, "clear of the menu button").toBeGreaterThan(menu.x + menu.width);
}));
