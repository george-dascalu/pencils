// Owner request T97, 1 November 2026: the splash screen shows Pencils' mark in a ring that fills as
// the app signs in, loads the workspace and opens the page, and turns while it waits unless motion
// is reduced.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Splash" }) }));
// Holds a request until released, so the splash can be seen at that step.
function hold(page, pattern) {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  return page.route(pattern, async (route) => { await held; await route.continue(); }).then(() => release);
}
const splash = (page) => page.locator("#app > .boot");
// How much of the ring is still empty, out of 100.
const gap = (page) => splash(page).locator(".boot-arc").evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset.replace("calc(", "")));

for (const motion of ["reduce", "no-preference"])
  test(`the splash ring fills step by step until the app opens (motion: ${motion})`, { tag: "@gate" }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    const session = await hold(page, "**/api/session");
    const workspace = await hold(page, "**/api/organisations");
    await page.goto(`${app.base}/`);
    await expect(splash(page)).toHaveAttribute("role", "progressbar");
    await expect(splash(page).locator("img")).toBeVisible();
    await expect(splash(page).locator(".boot-step")).toHaveText("Signing in…");
    await expect(splash(page)).toHaveAttribute("aria-valuenow", "30");
    await expect.poll(() => gap(page)).toBeCloseTo(70);
    expect(await splash(page).locator(".boot-ring").evaluate((el) => getComputedStyle(el).animationName)).toBe(motion === "reduce" ? "none" : "boot-turn");
    session();
    await expect(splash(page).locator(".boot-step")).toHaveText("Loading your workspace…");
    await expect(splash(page)).toHaveAttribute("aria-valuenow", "60");
    await expect.poll(() => gap(page)).toBeCloseTo(40);
    workspace();
    await expect(splash(page)).toHaveCount(0);
    await expect(page.locator(".shell")).toBeVisible();
  });
