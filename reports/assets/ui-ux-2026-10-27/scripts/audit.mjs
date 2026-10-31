import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire("/run/media/george/Work/Projects/pencils/package.json");
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");

const BASE = process.env.BASE || "http://127.0.0.1:3911";
const OUT = "/tmp/claude-1000/-run-media-george-Work-Projects-pencils/1e825100-4d44-4c67-890a-176a51b6353a/scratchpad";
const SHOTS = path.join(OUT, "shots");
await fs.mkdir(SHOTS, { recursive: true });
const P = "p-10508786", ORG = "o-default", BOARD = "b-05ca0354", BIG = "p-8be9c02b";
const ONLY_CTX = process.env.CTX?.split(",");
const REPORT = process.env.REPORT || "audit.json";
const ONLY_PAGE = process.env.PAGES?.split(",");

const contexts = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true, themes: ["light", "dark"], axe: true, full: true, settings: true },
  { name: "ipad-portrait", viewport: { width: 820, height: 1180 }, touch: true, themes: ["light", "dark"], axe: false, full: true, settings: true },
  { name: "ipad-landscape", viewport: { width: 1180, height: 820 }, touch: true, themes: ["light"], axe: false, full: false, settings: false },
  { name: "laptop", viewport: { width: 1280, height: 720 }, touch: false, themes: ["light"], axe: false, full: false, settings: false },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false, themes: ["light", "dark"], axe: true, full: false, settings: true },
  { name: "ipad-mini", viewport: { width: 768, height: 1024 }, touch: true, themes: ["light"], axe: false, full: true, settings: true },
  { name: "ipad-1024", viewport: { width: 1024, height: 768 }, touch: true, themes: ["light"], axe: false, full: false, settings: true },
].filter((c) => !ONLY_CTX || ONLY_CTX.includes(c.name));

const pages = [
  ["home", "#home", ".main"],
  ["org-home", `#organisation/${ORG}/home`, ".main"],
  ["org-people", `#organisation/${ORG}/people`, ".main"],
  ["org-teams", `#organisation/${ORG}/teams`, ".main"],
  ["overview", `#project/${P}/overview`, ".project-overview"],
  ["documents", `#project/${P}/documents`, ".documents-workspace"],
  ["list", `#project/${P}/list`, ".task-row"],
  ["tree", `#project/${P}/tree`, ".tree-wrapper"],
  ["table", `#project/${P}/table`, ".spreadsheet"],
  ["kanban", `#project/${P}/kanban`, ".kanban"],
  ["board", `#project/${P}/board/${BOARD}`, "#canvas"],
  ["board-gallery", `#project/${P}/board/gallery`, ".main"],
  ["calendar", `#project/${P}/calendar`, ".calendar,.calendar-agenda"],
  ["timeline", `#project/${P}/timeline`, ".task-timeline"],
  ["capacity", `#project/${P}/capacity`, ".capacity-view"],
  ["settings", `#project/${P}/settings/general`, ".settings-navigation,#settings-section-select"],
  ["help", `#help/start`, ".main"],
  ["big-list", `#project/${BIG}/list`, ".task-row"],
  ["big-table", `#project/${BIG}/table`, ".spreadsheet"],
  ["big-kanban", `#project/${BIG}/kanban`, ".kanban"],
].filter((p) => !ONLY_PAGE || ONLY_PAGE.includes(p[0]));

