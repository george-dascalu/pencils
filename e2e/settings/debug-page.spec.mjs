// Owner request T96, 1 November 2026: Settings → Debug shows what failed, newest first: this
// browser's failed API calls and errors, which Copy and Clear handle, and, for administrators, the
// server's failed requests with their messages and its errors and warnings.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage, showSettingsSection } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Debug", key: "DB" }) }));
// One pattern: Playwright reads a second array item as the option's settings.
test.use({ allowErrors: [/Trash is down|Boom in a handler|responded with a status of (500|404)/] });

onDevices(["desktop", "phone"], () => test("Debug lists this browser's failed calls and errors, and the server's failed requests", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.route("**/api/projects/*/trash", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Trash is down" }) }));
  await page.goto(`${app.base}/#project/${app.project.id}/overview`);
  await page.locator("#view-content").waitFor();
  // A failed call through the app, a thrown error, and a request the server refuses.
  await openSettingsPage(page, "trash");
  await page.evaluate(() => setTimeout(() => { throw new Error("Boom in a handler"); }));
  await page.evaluate(() => fetch("/api/projects/p-nowhere"));
  await showSettingsSection(page, "diagnostics");
  await expect(page.locator("#settings-page-title")).toHaveText("Debug");
  const browser = page.locator("[data-debug-browser] li");
  await expect(browser.first()).toContainText("Boom in a handler");
  await expect(browser.filter({ hasText: "Trash is down" })).toContainText("500");
  await expect(browser.filter({ hasText: "Trash is down" })).toContainText(`GET /api/projects/${app.project.id}/trash`);
  // Newest first; the server is shared with the other device's run.
  await expect(page.locator("[data-debug-server] li").filter({ hasText: "/api/projects/p-nowhere" }).first()).toContainText("404");
  await page.getByRole("button", { name: "Clear this browser's list" }).click();
  await expect(browser).toHaveCount(0);
  await expect(page.locator("[data-debug-browser-empty]")).toBeVisible();
}));
