// Compact navigation (AGENTS.md, Consistency): the header's project navigation is icon-only
// with labels and tooltips, New stays a labelled menu, and the header groups never overlap,
// with the sidebar open or collapsed, from desktop down to phones. In Documents one bar holds
// the formatting toolbar and the document actions (since 0.19.31, with no title field and no
// separate formatting row); Reading hides the text toolbar and keeps search; Live preview
// brings the formatting back into that bar; Insert, the outline and Page versions open
// from compact controls. Phones also keep the formatting bar on one scrolling line and ask
// before deleting (merged from the phone document checks of test/mobile-layout.mjs).
import { test, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";
import { chooseDocumentView } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "A project with a longer title for compact navigation" });
  await store.createTask(project.id, { title: "Review the workspace" });
  const doc = await store.createDocument(project.id, { title: "A long document title stays editable beside the controls", body: "# Project brief\n\nReview the document toolbar." });
  return { project, doc };
});

// The old suite's five widths (height 950); below 1200px they are touch screens.
const sizes = [
  ["desktop", 1440],
  ["ipad", 1024],
  ["ipad-portrait", 834],
  ["ipad-portrait", 768],
  ["phone", 390],
];
const nextFrame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

for (const [device, width] of sizes) {
  test.describe(`${width}px ${device}`, () => {
    test.use({ device, viewportSize: { width, height: 950 } });
    const touch = device !== "desktop";
    const click = (el) => (touch ? el.tap() : el.click());
    const openDocument = async (page) => {
      await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
      await page.locator(".cm-content").waitFor();
    };

    test("the header is icon-only and the document controls fit, with the sidebar open or collapsed", async ({ page }) => {
      await openDocument(page);
      for (const collapsed of [false, true]) {
        await page.evaluate((collapsed) => window.PencilsAppearance.write({ collapsed }), collapsed);
        await expect(page.locator("html")).toHaveAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
        // Header layout listeners (resize observers) run before the next paint.
        await nextFrame(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width > 600) {
          const tabs = page.locator(".topbar .tabs .tab:visible");
          // Five views, then Search (at every width since 0.20.4).
          await expect(tabs).toHaveCount(6);
          for (const tab of await tabs.all()) {
            expect((await tab.textContent()).trim(), "Navigation is icon-only").toBe("");
            expect(await tab.getAttribute("aria-label")).toBeTruthy();
            expect(await tab.getAttribute("title")).toBeTruthy();
            await expect(tab.locator("svg")).toHaveCount(1);
          }
          expect((await page.locator(".topbar .new-menu:not(.phone-new-task) > summary:visible").textContent()).trim()).toBe("New");
          const boxes = await page.locator(".topbar > .breadcrumb, .topbar > .board-project-tools, .topbar > .top-actions").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, `${width}px: header groups do not overlap`).toBe(true);
          }
        }
        // Since 0.19.31 there is no separate formatting row: the document bar holds both.
        await expect(page.locator("#document-form .document-controls")).toHaveCount(0);
        await expect(page.locator("#document-form .document-heading .document-formatting")).toHaveCount(1);
        if (width > 600) await expect(page.locator(".document-formatting"), "Tablet and desktop retain the text toolbar").toBeVisible();
        const heading = await page.locator(".document-heading").boundingBox();
        const fits = (box) => box.x >= heading.x && box.x + box.width <= heading.x + heading.width + 1;
        // Formatting buttons scroll sideways inside their toolbar, so the toolbar itself must fit.
        for (const scroller of await page.locator(".document-heading .rich-toolbar-shell:visible").all())
          expect(fits(await scroller.boundingBox()), "The formatting toolbar fits the document bar").toBe(true);
        for (const control of await page.locator(".document-heading button:visible, .document-heading input:visible").all()) {
          const box = await control.boundingBox();
          const name = (await control.getAttribute("aria-label")) || (await control.textContent()).trim();
          if (!(await control.evaluate((el) => !!el.closest(".rich-toolbar"))))
            expect(fits(box), `Document controls fit their container: ${name} ${JSON.stringify(box)} in ${JSON.stringify(heading)}`).toBe(true);
          expect(box.y >= heading.y && box.y + box.height <= heading.y + heading.height + 1, `Document actions share the document bar: ${name}`).toBe(true);
        }
        await chooseDocumentView(page, "Reading", { tap: touch });
        await expect(page.locator(".document-formatting"), "Reading hides the text toolbar").toBeHidden();
        await click(page.getByRole("button", { name: "Find in document", exact: true }));
        await page.getByRole("searchbox", { name: "Find in document", exact: true }).fill("toolbar");
        await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "reading");
        await click(page.getByRole("button", { name: "Close search", exact: true }));
        await chooseDocumentView(page, "Live preview", { tap: touch });
        const formatting = page.locator(".document-formatting");
        if (!(await formatting.isVisible())) await click(page.getByRole("button", { name: "Show formatting", exact: true }));
        await expect(formatting).toBeVisible();
        // The formatting comes back inside the document bar, not in a row of its own.
        const bar = await page.locator(".document-heading").boundingBox(), format = await formatting.boundingBox();
        expect(format.y >= bar.y && format.y + format.height <= bar.y + bar.height + 1, `formatting sits in the document bar ${JSON.stringify({ bar, format })}`).toBe(true);
        if (device === "phone") {
          expect(await formatting.evaluate((el) => getComputedStyle(el).flexWrap), "the phone formatting bar stays on one line").toBe("nowrap");
          await click(page.getByRole("button", { name: "Hide formatting", exact: true }));
          await expect(formatting).toBeHidden();
          await click(page.getByRole("button", { name: "Show formatting", exact: true }));
          await expect(formatting).toBeVisible();
        }
        await click(page.getByRole("button", { name: "Insert", exact: true }));
        await page.getByRole("dialog", { name: "Insert", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        await click(page.getByRole("button", { name: "Document tools", exact: true }));
        const menu = page.getByRole("dialog", { name: "Document tools", exact: true });
        const outline = menu.getByRole("button", { name: "Document outline", exact: true });
        if (await outline.count()) {
          await click(outline);
          await page.getByRole("dialog", { name: "Outline", exact: true }).waitFor();
          await page.keyboard.press("Escape");
          await click(page.getByRole("button", { name: "Document tools", exact: true }));
        }
        await click(menu.getByRole("button", { name: "Page versions", exact: true }));
        await page.getByRole("dialog", { name: "Page versions", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        if (device === "phone") {
          // Deleting asks first (the confirmation is dismissed, so nothing is deleted).
          await click(page.getByRole("button", { name: "Document tools", exact: true }));
          await click(page.getByRole("button", { name: "Delete document", exact: true }));
          await page.getByRole("button", { name: "Move to Trash", exact: true }).waitFor();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("button", { name: "Move to Trash", exact: true })).toHaveCount(0);
        }
      }
    });

    test("New opens a blank card from a document", async ({ page }) => {
      await openDocument(page);
      await newCard(page, { tap: touch });
      await page.locator("#task-form").waitFor();
      await expect(page.locator("#task-form")).toHaveAttribute("data-id", "");
    });
  });
}
