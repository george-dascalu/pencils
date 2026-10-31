// One type scale for the card popup (details, comments, history) and the Table
// view, from the font-size assessment of 28 October 2026. Desktop and touch
// each use five steps: meta, small, body, section and title. Touch body text
// stays at 16px because smaller editable text makes iOS zoom on focus.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Type scale", key: "TS" });
  const statuses = ["backlog", "todo", "in-progress", "review", "done"];
  const tasks = [];
  for (let i = 0; i < 6; i++)
    tasks.push(await store.createTask(project.id, { title: `Scale task ${i}`, status: statuses[i % 5], priority: ["low", "medium", "high"][i % 3], assignee: i % 2 ? "George Dascalu" : "", start: "2026-11-01", due: "2026-11-12", tags: ["design"], body: "Body with **bold** and a [link](https://example.com).\n\n- one\n- two" }));
  await store.createTask(project.id, { title: "Child task", status: "todo", parent: tasks[0].id });
  const first = (await store.snapshot(project.id)).tasks.find((t) => t.id === tasks[0].id);
  await store.updateTask(project.id, first.id, { revision: first.revision, comments: [{ id: "c1", text: "Posted comment text", author: "George", created: "2026-10-27T10:00:00.000Z" }] });
  const headed = await store.createTask(project.id, { title: "Headed notes", status: "todo", body: "# Heading one\n\n## Heading two\n\n### Heading three\n\nBody text" });
  return { project, tasks, headed };
});

const SCALE = {
  desktop: { meta: 11, small: 12, body: 13, section: 14, title: 20, table: 12, tableTitle: 13, tableHeader: 12, initials: 10 },
  touch: { meta: 12, small: 14, body: 16, section: 16, title: 18, table: 16, tableTitle: 16, tableHeader: 14, initials: 10 },
};
const scaleFor = (device) => SCALE[device === "desktop" ? "desktop" : "touch"];
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const px = (page, selector) => page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
const weight = (page, selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontWeight);

async function openCard(page, pane) {
  await page.goto(url("list"));
  await page.locator(".task-row").first().waitFor();
  await page.locator(`[data-action="task-open"][data-id="${app.tasks[0].id}"]:visible`).first().click();
  await page.locator("#task-form .task-description .inline-rich").waitFor();
  if (pane) {
    await page.locator(`[data-editor-pane="${pane}"]`).click();
    await page.locator(pane === "comments" ? ".task-comments-panel .comment-body" : ".task-history-panel .task-history-change").first().waitFor();
  }
}
async function openTable(page) {
  await page.goto(url("table"));
  await page.locator(".spreadsheet [data-table-task]").first().waitFor();
}
// Visible text people can read: skips screen-reader-only text, opacity-0 overlays,
// decorative aria-hidden glyphs and intentionally textless dots (font-size 0).
async function smallestText(page, scope) {
  return page.evaluate((scope) => {
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.closest(".sr-only, [aria-hidden='true'], option")) return false;
      for (let n = el; n && n !== document; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.opacity === "0" || cs.visibility === "hidden") return false; }
      return true;
    };
    const found = [];
    for (const root of document.querySelectorAll(scope)) for (const el of root.querySelectorAll("*")) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || !shown(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size === 0) continue;
      found.push({ size, initials: el.classList.contains("task-assignee"), text: `${el.className || el.tagName}: ${el.textContent.trim().slice(0, 24)}` });
    }
    return found;
  }, scope);
}

