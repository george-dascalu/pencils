// Owner report, 29 October 2026: on the Settings page, scrolling the list of sections also
// scrolled the page beside it, and the other way round. The rail and the page now scroll on
// their own; narrow screens stack them in one scroller as before.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Scroll", key: "SC" }) }));
const rail = (page) => page.locator(".settings-navigation");
const pane = (page) => page.locator(".settings-content");
const top = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().top));
const wheel = async (page, locator, dy) => {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
  await page.mouse.wheel(0, dy);
};

onDevices(["ipad", "desktop"], () => {
  test("the section rail and the page scroll separately", async ({ page, device }) => {
    // A short window, so both the rail and the Organisation page are taller than it.
    await page.setViewportSize({ width: page.viewportSize().width, height: 560 });
    await page.goto(`${app.base}/#project/${app.project.id}/settings/organisation`);
    await expect(page.locator("#settings-page-title")).toHaveText("Organisation");
    for (const el of [rail(page), pane(page)])
      expect(await el.evaluate((e) => e.scrollHeight > e.clientHeight), `${device}: scrollable`).toBe(true);
    const [railTop, paneTop] = [await top(rail(page).locator("h1")), await top(page.locator("#settings-page-title"))];
    await wheel(page, rail(page), 400);
    await expect.poll(() => rail(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await top(page.locator("#settings-page-title")), "the page stays put").toBe(paneTop);
    await wheel(page, pane(page), 400);
    await expect.poll(() => pane(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await rail(page).evaluate((el) => el.scrollTop) > 0 && await top(rail(page).locator("h1")) < railTop, "the rail keeps its own position").toBe(true);
    expect(await page.evaluate(() => document.scrollingElement.scrollTop), "the window itself doesn't scroll").toBe(0);
    // Saving rebuilds the page without moving it.
    const scrolled = await pane(page).evaluate((el) => el.scrollTop);
    // Edit without scrolling the field into view.
    await page.locator('#organisation-form [name="body"]').evaluate((el) => {
      el.value = "Saved while scrolled";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Save organisation" }).click();
    await expect(page.locator('#organisation-form [name="body"]')).toHaveValue("Saved while scrolled");
    await expect(page.locator("#toasts")).toContainText("Organisation saved.");
    await expect.poll(() => pane(page).evaluate((el) => el.scrollTop), "the page keeps its scroll").toBe(scrolled);
    // Picking another section rebuilds the rail but keeps it where it was; the new page starts at the top.
    const link = rail(page).locator("nav a", { hasText: "Automation" });
    await link.scrollIntoViewIfNeeded();
    const before = await rail(page).evaluate((el) => el.scrollTop);
    await link.click();
    await expect(page.locator("#settings-page-title")).toHaveText("Automation");
    expect(await rail(page).evaluate((el) => el.scrollTop)).toBe(before);
    expect(await pane(page).evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("without a project, the organisation settings scroll the same way", async ({ page }) => {
    await page.setViewportSize({ width: page.viewportSize().width, height: 560 });
    await page.goto(`${app.base}/#home`);
    await openSettingsPage(page);
    await rail(page).locator("nav a", { hasText: "Organisation" }).click();
    await expect(page.locator("#settings-page-title")).toHaveText("Organisation");
    const railTop = await top(rail(page).locator("h1"));
    await wheel(page, pane(page), 400);
    await expect.poll(() => pane(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await top(rail(page).locator("h1"))).toBe(railTop);
  });
});

onDevices(["phone"], () => test("phones stack the sections above the page and scroll them together", async ({ page }) => {
  for (const start of [`#project/${app.project.id}/settings/organisation`, "#home"]) {
    await page.goto(`${app.base}/${start}`);
    if (start === "#home") {
      await page.locator(".mobile-menu").click();
      await page.locator(".sidebar .phone-drawer-utilities button", { hasText: "Settings" }).click();
    }
    await page.locator("#settings-page-title").waitFor();
    expect(await pane(page).evaluate((el) => getComputedStyle(el).overflowY), start).toBe("visible");
    const scroller = page.locator("#view-content");
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => top(page.locator("#settings-page-title")), `${start}: the stacked page scrolls`).toBeLessThan(0);
  }
}));

// Since 0.20.24 the sidebar opens over the page, so it no longer narrows Settings: a tablet-width
// window keeps the sections beside the page.
onDevices(["narrow"], () => test("at tablet width the sections stay beside the page", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/settings/organisation`);
  await expect(page.locator("#settings-page-title")).toHaveText("Organisation");
  await expect(page.locator(".settings-navigation nav")).toBeVisible();
  await expect(page.locator("#settings-section-select")).toBeHidden();
}));
