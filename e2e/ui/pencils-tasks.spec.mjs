// Regression checks for the Pencils project cards PEN-1, PEN-4 to PEN-10
// (owner-reported mobile and workflow issues, 27 October 2026), plus the owner's
// follow-up feedback on the phone card page, history and comments. Each test
// names the card it guards.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Owner project", key: "OW" });
  const statuses = ["backlog", "todo", "in-progress", "review", "done"];
  const tasks = [];
  for (let i = 0; i < 30; i++)
    tasks.push(await store.createTask(project.id, { title: `Owner task ${i}`, status: statuses[i % 5], priority: ["low", "medium", "high"][i % 3] }));
  const spec = await store.createDocument(project.id, { title: "Spec document", body: "Notes" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const attachment = await store.attach(project.id, { name: "pixel.png", data: png.toString("base64") });
  return { project, tasks, spec, attachment };
});

const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const open = async (page, view, wait) => { await page.goto(url(view)); await page.locator(wait).first().waitFor(); };
const openTask = async (page, id) => { await page.locator(`[data-action="task-open"][data-id="${id}"]:visible`).first().click(); await page.locator("#task-form").waitFor(); };
const rect = (locator) => locator.evaluate((el) => el.getBoundingClientRect().toJSON());
const snapshot = () => app.store.snapshot(app.project.id);

// ----- PEN-5: top buttons on the phone task page -----
onDevices(["phone"], () => test("PEN-5 phone task page pane buttons keep their labels inside and do not overlap", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[0].id);
  const buttons = page.locator(".task-pane-switcher > .icon-button");
  await expect(buttons).toHaveCount(3);
  const boxes = await buttons.evaluateAll((els) => els.map((el) => ({ box: el.getBoundingClientRect().toJSON(), text: el.textContent.trim() })));
  for (const { box, text } of boxes) {
    expect(text, "pane buttons are icon-only (owner feedback after 0.19.3)").toBe("");
    expect(box.width, `button is icon-sized: ${JSON.stringify(box)}`).toBeLessThanOrEqual(48);
  }
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].box.left, "buttons do not overlap").toBeGreaterThanOrEqual(boxes[i - 1].box.right - 1);
  const closeBox = await rect(page.locator('.task-editor-head [data-action="dialog-close"]'));
  expect(closeBox.left, "close button sits clear of the pane switcher").toBeGreaterThanOrEqual(boxes[2].box.right - 1);
}));

// ----- PEN-8: no focus zoom on touch -----
onDevices(["phone"], () => test("PEN-8 every text field on touch is at least 16px so iOS does not zoom", async ({ page }) => {
  const small = async () => page.evaluate(() => [...document.querySelectorAll('input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"]), textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')]
    .filter((el) => el.getClientRects().length && !el.closest("#canvas") && parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => `${el.tagName.toLowerCase()}#${el.id || el.name || el.className}`));
  await open(page, "list", ".task-row");
  expect(await small(), "list view").toEqual([]);
  await page.locator(".mobile-view-options > summary").click();
  await page.locator(".mobile-view-options-panel").waitFor();
  expect(await small(), "view options").toEqual([]);
  await page.keyboard.press("Escape");
  await openTask(page, app.tasks[0].id);
  await page.locator("#task-form .task-description .inline-rich").waitFor();
  expect(await small(), "task editor").toEqual([]);
  await page.keyboard.press("Escape");
  await open(page, "documents", ".documents-workspace");
  expect(await small(), "documents").toEqual([]);
}));

