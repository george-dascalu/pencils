// Regression checks for the 27 October 2026 UI/UX assessment
// (reports/2026-10-27-ui-ux-assessment.md). Each test names the finding it guards,
// grouped as in the report. An audit (tag @audit): it reports findings rather than
// guarding a change, so it runs only with `npx playwright test --project=audit`.
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Assessment project", key: "UX" });
  const statuses = ["backlog", "todo", "in-progress", "review", "done"];
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  for (let i = 0; i < 12; i++)
    await store.createTask(project.id, {
      title: `Assessment task ${i} with a reasonably long title to measure truncation`,
      status: statuses[i % statuses.length],
      start: day(i - 3), due: day(i + 4), assignee: i % 2 ? "George" : "",
      priority: ["low", "medium", "high"][i % 3],
    });
  await store.createDocument(project.id, { title: "Long document", body: `# Heading\n\n${"Paragraph text for measuring the editor width. ".repeat(120)}` });
  const bigProject = await store.createProject({ title: "Big project", key: "BIG" });
  for (let i = 0; i < 130; i++) await store.createTask(bigProject.id, { title: `Big task ${i}`, status: "todo" });
  return { project, bigProject, board: (await store.snapshot(project.id)).boards[0] };
});

const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const open = async (page, view, wait) => { await page.goto(url(view)); await page.locator(wait).first().waitFor(); };
const openBoard = (page) => open(page, `board/${app.board.id}`, "#canvas");
const rect = (page, selector, nth = 0) => page.locator(selector).nth(nth).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; });
// The saved appearance, applied before the app starts.
const dark = (page) => page.addInitScript(() => { try { localStorage.setItem("pencils:appearance", JSON.stringify({ theme: "dark" })); } catch {} });
const openFirstTask = async (page) => {
  await open(page, "list", ".task-row");
  await page.locator('.task-row [data-action="task-open"]:visible').first().click();
  await page.locator("#task-form").waitFor();
};
const settled = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test.describe("Group 1: tablet layout (findings 1–7)", { tag: "@audit" }, () => {
  onDevices(["ipad"], () => {
    test("list rows fit the main column on iPad landscape with the sidebar", async ({ page }) => {
      await open(page, "list", ".task-row");
      const widths = await page.evaluate(() => { const v = document.querySelector("#view-content"); return [v.scrollWidth, v.clientWidth, Math.max(...[...document.querySelectorAll(".task-row")].map((r) => r.getBoundingClientRect().right)), innerWidth]; });
      expect(widths[0], `list content ${widths[0]} wider than column ${widths[1]}`).toBeLessThanOrEqual(widths[1] + 1);
      expect(widths[2], `row right edge ${widths[2]} beyond viewport ${widths[3]}`).toBeLessThanOrEqual(widths[3] + 1);
    });
    test("calendar month grid fits on iPad landscape with the sidebar", async ({ page }) => {
      await open(page, "calendar", ".calendar, .calendar-agenda");
      const layout = page.locator("select[name='calendar-layout'], #calendar-layout").first();
      if (await layout.count()) await layout.selectOption("month").catch(() => {});
      await page.locator(".calendar").first().waitFor();
      const w = await page.locator(".calendar-scroll").first().evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(w[0], `calendar ${w[0]} wider than its container ${w[1]}`).toBeLessThanOrEqual(w[1] + 1);
    });
  });
  onDevices(["ipad-portrait"], () => {
    test("documents editor keeps at least 500px on iPad portrait with the sidebar", async ({ page }) => {
      await open(page, "documents", ".documents-workspace");
      const link = page.locator(".document-link").first();
      if (!(await link.isVisible())) await page.locator('[data-document-action="browse"]').first().click();
      await link.click();
      await page.locator(".document-editor").first().waitFor();
      await expect.poll(async () => (await rect(page, ".document-editor")).width, "editor width").toBeGreaterThanOrEqual(500);
    });
    test("settings content keeps at least 480px on iPad portrait with the sidebar", async ({ page }) => {
      await open(page, "settings/general", ".settings-content");
      const r = await rect(page, ".settings-content");
      expect(r.width, `settings content width ${r.width}`).toBeGreaterThanOrEqual(480);
    });
  });
  onDevices(["phone"], () => {
    test("viewport meta opts into the safe area", async ({ page }) => {
      await open(page, "list", ".task-row");
      expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]').content)).toMatch(/viewport-fit=cover/);
    });
    test("settings save footer never covers the last control on a phone", async ({ page }) => {
      await open(page, "settings/workflow", "#settings-panel .dialog-foot");
      await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector(".main")?.scrollTo(0, 1e6); document.querySelector("#view-content")?.scrollTo(0, 1e6); });
      await settled(page);
      const [lastBottom, footTop] = await page.evaluate(() => {
        const foot = document.querySelector("#settings-panel .dialog-foot");
        const body = foot.parentElement.querySelector(".settings-page-body, .dialog-body") || foot.previousElementSibling;
        const controls = [...body.querySelectorAll("button, input, select, textarea, summary")].filter((el) => el.getBoundingClientRect().height);
        const last = controls[controls.length - 1];
        return [last.getBoundingClientRect().bottom, foot.getBoundingClientRect().top];
      });
      expect(lastBottom, `last control bottom ${lastBottom} is under the footer top ${footTop}`).toBeLessThanOrEqual(footTop + 1);
    });
    test("phone kanban shows the edge of the next column", async ({ page }) => {
      await open(page, "kanban", ".kanban-column");
      const first = await rect(page, "#view-content > .kanban > .kanban-column", 0);
      const second = await rect(page, "#view-content > .kanban > .kanban-column", 1);
      expect(first.right, `first column right ${first.right} fills the viewport`).toBeLessThan(390 - 8);
      expect(second.left, `second column left ${second.left} is offscreen`).toBeLessThan(390 - 8);
    });
  });
});

