// The card editor on phones and touch screens (merged from task-editor-phone and
// task-editor-touch). Phones show Details, Comments and History as panes with a compact
// header, a one-row toolbar that scrolls sideways and 44px controls; relationships sort,
// add, remove and open the linked card; the relationship picker opens above the editor in
// view without summoning the keyboard and closes by tapping outside or Escape; text is at
// least 16px so focusing never zooms; with the keyboard up the editor fits above it and
// keeps the caret in view; attachments upload from the file picker and survive a reload.
// Desktop and iPad keep the same workflows.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  // Relationship review (from task-editor-phone).
  const review = await store.createProject({ title: "Phone task review", key: "PHONE" });
  const main = await store.createTask(review.id, { title: "Prepare the next project release", body: "## Release notes\n\nConfirm scope and check the latest changes." });
  const child = await store.createTask(review.id, { title: "Check the release on an iPhone and iPad", parent: main.id, assignee: "George", priority: "high" });
  await store.createTask(review.id, { title: "Write release notes", parent: main.id, assignee: "Alice", priority: "low", status: "done" });
  const link = await store.createTask(review.id, { title: "Review the updated task editor" });
  // A long card with many relationships (from task-editor-touch).
  const touch = await store.createProject({ title: "Touch task editor" });
  const links = [];
  for (let i = 0; i < 16; i++) links.push(await store.createTask(touch.id, { title: `Existing relationship ${i + 1}` }));
  const long = await store.createTask(touch.id, { title: "Review the phone editor", body: "## Notes\n\n" + "A detailed description.\n\n".repeat(16), related_records: links.map((t) => t.id) });
  await store.updateTask(touch.id, long.id, { revision: long.revision, related_records: links.map((t) => t.id) });
  const target = await store.createTask(touch.id, { title: "New relationship target" });
  return { review: { project: review, main, child, link }, touch: { project: touch, main: long, target } };
});

const touchDevices = new Set(["phone", "small", "ipad", "ipad-portrait"]);
const tapOrClick = (device, locator) => (touchDevices.has(device) ? locator.tap() : locator.click());
const form = (page) => page.locator("#task-form");
async function openCard(page, device, { project, main }) {
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await tapOrClick(device, page.locator(`[data-action="task-open"][data-id="${main.id}"]:visible`).first());
  await form(page).waitFor();
}