// ----- PEN-10: only content scrolls on phones and touch screens such as iPad (owner, 30 Oct 2026) -----
onDevices(["phone", "ipad", "ipad-portrait"], () => test("PEN-10 the shell does not scroll on phones and iPad; the view content does", async ({ page }) => {
  await open(page, "list", ".task-row");
  const shell = await page.evaluate(() => ({
    bodyOverflow: getComputedStyle(document.body).overflowY,
    pageScroll: document.scrollingElement.scrollHeight - innerHeight,
    content: (() => { const c = document.querySelector("#view-content"); return c ? c.scrollHeight - c.clientHeight : -1; })(),
  }));
  expect(["hidden", "clip"], `body overflow is ${shell.bodyOverflow}`).toContain(shell.bodyOverflow);
  expect(shell.pageScroll, `page scrolls by ${shell.pageScroll}px`).toBeLessThanOrEqual(1);
  expect(shell.content, `view content scrolls (${shell.content}px)`).toBeGreaterThan(100);
  await page.evaluate(() => document.querySelector("#view-content").scrollTo(0, 400));
  expect(await page.evaluate(() => document.querySelector("#view-content").scrollTop), "content scrolled").toBeGreaterThan(300);
  await open(page, "documents", ".documents-workspace");
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight), "documents page does not scroll").toBeLessThanOrEqual(1);
  await page.goto(app.base);
  // The app reopens the last project view from the home address.
  await page.locator("#view-content > *").first().waitFor();
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight), "home page does not scroll").toBeLessThanOrEqual(1);
}));

// ----- PEN-4: card layout -----
test("PEN-4 the card key follows the title and icon pickers have no caret", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[0].id);
  const key = page.locator(".task-title-row > .title-input + .task-key");
  await expect(key, "key sits after the title").toHaveCount(1);
  await expect(key).toHaveText(app.tasks[0].key);
  await expect(page.locator(".task-picker.icon-only .task-picker-trigger > .icon"), "icon-only pickers show no dropdown arrow").toHaveCount(0);
});

onDevices(["phone"], () => test("PEN-4 the card key follows the title on phones too", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[0].id);
  const [title, key] = await Promise.all([rect(page.locator(".task-title-row .title-input")), rect(page.locator(".task-title-row .task-key"))]);
  expect(key.top >= title.top - 1 || key.left >= title.right - 1, `key is after the title: ${JSON.stringify({ title, key })}`).toBe(true);
  await expect(page.locator(".task-identity-row .task-key"), "key no longer sits under the type button").toHaveCount(0);
}));

test("PEN-4 attached images are cacheable", async () => {
  const response = await fetch(`${app.base}${app.attachment.url}`);
  expect(response.status).toBe(200);
  const cache = response.headers.get("cache-control") || "";
  expect(cache, `attachment cache header: ${cache}`).toMatch(/max-age=\d+/);
  expect(cache).not.toMatch(/no-store/);
});

test("PEN-4 a new card can be given relationships before it is saved", async ({ page }) => {
  await open(page, "list", ".task-row");
  await newCard(page);
  await page.locator("#task-form.task-create-form").waitFor();
  const host = page.locator("#task-form .task-relationships");
  await expect(host, "new card editor has a Relationships section").toHaveCount(1);
  await page.locator("#task-form [name=title]").fill("Needs a parent");
  await host.locator("[data-relationship-toggle]").click();
  const picker = page.locator("#task-relationship-picker");
  await picker.locator("select").selectOption("blocked-by");
  await picker.locator("input[type=search]").fill("Owner task 3");
  await picker.locator(`[data-relationship-add="${app.tasks[3].id}"]`).click();
  await host.locator("[data-relationship-toggle]").click();
  await picker.locator("select").selectOption("child");
  await picker.locator("input[type=search]").fill("Owner task 4");
  await picker.locator(`[data-relationship-add="${app.tasks[4].id}"]`).click();
  await expect(host.locator(".task-relationship-row"), "both staged relationships are listed").toHaveCount(2);
  await page.locator("#task-form [type=submit]").click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  await expect.poll(async () => (await snapshot()).tasks.find((t) => t.title === "Needs a parent"), "card created").toBeTruthy();
  const created = (await snapshot()).tasks.find((t) => t.title === "Needs a parent");
  expect(created.dependencies, "blocked-by saved with the new card").toEqual([app.tasks[3].id]);
  await expect.poll(async () => (await snapshot()).tasks.find((t) => t.id === app.tasks[4].id).parent, "child relationship applied after creation").toBe(created.id);
});

