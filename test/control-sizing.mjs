import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { reveal } from "./menu-controls.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-control-sizing-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Shared controls" });
await store.createTask(project.id, { title: "Review controls", assignee: "George", priority: "high", start: "2026-10-20", due: "2026-10-24" });
await store.createDocument(project.id, { title: "Brief", body: "# Project brief\n\nReview **every** view." });
const server = createServer(store);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const kind = process.env.BROWSER || "chromium";
const browser = await { chromium, webkit }[kind].launch();
const errors = [];
try {
  for (const width of [1500, 768, 390]) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: touch });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    let height = touch ? 44 : 36;
    const controls = ".button,.icon-button,.tab,.avatar,.project-link,.directory-link,.side-new,.organisation-actions button,.side-label button,.settings-navigation nav a,.task-picker-trigger,.board-menu>summary,.view-layout-switcher,.view-layout-switcher button,.search:has(> input),.selection-action,.board-tools button,.select-menu [role=option],.task-picker-popover [role=option],input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]),select:not([multiple])";
    async function check(scope, name) {
      const result = await page.locator(scope).locator(controls).evaluateAll((els, expected) =>
        els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
          .map(el => ({
            name: el.getAttribute("aria-label") || el.id || el.textContent.trim().slice(0, 55),
            height: el.getBoundingClientRect().height,
            expected: expected < 44 && el.closest(".board-menu-panel,.select-menu,.task-picker-popover,.selection-menu > .selection-popover") ? 28 : expected,
          }))
          .filter(el => Math.abs(el.height - el.expected) > 1), height);
      assert.deepEqual(result, [], `${width} ${name}: page and compact menu controls use shared heights`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) {
        await page.screenshot({ path: `/tmp/pencils-controls-overflow-${width}.png`, fullPage: true });
        console.log(await page.locator("#view-content *").evaluateAll(els => els.filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map(el => [el.tagName, el.className, el.id, el.getBoundingClientRect().toJSON()])));
      }
      assert.ok(!overflow, `${width} ${name}: no page overflow`);
    }
    const views = {
      overview: ".project-overview",
      documents: ".documents-workspace",
      list: ".list-group",
      tree: ".tree-wrapper",
      table: ".spreadsheet",
      kanban: ".kanban",
      timeline: ".task-timeline",
      calendar: ".calendar, .calendar-agenda",
      capacity: ".capacity-view",
      board: "#canvas",
    };
    for (const [view, selector] of Object.entries(views)) {
      // Change query too: wait for a fresh view instead of matching the old DOM
      // while asynchronous hash navigation is still loading another project.
      await page.goto(`${base}/?sizing=${view}#project/${project.id}/${view}`);
      await page.locator(selector).first().waitFor();
      if (touch) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => window.PencilsAppearance.write({ theme, density: "comfortable" }), theme);
        await check(".main > .topbar", `${view} header ${theme}`);
        await check("#view-toolbar", `${view} toolbar ${theme}`);
        if (view === "overview" && !touch) await check(".sidebar", "sidebar");
      }
      if (view === "documents") {
        await check("#document-form", "document editor");
        assert.equal(await page.locator("[data-document-recovery]").isVisible(), false);
      }
      if (view === "table") {
        await check(".spreadsheet tbody", "table cells");
        await page.locator(".spreadsheet tbody select").first().click();
        await check("#shared-select-menu", "dropdown options");
        await page.keyboard.press("Escape");
        await (await reveal(page.locator("#column-list"))).waitFor({ state: "visible" });
        await check(".table-columns-panel", "columns menu");
        await page.keyboard.press("Escape");
        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
          for (const key of ["groups", "sorts", "filters"]) {
            const menu = page.locator(`[data-board-menu="table-${key}"]`);
            await menu.locator("summary").click();
            if (key === "sorts") await menu.locator('[data-table-action="add-sort"]').click();
            await check(`[data-board-menu="table-${key}"] .table-menu-panel`, `${key} menu ${theme}`);
            assert.equal(await menu.locator(".table-menu-panel > p").count(), 0, "Menus start with controls instead of explanatory text");
            await page.screenshot({ path: `/tmp/pencils-compact-menu-${key}-${width}-${theme}-${kind}.png` });
            if (key === "sorts") await menu.locator('[data-table-action="clear-sorts"]').click();
            await page.keyboard.press("Escape");
          }
        }
        if (!touch) {
          height = 32;
          await page.evaluate(() => window.PencilsAppearance.write({ density: "compact" }));
          await check("#view-toolbar", "compact toolbar");
          await check(".spreadsheet tbody", "compact table");
          await page.locator('[data-board-menu="table-filters"] > summary').click();
          await check('[data-board-menu="table-filters"] .table-menu-panel', "compact density menu");
          await page.keyboard.press("Escape");
          height = 36;
          await page.evaluate(() => window.PencilsAppearance.write({ density: "comfortable" }));
        }
      }
      if (view === "board") await check(".board-tools", "board tools");
      if (["timeline", "calendar", "capacity"].includes(view)) await check(".planning-head", `${view} controls`);
      if (["table", "documents", "board"].includes(view))
        await page.screenshot({ path: `/tmp/pencils-controls-${width}-${view}-${kind}.png` });
    }
    await page.goto(`${base}/?sizing=modal#project/${project.id}/list`);
    await page.locator(".row-open").first().click();
    await page.locator("#task-form").waitFor();
    await check("#task-form", "task editor");
    await page.locator("#task-form [data-task-picker=priority] .task-picker-trigger").click();
    await check(".task-picker-popover", "priority options");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `/tmp/pencils-controls-${width}-modal-${kind}.png` });
    await page.goto(`${base}/?sizing=settings#project/${project.id}/settings/general`);
    await page.locator("[data-settings-form]").waitFor();
    await check("#view-content", "project settings");
    await page.locator('[data-personal="settings"]').click();
    await page.locator("[name=personal-density]").waitFor();
    await check(".dialog", "personal settings");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${kind}: shared sizes across views, editor, menus, density settings, themes and touch passed`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await store.close();
  await fs.rm(root, { recursive: true, force: true });
}
