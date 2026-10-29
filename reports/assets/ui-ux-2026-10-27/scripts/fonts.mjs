import { createRequire } from "node:module";
const require = createRequire("/run/media/george/Work/Projects/pencils/package.json");
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3911", P = "p-10508786", BOARD = "b-05ca0354";
const pages = [["list", `#project/${P}/list`, ".task-row"], ["table", `#project/${P}/table`, ".spreadsheet"], ["kanban", `#project/${P}/kanban`, ".kanban"], ["board", `#project/${P}/board/${BOARD}`, "#canvas"], ["timeline", `#project/${P}/timeline`, ".task-timeline"], ["documents", `#project/${P}/documents`, ".documents-workspace"], ["overview", `#project/${P}/overview`, ".project-overview"]];
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--touch-events=enabled", "--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"] });
for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["ipad", { width: 820, height: 1180 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const agg = {};
  for (const [pn, url, wait] of pages) {
    await page.goto("about:blank"); await page.goto(`${BASE}/${url}`); await page.locator(wait).first().waitFor({ timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500);
    const rows = await page.evaluate(() => { const out = []; for (const el of document.querySelectorAll("body *")) { if (el.closest("svg")) continue; let t = false; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { t = true; break; } if (!t) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs > 11) continue; const sig = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + (el.closest("#canvas") ? " [canvas]" : el.closest(".sidebar") ? " [sidebar]" : el.closest(".topbar") ? " [topbar]" : ""); out.push([sig, fs, el.textContent.trim().slice(0, 30)]); } return out; });
    for (const [sig, fs, txt] of rows) { const k = `${fs}px ${sig}`; agg[k] = agg[k] || { n: 0, pages: new Set(), txt }; agg[k].n++; agg[k].pages.add(pn); }
  }
  console.log(`\n== ${name}: elements with text <= 11px`);
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].n - a[1].n).slice(0, 28)) console.log(`${v.n}\t${k}\t"${v.txt}"\t[${[...v.pages].join(",")}]`);
  await ctx.close();
}
await browser.close();
