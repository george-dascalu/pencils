// F0.22-39: Home loads every project's cards (/api/overview, for links to cards in its notes) once,
// and again only after something changed; it used to load them again on every redraw.
import { test, expect, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const alpha = await store.createProject({ title: "Alpha", key: "AL" });
  await store.createTask(alpha.id, { title: "First" });
  return { alpha };
});

test("Home loads the cards of every project once, and again after a change", async ({ page }) => {
  const loads = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/overview") loads.push(request); });
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/overview");
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await loaded;
  // Redraws: the sidebar opening and closing redraws the page.
  for (let i = 0; i < 2; i++) {
    await openSidebar(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#workspace-sidebar")).not.toHaveClass(/open/);
  }
  // A change elsewhere arrives through the event stream: one more load, not one per redraw.
  const reloaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/overview");
  await app.store.createTask(app.alpha.id, { title: "Second" });
  await reloaded;
  await openSidebar(page);
  await page.keyboard.press("Escape");
  // Nothing observable follows a skipped load, so give a stray one time to start.
  await page.waitForTimeout(500);
  expect(loads.length).toBe(2);
});
