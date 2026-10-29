// Keyboard audit (28 October 2026): which controls summon the software keyboard
// on a phone when they should not. Two signals per screen:
// 1. Static: buttons, toggles and checkboxes inside an editable area. iOS Safari
//    does not focus a tapped button; it focuses the nearest focusable ancestor,
//    so a control inside an editor focuses the editor and opens the keyboard.
// 2. Tap: every visible control is tapped (after a reset) and any move of focus
//    into a text field is recorded with what received focus.
// Usage: node keyboard-audit.mjs [outfile.json]   (ONLY=screen-name filters)
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Store } from "../../../../server/store.js";
import { createServer } from "../../../../server/index.js";

process.env.AUTH_MODE ||= "single-user";
process.env.LOCAL_USER_NAME ||= "George";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-keyboard-audit-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Keyboard audit", key: "KA" });
const parent = await store.createTask(project.id, { title: "Plan the launch", status: "todo", body: "Some **notes** here.\n\n- [ ] first\n- [x] second", assignee: "George", due: "2026-11-10" });
const child = await store.createTask(project.id, { title: "Write the brief", status: "in-progress", parent: parent.id, due: "2026-11-05" });
await store.createTask(project.id, { title: "Review", status: "review", dependencies: [child.id] });
const board = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [
  { id: "c1", type: "task", task: parent.id, x: 40, y: 40, w: 300, h: 200 },
  { id: "n1", type: "sticky", text: "A sticky note", x: 400, y: 40, w: 200, h: 160 },
  { id: "t1", type: "text", text: "Some text", x: 400, y: 260, w: 200, h: 60 },
] });
const doc = await store.createDocument(project.id, { title: "Audit document", body: "# Audit\n\nParagraph with **bold** text.\n\n- [ ] A checklist item\n\n> [!note] Callout\n> Callout body.\n\n```js\nconst a = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n$$\nx^2\n$$\n" });
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/#project/${project.id}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--touch-events=enabled", "--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(6000);

const screens = [
  ["overview", `${base}/overview`],
  ["list", `${base}/list`],
  ["tree", `${base}/tree`],
  ["table", `${base}/table`],
  ["kanban", `${base}/kanban`],
  ["calendar", `${base}/calendar`],
  ["timeline", `${base}/timeline`],
  ["capacity", `${base}/capacity`],
  ["board", `${base}/board/${board.id}`],
  ["documents", `${base}/documents/${doc.id}`],
  ["card editor", `${base}/list`, async () => {
    await page.locator(`.task-row [data-action="task-open"][data-id="${parent.id}"]:visible, .task-row .task-id:visible`).first().click();
    await page.locator("#task-form").waitFor();
  }],
];
const TEXT = 'input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]), textarea';
async function open([, url, after]) {
  await page.goto("about:blank");
  await page.goto(url);
  await page.waitForTimeout(900);
  if (after) { await after(); await page.waitForTimeout(400); }
  await page.evaluate(() => document.activeElement?.blur?.());
}
const controls = () => page.evaluate(() => {
  const selector = 'button, summary, select, [role="button"], input[type="checkbox"], input[type="radio"], a[href]';
  return [...document.querySelectorAll(selector)].map((el, index) => {
    const r = el.getBoundingClientRect();
    const host = el.parentElement?.closest('[contenteditable="true"], [contenteditable="plaintext-only"]');
    const name = (el.getAttribute("aria-label") || el.title || el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 50);
    return { index, tag: el.tagName.toLowerCase(), name, cls: String(el.className).slice(0, 40), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert]"),
      insideEditable: !!host && !el.isContentEditable, host: host ? String(host.className).slice(0, 40) || host.tagName : null, disabled: !!el.disabled };
  });
});
const focusState = () => page.evaluate((TEXT) => {
  const el = document.activeElement;
  const text = !!el && (el.matches(TEXT) || el.isContentEditable);
  return { text, what: el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).slice(0, 30)} ${(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || "").slice(0, 40)}` : null };
}, TEXT);

const report = [];
for (const screen of screens) {
  if (process.env.ONLY && !screen[0].includes(process.env.ONLY)) continue;
  try { await open(screen); } catch (error) { report.push({ screen: screen[0], error: error.message.split("\n")[0] }); continue; }
  const list = (await controls()).filter((c) => c.visible && !c.disabled);
  const staticRisk = list.filter((c) => c.insideEditable).map(({ tag, name, cls, host }) => ({ tag, name, cls, host }));
  const tapped = [];
  for (const control of list) {
    try {
      await open(screen);
      const handle = (await page.$$('button, summary, select, [role="button"], input[type="checkbox"], input[type="radio"], a[href]'))[control.index];
      if (!handle) continue;
      const before = await focusState();
      await handle.tap({ timeout: 2500 });
      await page.waitForTimeout(450);
      const after = await focusState();
      if (after.text && !before.text) tapped.push({ control: `${control.tag} "${control.name}"`, cls: control.cls, focused: after.what });
    } catch { /* hidden behind something or detached: skip */ }
  }
  report.push({ screen: screen[0], controls: list.length, insideEditable: staticRisk, focusesText: tapped });
  console.log(`${screen[0]}: ${list.length} controls, ${staticRisk.length} inside editable areas, ${tapped.length} focus a text field`);
}
await fs.writeFile(process.argv[2] || "keyboard-audit.json", JSON.stringify(report, null, 2));
await browser.close();
server.close();
await fs.rm(root, { recursive: true, force: true });