// Relationship review: panes, compact phone layout, sort/add/remove and linked cards.
const reviewTests = (device, phone) => {
  const relationships = (page) => form(page).locator(".task-relationships");

  test("Details, Comments and History are the editor's three panes", async ({ page }) => {
    await openCard(page, device, app.review);
    await relationships(page).waitFor();
    await expect(page.locator(".task-mobile-panes")).toHaveCount(0);
    await expect(form(page).locator("[data-editor-pane]")).toHaveCount(3);
    const dialog = page.locator(".task-dialog");
    await tapOrClick(device, form(page).locator('[data-editor-pane="comments"]'));
    await expect(dialog).toHaveClass(/\bwith-task-comments\b/);
    await tapOrClick(device, form(page).locator('[data-editor-pane="history"]'));
    await expect(dialog).toHaveClass(/\bwith-task-history\b/);
    await expect(dialog).not.toHaveClass(/\bwith-task-comments\b/);
    await tapOrClick(device, form(page).locator('[data-editor-pane="details"]'));
    await form(page).locator(".task-metadata").waitFor();
  });

  if (phone)
    test("the phone header, toolbar and relationships stay compact with 44px controls", async ({ page }) => {
      await openCard(page, device, app.review);
      await relationships(page).waitFor();
      const tools = form(page).locator(".task-rich-tools");
      const identity = await form(page).locator(".task-identity-row").boundingBox();
      const title = await form(page).locator('[name="title"]').boundingBox();
      expect(identity.x + identity.width, "Type/ID precede title").toBeLessThanOrEqual(title.x);
      // Title is one step above the 16px body on phones (type scale, 0.19.8).
      await expect(form(page).locator('[name="title"]')).toHaveCSS("font-size", "18px");
      expect(await tools.evaluate((el) => el.scrollWidth <= el.clientWidth && el.offsetHeight <= 54), "Toolbar fits one row").toBe(true);
      for (const control of await tools.locator("button:visible,summary:visible").all()) expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      const del = form(page).locator(".task-secondary-actions").getByRole("button", { name: "Delete task", exact: true });
      await expect(del, "Delete shows without a More menu").toBeVisible();
      // Both header groups and Close fit the screen, Close last.
      const [group, close] = [await form(page).locator(".task-secondary-actions").boundingBox(), await form(page).locator('[data-action="dialog-close"]').boundingBox()];
      expect(group.x + group.width <= close.x && close.x + close.width <= page.viewportSize().width, "header fits").toBe(true);
      const panes = await form(page).locator(".task-pane-switcher").boundingBox();
      expect(group.x - panes.x - panes.width, "the two groups keep at least the editor's 10px spacing").toBeGreaterThanOrEqual(10);
      // Escape closes Delete's confirmation, not the card.
      await del.tap();
      await page.locator(".confirm-popover").waitFor();
      await page.keyboard.press("Escape");
      await expect(page.locator(".confirm-popover")).toHaveCount(0);
      await expect(form(page)).toBeVisible();
      // The toolbar scrolls sideways (0.19.6): the mode controls sit past the end indicator.
      await tools.locator(".rich-format-menu > summary").tap();
      await page.keyboard.press("Escape");
      await expect(form(page), "Escape closes formatting before the task").toBeVisible();
      await expect(tools.locator(".rich-format-menu")).not.toHaveAttribute("open");
      await expect(tools.locator('[data-rich-scroll="end"]'), "end indicator shows more tools").toBeVisible();
      await tools.getByRole("button", { name: "Markdown", exact: true }).tap();
      await expect(form(page).locator('[name="body"]')).toBeVisible();
      await expect(form(page).locator('[name="body"]')).not.toBeFocused();
      await tools.getByRole("button", { name: "Rich text", exact: true }).tap();
      await tools.getByRole("button", { name: "Preview", exact: true }).tap();
      await form(page).locator(".inline-preview:not(.hidden)").waitFor();
      await tools.getByRole("button", { name: "Back to edit", exact: true }).tap();
      // Phones keep card-sized fields on a second line instead of shrinking them (0.19.10).
      for (const row of await relationships(page).locator(".task-relationship-row").all()) expect((await row.boundingBox()).height, "Relationship uses at most a title line and a field line").toBeLessThanOrEqual(110);
    });

  test("relationships sort, add and remove, and the editor has no horizontal overflow in either theme", async ({ page }) => {
    const { link } = app.review;
    await openCard(page, device, app.review);
    await relationships(page).waitFor();
    await tapOrClick(device, relationships(page).locator(".task-relationship-sort > summary"));
    await relationships(page).getByLabel("Sort relationships by", { exact: true }).selectOption("assignee");
    await tapOrClick(device, relationships(page).getByRole("button", { name: "Reverse relationship sort" }));
    await page.keyboard.press("Escape");
    await expect(relationships(page).locator(".task-relationship-sort")).not.toHaveAttribute("open");
    await tapOrClick(device, relationships(page).getByRole("button", { name: "Add relationship", exact: true }));
    if (touchDevices.has(device)) await expect(relationships(page).getByRole("searchbox")).not.toBeFocused();
    await relationships(page).getByRole("searchbox").fill(link.key);
    await tapOrClick(device, relationships(page).locator(`[data-relationship-add="${link.id}"]`));
    await relationships(page).locator("[data-relationship-picker]").waitFor({ state: "hidden" });
    // Remove the fixture link so each device exercises the same workflow.
    await tapOrClick(device, relationships(page).locator(`[data-relationship-remove="${link.id}"]`));
    await expect(relationships(page).locator(`[data-relationship-remove="${link.id}"]`)).toHaveCount(0);
    await expect(relationships(page).getByText("Relationship saved.", { exact: true })).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await form(page).locator(".dialog-body").evaluate((el) => (el.scrollTop = 0));
      expect(await form(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `Editor has no horizontal overflow (${theme})`).toBe(true);
    }
  });

  test("a compact relationship row opens the linked card with its full title", async ({ page }) => {
    const { child } = app.review;
    await openCard(page, device, app.review);
    await tapOrClick(device, relationships(page).locator(`[data-relationship-open="${child.id}"]`));
    await expect(form(page)).toHaveAttribute("data-id", child.id);
    await expect(form(page).locator('[name="title"]')).toHaveValue(child.title);
  });
};
onDevices(["small", "phone"], (device) => reviewTests(device, true));
test.describe("large phone", () => {
  test.use({ device: "phone", viewportSize: { width: 430, height: 900 } });
  reviewTests("phone", true);
});
onDevices(["ipad-portrait", "desktop"], (device) => reviewTests(device, false));

