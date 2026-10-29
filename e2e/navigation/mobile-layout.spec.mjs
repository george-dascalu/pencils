// Phone layout (AGENTS.md: one sidebar, the phone drawer, 44px touch targets): the drawer makes
// the page inert and closes with Escape or a tap outside; task rows stay compact with full tap
// targets; tree branches toggle; the document list is the drawer's Documents level (0.19.27);
// every shipped view fits a phone in both themes with an accessible document header; and
// documents, List and Tree fit from 360px to desktop. The phone document toolbar checks
// (modes, search, formatting, versions, delete confirmation) are in compact-navigation.spec.mjs.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.demo();
  const doc = await store.createDocument(project.id, { title: "Project notes", body: "# Project notes\n\nA clear place to work.\n\n## Next steps\n\n- [ ] Discuss the plan\n\n| Task | Owner |\n| --- | --- |\n| Review | George |" });
  const second = await store.createDocument(project.id, { title: "Meeting notes", body: "# Meeting notes\n\nFollow-up actions." });
  return { project, doc, second };
});

const nextFrame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function goto(page, view) {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}${view === "documents" ? "/" + app.doc.id : ""}`);
  await page.locator(".main[data-layout-view]").waitFor();
  if (["list", "tree"].includes(view)) await page.locator(".task-row").first().waitFor();
  if (view === "documents") await page.locator(".cm-content,.document-reading:not([hidden])").first().waitFor();
}
// The view has rendered its content and laid it out.
async function rendered(page, view) {
  await page.locator(`#view-content[data-layout-view="${view}"]`).waitFor();
  await nextFrame(page);
}
const inert = (page, selector) => page.locator(selector).evaluate((el) => el.inert);
async function navigate(page, view) {
  await page.locator(".mobile-menu").click();
  await page.locator(`.phone-project-navigation [data-view="${view}"]`).click();
  await page.locator(`.main[data-layout-view="${view}"]`).waitFor();
  // Documents drills the drawer down to the document list (0.19.27); close it.
  if (view === "documents") await page.locator(".phone-drawer-close").click();
  await expect.poll(() => inert(page, ".main")).toBe(false);
  await expect.poll(() => inert(page, ".sidebar")).toBe(true);
}

onDevices(["phone"], () => {
  test("the drawer makes the page inert and closes with Escape or a tap outside; task rows stay compact", async ({ page }) => {
    await goto(page, "list");
    await page.locator(".mobile-menu").click();
    await expect.poll(() => inert(page, ".main")).toBe(true);
    await expect(page.locator(".phone-project-navigation [data-view]")).toHaveCount(10);
    await page.keyboard.press("Escape");
    await expect(page.locator(".mobile-menu")).toBeFocused();
    await page.locator(".mobile-menu").click();
    await page.locator(".sidebar-overlay").click({ position: { x: 375, y: 200 } });
    await expect(page.locator(".mobile-menu")).toHaveAttribute("aria-expanded", "false");
    const row = page.locator(".task-row").first();
    expect((await row.boundingBox()).height).toBeLessThanOrEqual(76);
    expect((await row.locator(".phone-task-open").boundingBox()).height).toBeGreaterThanOrEqual(44);
    await row.locator(".phone-task-open").click();
    await page.locator("#task-form").waitFor();
    await expect(page.locator("#task-form [name=title]")).toBeVisible();
    await page.locator('[data-action="dialog-close"]').first().click();
  });

  test("views opened from the drawer leave it inert, and tree branches toggle", async ({ page }) => {
    await goto(page, "list");
    await navigate(page, "tree");
    const branch = page.locator(".task-row .tree-toggle:not(:disabled)").first();
    const before = await branch.getAttribute("aria-expanded");
    await branch.click();
    await expect(page.locator(`.task-row .tree-toggle[data-id="${await branch.getAttribute("data-id")}"]`)).not.toHaveAttribute("aria-expanded", before);
    await navigate(page, "documents");
  });

  test("the document list is the drawer's Documents level and opens documents", async ({ page }) => {
    await goto(page, "list");
    await navigate(page, "documents");
    await page.locator(".cm-content").waitFor();
    expect((await page.locator(".document-writing").boundingBox()).y).toBeLessThan(180);
    await page.locator(".mobile-menu").click();
    await expect.poll(() => inert(page, ".main")).toBe(true);
    await page.locator(`.sidebar [data-document-open="${app.second.id}"]`).click();
    await expect(page.locator('[aria-label="Document title"]')).toHaveValue("Meeting notes");
    await expect.poll(() => inert(page, ".main")).toBe(false);
    await page.locator(".mobile-menu").click();
    await page.keyboard.press("Escape");
    await expect.poll(() => inert(page, ".sidebar")).toBe(true);
  });

  // Inspect all shipped views together, in both themes. No fixture changes leak into the vault.
  for (const theme of ["light", "dark"]) {
    test(`every view fits the phone, with an accessible document header, in the ${theme} theme`, async ({ page }) => {
      await goto(page, "list");
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      for (const view of ["overview", "documents", "list", "tree", "table", "kanban", "board", "calendar", "timeline", "capacity"]) {
        await goto(page, view);
        await rendered(page, view);
        const geometry = await page.evaluate(() => ({ header: document.querySelector(".topbar")?.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth - innerWidth }));
        expect(geometry.overflow, `${view} has page overflow`).toBe(0);
        expect(geometry.header.height, `${view} header too tall`).toBeLessThanOrEqual(60);
      }
      await goto(page, "documents");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const a11y = await new AxeBuilder({ page }).include(".topbar").include(".document-heading").include(".document-controls").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(a11y.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
      // In Documents the drawer opens on the document list (0.19.27); Back shows the menu.
      await page.locator(".mobile-menu").click();
      await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().left >= -1);
      await page.locator(".sidebar [data-drawer-back]").click();
      await page.keyboard.press("Escape");
    });
  }
});

// Documents, List and Tree fit at every width. The old suite resized one touch window.
for (const [device, width] of [["small", 360], ["phone", 600], ["ipad-portrait", 820], ["ipad", 1440]]) {
  test.describe(`${width}px touch`, () => {
    test.use({ device, viewportSize: { width, height: 900 } });
    test("documents, List and Tree have no page overflow", async ({ page }) => {
      for (const view of ["documents", "list", "tree"]) {
        await goto(page, view);
        await rendered(page, view);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${view} overflow`).toBe(true);
      }
    });
  });
}

test("desktop documents keep the tabs, formatting bar and view controls", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  await expect(page.locator(".tabs")).toBeVisible();
  await expect(page.locator(".document-formatting")).toBeVisible();
  await expect(page.locator(".document-view-controls")).toBeVisible();
  await expect(page.locator(".phone-new-task")).toBeHidden();
});
