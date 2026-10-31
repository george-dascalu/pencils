// Owner request, 30 October 2026: switching organisations and projects can take a moment. A thin
// loading bar at the top of the screen shows while the next one loads, and goes once it's open.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { chooseProject } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const first = await store.createProject({ title: "First", key: "FI" });
  const second = await store.createProject({ title: "Second", key: "SE" });
  const fourth = await store.createProject({ title: "Fourth", key: "FO" });
  const other = await store.createOrganisation({ title: "Other org" });
  const third = await store.createProject({ title: "Third", key: "TH", organisation: other.id });
  for (const [project, title] of [[first, "One"], [second, "Two"], [third, "Three"]]) await store.createTask(project.id, { title });
  return { first, second, third, fourth, other };
});
// Holds the project's answer until released, so the switch is still loading.
async function hold(page, project) {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(`**/api/projects/${project.id}`, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

onDevices(["desktop", "phone"], () => test("a loading bar shows while another project or organisation loads", async ({ page, device }) => {
  // The bar moves only when motion is allowed: run the flow with it moving on one device.
  if (device === "desktop") await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${app.base}/#project/${app.first.id}/list`);
  await page.locator(".task-row", { hasText: "One" }).waitFor();
  const bar = page.locator("#loading-bar");
  await expect(bar, `${device}: none while nothing loads`).toBeHidden();
  let release = await hold(page, app.second);
  await chooseProject(page, app.second.id);
  await expect(bar, `${device}: a project loading`).toBeVisible();
  const moving = await bar.evaluate((el) => getComputedStyle(el, "::before").animationName);
  expect(moving === "none", `${device}: it moves only when motion is allowed (${moving})`).toBe(device !== "desktop");
  const box = await bar.boundingBox();
  expect(box.y, "at the top of the screen").toBeLessThanOrEqual(1);
  release();
  await expect(page.locator(".task-row", { hasText: "Two" })).toBeVisible();
  await expect(bar).toBeHidden();
  release = await hold(page, app.third);
  await page.locator(".topbar .mobile-menu").click();
  await page.locator("#organisation-select").selectOption(app.other.id);
  await expect(bar, `${device}: an organisation loading`).toBeVisible();
  release();
  await expect(page.locator(".task-row", { hasText: "Three" })).toBeVisible();
  await expect(bar).toBeHidden();
}));

// A project chosen while another loads is refused, and the Projects dropdown keeps naming the open
// one (0.20.85).
test("a project chosen while another loads leaves the Projects dropdown on the open project", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.first.id}/list`);
  await page.locator(".task-row", { hasText: "One" }).waitFor();
  const release = await hold(page, app.second);
  await chooseProject(page, app.second.id);
  await expect(page.locator("#loading-bar")).toBeVisible();
  await chooseProject(page, app.fourth.id);
  await expect(page.locator("#toasts")).toContainText("Wait for the current changes to finish saving.");
  await expect(page.locator("#project-select")).toHaveValue(app.first.id);
  release();
  await expect(page.locator(".task-row", { hasText: "Two" })).toBeVisible();
  await expect(page.locator("#project-select")).toHaveValue(app.second.id);
});