// ----- PEN-1: phone drawer -----
onDevices(["phone"], () => test("PEN-1 the phone drawer is compact: close beside the brand, one label style, settings at the bottom", async ({ page }) => {
  await open(page, "list", ".task-row");
  await page.locator(".mobile-menu").click();
  await page.locator(".sidebar.open").waitFor();
  const [brand, close] = await Promise.all([rect(page.locator(".sidebar .brand")), rect(page.locator(".sidebar .phone-drawer-close"))]);
  expect(close.top < brand.bottom && close.bottom > brand.top, `close button shares the brand row: ${JSON.stringify({ brand, close })}`).toBe(true);
  const labels = await page.evaluate(() => [...document.querySelectorAll(".sidebar .side-label, .sidebar .organisation-choice > span")]
    .map((el) => `${getComputedStyle(el).textTransform}/${getComputedStyle(el).fontSize}`));
  expect(labels.length, "labels found").toBeGreaterThanOrEqual(3);
  expect(new Set(labels).size, `section labels share one style: ${labels.join(", ")}`).toBe(1);
  // Since 0.19.33 views live in the bottom tab bar; the drawer lists projects and teams, with
  // Settings and Help at the bottom.
  const [teams, settings] = await Promise.all([rect(page.locator(".sidebar .sidebar-directory")), rect(page.locator(".sidebar .phone-drawer-utilities"))]);
  expect(settings.top, "settings sit below the teams").toBeGreaterThanOrEqual(teams.bottom);
  const tall = await page.evaluate(() => [...document.querySelectorAll(".sidebar .project-link, .sidebar .directory-link, .sidebar .phone-drawer-utilities .button")]
    .filter((el) => el.getBoundingClientRect().height > 48).length);
  expect(tall, "drawer rows are at most 48px tall").toBe(0);
}));

// ----- PEN-9: filters and sort on phones -----
onDevices(["phone"], () => test("PEN-9 phone view options list the filters directly and sort is its own icon button", async ({ page }) => {
  await open(page, "list", ".task-row");
  const sort = page.locator(".toolbar-left > [data-sort-menu]");
  await expect(sort, "sort icon button in the toolbar").toBeVisible();
  await expect(sort.locator(":scope > .icon"), "one icon (and a direction arrow when sorted)").toHaveCount(1);
  await sort.click();
  await expect(page.locator("#shared-select-menu"), "sort menu opens from the icon button").toContainText("Manual order");
  await page.keyboard.press("Escape");
  await page.locator(".mobile-view-options > summary").click();
  await page.locator(".mobile-view-options-panel").waitFor();
  await expect(page.locator("#filter-status"), "status filter shows without opening a Filters dropdown").toBeVisible();
  await expect(page.locator("#filter-type"), "type filter shows without opening a Filters dropdown").toBeVisible();
  await expect(page.locator(".mobile-view-options-panel details.board-menu > summary:visible"), "no Filters summary inside the panel").toHaveCount(0);
  await expect(page.locator(".mobile-view-options-panel #sort:visible"), "sort is not duplicated inside the panel").toHaveCount(0);
}));

onDevices(["phone"], () => test("the phone top bar's + button centres its icon", async ({ page }) => {
  await open(page, "list", ".task-row");
  const [box, glyph] = await page.locator(".topbar .phone-new-task > summary").evaluate((s) => [s.getBoundingClientRect(), s.querySelector(".icon").getBoundingClientRect()].map((r) => r.left + r.width / 2));
  expect(Math.abs(box - glyph)).toBeLessThanOrEqual(1);
}));