onDevices(["desktop", "ipad", "phone"], (device) => {
  const s = scaleFor(device);

  test("card section headings share one size and weight", async ({ page }) => {
    await openCard(page);
    for (const selector of [".task-relationships .task-relationships-heading h3", ".task-documents .task-relationships-heading h3"]) {
      expect(await px(page, selector), `${selector} size`).toBe(s.section);
      expect(await weight(page, selector), `${selector} weight`).toBe("600");
    }
    await page.locator('[data-editor-pane="comments"]').click();
    await page.locator(".board-comments-head").first().waitFor();
    expect(await px(page, ".task-comments-panel .board-comments-head > strong"), "Comments heading size").toBe(s.section);
    expect(await weight(page, ".task-comments-panel .board-comments-head > strong")).toBe("600");
    await page.locator('[data-editor-pane="history"]').click();
    await page.locator(".task-history-head h3").waitFor();
    expect(await px(page, ".task-history-head h3"), "Version history heading size").toBe(s.section);
    expect(await weight(page, ".task-history-head h3")).toBe("600");
  });

  test("card subsection headings share one style", async ({ page }) => {
    await openCard(page);
    const children = { size: await px(page, ".task-relationship-group > h4"), weight: await weight(page, ".task-relationship-group > h4") };
    await page.locator('[data-editor-pane="history"]').click();
    await page.locator(".task-history-month").waitFor();
    const month = { size: await px(page, ".task-history-month"), weight: await weight(page, ".task-history-month") };
    expect(children, "Children heading").toEqual({ size: s.small, weight: "600" });
    expect(month, "month heading matches Children").toEqual(children);
  });

  test("card body text shares one size and the title stays largest", async ({ page }) => {
    await openCard(page);
    const sizes = {
      title: await px(page, '#task-form [name="title"]'),
      description: await px(page, "#task-form .task-description .inline-rich"),
      status: await px(page, '#task-form select[name="status"]'),
      start: await px(page, '#task-form input[name="start"]'),
      due: await px(page, '#task-form input[name="due"]'),
      relationship: await px(page, ".task-relationship-title"),
    };
    expect(sizes.title, `title ${JSON.stringify(sizes)}`).toBe(s.title);
    for (const key of ["description", "status", "start", "due"]) expect(sizes[key], `${key} ${JSON.stringify(sizes)}`).toBe(s.body);
    // On phones relationship rows match the List rows' phone title instead (owner request, 30 Oct).
    const listTitle = device === "phone" ? 14 : s.body;
    expect(sizes.relationship, `relationship ${JSON.stringify(sizes)}`).toBe(listTitle);
    await page.locator('[data-editor-pane="comments"]').click();
    await page.locator(".task-comments-panel .comment-body").first().waitFor();
    expect(await px(page, ".task-comments-panel .comment-body"), "posted comment matches the description").toBe(s.body);
    expect(await px(page, ".task-comments-panel .comment-author"), "comment author").toBe(s.small);
    expect(await px(page, ".task-comments-panel .comment-footer time"), "comment time").toBe(s.meta);
  });

  test("card meta text uses the meta step", async ({ page }) => {
    await openCard(page);
    expect(await px(page, "#task-form .task-key"), "header key").toBe(s.meta);
    expect(await px(page, ".task-relationship-key"), "relationship key").toBe(s.meta);
    await page.locator('[data-editor-pane="history"]').click();
    await page.locator(".task-history-panel .task-history-change").first().waitFor();
    expect(await px(page, ".task-history-date time"), "history time").toBe(s.meta);
    expect(await px(page, ".task-history-summary"), "history summary").toBe(s.meta);
    const labels = await page.locator(".task-history-change :is(h4, .task-history-before > strong, .task-history-after > strong, .task-history-before > div, .task-history-after > div)").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(labels.length >= 3 && labels.every((v) => v === s.small), `history change text uses one size: ${labels}`).toBe(true);
  });

  test("no card text falls below the floor", async ({ page }) => {
    for (const pane of [null, "comments", "history"]) {
      await openCard(page, pane);
      const text = await smallestText(page, "dialog.task-dialog");
      const low = text.filter((t) => t.size < (t.initials ? s.initials : s.meta));
      expect(low.map((t) => `${t.text} ${t.size}px`), `${pane || "details"} pane`).toEqual([]);
    }
  });

  test("table text uses one body size, a title step and readable headers", async ({ page }) => {
    await openTable(page);
    const row = `[data-table-task="${app.tasks[1].id}"]`;
    const sizes = await page.evaluate((row) => {
      const size = (el) => el && parseFloat(getComputedStyle(el).fontSize);
      const r = document.querySelector(row);
      return {
        header: size(document.querySelector(".spreadsheet .table-column-name")),
        value: size(r.querySelector(".table-cell-value")),
        description: size(r.querySelector(".table-description")),
        inputs: [...r.querySelectorAll('input[data-task-field]:not([data-task-field="title"])')].map(size),
        title: size(r.querySelector('input[data-task-field="title"]')),
      };
    }, row);
    expect(sizes.header, `headers ${JSON.stringify(sizes)}`).toBe(s.tableHeader);
    expect(sizes.value, `cell values ${JSON.stringify(sizes)}`).toBe(s.table);
    expect(sizes.description, `description ${JSON.stringify(sizes)}`).toBe(s.table);
    expect(sizes.inputs.length && sizes.inputs.every((v) => v === s.table), `inputs ${JSON.stringify(sizes)}`).toBeTruthy();
    expect(sizes.title, `title ${JSON.stringify(sizes)}`).toBe(s.tableTitle);
    // Since 0.19.31 the Table has no bottom "+ New card" row; New in the top bar creates cards.
    await expect(page.locator(".add-row")).toHaveCount(0);
    const text = await smallestText(page, "#view-content .spreadsheet");
    const low = text.filter((t) => t.size < (t.initials ? s.initials : s.meta));
    expect(low.map((t) => `${t.text} ${t.size}px`), "no table text below the floor").toEqual([]);
  });
});

