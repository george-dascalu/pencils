// One formatting toolbar everywhere (description, comments, documents, board
// text): grouped controls, the same control set, horizontal scrolling with snap
// and edge indicators on narrow screens.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Toolbar project", key: "TB" });
  const tasks = [];
  for (let i = 0; i < 4; i++) tasks.push(await store.createTask(project.id, { title: `Toolbar task ${i}` }));
  const doc = await store.createDocument(project.id, { title: "Toolbar document", body: "First line\n\nSecond line" });
  return { project, tasks, doc };
});
const open = async (page, view, wait) => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(wait).first().waitFor();
};
const openTask = async (page, id) => {
  await page.locator(`[data-action="task-open"][data-id="${id}"]:visible`).first().click();
  await page.locator("#task-form .task-description .rich-toolbar").waitFor();
};
// The formatting controls every surface must offer, in order.
const FORMATTING = ["Text style", "Bold", "Italic", "Strikethrough", "Highlight", "Inline code", "Bullet list", "Numbered list", "Checklist", "Link", "Code block", "Divider"];
const STYLES = ["Paragraph", "Heading 1", "Heading 2", "Heading 3", "Quote"];
const names = (page, scope) => page.evaluate((scope) => [...document.querySelectorAll(`${scope} .rich-toolbar :is(button, summary)`)]
  .filter((el) => !el.closest(".selection-popover") && !el.matches("[data-rich-scroll]"))
  .map((el) => el.getAttribute("aria-label")), scope);
const styleItems = (page, scope) => page.evaluate((scope) => [...document.querySelectorAll(`${scope} .rich-format-menu .selection-popover button`)].map((el) => el.getAttribute("aria-label")), scope);

test("the description, comments and documents share one formatting control set", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[0].id);
  const description = await names(page, ".task-description");
  expect(description.slice(0, FORMATTING.length), `description toolbar: ${description.join(", ")}`).toEqual(FORMATTING);
  expect(await styleItems(page, ".task-description")).toEqual(STYLES);
  expect(description.includes("Markdown") && description.includes("Preview"), "rich surfaces keep the Markdown and Preview modes").toBe(true);
  await page.locator('[data-feature="task-comments"]').click();
  await page.locator(".comment-rich-tools").waitFor();
  expect((await names(page, ".comment-rich-tools")).slice(0, FORMATTING.length), "comment composer").toEqual(FORMATTING);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await open(page, "documents", ".documents-workspace");
  await openSidebar(page);
  await page.locator(`[data-document-open="${app.doc.id}"]`).first().click();
  // Since 0.19.31 the title is a hidden field; the document's formatting bar marks it open.
  await page.locator("#document-form .document-formatting .rich-toolbar").waitFor();
  const documentNames = await names(page, ".document-formatting");
  expect(documentNames.slice(0, FORMATTING.length), `document toolbar: ${documentNames.join(", ")}`).toEqual(FORMATTING);
  expect(await styleItems(page, ".document-formatting")).toEqual(STYLES);
  expect(documentNames, "documents keep their own view modes instead of the rich/Markdown toggle").not.toContain("Markdown");
  await expect(page.locator(".rich-more-menu, [data-document-format-select]"), "no More menu or style select remains").toHaveCount(0);
});