const interactions = [
  ["list-new-task", `#project/${P}/list`, ".task-row", async (page) => {
    const top = page.locator('.topbar [data-action="task-new"]:visible');
    if (await top.count()) await top.first().click({ timeout: 5000 });
    else await page.locator('#view-content [data-action="task-new"]:visible, .main [data-action="task-new"]:visible').first().click({ timeout: 5000 });
    await page.locator("#task-form").waitFor();
  }],
  ["list-task-open", `#project/${P}/list`, ".task-row", async (page) => {
    await page.locator('.task-row [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
  }],
  ["task-comments", `#project/${P}/list`, ".task-row", async (page) => {
    await page.locator('.task-row [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
    await page.getByRole("button", { name: /comments/i }).first().click();
    await page.waitForTimeout(400);
  }],
  ["list-filters", `#project/${P}/list`, ".task-row", async (page) => {
    const s = page.locator('details[data-board-menu="filters"] > summary:visible').first();
    if (await s.count()) await s.click();
    else {
      await page.locator(".mobile-view-options > summary").first().click();
      await page.locator('details[data-board-menu="filters"] > summary').first().click();
    }
    await page.waitForTimeout(300);
  }],
  ["drawer", `#project/${P}/list`, ".task-row", async (page) => {
    const m = page.locator(".mobile-menu:visible");
    if (!(await m.count())) throw new Error("no mobile menu at this width");
    await m.click();
    await page.waitForTimeout(400);
  }],
  ["personal", `#project/${P}/list`, ".task-row", async (page) => {
    await page.locator(".avatar:visible").first().click();
    await page.waitForTimeout(400);
  }],
  ["kanban-task-open", `#project/${P}/kanban`, ".kanban", async (page) => {
    await page.locator('.kanban [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
  }],
  ["table-task-open", `#project/${P}/table`, ".spreadsheet", async (page) => {
    await page.locator('.spreadsheet [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
  }],
  ["board-more", `#project/${P}/board/${BOARD}`, "#canvas", async (page) => {
    await page.locator("details > summary:visible", { hasText: /^more/i }).first().click();
    await page.waitForTimeout(300);
  }],
  ["board-settings", `#project/${P}/board/${BOARD}`, "#canvas", async (page) => {
    await page.getByRole("button", { name: /board settings/i }).first().click();
    await page.waitForTimeout(400);
  }],
  ["board-select-note", `#project/${P}/board/${BOARD}`, "#canvas", async (page) => {
    const node = page.locator("#canvas .board-node").first();
    await node.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(400);
  }],
  ["doc-open", `#project/${P}/documents`, ".documents-workspace", async (page) => {
    await page.locator(".document-link:visible").first().click();
    await page.locator(".document-reading, .cm-editor, .document-editor").first().waitFor();
    await page.waitForTimeout(400);
  }],
  ["calendar-task-open", `#project/${P}/calendar`, ".calendar,.calendar-agenda", async (page) => {
    await page.locator('[data-action="task-open"]:visible, .calendar-card:visible, .agenda-row button:visible').first().click();
    await page.locator("#task-form").waitFor();
  }],
  ["timeline-task-open", `#project/${P}/timeline`, ".task-timeline", async (page) => {
    await page.locator('.task-timeline [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
  }],
  ["command-k", `#project/${P}/list`, ".task-row", async (page) => {
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
  }],
  ["task-history", `#project/${P}/list`, ".task-row", async (page) => {
    await page.locator('.task-row [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
    await page.getByRole("button", { name: /history/i }).first().click();
    await page.waitForTimeout(400);
  }],
  ["task-relationship-add", `#project/${P}/list`, ".task-row", async (page) => {
    await page.locator('.task-row [data-action="task-open"]:visible').first().click();
    await page.locator("#task-form").waitFor();
    const add = page.getByRole("button", { name: /add (parent|child|related|relationship)|^\+$|add task relationship/i }).first();
    await add.scrollIntoViewIfNeeded();
    await add.click();
    await page.waitForTimeout(400);
  }],
  ["list-sort", `#project/${P}/list`, ".task-row", async (page) => {
    const opts = page.locator(".mobile-view-options > summary:visible");
    if (await opts.count()) await opts.first().click();
    await page.locator("details > summary:visible", { hasText: /^sort/i }).first().click();
    await page.waitForTimeout(300);
  }],
  ["list-group", `#project/${P}/list`, ".task-row", async (page) => {
    const opts = page.locator(".mobile-view-options > summary:visible");
    if (await opts.count()) await opts.first().click();
    await page.locator("details > summary:visible", { hasText: /^group/i }).first().click();
    await page.waitForTimeout(300);
  }],
  ["table-columns", `#project/${P}/table`, ".spreadsheet", async (page) => {
    const opts = page.locator(".mobile-view-options > summary:visible");
    if (await opts.count()) await opts.first().click();
    await page.getByRole("button", { name: /^columns/i }).first().click();
    await page.waitForTimeout(300);
  }],
  ["board-project-tasks", `#project/${P}/board/${BOARD}`, "#canvas", async (page) => {
    await page.getByRole("button", { name: /project tasks/i }).first().click();
    await page.waitForTimeout(500);
  }],
  ["new-project", `#organisation/${ORG}/home`, ".main", async (page) => {
    // The sidebar's + beside Projects is the one New project control (0.20.75).
    await page.locator(".topbar .mobile-menu").click();
    await page.locator('.sidebar .side-label [data-action="project-new"]').click();
    await page.waitForTimeout(400);
  }],
  ["new-organisation", `#home`, ".main", async (page) => {
    await page.getByRole("button", { name: /new organisation/i }).first().click();
    await page.waitForTimeout(400);
  }],
  ["phone-view-options", `#project/${P}/table`, ".spreadsheet", async (page) => {
    const opts = page.locator(".mobile-view-options > summary:visible");
    if (!(await opts.count())) throw new Error("no view options at this width");
    await opts.first().click();
    await page.waitForTimeout(300);
  }],
  ["help-article", `#help/start`, ".main", async (page) => {
    const nav = page.locator("#help-navigation a").nth(3);
    if (!(await nav.isVisible())) await page.locator(".help-navigation > summary").click();
    await nav.click();
    await page.waitForTimeout(400);
  }],
].filter((p) => !ONLY_PAGE || ONLY_PAGE.includes(p[0]));

const metricsScript = (touch) => `(() => {
  const TOUCH = ${touch};
  const vis = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; const s = getComputedStyle(el); if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return null; return r; };
  const sig = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "") + (el.id ? "#" + el.id : "");
  const lab = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 45);
  const rect = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  const interactive = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=option], [role=tab], [role=menuitem], [contenteditable="true"]')];
  const minT = TOUCH ? 44 : 24;
  const small = {}, offscreen = [];
  let smallCount = 0, visibleCount = 0;
  for (const el of interactive) {
    const r = vis(el); if (!r) continue;
    if (el.closest("#canvas .board-node, #canvas .board-world, .cm-editor")) continue;
    visibleCount++;
    if (((r.right > innerWidth + 1 && r.left < innerWidth - 1) || (r.left < -1 && r.right > 1)) && !el.closest(".sidebar")) offscreen.push({ sig: sig(el), label: lab(el), rect: rect(r) });
    if (r.bottom <= 0 || r.top >= innerHeight) continue;
    if (r.width < minT - 0.5 || r.height < minT - 0.5) {
      smallCount++;
      const k = sig(el) + " " + Math.round(r.width) + "x" + Math.round(r.height);
      small[k] = small[k] || { n: 0, label: lab(el) };
      small[k].n++;
    }
  }
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (clipped.length > 30) break;
    if (el.closest("#canvas, .cm-editor, svg")) continue;
    const s = getComputedStyle(el);
    if (!(s.overflowX === "hidden" || s.overflow === "hidden" || s.overflowX === "clip")) continue;
    if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis" && el.textContent.trim() && !el.querySelector("table, .kanban, .task-timeline, .calendar")) {
      const r = vis(el); if (!r) continue;
      clipped.push({ sig: sig(el), text: el.textContent.trim().replace(/\\s+/g, " ").slice(0, 40), over: el.scrollWidth - el.clientWidth, rect: rect(r) });
    }
  }
  const chrome = [...document.querySelectorAll(".topbar button, .topbar a, .topbar select, .toolbar button, .toolbar select, .toolbar input, .toolbar summary, .board-toolbar button, .board-toolbar summary, .planning-head button, .planning-head select, .planning-head input, .tabs a, .tabs button, .view-layout-switcher button, .document-controls button, .document-heading button")];
  const heights = {};
  for (const el of chrome) { const r = vis(el); if (!r) continue; const h = Math.round(r.height); heights[h] = (heights[h] || 0) + 1; }
  const find = (sel) => { const el = [...document.querySelectorAll(sel)].find(vis); const r = el && vis(el); return r ? rect(r) : null; };
  const byText = (re, scope = "button, a, summary") => { for (const el of document.querySelectorAll(scope)) { const t = lab(el); if (re.test(t)) { const r = vis(el); if (r) return rect(r); } } return null; };
  const landmarks = { topbar: find(".topbar"), sidebar: find(".sidebar"), mobileMenu: find(".mobile-menu"), crumb: find(".organisation-crumb"), tabs: find(".tabs"), layoutSwitcher: find(".view-layout-switcher"), viewSwitcherSelect: find("#project-view-switcher"), newTask: byText(/^new (card|task)$/i), projectSettings: byText(/^project settings$/i), help: byText(/^help/i), avatar: find(".avatar"), toolbar: find(".toolbar"), search: find(".search"), filters: byText(/^filters$/i, "summary, button"), sort: byText(/^sort/i, "summary, button"), group: byText(/^group/i, "summary, button"), mobileViewOptions: find(".mobile-view-options"), saveState: find("#save-state") };
  const overlays = [...document.querySelectorAll('[role="dialog"], .task-dialog, details[open] > .board-menu-panel, .select-menu, .popover, .task-picker-popover, .document-panel, .phone-drawer, .personal-settings, .settings-panel, .board-settings, .comment-panel, .board-comments, .board-object-panel, .task-aux, .pen-settings')].map((el) => { const r = vis(el); if (!r) return null; const s = getComputedStyle(el); return { sig: sig(el), rect: rect(r), beyondRight: r.right > innerWidth + 1, beyondBottom: r.bottom > innerHeight + 1, beyondLeft: r.left < -1, beyondTop: r.top < -1, scrollable: el.scrollHeight > el.clientHeight + 2, overflowY: s.overflowY, position: s.position, z: s.zIndex }; }).filter(Boolean);
  const fontSizes = {};
  for (const el of document.querySelectorAll("body *")) { if (el.closest("#canvas, svg")) continue; let hasText = false; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; } if (!hasText) continue; const r = vis(el); if (!r) continue; const fsz = getComputedStyle(el).fontSize; fontSizes[fsz] = (fontSizes[fsz] || 0) + 1; }
  const html = document.documentElement;
  return { title: document.title, theme: html.dataset.theme, density: html.dataset.density, coarse: matchMedia("(pointer: coarse)").matches, hoverNone: matchMedia("(hover: none)").matches, innerWidth, innerHeight, scrollWidth: html.scrollWidth, scrollHeight: html.scrollHeight, overflowX: html.scrollWidth > innerWidth + 1, bodyOverflowX: document.body.scrollWidth > innerWidth + 1, visibleInteractive: visibleCount, smallCount, small: Object.entries(small).sort((a, b) => b[1].n - a[1].n).slice(0, 25), offscreen: offscreen.slice(0, 25), clipped, heights, landmarks, overlays, fontSizes, toasts: [...document.querySelectorAll("#toasts *")].map((t) => t.textContent.trim()).filter(Boolean).slice(0, 5), emptyState: document.querySelector(".empty")?.textContent.trim().slice(0, 120) || null };
})()`;

const desktopBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const touchBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--touch-events=enabled", "--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"] });
const report = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

for (const ctx of contexts) {
  for (const theme of ctx.themes) {
    const browser = ctx.touch ? touchBrowser : desktopBrowser;
    const context = await browser.newContext({ viewport: ctx.viewport, hasTouch: ctx.touch, isMobile: ctx.touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.addInitScript((t) => { try { localStorage.setItem("pencils:appearance", JSON.stringify({ theme: t, font: "manrope" })); } catch {} }, theme);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const coarse = async () => {};
    let errors = [], failed = [], consoleErrors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(BASE, "")); });
    const tag = `${ctx.name}-${theme}`;
    const visit = async (url, wait) => {
      await page.goto("about:blank");
      errors = []; failed = []; consoleErrors = [];
      await coarse();
      await page.goto(`${BASE}/${url}`, { waitUntil: "commit" });
      await coarse();
      await page.locator(".boot").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
      await page.locator(wait).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
    };
    const capture = async (name, { full = ctx.full, axe = ctx.axe } = {}) => {
      const entry = { ctx: ctx.name, theme, width: ctx.viewport.width, name, shot: `${tag}-${name}.png` };
      try { entry.metrics = await page.evaluate(metricsScript(ctx.touch)); } catch (e) { entry.metricsError = String(e.message).slice(0, 200); }
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`) }).catch((e) => (entry.shotError = String(e.message).slice(0, 100)));
      if (full) await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}-full.png`), fullPage: true }).catch(() => {});
      if (axe) {
        try {
          const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
          entry.axe = res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(" ").slice(0, 120), html: n.html.slice(0, 160), summary: (n.failureSummary || "").slice(0, 200) })) }));
        } catch (e) { entry.axeError = String(e.message).slice(0, 200); }
      }
      entry.errors = [...errors]; entry.failed = [...failed]; entry.console = [...consoleErrors].slice(0, 10);
      report.push(entry);
      const m = entry.metrics || {};
      log(tag, name, `ovf=${m.overflowX ? "Y" : "n"} small=${m.smallCount}/${m.visibleInteractive} off=${m.offscreen?.length} clip=${m.clipped?.length} coarse=${m.coarse} err=${entry.errors.length} axe=${entry.axe ? entry.axe.length : "-"}`);
    };
    for (const [name, url, wait] of pages) {
      try { await visit(url, wait); await capture(name); }
      catch (e) { log(tag, name, "FAILED", e.message.split("\n")[0].slice(0, 160)); report.push({ ctx: ctx.name, theme, name, failed: e.message.slice(0, 300) }); await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}-FAILED.png`) }).catch(() => {}); }
    }
    for (const [name, url, wait, act] of interactions) {
      try { await visit(url, wait); await act(page); await capture(name, { full: false }); }
      catch (e) { log(tag, name, "FAILED", e.message.split("\n")[0].slice(0, 160)); report.push({ ctx: ctx.name, theme, name, failed: e.message.slice(0, 300) }); await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}-FAILED.png`) }).catch(() => {}); }
    }
    if (ctx.settings && theme === "light" && (!ONLY_PAGE || ONLY_PAGE.includes("settings"))) {
      try {
        await visit(`#project/${P}/settings/general`, ".settings-navigation,#settings-section-select");
        const sections = await page.$$eval("[data-settings-section], #settings-section-select option", (els) => [...new Set(els.map((e) => e.dataset.settingsSection || e.value).filter(Boolean))]);
        log(tag, "settings sections", sections.join(","));
        for (const section of sections) {
          try {
            await visit(`#project/${P}/settings/${section}`, ".settings-navigation,#settings-section-select");
            await page.locator(".settings-loading").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
            await capture(`settings-${section}`, { axe: false });
          } catch (e) { log(tag, `settings-${section}`, "FAILED", e.message.split("\n")[0].slice(0, 120)); }
        }
      } catch (e) { log(tag, "settings loop FAILED", e.message.slice(0, 160)); }
    }
    await context.close();
    await fs.writeFile(path.join(OUT, REPORT), JSON.stringify(report, null, 1));
  }
}
await desktopBrowser.close(); await touchBrowser.close();
await fs.writeFile(path.join(OUT, REPORT), JSON.stringify(report, null, 1));
log("DONE", report.length, "entries");