const rgb = (value) => { const parts = (value.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number); return value.startsWith("color(") ? parts.map((v) => v * 255) : parts; };
const distance = (a, b) => rgb(a).reduce((sum, v, i) => sum + Math.abs(v - rgb(b)[i]), 0);
const tints = (page, selector) => page.evaluate((selector) => { const seen = new Map(); for (const el of document.querySelectorAll(selector)) { const key = el.style.getPropertyValue("--task-field-color"); if (!seen.has(key)) seen.set(key, getComputedStyle(el).backgroundColor); } return [...seen.values()]; }, selector);

test.describe("Group 2: dark theme and tokens (findings 8–12, 15)", { tag: "@audit" }, () => {
  test("board minimap is painted with theme colours in dark mode", async ({ page }) => {
    await dark(page);
    await openBoard(page);
    const corner = () => page.evaluate(() => { const c = document.querySelector("#canvas-minimap canvas"); const d = c.getContext("2d").getImageData(2, 2, 1, 1).data; return [d[0], d[1], d[2], d[3]]; });
    await expect.poll(async () => { const pixel = await corner(); return pixel[3] === 0 || pixel[0] + pixel[1] + pixel[2] < 300; }, "minimap corner pixel is dark or transparent").toBe(true);
  });
  test("error toasts stay distinct from ordinary toasts in dark mode", async ({ page }) => {
    await dark(page);
    await open(page, "list", ".task-row");
    const [plain, error] = await page.evaluate(() => { const host = document.querySelector("#toasts"); const a = document.createElement("div"); a.className = "toast"; const b = document.createElement("div"); b.className = "toast error"; host.append(a, b); return [getComputedStyle(a).backgroundColor, getComputedStyle(b).backgroundColor]; });
    expect(distance(plain, error), `toast ${plain} vs error ${error}`).toBeGreaterThan(40);
  });
  test("border and danger tokens resolve on the root in both themes", async ({ page }) => {
    await open(page, "list", ".task-row");
    const read = () => page.evaluate(() => { const s = getComputedStyle(document.documentElement); return [s.getPropertyValue("--border").trim(), s.getPropertyValue("--danger").trim(), s.getPropertyValue("--shadow-popover").trim()]; });
    const light = await read();
    expect(light.every(Boolean), `missing tokens in light: ${light}`).toBe(true);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    const dark = await read();
    expect(dark.every(Boolean) && dark[1] !== light[1], `dark danger ${dark[1]} should differ from ${light[1]}`).toBe(true);
  });
  test("calendar cards keep distinct status tints in dark mode", async ({ page }) => {
    await dark(page);
    await open(page, "calendar", ".calendar, .calendar-agenda");
    const backgrounds = await tints(page, ".calendar-task");
    expect(backgrounds.length, `need two statuses, got ${backgrounds}`).toBeGreaterThanOrEqual(2);
    expect(distance(backgrounds[0], backgrounds[1]), `tints too close: ${backgrounds[0]} vs ${backgrounds[1]}`).toBeGreaterThan(24);
  });
  test("timeline bars keep distinct status tints in dark mode", async ({ page }) => {
    await dark(page);
    await open(page, "timeline", ".task-timeline");
    const backgrounds = await tints(page, ".timeline-bar");
    expect(backgrounds.length, `need two statuses, got ${backgrounds}`).toBeGreaterThanOrEqual(2);
    expect(distance(backgrounds[0], backgrounds[1]), `tints too close: ${backgrounds[0]} vs ${backgrounds[1]}`).toBeGreaterThan(24);
  });
  onDevices(["phone"], () => test("secondary text on phones is at least 12px", async ({ page }) => {
    const small = [];
    for (const [view, wait] of [["list", ".task-row"], ["table", ".spreadsheet"], ["kanban", ".kanban-column"]]) {
      await open(page, view, wait);
      small.push(...await page.evaluate((view) => { const out = []; for (const el of document.querySelectorAll(".main *")) { if (el.closest("svg, .sidebar")) continue; let text = false; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { text = true; break; } if (!text) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; const size = parseFloat(getComputedStyle(el).fontSize); const floor = el.classList.contains("task-assignee") ? 10 : 12; if (size < floor - 0.1) out.push(`${view} ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} ${size}px "${el.textContent.trim().slice(0, 16)}"`); } return [...new Set(out)]; }, view));
    }
    expect(small.slice(0, 12), `small text: ${small.length} elements`).toEqual([]);
  }));
});

