// Owner report, 28 October 2026 (Documents on iPhone): ticking a checklist box
// opened the keyboard, and closing the keyboard scrolled the document to the
// top. A tap on a checkbox now toggles it without focusing the editor, and a
// refresh of the Documents view keeps the open document's scroll position.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Docs", key: "DC" }) }));
const body = "# Plan\n\n" + Array.from({ length: 40 }, (_, i) => `Paragraph ${i} with enough words to fill a line or two on a phone screen.\n\n- [ ] Task ${i}\n`).join("\n");

// A checklist box fully inside the visible editor, or null while none is rendered there.
const visibleCheckbox = (page) => page.evaluate(() => {
  const scroller = document.querySelector(".cm-scroller").getBoundingClientRect();
  const boxes = [...document.querySelectorAll(".document-checkbox")];
  const index = boxes.findIndex((el) => { const r = el.getBoundingClientRect(); return r.top > scroller.top + 60 && r.bottom < scroller.bottom - 60; });
  if (index < 0) return null;
  const r = boxes[index].getBoundingClientRect();
  return { index, label: boxes[index].getAttribute("aria-label"), x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const scrollTop = (page) => page.locator(".cm-scroller").evaluate((el) => el.scrollTop);
const nextFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Opens a fresh checklist document scrolled part-way down, with a box in view.
async function open(page) {
  const doc = await openNewDocument(page, app, app.project.id, { title: `Checklist ${Date.now()}-${Math.random()}`, body, waitFor: ".document-checkbox" });
  await page.locator(".cm-scroller").evaluate((el) => { el.scrollTop = 900; });
  await expect.poll(() => scrollTop(page)).toBe(900);
  await expect.poll(() => visibleCheckbox(page)).not.toBeNull();
  return doc;
}

onDevices(["phone"], () => {
  test("a touch on a checklist box toggles it without focusing the editor", async ({ page }) => {
    await open(page);
    const box = await visibleCheckbox(page);
    const find = (label) => page.evaluate((label) => {
      const el = [...document.querySelectorAll(".document-checkbox")].find((c) => c.getAttribute("aria-label") === label);
      return { checked: el?.checked, editorFocused: !!document.activeElement?.closest(".cm-editor") };
    }, label);
    // iOS focuses the editor (and opens the keyboard) when a tap's touchend is
    // allowed to complete. The box's touchend is cancelled and it toggles itself.
    const prevented = await page.evaluate((index) => {
      const target = document.querySelectorAll(".document-checkbox")[index];
      const touch = new Touch({ identifier: 1, target, clientX: 1, clientY: 1 });
      target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      const end = new TouchEvent("touchend", { bubbles: true, cancelable: true, changedTouches: [touch] });
      target.dispatchEvent(end);
      return end.defaultPrevented;
    }, box.index);
    expect(prevented, "the tap is kept from focusing the editor").toBe(true);
    await expect.poll(() => find(box.label), "the cancelled tap still ticks the box").toEqual({ checked: true, editorFocused: false });
    await page.touchscreen.tap(box.x, box.y);
    await expect.poll(() => find(box.label), "a real tap unticks it, still without focus").toEqual({ checked: false, editorFocused: false });
    await expect(page.locator(".cm-content"), "the item text is unchanged").toContainText(box.label);
  });

  test("ticking a box and the refresh that follows keep the scroll position", async ({ page }) => {
    await open(page);
    const box = await visibleCheckbox(page);
    const before = await scrollTop(page);
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(`/api/projects/${app.project.id}/documents/`));
    await page.touchscreen.tap(box.x, box.y);
    await saved;
    // The save's change notice refreshes the view once nothing is being edited.
    await page.waitForResponse((r) => r.request().method() === "GET" && r.url().includes(`/api/projects/${app.project.id}`), { timeout: 15000 });
    await nextFrames(page);
    const after = await scrollTop(page);
    expect(Math.abs(after - before), `scroll position kept ${JSON.stringify({ before, after })}`).toBeLessThanOrEqual(40);
  });

  test("switching documents still starts at the top", async ({ page }) => {
    await open(page);
    const other = await app.store.createDocument(app.project.id, { title: `Other ${Date.now()}`, body });
    await page.goto(`${app.base}/#project/${app.project.id}/documents/${other.id}`);
    await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(other.title);
    // Scroll restoring runs at once and again on the next frame.
    await nextFrames(page);
    expect(await scrollTop(page)).toBe(0);
  });
});
