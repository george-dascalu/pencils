import fs from "node:fs/promises";
const OUT = "/tmp/claude-1000/-run-media-george-Work-Projects-pencils/1e825100-4d44-4c67-890a-176a51b6353a/scratchpad";
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["audit.json", "audit-ipad2.json", "audit-extra.json"];
let entries = [];
for (const f of files) { try { entries.push(...JSON.parse(await fs.readFile(`${OUT}/${f}`, "utf8"))); } catch (e) { console.log("skip", f, e.message.slice(0, 60)); } }
const section = process.env.SECTION || "all";
const show = (s) => section === "all" || section === s;
const key = (e) => `${e.ctx}-${e.theme}`;

if (show("failed")) {
  console.log("\n=== FAILED CAPTURES ===");
  for (const e of entries.filter((e) => e.failed)) console.log(key(e), e.name, "::", e.failed.split("\n")[0].slice(0, 140));
}
if (show("overflow")) {
  console.log("\n=== PAGE OVERFLOW / OFFSCREEN / CLIPPED ===");
  for (const e of entries.filter((e) => e.metrics)) {
    const m = e.metrics;
    if (m.overflowX || m.bodyOverflowX || m.offscreen.length || m.clipped.length)
      console.log(key(e), e.name, `overflowX=${m.overflowX} body=${m.bodyOverflowX} sw=${m.scrollWidth}/${m.innerWidth}`,
        m.offscreen.length ? "\n   offscreen: " + m.offscreen.slice(0, 6).map((o) => `${o.sig} "${o.label}" ${o.rect}`).join(" | ") : "",
        m.clipped.length ? "\n   clipped: " + m.clipped.slice(0, 6).map((o) => `${o.sig} "${o.text}" +${o.over}px`).join(" | ") : "");
  }
}
if (show("small")) {
  console.log("\n=== SMALL TARGETS (touch <44, desktop <24) per page ===");
  for (const e of entries.filter((e) => e.metrics && e.metrics.smallCount)) {
    const m = e.metrics;
    console.log(key(e), e.name, `${m.smallCount}/${m.visibleInteractive}`, "::", m.small.slice(0, 8).map(([k, v]) => `${k}×${v.n} "${v.label}"`).join(" | "));
  }
  console.log("\n=== SMALL TARGET SIGNATURES aggregated (touch contexts) ===");
  const agg = {};
  for (const e of entries.filter((e) => e.metrics && /phone|ipad/.test(e.ctx))) for (const [k, v] of e.metrics.small) { const s = k.replace(/ \d+x\d+$/, ""); agg[s] = agg[s] || { n: 0, sizes: new Set(), pages: new Set(), label: v.label }; agg[s].n += v.n; agg[s].sizes.add(k.split(" ").pop()); agg[s].pages.add(e.name); }
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].n - a[1].n).slice(0, 45)) console.log(`${v.n}\t${k}\t${[...v.sizes].join(",")}\t"${v.label}"\t[${[...v.pages].slice(0, 6).join(",")}]`);
}
if (show("heights")) {
  console.log("\n=== CHROME CONTROL HEIGHT DISTRIBUTION per ctx ===");
  const agg = {};
  for (const e of entries.filter((e) => e.metrics)) { const k = key(e); agg[k] = agg[k] || {}; for (const [h, n] of Object.entries(e.metrics.heights)) { agg[k][h] = agg[k][h] || new Set(); agg[k][h].add(e.name); } }
  for (const [k, v] of Object.entries(agg)) console.log(k, Object.entries(v).sort((a, b) => a[0] - b[0]).map(([h, s]) => `${h}px(${s.size} pages: ${[...s].slice(0, 5).join(",")})`).join("  "));
}
if (show("landmarks")) {
  console.log("\n=== HEADER LANDMARK POSITIONS per view (x,y,w,h) ===");
  const views = ["overview", "documents", "list", "tree", "table", "kanban", "board", "board-gallery", "calendar", "timeline", "capacity", "settings", "help"];
  for (const k of [...new Set(entries.map(key))]) {
    console.log("\n--", k);
    const rows = entries.filter((e) => key(e) === k && e.metrics && views.includes(e.name));
    for (const lm of ["topbar", "tabs", "layoutSwitcher", "newTask", "projectSettings", "help", "avatar", "toolbar", "search", "filters", "sort", "group", "saveState", "mobileViewOptions"]) {
      const vals = rows.map((e) => `${e.name}=${e.metrics.landmarks[lm] ? e.metrics.landmarks[lm].join(",") : "-"}`);
      const distinct = new Set(rows.map((e) => (e.metrics.landmarks[lm] || ["-"]).join(",")));
      if (distinct.size > 1) console.log(`${lm} [${distinct.size} variants]:`, vals.join("  "));
      else console.log(`${lm}: same on all (${[...distinct][0]})`);
    }
  }
}
if (show("overlays")) {
  console.log("\n=== OVERLAYS (dialogs/panels/popovers) geometry ===");
  for (const e of entries.filter((e) => e.metrics && e.metrics.overlays.length)) {
    for (const o of e.metrics.overlays) console.log(key(e), e.name, o.sig, o.rect.join(","), `pos=${o.position} ovY=${o.overflowY} scroll=${o.scrollable}`, (o.beyondRight ? "BEYOND-RIGHT " : "") + (o.beyondBottom ? "BEYOND-BOTTOM " : "") + (o.beyondLeft ? "BEYOND-LEFT " : "") + (o.beyondTop ? "BEYOND-TOP" : ""));
  }
}
if (show("errors")) {
  console.log("\n=== JS ERRORS / FAILED REQUESTS / CONSOLE ===");
  for (const e of entries.filter((e) => (e.errors && e.errors.length) || (e.failed && Array.isArray(e.failed) && e.failed.length) || (e.console && e.console.length))) console.log(key(e), e.name, JSON.stringify({ errors: e.errors, failed: e.failed, console: e.console }).slice(0, 400));
}
if (show("axe")) {
  console.log("\n=== AXE VIOLATIONS aggregated ===");
  const agg = {};
  for (const e of entries.filter((e) => e.axe)) for (const v of e.axe) { const k = `${v.id} (${v.impact})`; agg[k] = agg[k] || { n: 0, pages: new Set(), samples: [] }; agg[k].n += v.n; agg[k].pages.add(`${key(e)}:${e.name}`); if (agg[k].samples.length < 3) agg[k].samples.push(...v.sample.slice(0, 1)); }
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].n - a[1].n)) { console.log(`${v.n}\t${k}\t${v.pages.size} pages: ${[...v.pages].slice(0, 8).join(", ")}`); for (const s of v.samples) console.log(`\t  ${s.target} :: ${s.html.slice(0, 110)} :: ${s.summary.slice(0, 140).replace(/\n/g, " ")}`); }
}
if (show("fonts")) {
  console.log("\n=== FONT SIZES in visible text per ctx (aggregated) ===");
  const agg = {};
  for (const e of entries.filter((e) => e.metrics)) { const k = e.ctx; agg[k] = agg[k] || {}; for (const [f, n] of Object.entries(e.metrics.fontSizes)) agg[k][f] = (agg[k][f] || 0) + n; }
  for (const [k, v] of Object.entries(agg)) console.log(k, Object.entries(v).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([f, n]) => `${f}:${n}`).join(" "));
}
if (show("misc")) {
  console.log("\n=== MISC (coarse flag, titles, toasts, empty states) ===");
  for (const e of entries.filter((e) => e.metrics)) if (e.metrics.toasts.length || e.metrics.emptyState || !e.metrics.title.includes("Pencils")) console.log(key(e), e.name, `title="${e.metrics.title}"`, e.metrics.toasts.length ? "toasts=" + JSON.stringify(e.metrics.toasts) : "", e.metrics.emptyState ? "empty=" + e.metrics.emptyState.slice(0, 80) : "");
  const titles = {}; for (const e of entries.filter((e) => e.metrics)) titles[e.name] = e.metrics.title; console.log("page titles:", JSON.stringify(titles));
}