// ----- PEN-6: New offers card or document -----
test("PEN-6 the header New control offers a card or a document", async ({ page }) => {
  await open(page, "list", ".task-row");
  const summary = page.locator(".topbar .new-menu:not(.phone-new-task) > summary");
  await expect(summary).toHaveText("New");
  await summary.click();
  const items = page.locator(".topbar .new-menu:not(.phone-new-task) .new-menu-panel button");
  expect((await items.allInnerTexts()).map((t) => t.trim())).toEqual(["Card", "Document", "From template"]);
  await items.nth(1).click();
  const title = page.locator(".documents-workspace #document-form [name=title]");
  await expect(title).toHaveValue("Untitled document");
  expect(page.url(), "navigated to Documents").toContain("/documents");
  await open(page, "list", ".task-row");
  await summary.click();
  await items.nth(0).click();
  await page.locator("#task-form.task-create-form").waitFor();
});

onDevices(["phone"], () => test("PEN-6 the phone header plus opens the New menu", async ({ page }) => {
  await open(page, "list", ".task-row");
  await page.locator(".top-actions .phone-new-task > summary").click();
  await page.locator('.new-menu-panel:visible [data-action="task-new"]').waitFor();
  await expect(page.locator('.new-menu-panel:visible [data-action="document-new"]')).toHaveCount(1);
}));

// ----- PEN-7: documents linked to cards -----
test("PEN-7 a card links to documents and the document lists its cards", async ({ page }) => {
  const { tasks, spec } = app;
  await open(page, "list", ".task-row");
  await openTask(page, tasks[1].id);
  const section = page.locator("#task-form .task-documents");
  await expect(section, "task editor has a Documents section").toHaveCount(1);
  await section.locator("[data-document-link-toggle]").click();
  const picker = page.locator("#task-document-picker");
  await picker.locator("input[type=search]").fill("Spec");
  await picker.locator(`[data-document-link-add="${spec.id}"]`).click();
  await expect(section.locator(`[data-document-open="${spec.id}"]`), "linked document is listed").toHaveCount(1);
  await expect(page.locator("[data-autosave-status]")).toHaveText(/Saved/);
  await expect.poll(async () => (await snapshot()).tasks.find((t) => t.id === tasks[1].id).documents, "document id saved on the task").toEqual([spec.id]);
  await section.locator(`[data-document-open="${spec.id}"]`).click();
  await expect(page.locator(".documents-workspace #document-form [name=title]")).toHaveValue("Spec document");
  const linked = page.locator(".document-linked-cards [data-action='task-open']");
  await expect(linked, "document shows its linked card").toHaveCount(1);
  await expect(linked.first()).toContainText(tasks[1].key);
});

