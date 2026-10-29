// AGENTS.md: on touch screens, only a tap on a text field may open the keyboard. Opening a
// task, its comments, Markdown modes, New, the document list and document modes never focus
// a text field, even briefly, on phones and tablets; direct taps still edit, and desktop keeps
// title and editor autofocus.
import { test, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.demo();
  const doc = await store.createDocument(project.id, { title: "Focus check", body: "# Focus check\n\nTap here to edit.\n\n## Next steps\n\nKeep the keyboard closed while browsing." });
  return { project, doc };
});

// Record every focus that would open a keyboard.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.textFocusEvents = [];
    document.addEventListener("focusin", (event) => {
      const el = event.target;
      if (el.isContentEditable || el.matches("textarea,input:not([type=checkbox],[type=radio],[type=hidden],[type=file],[type=range],[type=color])"))
        window.textFocusEvents.push(el.getAttribute("aria-label") || el.name || el.id || el.tagName);
    });
  });
});

for (const [device, width] of [["phone", 390], ["ipad-portrait", 834], ["desktop", 1440]]) {
  test.describe(`${width}px ${device}`, () => {
    test.use({ device, viewportSize: { width, height: 900 } });
    const touch = device !== "desktop";
    const base = () => `${app.base}/#project/${app.project.id}/`;
    const click = (locator) => (touch ? locator.tap() : locator.click());
    const focused = (locator) => expect(locator).toBeFocused();
    // The action may not focus a text field, not even for a moment, on touch screens.
    async function passive(page, action, label) {
      await page.evaluate(() => (window.textFocusEvents = []));
      await action();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (touch) expect(await page.evaluate(() => window.textFocusEvents), `${width}: ${label} must not briefly focus a text field`).toEqual([]);
    }

    test("opening tasks, comments, Markdown modes and New leaves the keyboard closed", async ({ page }) => {
      const closeTask = () => click(page.locator('.task-dialog [data-action="dialog-close"]'));
      await page.goto(base() + "list");
      const opener = page.locator(".task-row .phone-task-open:visible, .task-row .task-id:visible").first();
      await opener.waitFor();
      await passive(page, async () => { await click(opener); await page.locator("#task-form").waitFor(); }, "Open task");
      const title = page.locator('#task-form [name="title"]');
      if (!touch) await expect(title, "Desktop title autofocus remains available").toBeFocused();
      await click(title);
      await expect(title, "Direct taps can edit task titles").toBeFocused();
      expect(await page.evaluate(() => window.textFocusEvents), "the focus recorder sees text fields").not.toEqual([]);
      if (await page.locator(".task-rich-tools .rich-more-menu").isVisible()) await click(page.locator(".task-rich-tools .rich-more-menu > summary"));
      await passive(page, () => click(page.locator(".task-rich-tools [data-rich-mode]")), "Task Markdown mode");
      await passive(page, async () => { await click(page.locator('[data-feature="task-comments"]')); await page.locator(".task-comments-panel").waitFor(); }, "Open comments");
      const comment = page.locator(".task-comments-panel .inline-rich");
      await click(comment);
      await focused(comment);
      await passive(page, () => click(page.locator(".task-comments-panel [data-rich-mode]")), "Comment Markdown mode");
      await closeTask();
      await passive(page, async () => { await newCard(page, { tap: touch }); await page.locator("#task-form").waitFor(); }, "New task");
      await closeTask();
    });

    test("the document list, document modes and New document leave the keyboard closed", async ({ page }) => {
      await page.goto(base() + "documents/" + app.doc.id);
      await page.locator(".cm-content").waitFor();
      // Since 0.19.27 the document list lives in the main sidebar (the drawer's
      // Documents level on phones and narrow tablets).
      const drawer = await page.locator(".mobile-menu").isVisible();
      if (drawer) await passive(page, () => click(page.locator(".mobile-menu")), "Open the document list");
      const search = page.locator("#document-search");
      await click(search);
      await focused(search);
      if (drawer) await click(page.locator(".phone-drawer-close"));
      async function mode(name) {
        if (width <= 600) await click(page.locator(".document-mode-picker"));
        await click(page.getByRole("button", { name, exact: true }));
      }
      await passive(page, () => mode("Source"), "Document Source mode");
      if (!touch) await focused(page.locator(".cm-content"));
      await click(page.locator(".cm-line").first());
      await expect(page.locator(".cm-content"), "Direct taps can edit Markdown").toBeFocused();
      await passive(page, () => mode("Live preview"), "Document Live preview mode");
      await passive(page, () => mode("Reading"), "Document Reading mode");
      await passive(page, () => mode("Source"), "Document Source after Reading");
      if (drawer) await click(page.locator(".mobile-menu"));
      await passive(page, async () => {
        await click(page.getByRole("button", { name: "New document", exact: true }));
        await expect(page.locator('[aria-label="Document title"]')).toHaveValue("Untitled document");
      }, "New document");
    });
  });
}
