// Card section tabs (owner request F0.23-10): on desktop and iPad the card editor shows Attachments,
// Notes, Relationships, Documents and Boards as one row of tabs, one section below it at a time, with
// a count on a tab whose section holds items and the last chosen tab kept per browser; a section the
// project leaves out has no tab, and with one left there is no row. Phones keep the stacked page, and
// the card's board its panels.
import { test, expect, useApp, onDevices } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";
import { chooseCardPane } from "../helpers/card-panes.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Card tabs", key: "CT" });
  const other = await store.createTask(project.id, { title: "Other card" });
  const doc = await store.createDocument(project.id, { title: "Launch brief", body: "Brief" });
  const board = await store.createBoard(project.id, { title: "Launch canvas" });
  const full = await store.createTask(project.id, {
    title: "Everything", body: "Text\n\n![shot.png](../attachments/a-0000aaaa.png)\n",
    notes: [{ id: "n-1", body: "One" }, { id: "n-2", body: "Two" }], related_records: [other.id], documents: [doc.id], boards: [board.id],
  });
  const plain = await store.createTask(project.id, { title: "Nothing yet" });
  // Mentions the full card without linking it: listed under Documents, not counted as one of its own.
  const mention = await store.createDocument(project.id, { title: "Release notes", body: `Ships with ${full.key}.` });
  return { project, other, doc, board, full, plain, mention };
});
const PNG = [...Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")];
const tabs = (page) => page.locator("#task-form").getByRole("tablist", { name: "Card sections", exact: true });
async function open(page, card, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator("#task-form")).toBeVisible();
}