const smallTargets = (page, scope = ".main, #dialogs", min = 44) => page.evaluate(([scope, min]) => {
  const out = [];
  for (const root of document.querySelectorAll(scope)) for (const el of root.querySelectorAll('button, summary, a[href], [role="button"], input[type="checkbox"], select')) {
    if (el.closest("#canvas, .calendar-resize, .markdown, .canvas-markdown, .document-prose, svg")) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === "hidden") continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const target = el.closest("label, .check-button") || (el.matches(".kanban-card .task-title") ? el.closest(".kanban-card") : null) || el;
    const t = target.getBoundingClientRect();
    if (t.width < min - 0.5 || t.height < min - 0.5) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} ${Math.round(t.width)}x${Math.round(t.height)} "${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 24)}"`);
  }
  return [...new Set(out)];
}, [scope, min]);

test.describe("Group 3: touch targets and axe (findings 13–14)", { tag: "@audit" }, () => {
  onDevices(["phone"], () => {
    test("kanban, timeline and capacity targets are at least 44px on phones", async ({ page }) => {
      const small = [];
      for (const [view, wait] of [["kanban", ".kanban-column"], ["timeline", ".task-timeline"], ["capacity", ".capacity-view"]]) {
        await open(page, view, wait);
        small.push(...(await smallTargets(page)).map((x) => `${view}: ${x}`));
      }
      expect(small.slice(0, 12), `${small.length} small targets: ${small.join(" | ")}`).toEqual([]);
    });
    test("people, workflow and automation targets are at least 44px on phones", async ({ page }) => {
      const small = [];
      await page.goto(`${app.base}/#organisation/${app.project.organisation}/people`);
      await page.locator(".main .directory-page").waitFor();
      small.push(...(await smallTargets(page)).map((x) => `people: ${x}`));
      for (const section of ["workflow", "automation"]) {
        await open(page, `settings/${section}`, "#settings-panel");
        await page.locator(".settings-loading").waitFor({ state: "detached" });
        small.push(...(await smallTargets(page)).map((x) => `${section}: ${x}`));
      }
      expect(small.slice(0, 12), `${small.length} small targets: ${small.join(" | ")}`).toEqual([]);
    });
    test("task comment formatting buttons are at least 44px on phones", async ({ page }) => {
      await openFirstTask(page);
      await page.getByRole("button", { name: /comments/i }).first().click();
      await page.locator("#board-comment-form").waitFor();
      const small = await smallTargets(page, "#board-comment-form");
      expect(small, `${small.length} small comment controls: ${small.join(" | ")}`).toEqual([]);
    });
  });
  test("table row checkboxes offer a 24px target on desktop", async ({ page }) => {
    await open(page, "table", ".spreadsheet");
    const sizes = await page.evaluate(() => [...document.querySelectorAll(".spreadsheet input[type=checkbox]")].slice(0, 3).map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    expect(sizes.length && sizes.every(([w, h]) => w >= 24 && h >= 24), `checkbox sizes ${JSON.stringify(sizes)}`).toBeTruthy();
  });
  test("axe finds no contrast, target or scroll-region issues on key pages", async ({ page }) => {
    const found = [];
    for (const [name, path, wait] of [["home", `${app.base}/#home`, ".organisation-overview"], ["org", `${app.base}/#organisation/${app.project.organisation}/home`, ".organisation-overview"], ["list", url("list"), ".task-row"], ["table", url("table"), ".spreadsheet"], ["kanban", url("kanban"), ".kanban-column"], ["documents", url("documents"), ".documents-workspace"]]) {
      await page.goto(path);
      await page.locator(wait).first().waitFor();
      if (name === "documents") { const link = page.locator(".document-link").first(); if (await link.count()) { await link.click(); await page.locator(".document-editor .cm-content").first().waitFor(); } }
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      for (const v of res.violations) found.push(`${name}: ${v.id} ×${v.nodes.length} (${v.nodes[0].target.join(" ")})`);
    }
    expect(found, `axe: ${found.join(" | ")}`).toEqual([]);
  });
});

