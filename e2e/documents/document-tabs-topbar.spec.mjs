// Owner request, 31 October 2026: like Obsidian, a document's tabs are the only thing at the top.
// On desktop and iPad they take the title's place in the top bar, in the title's own type (the
// heading stays for screen readers), so the document starts right under its one bar. Phones keep
// one document and no title.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tabs on top", key: "TT" });
  const a = await store.createDocument(project.id, { title: "Alpha note", body: "Alpha\n" });
  const b = await store.createDocument(project.id, { title: "Beta note", body: "Beta\n" });
  return { project, a, b };
});
async function open(page, doc) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator("#document-form .cm-content").waitFor();
}
const look = (el) => { const s = getComputedStyle(el); return [s.fontSize, s.fontWeight, s.color, s.fontFamily]; };

onDevices(["desktop", "ipad", "ipad-portrait"], () => test("the tabs take the title's place in the top bar, in its type", async ({ page, device }) => {
  await open(page, app.a);
  await open(page, app.b);
  const tabs = page.getByRole("navigation", { name: "Open documents" });
  await expect(page.locator(".topbar .breadcrumb .document-tabs"), `${device}: in the top bar`).toHaveCount(1);
  await expect(page.locator(".documents-workspace .document-tabs"), `${device}: not above the document`).toHaveCount(0);
  await expect(tabs.getByRole("button", { name: "Beta note", exact: true })).toHaveAttribute("aria-current", "page");
  // The heading stays, for screen readers, without showing the name twice.
  const title = page.locator(".topbar .breadcrumb strong");
  await expect(title).toHaveText("Beta note");
  expect(await title.evaluate((el) => el.getBoundingClientRect().width), `${device}: the title is hidden`).toBeLessThanOrEqual(1);
  const [active, other, heading] = [await tabs.locator("[aria-current=page]").evaluate(look), await tabs.locator(".document-tab-open:not([aria-current])").evaluate(look), await title.evaluate(look)];
  expect(active, `${device}: the open tab looks like the title`).toEqual(heading);
  expect(other.slice(0, 1), `${device}: other tabs share its size`).toEqual(heading.slice(0, 1));
  expect(other[2], `${device}: other tabs are muted`).not.toBe(heading[2]);
  // The document's bar is the first thing in the content.
  const [content, bar] = [await page.locator(".documents-workspace").boundingBox(), await page.locator(".document-heading").boundingBox()];
  expect(bar.y - content.y, `${device}: no tab strip above the bar`).toBeLessThanOrEqual(2);
  // Leaving Documents takes the tabs away and shows the title again.
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator(".topbar .document-tabs")).toHaveCount(0);
  expect(await page.locator(".topbar .breadcrumb strong").evaluate((el) => el.getBoundingClientRect().width), `${device}: the title is back`).toBeGreaterThan(1);
}));

// A window that narrows to a phone's width, or a short one, swaps the tabs for no title; widening
// brings them back.
test("the tabs follow the window between desktop and phone sizes", async ({ page }) => {
  await open(page, app.a);
  const tabs = page.locator(".topbar .document-tabs");
  await expect(tabs).toBeVisible();
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 480 }]) {
    await page.setViewportSize(size);
    await expect(tabs, JSON.stringify(size)).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tabs, "back on desktop").toBeVisible();
  }
});

// The other tabs' close buttons show on hover or keyboard focus, and can't be tapped unseen.
test("a hidden close button is reached by keyboard and can't be hit unseen", async ({ page }) => {
  await open(page, app.a);
  await open(page, app.b);
  const close = page.getByRole("button", { name: "Close Alpha note", exact: true });
  expect(await close.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).pointerEvents])).toEqual(["0", "none"]);
  await page.getByRole("button", { name: "Alpha note", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS("opacity", "1");
});