onDevices(["desktop", "ipad"], () => {
  test("the sections share one tab row: one shows, counts name what the others hold, and arrows, Home and End move along it @gate", async ({ page, device }) => {
    await open(page, app.full);
    const row = tabs(page), all = row.getByRole("tab");
    await expect(all).toHaveText(["Attachments 1", "Notes 2", "Relationships 1", "Documents 1", "Boards 1"]);
    const first = all.first();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(all.nth(1)).toHaveAttribute("tabindex", "-1");
    // Each tab controls its section, which is a tab panel named by it; only the chosen one shows.
    for (const tab of await all.all()) {
      const panel = page.locator(`#${await tab.getAttribute("aria-controls")}`);
      await expect(panel).toHaveAttribute("role", "tabpanel");
      await expect(panel).toHaveAttribute("aria-labelledby", await tab.getAttribute("id"));
      if ((await tab.getAttribute("aria-selected")) === "true") await expect(panel).toBeVisible();
      else await expect(panel).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "Preview shot.png", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Link a board", exact: true })).toBeHidden();
    // The chosen tab wears the selected-segment look of the editor's pane buttons; shared control height.
    const look = await first.evaluate((el) => { const s = getComputedStyle(el), green = getComputedStyle(document.body).getPropertyValue("--green"); const probe = document.createElement("i"); probe.style.color = green; document.body.append(probe); const accent = getComputedStyle(probe).color; probe.remove(); return { color: s.color, border: s.borderTopColor, accent, height: el.getBoundingClientRect().height }; });
    expect(look.color).toBe(look.accent);
    expect(look.border).toBe(look.accent);
    expect(look.height).toBe(device === "desktop" ? 32 : 44);
    const other = await all.nth(1).evaluate((el) => getComputedStyle(el).color);
    expect(other).not.toBe(look.accent);
    // Arrow keys move along the row and show that section; Home and End jump to the ends, wrapping round.
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(all.nth(1)).toBeFocused();
    await expect(all.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "New note", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview shot.png", exact: true })).toBeHidden();
    await page.keyboard.press("End");
    await expect(all.last()).toBeFocused();
    await expect(page.getByRole("button", { name: "Link a board", exact: true })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(first).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(all.last()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#task-form")).toBeVisible();
    // Documents counts the card's own links; a document that only mentions it is listed but not counted.
    await all.nth(3).click();
    await expect(page.locator("#task-form .task-documents [data-document-mentions]")).toContainText("Release notes");
    await expect(all.nth(3)).toHaveText("Documents 1");
  });

  // Owner request (F0.23-23): each section's controls sit on the tab row, after the tabs, and every
  // section's content starts the same distance below it; no divider separates the tags, the
  // description and the tabs (F0.23-21).
  test("the chosen section's controls share the tab row, and every section starts its content at the same place @gate", async ({ page }) => {
    await open(page, app.plain);
    const form = page.locator("#task-form"), all = tabs(page).getByRole("tab");
    for (const part of [".task-metadata", ".task-description"]) await expect(form.locator(part)).toHaveCSS("border-bottom-width", "0px");
    const measure = (panel) => panel.evaluate((el) => {
      const list = el.querySelector('[role="tablist"]'), row = list.getBoundingClientRect(), middle = (r) => r.top + r.height / 2;
      const head = list.parentElement;
      const controls = [...head.querySelectorAll(":scope > button, :scope > details > summary, :scope > [role=group] > button")].filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect());
      // The first thing the section shows: a note, or else its first line of text.
      const card = el.querySelector(".task-note-card");
      let first = card?.getClientRects().length ? card : null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node; !first && (node = walker.nextNode()); ) if (!head.contains(node) && node.textContent.trim() && node.parentElement.getClientRects().length) first = node.parentElement;
      return { inRow: controls.length > 0 && controls.every((r) => Math.abs(middle(r) - middle(row)) <= 2 && r.left >= row.right), gap: Math.round(first.getBoundingClientRect().top - Math.max(row.bottom, ...controls.map((r) => r.bottom))),
        // The row itself stays put as the tabs change.
        row: Math.round(row.top - el.closest("form").querySelector(".task-description").getBoundingClientRect().bottom) };
    });
    const gaps = {}, rows = {};
    for (const name of ["Attachments", "Relationships", "Documents", "Boards"]) {
      const tab = all.filter({ hasText: name });
      await tab.click();
      const panel = page.locator(`#${await tab.getAttribute("aria-controls")}`);
      await expect(panel).toBeVisible();
      const m = await measure(panel);
      expect(m.inRow, name).toBe(true);
      gaps[name] = m.gap;
      rows[name] = m.row;
    }
    // A note starts where the empty sections' text does.
    await open(page, app.full);
    const notes = all.filter({ hasText: "Notes" });
    await notes.click();
    const m = await measure(page.locator(`#${await notes.getAttribute("aria-controls")}`));
    expect(m.inRow, "Notes").toBe(true);
    gaps.Notes = m.gap;
    rows.Notes = m.row;
    expect(new Set(Object.values(gaps)).size, JSON.stringify(gaps)).toBe(1);
    expect(new Set(Object.values(rows)).size, JSON.stringify(rows)).toBe(1);
  });

  // The tabs sit inside the chosen section, whose own handlers must not take a tab for one of their buttons.
  test("switching tabs saves nothing, whichever section holds the row", async ({ page }) => {
    await open(page, app.plain);
    const writes = [];
    // Opening the card records a visit; nothing else may write.
    page.on("request", (request) => { if (request.method() !== "GET" && !request.url().endsWith("/api/visits")) writes.push(`${request.method()} ${request.url()}`); });
    const all = tabs(page).getByRole("tab");
    for (const name of ["Relationships", "Documents", "Boards", "Notes", "Attachments", "Relationships", "Notes", "Relationships"]) {
      await all.filter({ hasText: name }).click();
      await expect(all.filter({ hasText: name })).toHaveAttribute("aria-selected", "true");
    }
    // Relationships shows again with nothing said: no tab was taken for one of its buttons.
    await expect(page.locator("#task-form .task-relationship-sort > summary")).toBeVisible();
    await expect(page.locator("#task-form [data-relationship-status]")).toBeHidden();
    expect(writes).toEqual([]);
  });
});

test("the last chosen tab opens again, on any card that has it, and a card without it opens on its first", async ({ page }) => {
  await open(page, app.full);
  await tabs(page).getByRole("tab", { name: /^Relationships/ }).click();
  await page.reload();
  await page.locator(`[data-action="task-open"][data-id="${app.full.id}"]:visible`).first().click();
  await expect(tabs(page).getByRole("tab", { name: /^Relationships/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Add relationship", exact: true })).toBeVisible();
  // A tab with nothing in it shows no count.
  await open(page, app.plain);
  await expect(tabs(page).getByRole("tab")).toHaveText(["Attachments", "Notes", "Relationships", "Documents", "Boards"]);
  await expect(tabs(page).getByRole("tab", { name: "Relationships", exact: true })).toHaveAttribute("aria-selected", "true");
  // Chosen again later: a new card shows the same tab.
  await page.keyboard.press("Escape");
  await newCard(page);
  await expect(tabs(page).getByRole("tab", { name: "Relationships", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("a count follows the section as items are added", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Counting" });
  await open(page, card);
  const notes = tabs(page).getByRole("tab", { name: /^Notes/ });
  await notes.click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(notes).toHaveText("Notes 1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(notes).toHaveText("Notes 2");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("button", { name: "Delete note", exact: true }).last().click();
  await expect(notes).toHaveText("Notes 1");
});

test("a file pasted into the description, or dropped on the card, shows the Attachments tab", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Paste shows attachments", body: "Before" });
  await open(page, card);
  await tabs(page).getByRole("tab", { name: /^Boards/ }).click();
  await page.locator('#task-form .task-description [contenteditable="true"]').evaluate((el, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }));
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, PNG);
  await expect(tabs(page).getByRole("tab", { name: /^Attachments/ })).toHaveAttribute("aria-selected", "true");
  await expect(tabs(page).getByRole("tab", { name: /^Attachments/ })).toHaveText("Attachments 1");
  await expect(page.getByRole("button", { name: /^Preview Pasted image \d{14}\.png$/ })).toBeVisible();
  // Typing stays in the description.
  await expect(page.locator('#task-form .task-description [contenteditable="true"]')).toBeFocused();
  await tabs(page).getByRole("tab", { name: /^Notes/ }).click();
  await page.locator("#task-form").evaluate((form, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    const target = form.querySelector(".task-title-row");
    for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
  }, PNG);
  await expect(tabs(page).getByRole("tab", { name: /^Attachments/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Preview dropped.png", exact: true })).toBeVisible();
});

test("a section the project leaves out has no tab, and the New card form leaves out its own parts", async ({ page }) => {
  const project = await app.store.createProject({ title: "Fewer tabs", key: "FT", schema: { off: ["notes"], views_off: ["documents"], create_off: ["attachments", "relationships"] } });
  const card = await app.store.createTask(project.id, { title: "Few sections" });
  await open(page, card, project);
  await expect(tabs(page).getByRole("tab")).toHaveText(["Attachments", "Relationships", "Boards"]);
  // Its heading left to the tab, an empty Attachments tab says so.
  await expect(page.getByRole("tabpanel", { name: "Attachments", exact: true })).toContainText("No attachments.");
  await page.keyboard.press("Escape");
  // The New card form shows only Boards of these: one section, so no tab row.
  await newCard(page);
  await expect(page.locator("#task-form.task-create-form")).toBeVisible();
  await expect(page.locator("#task-form").getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Boards", exact: true })).toBeVisible();
});

onDevices(["phone"], () => {
  test("phones keep the sections stacked on the card page, with no tabs", async ({ page }) => {
    await open(page, app.full);
    await expect(page.locator("#task-form").getByRole("tablist")).toHaveCount(0);
    await expect(page.locator("#task-form .task-section-tabs")).toHaveCSS("display", "none");
    for (const name of ["Attachments", "Notes", "Relationships", "Documents", "Boards"])
      await expect(page.getByRole("region", { name, exact: true })).toBeAttached();
    await expect(page.locator("#task-form .task-description > .task-attachments")).toHaveCount(1);
  });
});

test("the card's board shows every section as its own panel, and tabs return with the details", async ({ page }) => {
  await open(page, app.full);
  await chooseCardPane(page, "board");
  await expect(page.locator("#task-form").getByRole("tablist")).toHaveCount(0);
  await expect(page.locator("#task-form .task-section-tabs")).toHaveCSS("display", "none");
  for (const name of ["Notes", "Relationships", "Documents", "Boards"])
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  await expect(page.locator("#task-form .task-description > .task-attachments")).toBeVisible();
  await chooseCardPane(page, "details");
  await expect(tabs(page)).toBeVisible();
  await expect(page.locator("#task-form .task-description > .task-attachments")).toHaveCount(0);
});