onDevices(["phone"], () => test("phone table: the key opens the card, no separate open button", async ({ page }) => {
  await openTable(page);
  const row = page.locator(`[data-table-task="${app.tasks[1].id}"]`);
  await expect(row.locator(".table-open:visible"), "no open button on the phone").toHaveCount(0);
  const key = row.locator(".phone-table-key");
  const title = row.locator('input[data-task-field="title"]');
  const k = await key.boundingBox(), t = await title.boundingBox();
  expect(k.height, `key keeps a 44px target: ${k.height}`).toBeGreaterThanOrEqual(44);
  expect(Math.abs(k.y + k.height / 2 - (t.y + t.height / 2)), "key sits on the title line").toBeLessThanOrEqual(2);
  expect(t.width, `title has room: ${t.width}`).toBeGreaterThanOrEqual(220);
  expect((await row.boundingBox()).height, "one-line phone rows").toBeLessThanOrEqual(56);
  await key.click();
  await page.locator(`#task-form[data-id="${app.tasks[1].id}"]`).waitFor();
}));

test("desktop table keeps its open button", async ({ page }) => {
  await openTable(page);
  await expect(page.locator(`[data-table-task="${app.tasks[1].id}"] .table-open`)).toBeVisible();
  await expect(page.locator(".phone-table-key:visible")).toHaveCount(0);
});

// Owner request (T17, 31 October 2026): headings in a card's description stay close to its text's
// size: 1.3, 1.15 and 1.05 times the text, smaller headings at the text's own size.
onDevices(["desktop", "phone"], () => test("description headings stay close to the text's size", async ({ page, device }) => {
  await page.goto(url("list"));
  await page.locator(`[data-action="task-open"][data-id="${app.headed.id}"]:visible`).first().click();
  const editor = page.locator("#task-form .task-description .inline-rich");
  await editor.locator("h1").waitFor();
  const measure = (root) => root.evaluate((el) => Object.fromEntries(["h1", "h2", "h3", "p"].map((tag) => [tag, parseFloat(getComputedStyle(el.querySelector(tag)).fontSize)]).concat([["weight", getComputedStyle(el.querySelector("h1")).fontWeight]])));
  // The editor and its preview show headings alike.
  for (const [name, root] of [["editor", editor], ["preview", page.locator("#task-form #markdown-preview")]]) {
    if (name === "preview") {
      await page.locator("#task-form [data-rich-preview]").click();
      await root.locator("h1").waitFor();
    }
    const sizes = await measure(root);
    if (name === "editor") expect(sizes.p, `${device}: the text keeps the body size`).toBe(scaleFor(device).body);
    expect(sizes.h1 / sizes.p, `${device} ${name}: ${JSON.stringify(sizes)}`).toBeCloseTo(1.3, 2);
    expect(sizes.h2 / sizes.p).toBeCloseTo(1.15, 2);
    expect(sizes.h3 / sizes.p).toBeCloseTo(1.05, 2);
    expect(sizes.weight).toBe("600");
  }
}));
