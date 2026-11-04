// Owner report, 28 October 2026 (Documents on iPhone): ticking a checklist box
// opened the keyboard, and closing the keyboard scrolled the document to the
// top. A tap on a checkbox now toggles it without focusing the editor, and a
// refresh of the Documents view keeps the open document's scroll position.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { documentBarAction, documentName, openNewDocument, editorSource } from "../helpers/documents.mjs";

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
  test("a touch on a checklist box toggles it without focusing the editor", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit refuses to construct the Touch the test taps with (Illegal constructor)");
    await open(page);
    const box = await visibleCheckbox(page);
    const find = (label) => page.evaluate((label) => {
      const el = [...document.querySelectorAll(".document-checkbox")].find((c) => c.getAttribute("aria-label") === label);
      return { checked: el?.checked, editorFocused: !!document.activeElement?.closest(".cm-editor") };
    }, label);
    // iOS focuses the editor (and opens the keyboard) when a tap's touchend is
    // allowed to complete. The box's touchend is cancelled and it toggles itself.
    // Find the box by its label: CodeMirror may re-render the lines around the viewport, which
    // shifts the boxes' order in the DOM.
    const prevented = await page.evaluate((label) => {
      const target = [...document.querySelectorAll(".document-checkbox")].find((c) => c.getAttribute("aria-label") === label);
      const touch = new Touch({ identifier: 1, target, clientX: 1, clientY: 1 });
      target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      const end = new TouchEvent("touchend", { bubbles: true, cancelable: true, changedTouches: [touch] });
      target.dispatchEvent(end);
      return end.defaultPrevented;
    }, box.label);
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
    // Since 0.19.31 the open document's name shows in the top bar.
    await expect(documentName(page)).toHaveText(other.title);
    // Scroll restoring runs at once and again on the next frame.
    await nextFrames(page);
    expect(await scrollTop(page)).toBe(0);
  });
});

// A near tap must hit the same target as a centred tap, without waking the keyboard.
onDevices(["phone", "ipad"], () => test("checklist targets accept off-centre taps without entering text @gate", async ({ page }) => {
  const doc = await open(page);
  const box = await visibleCheckbox(page);
  const checkbox = page.getByRole("checkbox", { name: box.label, exact: true });
  const target = checkbox.locator("..");
  const size = await target.boundingBox();
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await page.touchscreen.tap(box.x + 12, box.y);
  await expect(checkbox).toBeChecked();
  expect(await page.evaluate(() => !!document.activeElement?.closest(".cm-editor"))).toBe(false);
  expect(await editorSource(page)).toContain(`- [x] ${box.label}`);
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).body).toContain(`- [x] ${box.label}`);
  expect((await editorSource(page)).match(/\[x\]/g)).toHaveLength(1);
  await page.touchscreen.tap(box.x + 12, box.y);
  await expect(checkbox).not.toBeChecked();
}));

onDevices(['phone'], () => test('a swipe starting on a checklist target scrolls without toggling', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch swipes use Chromium DevTools');
  await open(page);
  const box = await visibleCheckbox(page), before = await scrollTop(page);
  const cdp = await page.context().newCDPSession(page);
  try {
    const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y == null ? [] : [{ id: 1, x: box.x + 12, y }] });
    await touch('touchStart', box.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', box.y - i * 8);
    await touch('touchEnd');
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(before + 20);
    expect(await editorSource(page)).not.toContain('[x]');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(false);
  } finally { await cdp.detach(); }
}));

onDevices(['phone', 'ipad'], () => test('property and task-query checkboxes share the touch target @gate', async ({ page }) => {
  const title = `Touch query ${Date.now()}`;
  const task = await app.store.createTask(app.project.id, { title, status: 'todo' });
  let doc = await app.store.createDocument(app.project.id, { title, body: `\`\`\`tasks\ntitle includes ${title}\n\`\`\`` });
  doc = await app.store.updateDocument(app.project.id, doc.id, { revision: doc.revision, document_properties: { set: { Approved: false } } });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await documentBarAction(page, 'Properties');
  for (const checkbox of [page.getByRole('checkbox', { name: 'Approved', exact: true }), page.getByRole('checkbox', { name: `Done: ${title}`, exact: true })]) {
    await checkbox.scrollIntoViewIfNeeded();
    const target = await checkbox.locator('..').boundingBox(), box = await checkbox.boundingBox();
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(box.x + box.width / 2 + 12, box.y + box.height / 2);
    await expect(checkbox).toBeChecked();
    expect(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(false);
    // Phones have no Properties button in the bar to close it with (F0.21-87).
    if (await page.getByRole('dialog', {name:'Properties',exact:true}).isVisible()) await page.keyboard.press('Escape');
  }
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).Approved).toBe(true);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === task.id).status).toBe('done');
}));
