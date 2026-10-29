// Measures rendered controls across pages and tallies visual variants per family.
import { createRequire } from "node:module";
import fs from "node:fs/promises"; import os from "node:os"; import path from "node:path";
const require = createRequire("/run/media/george/Work/Projects/pencils/package.json");
const { chromium } = require("playwright");
const { Store } = await import("/run/media/george/Work/Projects/pencils/server/store.js");
const { createServer } = await import("/run/media/george/Work/Projects/pencils/server/index.js");
const OUT = "/tmp/claude-1000/-run-media-george-Work-Projects-pencils/1e825100-4d44-4c67-890a-176a51b6353a/scratchpad";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-controls-")); const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Controls audit", key: "CTL" });
const statuses = ["backlog", "todo", "in-progress", "review", "done"];
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
for (let i = 0; i < 8; i++) await store.createTask(project.id, { title: `Control task ${i}`, status: statuses[i % 5], start: day(i - 2), due: day(i + 3), assignee: i % 2 ? "George" : "", priority: ["low", "medium", "high"][i % 3], body: "- [ ] item" });
const doc = await store.createDocument(project.id, { title: "Doc", body: "# Doc\n\nText." });
const board = (await store.snapshot(project.id)).boards[0];
const server = createServer(store); await new Promise((r) => server.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${server.address().port}`;
const touchArgs = ["--no-sandbox", "--touch-events=enabled", "--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"];
const desktop = await chromium.launch(); const touch = await chromium.launch({ args: touchArgs });
const P = `#project/${project.id}`;
const pages = [
  ["list", `${P}/list`, ".task-row"], ["table", `${P}/table`, ".spreadsheet"], ["kanban", `${P}/kanban`, ".kanban-column"], ["calendar", `${P}/calendar`, ".calendar, .calendar-agenda"],
  ["timeline", `${P}/timeline`, ".task-timeline"], ["capacity", `${P}/capacity`, ".capacity-view"], ["board", `${P}/board/${board.id}`, "#canvas"], ["documents", `${P}/documents/${doc.id}`, ".document-editor"],
  ["settings-general", `${P}/settings/general`, "#project-form"], ["settings-workflow", `${P}/settings/workflow`, "#settings-panel"], ["settings-teams", `${P}/settings/teams`, "#settings-panel"], ["settings-sources", `${P}/settings/sources`, "#settings-panel"],
  ["org-people", `#organisation/${project.organisation}/people`, ".main"], ["org-home", `#organisation/${project.organisation}/home`, ".main"], ["help", "#help/start", ".main"], ["overview", `${P}/overview`, ".project-overview"],
];
const interactions = [
  ["task-edit", `${P}/list`, ".task-row", async (page) => { await page.locator('.task-row [data-action="task-open"]:visible').first().click(); await page.locator("#task-form").waitFor(); }],
  ["task-new", `${P}/list`, ".task-row", async (page) => { await page.locator('.topbar [data-action="task-new"]:visible').first().click(); await page.locator("#task-form").waitFor(); }],
  ["personal", `${P}/list`, ".task-row", async (page) => { const a = page.locator(".avatar:visible"); if (!(await a.count())) { await page.locator(".mobile-menu").click(); await page.locator('[data-personal="settings"]:visible').first().click(); } else await a.first().click(); await page.locator("dialog").waitFor(); }],
  ["filters-open", `${P}/list`, ".task-row", async (page) => { const s = page.locator('details[data-board-menu="filters"] > summary:visible'); if (await s.count()) await s.first().click(); else { await page.locator(".mobile-view-options > summary").first().click(); await page.locator('details[data-board-menu="filters"] > summary').first().click(); } await page.waitForTimeout(200); }],
  ["board-settings", `${P}/board/${board.id}`, "#canvas", async (page) => { const b = page.getByRole("button", { name: /board settings/i }); if (await b.first().isVisible()) { await b.first().click(); await page.waitForTimeout(300); } }],
  ["columns-open", `${P}/table`, ".spreadsheet", async (page) => { const s = page.locator('details[data-board-menu="table-columns"] > summary:visible'); if (await s.count()) await s.first().click(); else { await page.locator(".mobile-view-options > summary").first().click(); await page.locator('details[data-board-menu="table-columns"] > summary').first().click(); } await page.waitForTimeout(200); }],
];
const collect = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; const s = getComputedStyle(el); if (s.visibility === "hidden") return null; return r; };
  const out = [];
  for (const el of document.querySelectorAll('button, a.button, input:not([type=hidden]), select, textarea, summary, [role="button"], .task-color-badge, .count, .tag, .task-assignee, .field, .toolbar, .planning-head, .board-toolbar, .grid-tools, .table-view-tools, .dialog-head, .dialog-foot, .board-menu-panel, .selection-popover, .select-menu, .date-picker-popover')) {
    if (el.closest("#canvas .board-node, svg")) continue;
    const r = vis(el); if (!r) continue;
    const s = getComputedStyle(el);
    const svg = el.querySelector(":scope > svg.icon, :scope > .icon");
    const kind = el.matches(".field, .toolbar, .planning-head, .board-toolbar, .grid-tools, .table-view-tools, .dialog-head, .dialog-foot, .board-menu-panel, .selection-popover, .select-menu, .date-picker-popover") ? "layout" : el.matches(".task-color-badge, .count, .tag, .task-assignee") ? "badge" : "control";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    out.push({ kind, tag: el.tagName.toLowerCase(), type: el.getAttribute("type") || "", cls: [...el.classList].slice(0, 3).join("."), h: Math.round(r.height), w: Math.round(r.width), pad: `${s.paddingTop}/${s.paddingRight}/${s.paddingBottom}/${s.paddingLeft}`, radius: s.borderTopLeftRadius, font: `${s.fontSize}/${s.fontWeight}`, border: `${s.borderTopWidth} ${s.borderTopColor}`, bg: s.backgroundColor, color: s.color, gap: s.gap, flex: s.flexDirection, display: s.display, margin: `${s.marginTop}/${s.marginBottom}`, icon: svg ? `${Math.round(svg.getBoundingClientRect().width)}` : "", iconOnly: !!svg && !text, ariaLabel: !!el.getAttribute("aria-label"), title: !!el.getAttribute("title"), text: text.slice(0, 18), parent: el.parentElement ? [...el.parentElement.classList].slice(0, 2).join(".") : "" });
  }
  return out;
};
const rows = [];
for (const [device, browser, viewport] of [["desktop", desktop, { width: 1440, height: 900 }], ["phone", touch, { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, hasTouch: device === "phone", isMobile: device === "phone" });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const run = async (name, url, wait, act) => {
    try { await page.goto("about:blank"); await page.goto(`${base}/${url}`); await page.locator(wait).first().waitFor(); await page.waitForTimeout(300); if (act) await act(page); for (const row of await page.evaluate(collect)) rows.push({ device, page: name, ...row }); }
    catch (e) { console.log("skip", device, name, e.message.split("\n")[0].slice(0, 80)); }
  };
  for (const [name, url, wait] of pages) await run(name, url, wait);
  for (const [name, url, wait, act] of interactions) await run(name, url, wait, act);
  await context.close();
}
await desktop.close(); await touch.close(); server.close(); await fs.rm(root, { recursive: true, force: true });
await fs.writeFile(path.join(OUT, "controls.json"), JSON.stringify(rows));
// Tallies: per family (tag+type+cls), variants of visual signature on desktop.
const family = (r) => `${r.tag}${r.type ? `[${r.type}]` : ""}${r.cls ? "." + r.cls : ""}`;
const sig = (r) => `h${r.h} pad${r.pad} r${r.radius} f${r.font} b(${r.border}) bg(${r.bg})`;
for (const device of ["desktop", "phone"]) {
  console.log(`\n==== ${device}: control families with more than one visual variant`);
  const fams = {};
  for (const r of rows.filter((r) => r.device === device && r.kind === "control")) { const f = family(r); fams[f] = fams[f] || {}; const k = sig(r); fams[f][k] = fams[f][k] || { n: 0, pages: new Set(), text: r.text }; fams[f][k].n++; fams[f][k].pages.add(r.page); }
  for (const [f, variants] of Object.entries(fams).sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)) {
    const vs = Object.entries(variants); if (vs.length < 2) continue;
    console.log(`\n${f}: ${vs.length} variants`);
    for (const [k, v] of vs.sort((a, b) => b[1].n - a[1].n).slice(0, 6)) console.log(`   ${v.n}× ${k} [${[...v.pages].slice(0, 4).join(",")}] "${v.text}"`);
  }
  console.log(`\n==== ${device}: icon sizes inside controls`);
  const icons = {}; for (const r of rows.filter((r) => r.device === device && r.kind === "control" && r.icon)) { const k = `${r.icon}px in ${family(r)}`; icons[k] = (icons[k] || 0) + 1; }
  console.log(Object.entries(icons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join("\n"));
  console.log(`\n==== ${device}: icon-only controls lacking aria-label`);
  const bad = {}; for (const r of rows.filter((r) => r.device === device && r.kind === "control" && r.iconOnly && !r.ariaLabel && !r.title)) { const k = `${family(r)} in .${r.parent}`; bad[k] = (bad[k] || 0) + 1; }
  console.log(Object.entries(bad).map(([k, n]) => `${n}× ${k}`).join("\n") || "none");
  console.log(`\n==== ${device}: layout containers`);
  const lay = {}; for (const r of rows.filter((r) => r.device === device && r.kind === "layout")) { const k = `${family(r)} gap=${r.gap} pad=${r.pad} flex=${r.flex} margin=${r.margin}`; lay[k] = lay[k] || { n: 0, pages: new Set() }; lay[k].n++; lay[k].pages.add(r.page); }
  for (const [k, v] of Object.entries(lay).sort()) console.log(`${v.n}× ${k} [${[...v.pages].slice(0, 3).join(",")}]`);
  console.log(`\n==== ${device}: badges`);
  const badges = {}; for (const r of rows.filter((r) => r.device === device && r.kind === "badge")) { const k = `${family(r)} h${r.h} ${r.font} r${r.radius} pad${r.pad}`; badges[k] = (badges[k] || 0) + 1; }
  console.log(Object.entries(badges).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join("\n"));
}
