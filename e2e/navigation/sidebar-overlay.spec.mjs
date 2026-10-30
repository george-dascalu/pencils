// Owner requests, 30 October 2026: on iPad and desktop the sidebar opens over the content instead
// of moving it, slides in, is half as wide again on iPad (315px), and holds Settings, Help and the
// version at its bottom; the top bar no longer shows them.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Garden", key: "GA" }) }));

onDevices(["desktop", "ipad"], (device) => test("the sidebar opens over the content and closes from outside, Escape, its close button or a choice", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const sidebar = page.locator(".sidebar"), menu = page.locator(".topbar .mobile-menu");
  const contentLeft = async () => (await page.locator(".main").boundingBox()).x;
  await expect(sidebar).not.toBeInViewport();
  expect(await contentLeft()).toBe(0);
  await expect(page.locator(".topbar").locator("[data-action=settings], [data-action=help]")).toHaveCount(0);

  await menu.click();
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await expect(sidebar, "no slide when reduced motion is asked for").toHaveCSS("transition-property", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(sidebar, "it slides in").toHaveCSS("transition-property", /transform/);
  await expect.poll(async () => (await sidebar.boundingBox()).x).toBe(0);
  expect(await contentLeft(), "the content stays where it is").toBe(0);
  expect(Math.round((await sidebar.boundingBox()).width)).toBe(device === "ipad" ? 315 : 236);
  const settings = sidebar.getByRole("button", { name: "Settings", exact: true });
  const version = sidebar.locator(".side-footer .version");
  await expect(sidebar.getByRole("button", { name: "Help & guides" })).toBeVisible();
  const [box, settingsBox, versionBox] = [await sidebar.boundingBox(), await settings.boundingBox(), await version.boundingBox()];
  expect(settingsBox.y, "Settings and Help sit above the version").toBeLessThan(versionBox.y);
  expect(box.y + box.height - versionBox.y, "at the bottom of the sidebar").toBeLessThan(60);

  await page.keyboard.press("Escape");
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await menu.click();
  await page.mouse.click(page.viewportSize().width - 40, page.viewportSize().height / 2);
  await expect(sidebar, "a click outside closes it").not.toHaveClass(/\bopen\b/);
  await menu.click();
  await sidebar.locator(".phone-drawer-close").click();
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  // The page behind takes no shortcuts, and a dialog opened over the sidebar closes first.
  await menu.click();
  await page.keyboard.press("n");
  await expect(page.locator("#task-form"), "no new card from behind the sidebar").toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await settings.click();
  await expect(page.locator(".settings-navigation h1")).toBeVisible();
  await expect(sidebar, "choosing closes it").not.toHaveClass(/\bopen\b/);
}));

test("the Today command opens the day's note while the sidebar is closed", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("#global-search-input").fill("Today's note");
  await page.locator('[data-command="today"]').click();
  await expect(page.locator(".tabs [data-view]"), "the personal space shows Documents only").toHaveCount(1);
});
