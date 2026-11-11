// Owner request (F0.23-14): Pencils installs as an app of its own (a web app manifest that opens it in
// its own window), and an Install button beside Search in the tab bar offers it while the browser can
// install it; iPhone and iPad Safari, which has no install prompt, get the Add to Home Screen steps.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Install" }) }));
const install = (page) => page.locator(".topbar .tabs .tab-install");
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/overview`);
  await page.locator(".topbar .tabs .tab-search").waitFor();
}
// The browser offers installation the way Chromium does, with a prompt the page calls.
const offer = (page) => page.evaluate(() => {
  window.prompted = 0;
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => { window.prompted++; };
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  window.dispatchEvent(event);
});

test("the app is installable: its manifest opens it in its own window with its icons", async ({ page }) => {
  await open(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await page.request.get(`${app.base}${href}`)).json();
  expect(manifest).toMatchObject({ name: "Pencils", short_name: "Pencils", start_url: "/", display: "standalone" });
  for (const icon of manifest.icons) expect((await page.request.get(`${app.base}${icon.src}`)).headers()["content-type"]).toBe("image/png");
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  expect((await page.request.get(`${app.base}${await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")}`)).ok()).toBe(true);
  // Chromium's own check, the one its Install app menu follows.
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(async () => (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors.map((e) => e.errorId)).toEqual([]);
});

onDevices(["desktop", "phone"], () => {
  test("Install shows beside Search only while the browser offers it, and installs through its prompt", async ({ page }) => {
    await open(page);
    await expect(install(page)).toBeHidden();
    await offer(page);
    await expect(install(page)).toBeVisible();
    await expect(install(page)).toHaveAccessibleName("Install Pencils as an app");
    // It follows Search, in the same bar, after the view tabs re-render.
    expect(await page.locator(".topbar .tabs .tab-search").evaluate((search) => search.nextElementSibling.classList.contains("tab-install"))).toBe(true);
    await page.locator('[data-action="view"][data-view="documents"]').first().click();
    await expect(install(page)).toBeVisible();
    await install(page).click();
    await expect.poll(() => page.evaluate(() => window.prompted)).toBe(1);
    // Accepted, the prompt can't be used again: the button goes, as it does once the app is installed.
    await expect(install(page)).toBeHidden();
    await offer(page);
    await expect(install(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(install(page)).toBeHidden();
  });
});

onDevices(["ipad"], () => {
  test("iPad Safari, which has no install prompt, gets the Add to Home Screen steps", async ({ page }) => {
    // iPadOS Safari reports a Mac with touch.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
    });
    await open(page);
    await expect(install(page)).toBeVisible();
    await install(page).tap();
    const panel = page.getByRole("dialog", { name: "Install Pencils" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Add to Home Screen");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("an installed app shows no Install button", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
      Object.defineProperty(navigator, "standalone", { get: () => true });
    });
    await open(page);
    await expect(page.locator(".topbar .tabs .tab-home")).toBeVisible();
    await expect(install(page)).toBeHidden();
  });
});