// ----- Owner feedback on the phone card page (27 Oct, after 0.19.3) -----
// 29 Oct: the More menu became a group of icons before a red Close, and the type button a square.
onDevices(["phone"], () => test("phone card page: icon-only pane switcher aligned with the type icon, a distinct Details icon, no status caret, actions grouped before a red Close", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[0].id);
  await expect(page.locator(".task-pane-switcher .pane-label:visible"), "pane buttons carry no text").toHaveCount(0);
  const geometry = await page.evaluate(() => {
    const centre = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const details = document.querySelector('.task-pane-switcher [data-editor-pane="details"]');
    const type = document.querySelector('[data-task-picker="type"] .task-picker-trigger');
    return {
      detailsCentre: centre(details.querySelector(".icon")), typeCentre: centre(type.querySelector(".icon")),
      detailsIcon: details.querySelector(".icon path")?.getAttribute("d"), typeIcon: type.querySelector("[data-picker-symbol] path")?.getAttribute("d"),
      widths: [...document.querySelectorAll(".task-pane-switcher > .icon-button")].map((el) => Math.round(el.getBoundingClientRect().width)),
      statusCarets: document.querySelectorAll('[data-task-picker="status"] .task-picker-trigger > .icon, .task-picker-trigger > .icon').length,
      statusBackground: [...document.querySelectorAll(".task-dialog select[data-task-color]")].map((el) => getComputedStyle(el).backgroundImage).filter((v) => v !== "none").length,
      group: (() => { const g = document.querySelector(".task-secondary-actions"); return { border: getComputedStyle(g).borderTopStyle, labels: [...g.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), beforeClose: g.closest(".task-editor-actions").nextElementSibling?.dataset.action, groupRight: g.getBoundingClientRect().right, closeLeft: document.querySelector('#task-form [data-action="dialog-close"]').getBoundingClientRect().left }; })(),
      closeColor: getComputedStyle(document.querySelector('#task-form [data-action="dialog-close"]')).color,
      deleteColor: getComputedStyle(document.querySelector('#task-form [data-action="task-delete"]')).color,
      typeBox: (() => { const r = type.getBoundingClientRect(), d = details.getBoundingClientRect(); return { width: Math.round(r.width), detailsWidth: Math.round(d.width), left: Math.round(r.left), detailsLeft: Math.round(d.left) }; })(),
      // 29 Oct: priority is a square like the assignee; the metadata row's gap is the editor's spacing.
      priorityWidth: Math.round(document.querySelector('#task-form [data-task-picker="priority"] .task-picker-trigger').getBoundingClientRect().width),
      assigneeWidth: Math.round(document.querySelector("#task-form .task-assignee-choice").getBoundingClientRect().width),
      spacing: parseFloat(getComputedStyle(document.querySelector("#task-form .task-metadata-main")).columnGap),
      fieldsRight: document.querySelector("#task-form .task-fields").getBoundingClientRect().right,
      closeRight: document.querySelector('#task-form [data-action="dialog-close"]').getBoundingClientRect().right,
    };
  });
  expect(Math.abs(geometry.detailsCentre - geometry.typeCentre), `Details icon lines up with the type icon: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(2);
  expect(geometry.detailsIcon, "Details uses its own icon").not.toBe(geometry.typeIcon);
  expect(geometry.widths.every((w) => w <= 48), `pane buttons are icon-sized: ${geometry.widths}`).toBe(true);
  expect(geometry.statusCarets, "status control shows no dropdown arrow").toBe(0);
  expect(geometry.statusBackground, "tinted selects draw no arrow").toBe(0);
  expect(geometry.group.border, "the actions form a bordered group").toBe("solid");
  expect(geometry.group.labels).toEqual(["Duplicate task", "Archive task", "Delete task"]);
  expect(geometry.group.beforeClose, "the group sits right before Close").toBe("dialog-close");
  expect(Math.abs(geometry.group.closeLeft - geometry.group.groupRight - geometry.spacing), `Close keeps the editor's spacing from the group: ${JSON.stringify(geometry.group)}`).toBeLessThanOrEqual(1);
  expect(geometry.priorityWidth, "priority is as wide as the assignee").toBe(geometry.assigneeWidth);
  // 29 Oct (item 15): assignee, status and priority share one box, which ends where Close does.
  expect(Math.abs(geometry.closeRight - geometry.fieldsRight), `the field box ends where Close ends: ${geometry.closeRight} vs ${geometry.fieldsRight}`).toBeLessThanOrEqual(1);
  expect(geometry.closeColor, "Close is red, like Delete").toBe(geometry.deleteColor);
  expect(Math.abs(geometry.typeBox.width - geometry.typeBox.detailsWidth), `the type button is as wide as the pane buttons: ${JSON.stringify(geometry.typeBox)}`).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.typeBox.left - geometry.typeBox.detailsLeft), "and lines up with them").toBeLessThanOrEqual(2);
}));

onDevices(["ipad"], () => test("double-tapping a dropdown never focuses the select or lets a double-click through", async ({ page }) => {
  await open(page, "calendar", ".calendar, .calendar-agenda");
  const label = page.locator("label:has(> #calendar-mode)");
  const box = await label.boundingBox();
  await page.evaluate(() => { window.__selectFocus = 0; document.addEventListener("focusin", (e) => { if (e.target.tagName === "SELECT") window.__selectFocus++; }, true); });
  await page.touchscreen.tap(box.x + 6, box.y + 8);
  // The gap between the two taps of a double tap.
  await page.waitForTimeout(120);
  await page.touchscreen.tap(box.x + 6, box.y + 8);
  // Proves that no select gains focus afterwards, so there is no state to wait for.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__selectFocus), "no select focus after a double tap").toBe(0);
  const prevented = await page.evaluate(() => !document.querySelector("#calendar-mode").dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })));
  expect(prevented, "a double-click on a select is cancelled before the platform picker can open").toBe(true);
}));

