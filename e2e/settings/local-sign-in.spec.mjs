// Local automatic sign-in (AUTH_MODE=local, README "single-user use"): local and LAN
// connections open as George with administrator access, without a password, login form,
// Sign out or Accounts. Settings (its "You" section) names the identity, project sources can be set up
// and are owned by George, and a fresh browser needs no cookie or storage.
// TEST_AUTH_MODE picks another automatic mode (for example single-user).
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { openSettingsPage as openSettings, selectProjectView, showSettingsSection } from "../helpers/menu-controls.mjs";
import { Auth } from "../../server/auth.js";

const app = useCustomApp({
  seed: async (store) => {
    const project = await store.createProject({ title: "George's workspace" });
    await store.createTask(project.id, { title: "Existing task" });
    return { project };
  },
  server: (store) => ({
    auth: new Auth(store, process.env.TEST_AUTH_MODE || "local", "George"),
    sources: { env: { APP_ORIGIN: "http://localhost:3000", JIRA_CLIENT_ID: "fixture-client", JIRA_CLIENT_SECRET: "fixture-secret" } },
  }),
});

async function openList(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
}
// Since 0.19.26 phones reach settings from the drawer's settings row. Since 0.19.31 one
// Settings button there (and in the top bar) opens the Settings page (openSettingsPage),
// which replaced the project gear and the avatar's Personal settings; the avatar is gone.

test("a fresh browser opens as George, the automatic administrator, with no login or logout", { tag: "@gate" }, async ({ page, context }) => {
  await openList(page);
  await expect(page.locator("#login-form")).toHaveCount(0);
  await expect(page.locator('[data-feature="logout"],[data-feature="accounts"]')).toHaveCount(0);
  await openSettings(page, "personal");
  await expect(page.locator("[data-current-user]")).toHaveText(/George.*Administrator.*Automatic sign-in/);
  // No password, cookie or browser storage is needed on a new local device or after a reload.
  await page.reload();
  await expect(page.locator("[data-current-user]")).toHaveText(/George.*Administrator.*Automatic sign-in/);
  await expect(page.locator('[data-feature="logout"],[data-feature="accounts"]')).toHaveCount(0);
  await expect(page.locator("#login-form")).toHaveCount(0);
  expect(await context.cookies()).toHaveLength(0);
});

for (const width of [1440, 390]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewportSize: { width, height: 1000 } });

    test("Settings names the automatic administrator in light and dark themes", { tag: "@gate" }, async ({ page }) => {
      await openList(page);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        await openSettings(page, "personal");
        await expect(page.locator("[data-current-user]")).toHaveText(/George.*Administrator.*Automatic sign-in/);
        const box = await page.locator("[data-current-user]").boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        await page.locator("[data-action=settings-close]").click();
        await selectProjectView(page, "tree");
        await expect(page.locator(".settings-navigation")).toHaveCount(0);
      }
    });
  });
}

test.describe("phone width", () => {
  test.use({ viewportSize: { width: 390, height: 1000 } });

  test("George configures a Jira source from the drawer's Settings and owns it", { tag: "@gate" }, async ({ page }) => {
    await openList(page);
    await openSettings(page);
    await showSettingsSection(page, "sources");
    await page.locator('[data-source-action="new"]').click();
    await page.locator('#source-config [name="provider"]').selectOption("jira");
    await expect(page.getByText("OAuth app configured.", { exact: false })).toBeVisible();
    await page.locator('#source-config [name="name"]').fill("Jira fixture");
    await page.locator('#source-config [name="cloudId"]').fill("fixture-site");
    await page.locator('#source-config [name="jql"]').fill("project = DEMO ORDER BY key ASC");
    await page.locator('#source-config [type="submit"]').click();
    await page.locator('[data-source-action="authorize"]').waitFor();
    expect((await app.store.snapshot(app.project.id)).project.source_owner).toBe("George");
    await expect(page.locator("#login-form")).toHaveCount(0);
  });
});
