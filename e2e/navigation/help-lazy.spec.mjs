// The guides and the roadmap are an eighth of the app's code and few visits use them (frontend
// analysis item 7): they load when Help or the Roadmap is first opened, not with the app.
import { test, expect, useApp } from "../fixtures.mjs";
import { openHelp } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Lazy help" }) }));
const loaded = (page) => page.evaluate(() => performance.getEntriesByType("resource").map((r) => new URL(r.name).pathname).filter((p) => /\/(help|help-content|roadmap)\.js$/.test(p)).sort());

test("Help's guides and the roadmap load when Help is first opened", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator("#view-content")).toBeVisible();
  expect(await loaded(page), "not with the app").toEqual([]);
  await openHelp(page);
  await expect(page.locator("#help-title")).toBeVisible();
  expect(await loaded(page)).toEqual(["/help-content.js", "/help.js", "/roadmap.js"]);
});

test("a link straight to a guide opens it", async ({ page }) => {
  await page.goto(`${app.base}/#help/roadmap`);
  await expect(page.locator("#help-title")).toHaveText("Roadmap");
  await expect(page).toHaveTitle(/^Roadmap · Help/);
});
