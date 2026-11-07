// Help loads on first use in the built app too (frontend analysis item 7): its chunk is fetched
// when Help opens, and a link straight to a guide waits for it.
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { openHelp } from "../helpers/menu-controls.mjs";

const app = useCustomApp({ server: () => ({ productionAssets: true }), seed: async (store) => ({ project: await store.createProject({ title: "Built help" }) }) });

test("the built app opens Help and links to guides", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator("#view-content")).toBeVisible();
  const scripts = () => page.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).length);
  const before = await scripts();
  await openHelp(page);
  await expect(page.locator("#help-title")).toBeVisible();
  expect(await scripts(), "Help's chunk came when it opened").toBeGreaterThan(before);
  await page.goto(`${app.base}/#help/roadmap`);
  await page.reload();
  await expect(page.locator("#help-title")).toHaveText("Roadmap");
});
