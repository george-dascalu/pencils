// Computed font sizes for the card popup (details, comments, history) and the
// Table view at phone, iPad and desktop widths, with screenshots. Run from the
// repo root: node reports/assets/ui-ux-2026-10-27/scripts/font-audit.mjs (OUT=dir).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Store } from "../../../../server/store.js";
import { createServer } from "../../../../server/index.js";

process.env.AUTH_MODE ||= "single-user";
process.env.LOCAL_USER_NAME ||= "George";
const out = process.env.OUT || "/tmp/pencils-font-audit";
await fs.mkdir(out, { recursive: true });
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-fonts-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Pencils", key: "PEN" });
const statuses = ["backlog", "todo", "in-progress", "review", "done"];
const tasks = [];
for (let i = 0; i < 10; i++)
  tasks.push(await store.createTask(project.id, { title: `On mobile don't allow me to scroll the whole app up and down ${i}`, status: statuses[i % 5], priority: ["low", "medium", "high"][i % 3], assignee: i % 2 ? "George Dascalu" : "", due: `2026-11-1${i % 9}`, start: "2026-11-01", tags: ["design", "quality"], body: "First paragraph of the **description** with a [link](https://example.com).\n\n- bullet one\n- bullet two" }));
await store.createTask(project.id, { title: "Child task", status: "todo", parent: tasks[0].id });
const t0 = tasks[0];
const current = (await store.snapshot(project.id)).tasks.find((t) => t.id === t0.id);
await store.updateTask(project.id, t0.id, { revision: current.revision, comments: [{ id: "c1", text: "A comment with **bold** text and a longer sentence to see wrapping.", author: "George", created: "2026-10-27T10:00:00.000Z" }] }).catch(() => {});
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const touchArgs = ["--no-sandbox", "--touch-events=enabled", "--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"];
const browsers = { touch: await chromium.launch({ args: touchArgs }), desktop: await chromium.launch({ args: ["--no-sandbox"] }) };
const devices = { phone: { width: 390, height: 844 }, ipad: { width: 1024, height: 768 }, desktop: { width: 1440, height: 900 } };

const collect = (scope) => {
  const root = document.querySelector(scope);
  if (!root) return [];
  const seen = new Map();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    const isField = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== "hidden";
    const isEditable = el.getAttribute("contenteditable") === "true";
    if (!own && !isField && !isEditable) continue;
    if (el.closest("option")) continue;
    const cs = getComputedStyle(el);
    const key = `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 3).map((c) => "." + c).join("")}${el.name ? `[name=${el.name}]` : ""}`;
    const sample = (own || el.value || el.placeholder || el.getAttribute("data-placeholder") || el.getAttribute("aria-label") || "").slice(0, 40);
    const entry = seen.get(key) || { key, sizes: new Set(), weight: cs.fontWeight, color: cs.color, sample, count: 0 };
    entry.sizes.add(cs.fontSize);
    entry.count++;
    seen.set(key, entry);
  }
  return [...seen.values()].map((e) => ({ ...e, sizes: [...e.sizes].join("/") }));
};

const report = {};
for (const [device, viewport] of Object.entries(devices)) {
  const touch = device !== "desktop";
  const context = await browsers[touch ? "touch" : "desktop"].newContext({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Rows
  for (const view of ["list", "tree"]) {
    await page.goto(`${base}/#project/${project.id}/${view}`);
    await page.locator(".task-row").first().waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${device}-${view}.png`, fullPage: false });
  }
  // Card popup
  await page.goto(`${base}/#project/${project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await page.locator(`[data-action="task-open"][data-id="${t0.id}"]:visible`).first().click();
  await page.locator("#task-form").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${device}-card.png` });
  report[`${device} card`] = await page.evaluate(collect, "dialog.task-dialog");
  // Comments pane
  await page.locator('[data-editor-pane="comments"]').click();
  await page.locator(".task-comments-panel").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${device}-card-comments.png` });
  report[`${device} card comments`] = await page.evaluate(collect, ".task-comments-panel");
  await page.locator('[data-editor-pane="history"]').click();
  await page.locator(".task-history-panel").waitFor();
  await page.waitForTimeout(400);
  report[`${device} card history`] = await page.evaluate(collect, ".task-history-panel");
  await page.screenshot({ path: `${out}/${device}-card-history.png` });
  // Table view
  await page.goto(`${base}/#project/${project.id}/table`);
  await page.locator(".task-table").first().waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${device}-table.png` });
  report[`${device} table`] = await page.evaluate(collect, "#view-content");
  if (errors.length) report[`${device} errors`] = errors;
  await context.close();
}
await Promise.all(Object.values(browsers).map((b) => b.close()));
server.close();
await fs.rm(root, { recursive: true, force: true });
let text = "";
for (const [name, rows] of Object.entries(report)) {
  text += `\n## ${name}\n`;
  if (!Array.isArray(rows)) { text += JSON.stringify(rows) + "\n"; continue; }
  for (const r of rows.sort((a, b) => parseFloat(a.sizes) - parseFloat(b.sizes))) text += `${r.sizes.padEnd(9)} w${r.weight} x${String(r.count).padEnd(3)} ${r.key.padEnd(56)} ${r.sample}\n`;
}
await fs.writeFile(`${out}/report.txt`, text);
console.log(text);