// A long card with many relationships: picker placement, text size, keyboard and attachments.
const saved = async () => (await app.store.snapshot(app.touch.project.id)).tasks.find((t) => t.id === app.touch.main.id);
// Emulates the on-screen keyboard: iOS shrinks the visual viewport and keeps the layout viewport.
const showKeyboard = (page) =>
  page.evaluate(() => {
    for (const [key, value] of Object.entries({ height: 270, offsetTop: 24 })) Object.defineProperty(visualViewport, key, { configurable: true, get: () => value });
    visualViewport.dispatchEvent(new Event("resize"));
  });
const expectAboveKeyboard = async (page, message) => {
  await expect.poll(async () => {
    const box = await page.locator(".task-dialog").boundingBox();
    return box.y >= 24 && box.y + box.height <= 295;
  }, { message }).toBe(true);
};
const touchTests = (device) => {
  const touch = touchDevices.has(device);
  const rich = (page) => form(page).getByRole("textbox", { name: "Task description", exact: true });

  test("the relationship picker opens above the editor in view, links and unlinks, and closes by tapping outside or Escape", async ({ page }) => {
    const { target } = app.touch;
    const { width } = page.viewportSize();
    await openCard(page, device, app.touch);
    const add = form(page).getByRole("button", { name: "Add relationship", exact: true });
    const picker = form(page).locator("[data-relationship-picker]");
    await tapOrClick(device, add);
    await expect(add).toHaveAttribute("aria-expanded", "true");
    expect(await picker.evaluate((el) => el.matches(":popover-open")), "Picker escapes clipped task content").toBe(true);
    const bounds = await picker.boundingBox();
    const viewport = await page.evaluate(() => ({ top: visualViewport.offsetTop, left: visualViewport.offsetLeft, width: visualViewport.width, height: visualViewport.height }));
    expect(
      bounds.x >= viewport.left && bounds.y >= viewport.top && bounds.x + bounds.width <= viewport.left + viewport.width + 1 && bounds.y + bounds.height <= viewport.top + viewport.height + 1,
      "Picker is visible without scrolling past existing relationships",
    ).toBe(true);
    expect(bounds.height).toBeGreaterThan(100);
    expect(
      await picker.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 20));
      }),
      "Picker receives taps above the editor",
    ).toBe(true);
    if (touch) await expect(picker.locator("input"), "Opening does not summon the keyboard").not.toBeFocused();
    await picker.getByLabel("Relationship type", { exact: true }).selectOption("related");
    await picker.getByRole("searchbox").fill(target.key);
    await tapOrClick(device, picker.locator(`[data-relationship-add="${target.id}"]`));
    await expect.poll(async () => (await saved()).related_records).toContain(target.id);
    await picker.waitFor({ state: "hidden" });
    await expect(add).toHaveAttribute("aria-expanded", "false");
    await tapOrClick(device, form(page).locator(`[data-relationship-remove="${target.id}"]`));
    await expect.poll(async () => (await saved()).related_records).not.toContain(target.id);
    // Dismissal works with both touch outside the picker and Escape.
    await tapOrClick(device, add);
    await expect(add).toHaveAttribute("aria-expanded", "true");
    if (width <= 600) await tapOrClick(device, form(page).locator('[name="title"]'));
    else {
      const outside = await page.locator(".task-dialog").boundingBox();
      if (touch) await page.touchscreen.tap(outside.x + 4, outside.y + 20);
      else await page.mouse.click(outside.x + 4, outside.y + 20);
    }
    await expect(add).toHaveAttribute("aria-expanded", "false");
    await tapOrClick(device, add);
    await expect(add).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(form(page)).toBeVisible();
    await expect(add).toHaveAttribute("aria-expanded", "false");
  });

  test("typed notes save, and on touch screens every text field is at least 16px so focusing never zooms", async ({ page }) => {
    const { width } = page.viewportSize();
    await openCard(page, device, app.touch);
    await tapOrClick(device, rich(page));
    if (touch) expect(await rich(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), "Description avoids small-text focus zoom").toBeGreaterThanOrEqual(16);
    await rich(page).fill(`Notes typed at ${width}px`);
    await expect.poll(async () => (await saved()).body).toContain(`Notes typed at ${width}px`);
    if (touch)
      for (const field of await form(page).locator('input:not([type="hidden"], [type="file"], [type="checkbox"]):visible, textarea:visible').all())
        expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), await field.evaluate((el) => el.name || el.type)).toBeGreaterThanOrEqual(16);
  });

  if (touch)
    test("with the keyboard up the editor fits above it and keeps the caret in view, for new cards too", async ({ page }) => {
      await openCard(page, device, app.touch);
      await rich(page).tap();
      await expect(rich(page)).toBeFocused();
      await showKeyboard(page);
      await expectAboveKeyboard(page, "Task panel fits above the keyboard");
      await page.waitForFunction(() => {
        const selection = getSelection();
        if (!selection.rangeCount) return false;
        const caret = selection.getRangeAt(0).getBoundingClientRect();
        const phone = document.querySelector(".task-editor-page");
        const body = document.querySelector(phone ? "#task-form" : ".task-editor-content > .dialog-body").getBoundingClientRect();
        const top = phone ? Math.max(body.top, document.querySelector(".task-editor-head").getBoundingClientRect().bottom) : body.top;
        return caret.top >= top && caret.bottom <= body.bottom;
      });
      await page.evaluate(() => {
        delete visualViewport.height;
        delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await form(page).locator('[data-action="dialog-close"]').tap();
      await newCard(page, { tap: true });
      await form(page).waitFor();
      await showKeyboard(page);
      await expectAboveKeyboard(page, "New task also fits the keyboard viewport");
    });

  test("attachments upload from the file picker without losing the description and survive a reload", async ({ page }) => {
    const { width } = page.viewportSize();
    const name = `notes-${device}-${width}.txt`;
    await openCard(page, device, app.touch);
    await rich(page).fill(`Notes typed at ${width}px`);
    await expect.poll(async () => (await saved()).body).toContain(`Notes typed at ${width}px`);
    const attach = form(page).getByRole("button", { name: "Add attachments", exact: true });
    await expect(attach.locator("svg")).toHaveCount(1);
    if (touch) expect((await attach.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const chooser = page.waitForEvent("filechooser");
    await tapOrClick(device, attach);
    await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from("Phone attachment") });
    await form(page).getByRole("button", { name: `Preview ${name}`, exact: true }).waitFor();
    await expect.poll(async () => (await saved()).body).toContain(name);
    expect((await saved()).body).toContain(`Notes typed at ${width}px`);
    await page.reload();
    await tapOrClick(device, page.locator(`[data-action="task-open"][data-id="${app.touch.main.id}"]:visible`).first());
    await form(page).getByRole("button", { name: `Preview ${name}`, exact: true }).waitFor();
    expect(await form(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "no horizontal overflow").toBe(true);
  });
};
onDevices(["small", "phone", "desktop"], (device) => touchTests(device));
test.describe("landscape phone", () => {
  test.use({ device: "phone", viewportSize: { width: 844, height: 390 } });
  touchTests("phone");
});