test("controls sit in tight groups with separators", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[0].id);
  const layout = await page.evaluate(() => {
    const groups = [...document.querySelectorAll(".task-description .rich-toolbar .selection-group")].filter((g) => g.getClientRects().length);
    const gaps = [];
    for (const group of groups) {
      const items = [...group.querySelectorAll(":scope > button, :scope > details > summary, :scope > details")].filter((el) => el.getClientRects().length);
      for (let i = 1; i < items.length; i++) gaps.push(items[i].getBoundingClientRect().left - items[i - 1].getBoundingClientRect().right);
    }
    const separators = groups.slice(1).filter((g) => parseFloat(getComputedStyle(g).borderLeftWidth) > 0).length;
    return { groups: groups.length, maxGap: Math.max(...gaps), separators };
  });
  expect(layout.groups, `several groups: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(5);
  expect(layout.maxGap, `buttons inside a group sit together: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(4);
  expect(layout.separators, `groups are separated: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(layout.groups - 2);
});

test("the new rich controls round-trip to Markdown", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[1].id);
  const source = page.locator('#task-form textarea[name="body"]');
  const select = (text) => page.evaluate((text) => {
    const rich = document.querySelector(".task-description .inline-rich");
    rich.focus();
    rich.innerHTML = `<p>${text}</p>`;
    document.getSelection().selectAllChildren(rich.firstElementChild);
  }, text);
  const apply = async (text, label, expected) => {
    await select(text);
    await page.locator(`.task-description .rich-toolbar [aria-label="${label}"]:visible`).first().click();
    await expect.poll(async () => (await source.inputValue()).trim(), label).toMatch(expected);
  };
  await apply("shine", "Highlight", /^==shine==$/);
  await apply("mono", "Inline code", /^`mono`$/);
  await apply("todo", "Checklist", /^-\s+\[ \] todo$/m);
  await apply("block", "Code block", /^```\n?block\n?```$/m);
  await apply("after", "Divider", /---/);
  await select("title");
  await page.locator(".task-description .rich-format-menu > summary").click();
  await page.locator('.task-description .rich-format-menu [aria-label="Heading 3"]').click();
  await expect(source, "Heading 3 writes a level-3 heading").toHaveValue(/^### title$/m);
  await expect(page.locator(".task-description .rich-format-menu[open]"), "the style menu closes after a choice").toHaveCount(0);
});

test("the new document controls write Markdown", async ({ page }) => {
  await open(page, "documents", ".documents-workspace");
  await page.locator("#document-form .document-formatting .rich-toolbar").waitFor();
  await page.locator(".document-codemirror .cm-content").click();
  await page.keyboard.press("Control+End");
  await page.locator('.document-formatting .rich-toolbar [aria-label="Checklist"]').click();
  await page.locator('.document-formatting .rich-toolbar [aria-label="Highlight"]').click();
  const body = page.locator("#document-form [name=body]");
  await expect(body).toHaveValue(/- \[ \] .*==/);
  await page.locator(".document-formatting .rich-format-menu > summary").click();
  await page.locator('.document-formatting .rich-format-menu [aria-label="Heading 2"]').click();
  await expect(body).toHaveValue(/## /);
  await expect(page.locator(".document-formatting .rich-format-menu[open]"), "the style menu closes after a choice").toHaveCount(0);
});

onDevices(["phone"], () => test("on phones the toolbar scrolls sideways with snapping and edge indicators", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[2].id);
  const scope = ".task-description";
  const state = () => page.evaluate((scope) => {
    const scroller = document.querySelector(`${scope} .rich-toolbar`);
    const cs = getComputedStyle(scroller);
    const r = scroller.getBoundingClientRect();
    const items = [...scroller.querySelectorAll(":is(button, summary)")].filter((el) => el.getClientRects().length && !el.closest(".selection-popover"));
    const edge = r.left;
    const partial = items.filter((el) => { const b = el.getBoundingClientRect(); return b.left < edge - 1 && b.right > edge + 1; }).length;
    const groups = [...scroller.querySelectorAll(".selection-group")].filter((el) => el.getClientRects().length);
    const aligned = [...items, ...groups].some((el) => Math.abs(el.getBoundingClientRect().left - edge) <= 1.5);
    return { overflow: cs.overflowX, snap: cs.scrollSnapType, width: Math.round(r.width), scrollWidth: scroller.scrollWidth, scrollLeft: Math.round(scroller.scrollLeft), start: !!document.querySelector(`${scope} [data-rich-scroll="start"]:not([hidden])`), end: !!document.querySelector(`${scope} [data-rich-scroll="end"]:not([hidden])`), partialAtStart: partial, aligned, more: document.querySelectorAll(`${scope} .rich-more-menu`).length };
  }, scope);
  const toolbar = page.locator(`${scope} .rich-toolbar`);
  // The end indicator appears once the toolbar has measured its overflow.
  await expect(page.locator(`${scope} [data-rich-scroll="end"]`)).toBeVisible();
  const initial = await state();
  expect(["auto", "scroll"], `toolbar scrolls horizontally: ${JSON.stringify(initial)}`).toContain(initial.overflow);
  expect(initial.snap, "snap on the x axis").toMatch(/x/);
  expect(initial.scrollWidth, "there is more toolbar than fits").toBeGreaterThan(initial.width + 20);
  expect(initial.more, "no More menu").toBe(0);
  expect(!initial.start && initial.end, `only the end indicator shows at the start: ${JSON.stringify(initial)}`).toBe(true);
  await toolbar.evaluate((el) => el.scrollBy({ left: 37, behavior: "instant" }));
  // Scroll snapping settles the toolbar on a control's edge.
  await expect.poll(async () => { const s = await state(); return s.start && s.end && s.partialAtStart === 0 && s.aligned; }, "snaps with both indicators").toBe(true);
  const mid = await state();
  expect(mid.start && mid.end, `both indicators show mid-way: ${JSON.stringify(mid)}`).toBe(true);
  // The indicators are full 44px touch targets (AGENTS.md).
  const arrows = await page.locator(`${scope} [data-rich-scroll]`).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  expect(arrows.every(([w, h]) => w >= 44 && h >= 44), `scroll indicators are 44px targets: ${JSON.stringify(arrows)}`).toBe(true);
  expect(mid.partialAtStart, `no control is cut off at the left edge after snapping: ${JSON.stringify(mid)}`).toBe(0);
  expect(mid.aligned, "a control starts exactly at the left edge").toBe(true);
  const before = mid.scrollLeft;
  await page.locator(`${scope} [data-rich-scroll="end"]`).tap();
  await expect.poll(async () => (await state()).scrollLeft, "the end indicator scrolls on").toBeGreaterThan(before);
  await toolbar.evaluate((el) => el.scrollTo({ left: 1e4, behavior: "instant" }));
  await expect.poll(async () => { const s = await state(); return [s.start, s.end]; }, "only the start indicator shows at the end").toEqual([true, false]);
}));
