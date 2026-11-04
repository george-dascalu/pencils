// Owner requests (F0.21-80, 3 November 2026): a card ID that would be cut short shows only its
// number, as a rule everywhere; phone field boxes fit their status and date; and a document's card
// list on a phone keeps the ID clear of the field box.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument } from "../helpers/documents.mjs";

const KEY = "PENCILSLABS";
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Keys", key: KEY });
  let parent = null;
  for (let depth = 0; depth < 4; depth++) parent = await store.createTask(project.id, { title: `Share the first working version ${depth}`, status: "in-progress", assignee: "George", priority: "high", due: "2026-10-30", ...(parent ? { parent: parent.id } : {}) });
  return { project };
});
// Every key shows the full ID or, where that would be cut short, its number; never an ellipsis.
async function keys(locator) {
  return locator.evaluateAll((els) => els.map((el) => ({ text: el.textContent, full: el.dataset.keyFull || el.textContent, title: el.title, cut: el.scrollWidth > el.clientWidth })));
}
function checkKeys(list, label) {
  expect(list.length, label).toBeGreaterThan(0);
  for (const key of list) {
    expect(key.full, label).toMatch(new RegExp(`^${KEY}-\\d+$`));
    expect([key.full, key.full.split("-").pop()], `${label}: the full ID or its number`).toContain(key.text);
    expect(key.cut, `${label}: ${key.text} is never cut short`).toBe(false);
    if (key.text !== key.full) expect(key.title, `${label}: the full ID stays in the tooltip`).toBe(key.full);
  }
}

onDevices(["phone", "small"], () => test("phone rows show the card number when the ID would be cut, and their field boxes fit the status and date", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/tree`);
  const meta = page.locator(".task-row .phone-task-meta > span:not([class])");
  await expect(meta).toHaveCount(4);
  // Deep Tree rows on the smallest phones leave the key a sliver; the top rows keep its number whole.
  // Keys are fitted in the frame after they are laid out.
  const top = device === "small" ? 1 : 2;
  await expect.poll(async () => (await keys(meta)).slice(0, top).every((key) => !key.cut)).toBe(true);
  const list = await keys(meta);
  checkKeys(list.slice(0, top), device);
  expect(list.some((key) => key.text !== key.full), `${device}: the deepest rows show only the number`).toBe(true);
  const boxes = await page.locator(".task-row .phone-task-fields").evaluateAll((els) => els.map((box) => {
    const b = box.getBoundingClientRect(), part = (s) => box.querySelector(s);
    const status = part(".phone-task-status"), date = part(".phone-due .due"), assignee = part('[data-field="assignee"]');
    return { status: status.scrollWidth - status.clientWidth, dateCut: date.scrollWidth - date.clientWidth, dateOut: date.getBoundingClientRect().right - (b.right - 3), assignee: assignee.getBoundingClientRect().width, fontSize: getComputedStyle(date).fontSize, statusSize: getComputedStyle(status).fontSize };
  }));
  for (const [depth, box] of boxes.entries()) {
    // Deep Tree rows and the smallest phones narrow the box towards its four 44px targets, where a
    // long status may shorten; the top rows of a phone keep it whole.
    if (device === "phone" && depth < 2) expect(box.status, `${device}: "In progress" is whole`).toBeLessThanOrEqual(0);
    expect(box.dateCut, `${device}: the date is whole`).toBeLessThanOrEqual(0);
    expect(box.dateOut, `${device}: clear of the box's border`).toBeLessThanOrEqual(0);
    expect(box.assignee, `${device}: the assignee is one 44px target, an avatar when tight`).toBeLessThanOrEqual(44.5);
    expect(box.fontSize, `${device}: the date shares the fields' text size`).toBe(box.statusSize);
  }
}));

onDevices(["desktop"], () => test("List rows show the number when the full ID would be cut, everywhere a key is drawn", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const ids = page.locator(".task-row .task-id");
  await expect(ids).toHaveCount(4);
  await expect.poll(async () => (await keys(ids)).every((key) => !key.cut)).toBe(true);
  checkKeys(await keys(ids), "List");
}));

onDevices(["desktop"], () => test("a key rewritten in place is fitted again, not left on the old ID", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const id = page.locator(".task-row .task-id").first();
  await expect(id).toHaveAttribute("data-key-full", /-\d+$/);
  await id.evaluate((el) => (el.textContent = "AB-77"));
  await expect(id, "a short key fits and shows whole").toHaveText("AB-77");
  await expect(id).not.toHaveAttribute("data-key-full");
  await id.evaluate((el) => (el.textContent = "VERYLONGKEY-88"));
  await expect(id, "a long one shows its number").toHaveText("88");
  await expect(id).toHaveAttribute("data-key-full", "VERYLONGKEY-88");
}));

onDevices(["phone"], () => test("a document's card list keeps the ID clear of the field box on a phone", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { body: "Cards due\n\n```tasks\nnot done\nsort by key\n```" });
  const rows = page.locator(".cm-content [data-document-task-query] .document-task-row");
  await expect(rows).toHaveCount(4);
  const facts = await rows.evaluateAll((els) => els.map((row) => {
    const key = row.querySelector(".document-card-key"), title = row.querySelector(".document-task-title"), box = row.querySelector(".document-task-fields");
    const k = key.getBoundingClientRect(), t = title.getBoundingClientRect(), b = box.getBoundingClientRect(), r = row.getBoundingClientRect();
    const overlap = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
    return { key: key.textContent, keyHit: overlap(k, b), titleHit: overlap(t, b), title: t.width, inside: b.left >= r.left - 0.5 && b.right <= r.right + 0.5, width: b.width, cut: key.scrollWidth > key.clientWidth + 1 };
  }));
  const phoneBox = await page.evaluate(() => { const probe = document.createElement("div"); probe.style.width = "calc(var(--phone-box-width) - 44px * var(--box-date))"; document.body.append(probe); const w = probe.getBoundingClientRect().width; probe.remove(); return w; });
  for (const row of facts) {
    expect(row.keyHit, "the ID is clear of the box").toBe(false);
    expect(row.titleHit, "and so is the title").toBe(false);
    expect(row.cut, "the ID is whole").toBe(false);
    expect(row.key, "an ID sized by its text keeps the project key").toMatch(new RegExp(`^${KEY}-\\d+$`));
    expect(row.title, "the title has room to read").toBeGreaterThan(120);
    expect(row.inside, "the box stays in the row").toBe(true);
    expect(Math.abs(row.width - phoneBox), "the box has the phone box width, as in List rows, less the date these rows don't show").toBeLessThanOrEqual(1);
  }
}));