// ----- Owner feedback on history and comments (27 Oct, after 0.19.4) -----
onDevices(["phone"], () => test("phone history pane is left-aligned and grouped by month", async ({ page }) => {
  let t = (await snapshot()).tasks.find((task) => task.id === app.tasks[2].id);
  t = await app.store.updateTask(app.project.id, t.id, { revision: t.revision, status: "in-progress", priority: "high" });
  t = await app.store.updateTask(app.project.id, t.id, { revision: t.revision, title: `${t.title} renamed` });
  await open(page, "list", ".task-row");
  await openTask(page, t.id);
  await page.locator('.task-pane-switcher [data-editor-pane="history"]').tap();
  await page.locator(".task-history-version").first().waitFor();
  await expect.poll(() => page.locator(".task-history-version").count(), "three versions listed").toBeGreaterThanOrEqual(3);
  await page.locator(".task-history-month").first().waitFor();
  const geometry = await page.evaluate(() => {
    const panelLeft = (() => { const p = document.querySelector(".task-history-panel"); return p.getBoundingClientRect().left + parseFloat(getComputedStyle(p).paddingLeft); })();
    return {
      panelLeft,
      dates: [...document.querySelectorAll(".task-history-version > summary .task-history-date")].map((el) => Math.round(el.getBoundingClientRect().left)),
      summaries: [...document.querySelectorAll(".task-history-version > summary .task-history-summary")].map((el) => Math.round(el.getBoundingClientRect().left)),
      months: [...document.querySelectorAll(".task-history-month")].map((el) => ({ text: el.textContent.trim(), left: Math.round(el.getBoundingClientRect().left) })),
      versionsBeforeFirstMonth: (() => { const first = document.querySelector(".task-history-month"); return first ? [...document.querySelectorAll(".task-history-version")].filter((v) => v.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).length : -1; })(),
    };
  });
  expect(geometry.dates.length, "three versions listed").toBeGreaterThanOrEqual(3);
  for (const left of [...geometry.dates, ...geometry.summaries]) expect(Math.abs(left - geometry.panelLeft), `history rows start at the panel edge: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(2);
  expect(geometry.months.length, "versions are grouped under a month heading").toBeGreaterThanOrEqual(1);
  expect(geometry.months[0].text, `month heading reads like "October 2026": ${geometry.months[0].text}`).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  expect(geometry.versionsBeforeFirstMonth, "the first month heading precedes every version").toBe(0);
  expect(Math.abs(geometry.months[0].left - geometry.panelLeft), "month heading is left-aligned").toBeLessThanOrEqual(2);
}));

onDevices(["phone"], () => test("phone comment composer keeps its formatting controls on one line with a More menu", async ({ page }) => {
  await open(page, "list", ".task-row");
  await openTask(page, app.tasks[3].id);
  await page.locator('.task-pane-switcher [data-editor-pane="comments"]').tap();
  await page.locator(".comment-rich-tools").waitFor();
  const measure = () => page.evaluate(() => {
    const tools = document.querySelector(".comment-rich-tools");
    const tops = new Set([...tools.querySelectorAll("button, summary")].filter((el) => el.getClientRects().length && !el.closest(".selection-popover")).map((el) => Math.round(el.getBoundingClientRect().top)));
    return { rows: tops.size, more: !!tools.querySelector('[data-rich-scroll="end"]:not([hidden])'), width: Math.round(tools.getBoundingClientRect().width) };
  });
  await expect.poll(async () => (await measure()).more, "the toolbar scrolls sideways with an end indicator, like the description toolbar").toBe(true);
  const rows = await measure();
  expect(rows.rows, `toolbar controls sit on one line: ${JSON.stringify(rows)}`).toBe(1);
}));