const visibleText = (page, scope = ".main, #dialogs") => page.evaluate((scope) => [...document.querySelectorAll(scope)].map((el) => el.innerText).join("\n"), scope);
const banned = /New row|Add task\b|Add a task|Create task|Quick capture task|Canvas gallery|New canvas|Delete canvas|Select canvas|Remove connector|Name this canvas|Pen preferences|More pen settings/;

test.describe("Group 4: vocabulary and controls (findings 17–22)", { tag: "@audit" }, () => {
  test("creation and board actions use one vocabulary", async ({ page }) => {
    const hits = [];
    const scan = async (label, scope) => hits.push(...(await visibleText(page, scope)).split("\n").filter((l) => banned.test(l)).map((l) => `${label}: ${l}`));
    await open(page, "table", ".spreadsheet"); await scan("table");
    await open(page, "kanban", ".kanban-column"); await scan("kanban");
    await open(page, "board/gallery", ".drawing-gallery"); await scan("gallery");
    await openBoard(page); await scan("board");
    await open(page, "list", ".task-row");
    await newCard(page);
    await page.locator("#task-form").waitFor();
    await scan("editor", "#dialogs");
    expect(hits, `wording: ${hits.join(" | ")}`).toEqual([]);
  });
  test("the command palette uses the same vocabulary after the card editor closes", async ({ page }) => {
    // Escape returns focus to the header New menu button; Ctrl+K reaches the palette from there
    // since 0.19.29 (e2e/navigation/keyboard-shortcuts.spec.mjs).
    await open(page, "list", ".task-row");
    await newCard(page);
    await page.locator("#task-form").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.locator("#command-results .command-result").first().waitFor({ timeout: 3000 });
    const hits = (await visibleText(page, "#dialogs")).split("\n").filter((l) => banned.test(l) || /Workflow & fields/.test(l)).map((l) => `palette: ${l}`);
    expect(hits, `wording: ${hits.join(" | ")}`).toEqual([]);
  });
  test("calendar and timeline share the weekends toggle button", async ({ page }) => {
    await open(page, "calendar", ".calendar, .calendar-agenda");
    await expect(page.locator("button[data-weekends-toggle]"), "calendar toggle").toHaveCount(1);
    await open(page, "timeline", ".task-timeline");
    await expect(page.locator("button[data-weekends-toggle]"), "timeline toggle").toHaveCount(1);
    await expect(page.locator("input[data-timeline-weekends]"), "no checkbox").toHaveCount(0);
  });
  test("planning views hide the task sort and group controls", async ({ page }) => {
    for (const [view, wait] of [["calendar", ".calendar, .calendar-agenda"], ["timeline", ".task-timeline"], ["capacity", ".capacity-view"]]) {
      await open(page, view, wait);
      await expect(page.locator("#sort:visible"), `${view} sort select`).toHaveCount(0);
      await expect(page.locator("#group-by"), `${view} group select`).toHaveCount(0);
    }
    await open(page, "list", ".task-row");
    await expect(page.locator("#sort:visible"), "list keeps sort").toHaveCount(1);
    const width = await rect(page, "#sort");
    expect(width.width, `sort select width ${width.width}`).toBeGreaterThanOrEqual(140);
  });
  test("table keeps advanced filters and export inside menus", async ({ page }) => {
    await open(page, "table", ".spreadsheet");
    const top = await page.evaluate(() => [...document.querySelectorAll(".table-view-tools > *, .grid-tools > *")].filter((el) => el.getBoundingClientRect().height).map((el) => el.textContent.trim().slice(0, 24)));
    expect(top.some((t) => /Advanced filters|Export matching CSV/.test(t)), `toolbar: ${top.join(" | ")}`).toBe(false);
    expect(top.length, `toolbar has ${top.length} controls: ${top.join(" | ")}`).toBeLessThanOrEqual(5);
  });
  test("list group badges show the true total across pages", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.bigProject.id}/list`);
    await page.locator(".task-row").first().waitFor();
    await expect(page.locator(".list-group .count").first()).toHaveText("130");
  });
  test.describe(() => {
    test("dashboards render dates in the shared day format", async ({ page }) => {
      await page.goto(`${app.base}/#organisation/${app.project.organisation}/home`);
      await page.locator(".dashboard-deadlines time").first().waitFor();
      const org = await page.locator(".dashboard-deadlines time").first().textContent();
      await open(page, "overview", ".project-overview");
      const project = await page.locator(".dashboard-deadlines time").first().textContent();
      for (const text of [org, project]) expect(text.trim(), `date text ${text}`).toMatch(/^\d{1,2} [A-Z][a-z]{2}( \d{4})?$/);
    });
  });
  test("buttons use icons instead of text glyphs", async ({ page }) => {
    const hits = [];
    for (const [view, wait] of [["table", ".spreadsheet"], ["list", ".task-row"], ["kanban", ".kanban-column"]]) {
      await open(page, view, wait);
      hits.push(...(await page.evaluate(() => [...document.querySelectorAll("button, summary")].filter((el) => /[↗×⌄⋯]/.test(el.textContent)).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} "${el.textContent.trim().slice(0, 20)}"`))).map((x) => `${view}: ${x}`));
    }
    expect([...new Set(hits)], `glyphs: ${[...new Set(hits)].join(" | ")}`).toEqual([]);
  });
});

test.describe("Group 5: dialog contract (findings 23–26)", { tag: "@audit" }, () => {
  test("deleting a task uses the in-app confirm instead of window.confirm", async ({ page }) => {
    await open(page, "list", ".task-row");
    await page.evaluate(() => { window.confirm = () => { throw new Error("native confirm used"); }; });
    await page.locator('.task-row [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
    const more = page.locator(".task-secondary-actions > summary");
    if (await more.isVisible()) await more.click();
    await page.locator('[data-action="task-delete"]:visible').first().click();
    await page.locator(".confirm-popover").waitFor();
    await page.locator(".confirm-popover [data-confirm-cancel]").click();
    await page.locator(".confirm-popover").waitFor({ state: "detached" });
    expect((await app.store.snapshot(app.project.id)).tasks, "task kept after cancel").toHaveLength(12);
  });
  test("comments and history panes have no second close button", async ({ page }) => {
    await openFirstTask(page);
    await page.getByRole("button", { name: /comments/i }).first().click();
    await page.locator(".task-comments-panel").waitFor();
    await expect(page.locator(".task-comments-panel [data-comments-close]:visible"), "comments close").toHaveCount(0);
    await page.getByRole("button", { name: /history/i }).first().click();
    await page.locator(".task-history-panel:not([hidden])").waitFor();
    await expect(page.locator('.task-history-panel [data-task-modal="history-close"]:visible'), "history close").toHaveCount(0);
  });
  test("the history pane aligns with the task panel and avoids the sidebar", async ({ page }) => {
    await openFirstTask(page);
    await page.getByRole("button", { name: /history/i }).first().click();
    await page.locator(".task-history-panel:not([hidden])").waitFor();
    await settled(page);
    const panel = await rect(page, ".task-dialog");
    const pane = await rect(page, ".task-history-panel");
    const sidebar = await rect(page, ".sidebar");
    expect(Math.abs(pane.top - panel.top), `pane top ${pane.top} vs panel ${panel.top}`).toBeLessThanOrEqual(2);
    expect(pane.left, `pane left ${pane.left} overlaps sidebar right ${sidebar.right}`).toBeGreaterThanOrEqual(sidebar.right - 1);
  });
  test("new and existing task headers place the close button in the same corner", async ({ page }) => {
    await open(page, "list", ".task-row");
    await newCard(page);
    await page.locator("#task-form").waitFor();
    const newClose = await rect(page, '.task-dialog [data-action="dialog-close"]');
    const newPanel = await rect(page, ".task-dialog");
    await page.keyboard.press("Escape");
    await page.locator('.task-row [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form:not(.task-create-form)").waitFor();
    const editClose = await rect(page, '.task-dialog [data-action="dialog-close"]');
    const editPanel = await rect(page, ".task-dialog");
    expect(newPanel.right - newClose.right, `new task close sits ${newPanel.right - newClose.right}px from the right edge`).toBeLessThan(40);
    expect(Math.abs((newPanel.right - newClose.right) - (editPanel.right - editClose.right)), "same corner").toBeLessThanOrEqual(4);
  });
  test("the board More menu groups its items", async ({ page }) => {
    await openBoard(page);
    await page.locator("details > summary:visible", { hasText: /^more/i }).first().click();
    await page.locator("details[open] > .board-menu-panel").first().waitFor();
    const headings = await page.locator("details[open] > .board-menu-panel .board-menu-heading:visible").allTextContents();
    expect(headings.length, `headings: ${headings.join(", ")}`).toBeGreaterThanOrEqual(3);
  });
  test("filters panel fields are left-aligned and full width", async ({ page }) => {
    await open(page, "list", ".task-row");
    await page.locator('details[data-board-menu="filters"] > summary:visible').first().click();
    await page.locator('details[data-board-menu="filters"] .board-menu-panel').waitFor();
    const [, fields] = await page.evaluate(() => { const panel = document.querySelector('details[data-board-menu="filters"] .board-menu-panel'); const p = panel.getBoundingClientRect(); return [p.left, [...panel.querySelectorAll(":scope > .field")].map((f) => { const r = f.querySelector("select, input").getBoundingClientRect(); return [Math.round(r.left - p.left), Math.round(p.right - r.right)]; })]; });
    expect(fields.length, "status and type fields").toBeGreaterThanOrEqual(2);
    for (const [left, right] of fields) expect(Math.abs(left - right) <= 6 && left <= 20, `field inset ${left}/${right}`).toBe(true);
  });
  onDevices(["phone"], () => test("phone filters open inline inside view options", async ({ page }) => {
    await open(page, "list", ".task-row");
    await page.locator(".mobile-view-options > summary").first().click();
    // Since 0.19.2 the filters list is expanded inside the panel (PEN-9); there is no summary to click.
    await page.locator(".mobile-view-options-panel").waitFor();
    const [position, clearVisible] = await page.evaluate(() => { const panel = document.querySelector('details[data-board-menu="filters"] .board-menu-panel'); const options = document.querySelector(".mobile-view-options-panel"); const clear = [...panel.querySelectorAll("button")].find((b) => /clear filters/i.test(b.textContent)); clear?.scrollIntoView({ block: "nearest" }); const r = clear?.getBoundingClientRect(); const o = options.getBoundingClientRect(); return [getComputedStyle(panel).position, !!r && options.contains(clear) && r.bottom <= o.bottom + 1 && r.bottom <= innerHeight && r.top >= o.top - 1]; });
    expect(position, "filters panel flows inside the view options").toBe("static");
    expect(clearVisible, "Clear filters stays inside the panel").toBe(true);
  }));
});

test.describe("Group 6: keyboard, copy, identity (findings 27–31)", { tag: "@audit" }, () => {
  test("presence shows the signed-in name instead of a guest id", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".main"), "signed-in name missing from presence").toContainText("George");
    expect(await page.evaluate(() => document.querySelector(".main").innerText), "guest id still shown").not.toMatch(/Guest [a-z0-9]{4}/);
  });
  test("the document title names the current view", async ({ page }) => {
    await open(page, "list", ".task-row");
    await expect(page).toHaveTitle(/List/);
    await open(page, "calendar", ".calendar, .calendar-agenda");
    await expect(page).toHaveTitle(/Calendar/);
  });
  onDevices(["phone"], () => test("timeline copy avoids mouse-only wording", async ({ page }) => {
    await open(page, "timeline", ".task-timeline");
    const text = await page.evaluate(() => document.querySelector(".task-timeline").innerText + " " + [...document.querySelectorAll(".task-timeline [title]")].map((el) => el.title).join(" "));
    expect(text, "found 'Click' in timeline copy").not.toMatch(/\bClick\b/);
  }));
  test("the word count chip never covers document text", async ({ page }) => {
    await open(page, "documents", ".documents-workspace");
    const link = page.locator(".document-link").first();
    if (!(await link.isVisible())) await page.locator('[data-document-action="browse"]').first().click();
    await link.click();
    await page.locator(".cm-content").waitFor();
    await page.evaluate(() => { const s = document.querySelector(".cm-scroller"); s.scrollTop = s.scrollHeight; });
    await settled(page);
    const [chip, last] = await page.evaluate(() => { const c = document.querySelector(".document-save").getBoundingClientRect(); const lines = document.querySelectorAll(".cm-line"); const l = lines[lines.length - 1].getBoundingClientRect(); return [c, l]; });
    const overlap = chip.top < last.bottom && chip.bottom > last.top && chip.left < last.right && chip.right > last.left;
    expect(overlap, `chip ${JSON.stringify(chip)} overlaps last line ${JSON.stringify(last)}`).toBe(false);
  });
  // 0.19.4: the owner asked for icon-only pane buttons; names live in aria-label and title.
  onDevices(["phone"], () => test("phone task editor tabs are icon-only with accessible names", async ({ page }) => {
    await openFirstTask(page);
    const buttons = await page.locator(".task-pane-switcher > .icon-button").evaluateAll((els) => els.map((el) => ({ text: el.textContent.trim(), name: el.getAttribute("aria-label"), title: el.title, icon: el.querySelectorAll(".icon").length })));
    expect(buttons.map((b) => b.text), "no visible text on the pane buttons").toEqual(["", "", ""]);
    expect(buttons.map((b) => b.name)).toEqual(["Task details", "Version history", "Task comments"]);
    expect(buttons.every((b) => b.title && b.icon === 1)).toBe(true);
  }));
  test("escape inside the comments pane returns to details before closing the task", async ({ page }) => {
    await openFirstTask(page);
    await page.getByRole("button", { name: /comments/i }).first().click();
    await page.locator("#board-comment-form .inline-rich, #board-comment-form textarea").first().click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".task-dialog.with-task-comments"), "comments pane still open").toHaveCount(0);
    await expect(page.locator("#task-form"), "task panel closed too early").toHaveCount(1);
  });
  test("shortcut help explains the N key on boards", async ({ page }) => {
    await page.goto(`${app.base}/#help/shortcuts`);
    await page.locator(".main .help-page").waitFor();
    await expect.poll(async () => { const text = await page.evaluate(() => document.querySelector(".main").innerText); return /sticky/i.test(text) && /\bN\b/.test(text); }, "shortcut guide lacks the board N note").toBe(true);
  });
});

test.describe("Group 7: polish and dead code (findings 32–36)", { tag: "@audit" }, () => {
  test("types and hierarchy edits task types as chips", async ({ page }) => {
    await open(page, "settings/hierarchy", "#settings-panel");
    await page.locator(".settings-loading").waitFor({ state: "detached" });
    await page.locator("[data-type-chips]").waitFor();
    await expect(page.locator(".type-chip"), "six default types").toHaveCount(6);
    await page.locator("[data-type-input]").fill("Spike");
    await page.locator("[data-type-add]").click();
    await expect(page.locator(".type-chip"), "chip added").toHaveCount(7);
    await expect(page.locator('input[name="types"]')).toHaveValue(/spike/i);
    await expect(page.locator('input[name="types"]')).toHaveAttribute("type", "hidden");
  });
  test("the board gallery has no saved-view controls and labels empty boards", async ({ page }) => {
    await open(page, "board/gallery", ".drawing-gallery");
    await expect(page.locator("#saved-view"), "saved view select").toHaveCount(0);
    expect(await page.locator(".drawing-thumb-empty").count(), "empty board placeholder").toBeGreaterThanOrEqual(1);
    await expect(page.locator("a.button:has-text('↗')"), "arrow glyph link").toHaveCount(0);
  });
  test("the version is shown once with the sidebar open", async ({ page }) => {
    await open(page, "list", ".task-row");
    const visible = await page.evaluate(() => [...document.querySelectorAll(".version, .app-version")].filter((el) => el.getBoundingClientRect().width).length);
    expect(visible, `${visible} version labels visible`).toBe(1);
    await expect(page.locator(".overview-toolbar")).toHaveCount(0);
  });
  test("controls.css loads last and dead code is gone", async ({ page }) => {
    await open(page, "list", ".task-row");
    const last = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].pop().getAttribute("href"));
    expect(last).toBe("/controls.css");
    const source = await fs.readFile(new URL("../../public/app.js", import.meta.url), "utf8");
    expect(!/function nodeDialog/.test(source) && !/case "board-rename"/.test(source) && !/matches\(":modal"\)/.test(source), "dead code remains in app.js").toBe(true);
    const controls = await fs.readFile(new URL("../../public/controls.css", import.meta.url), "utf8");
    expect((controls.match(/--table-selection-width:/g) || []).length, "duplicate selection width").toBe(2);
  });
  onDevices(["phone"], () => test("the date picker stays inside the phone viewport", async ({ page }) => {
    await openFirstTask(page);
    await page.locator('#task-form [name="due"] ~ .date-picker-trigger, #task-form .date-picker-trigger').last().click();
    const pop = await rect(page, ".date-picker-popover");
    expect(pop.left >= 0 && pop.right <= 390 && pop.top >= 0 && pop.bottom <= 844, `popover ${JSON.stringify(pop)}`).toBe(true);
  }));
});
