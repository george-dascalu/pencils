// Regression checks for the 27 October 2026 controls audit
// (reports/2026-10-27-controls-audit.md) and the shared dropdown rule: every
// select opens the app menu, never the platform picker.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Controls project", key: "CT" });
  const statuses = ["backlog", "todo", "in-progress", "review", "done"];
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  for (let i = 0; i < 8; i++)
    await store.createTask(project.id, { title: `Control task ${i}`, status: statuses[i % 5], start: day(i - 2), due: day(i + 3), assignee: i % 2 ? "George" : "", priority: ["low", "medium", "high"][i % 3] });
  const board = (await store.snapshot(project.id)).boards[0];
  return { project, board };
});
const green = "rgb(77, 108, 85)";
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const open = async (page, view, wait) => { await page.goto(url(view)); await page.locator(wait).first().waitFor(); };
const openBoard = (page) => open(page, `board/${app.board.id}`, "#canvas");
const cssRules = (page) => page.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } }).map((r) => r.cssText));
const menu = (page) => page.locator("#shared-select-menu");

// ----- Dropdowns -----
onDevices(["ipad"], () => {
  test("choosing an option by touch leaves the select unfocused so iOS shows no native picker", async ({ page }) => {
    await open(page, "calendar", ".calendar, .calendar-agenda");
    const select = page.locator("#calendar-mode");
    await page.locator("label:has(> #calendar-mode)").tap({ position: { x: 6, y: 8 } });
    await menu(page).waitFor({ timeout: 3000 });
    const option = menu(page).locator('[role="option"][aria-selected="false"]').first();
    const value = await option.innerText();
    // iOS opens its picker the moment a select receives focus, so count every select focus from here on.
    await page.evaluate(() => { window.__selectFocus = 0; document.addEventListener("focusin", (e) => { if (e.target.tagName === "SELECT") window.__selectFocus++; }, true); });
    await option.tap();
    await menu(page).waitFor({ state: "detached", timeout: 3000 });
    const [focused, selected] = await page.evaluate(() => [window.__selectFocus, document.querySelector("#calendar-mode").selectedOptions[0]?.label]);
    expect(selected.trim(), "the tapped option is applied").toBe(value.trim());
    expect(focused, "no select received focus after a touch choice").toBe(0);
    await expect(select).toHaveCount(1);
  });

  test("tapping a label around a select opens the app menu on touch", async ({ page }) => {
    await open(page, "settings/general", "#project-form");
    const target = (await page.locator("#settings-section-select").count()) && (await page.locator("#settings-section-select").isVisible()) ? page.locator("label:has(> #settings-section-select)") : page.locator("#project-form label:has(> select)").first();
    await target.tap({ position: { x: 6, y: 8 } });
    await menu(page).waitFor({ timeout: 3000 });
  });
});

test("clicking a label around a select opens the app menu on desktop", async ({ page }) => {
  await open(page, "calendar", ".calendar, .calendar-agenda");
  await page.locator("label:has(> #calendar-mode)").click({ position: { x: 6, y: 8 } });
  await menu(page).waitFor({ timeout: 3000 });
  await expect(page.locator("#calendar-mode")).toHaveAttribute("aria-expanded", "true");
});

test("every visible select on planning and settings pages opens the app menu", async ({ page }) => {
  const misses = [];
  for (const [view, wait] of [["calendar", ".calendar, .calendar-agenda"], ["capacity", ".capacity-view"], ["settings/general", "#project-form"], ["kanban", ".kanban-column"]]) {
    await open(page, view, wait);
    const count = await page.locator("select:visible").count();
    for (let i = 0; i < count; i++) {
      const select = page.locator("select:visible").nth(i);
      const id = (await select.getAttribute("id")) || (await select.getAttribute("name")) || `#${i}`;
      await select.click();
      const opened = await menu(page).waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (!opened) misses.push(`${view}: ${id}`);
      await page.keyboard.press("Escape");
      await expect(menu(page)).toHaveCount(0);
    }
  }
  expect(misses, `native selects: ${misses.join(", ")}`).toEqual([]);
});

test("the task picker supports type-ahead, 16px icons and a turning caret", async ({ page }) => {
  await open(page, "list", ".task-row");
  await page.locator('.task-row [data-action="task-open"]:visible').first().click();
  await page.locator("#task-form").waitFor();
  await page.locator("[data-task-picker=priority] .task-picker-trigger").click();
  await page.locator("[data-task-picker] .task-picker-popover:not([hidden])").waitFor();
  await page.keyboard.type("h");
  const focused = await page.evaluate(() => document.activeElement?.textContent.trim());
  expect(focused, `type-ahead focused "${focused}"`).toMatch(/^High/);
  const iconSize = await page.locator('[data-task-picker] .task-picker-popover:not([hidden]) [role="option"] .icon').first().evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(iconSize)).toBe(16);
  // Icon-only pickers carry no dropdown arrow at all (PEN-4, 0.19.2).
  await expect(page.locator(".task-picker.icon-only .task-picker-trigger > .icon"), "icon-only pickers show no caret").toHaveCount(0);
});

// ----- Buttons, focus, states -----
test("focus rings use focus-visible with one width", async ({ page }) => {
  await open(page, "list", ".task-row");
  const rules = await cssRules(page);
  expect(rules.some((r) => /(^|,\s*)button:focus\s*[,{]/.test(r)), "button:focus rule remains").toBe(false);
  const twoPx = rules.filter((r) => /focus-visible[^{]*\{[^}]*outline:\s*2px solid/.test(r));
  expect(twoPx.map((r) => r.slice(0, 80)), "2px focus rings remain").toEqual([]);
});

test("active states use ARIA instead of classes or primary styling", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator(".board-tools button[data-tool].active[aria-pressed='true']"), "active tool has aria-pressed").toHaveCount(1);
  expect(await page.locator(".board-tools button[data-tool][aria-pressed='false']").count()).toBeGreaterThan(0);
  await page.goto(`${app.base}/#organisation/${app.project.organisation}/settings/organisation`);
  await expect(page.locator('.settings-navigation [aria-current="page"]'), "the current settings section uses aria-current").toHaveCount(1);
  await expect(page.locator('[aria-current="page"].button.soft'), "soft is not used as a state").toHaveCount(0);
});

test("disabled controls share one treatment and checkboxes use the green accent", async ({ page }) => {
  await open(page, "settings/workflow", "#settings-panel");
  await page.locator(".settings-loading").waitFor({ state: "detached" });
  await page.locator('#settings-panel input[type="checkbox"]').first().waitFor();
  const [cursor, opacity, accent] = await page.evaluate(() => { const b = document.createElement("button"); b.disabled = true; document.body.append(b); const s = getComputedStyle(b); const c = document.querySelector('#settings-panel input[type="checkbox"]'); const out = [s.cursor, s.opacity, getComputedStyle(c).accentColor]; b.remove(); return out; });
  expect(cursor).toBe("not-allowed");
  expect(opacity).toBe("0.45");
  expect(accent).toBe(green);
});

test("search fields are typed and carry the magnifier; invalid fields are visible", async ({ page }) => {
  await open(page, "list", ".task-row");
  await expect(page.locator("#search")).toHaveAttribute("type", "search");
  const naked = await page.evaluate(() => [...document.querySelectorAll('input[type="search"]')].filter((el) => el.getClientRects().length && !el.closest(".search") && getComputedStyle(el).backgroundImage === "none").map((el) => el.id || el.placeholder));
  expect(naked, `search inputs without icon: ${naked.join(", ")}`).toEqual([]);
  const invalid = await page.evaluate(() => { const i = document.createElement("input"); i.setAttribute("aria-invalid", "true"); document.body.append(i); const c = getComputedStyle(i).borderTopColor; i.remove(); return c; });
  expect(invalid, "aria-invalid has no visible border").not.toBe("rgb(220, 224, 213)");
});

test("text glyphs are gone from buttons and drag handles", async ({ page }) => {
  await openBoard(page);
  await open(page, "table", ".spreadsheet");
  const glyphs = await page.evaluate(() => [...document.querySelectorAll("button, summary, a.button")].filter((el) => /[⛶‹›↶↷⠿←→]/.test(el.textContent)).map((el) => `${el.className} "${el.textContent.trim().slice(0, 16)}"`));
  expect(glyphs, `glyphs: ${glyphs.join(" | ")}`).toEqual([]);
});

test("icons inside controls are 16px, including the selection toolbar", async ({ page }) => {
  await openBoard(page);
  await page.locator('.board-tools [data-tool="sticky"]').click();
  await page.locator("#canvas").click({ position: { x: 500, y: 400 } });
  // A new sticky opens its text editor with the floating formatting toolbar.
  await expect(page.locator(".inline-floating-tools")).toBeVisible();
  const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll(".selection-action > .icon, .icon-button > .icon, .button > .icon")].filter((el) => el.getClientRects().length).map((el) => Math.round(el.getBoundingClientRect().width)))]);
  expect(sizes, `icon sizes ${sizes.join(",")}`).toEqual([16]);
});

test("counts, tags and assignee chips share one size", async ({ page }) => {
  await open(page, "list", ".task-row");
  const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll(".count, .tab-count, .tag")].filter((el) => el.getClientRects().length).map((el) => getComputedStyle(el).fontSize))]);
  expect(sizes, `count sizes ${sizes.join(",")}`).toEqual(["11px"]);
  const chip = await page.locator(".task-row .task-assignee").first().evaluate((el) => Math.round(el.getBoundingClientRect().height));
  // Lists use the shared list chip: 24px avatars with room inside a 32px target (0.19.11).
  expect(chip).toBe(24);
});

test("textareas and inputs share one text size and border token", async ({ page }) => {
  await open(page, "settings/general", "#project-form");
  const textarea = await page.evaluate(() => getComputedStyle(document.querySelector("#project-form textarea")).fontSize);
  expect(textarea).toBe("13px");
  const border = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--control-border").trim());
  expect(border, "no --control-border token").toBeTruthy();
});

test("sliders use the shared range styling with a live value", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("button", { name: /board appearance/i }).first().click();
  const range = page.locator("#board-settings-form #board-pattern-spacing");
  await range.waitFor();
  const [accent, border, valuetext] = await range.evaluate((el) => [getComputedStyle(el).accentColor, getComputedStyle(el).borderTopWidth, el.getAttribute("aria-valuetext")]);
  expect(accent).toBe(green);
  expect(border).toBe("0px");
  expect(valuetext, "slider lacks aria-valuetext").toBeTruthy();
});

// Owner request (T15, 31 October 2026): a tap or click on a date field opens the app's calendar,
// never the platform's picker (iOS wheels, Firefox's popup); a tap leaves the field unfocused, as
// iOS opens its wheels on focus, and the keyboard still types a date.
onDevices(["desktop", "phone"], (device) => test("a tap or click on a date field opens only the app's calendar", device === "desktop" ? { tag: "@gate" } : {}, async ({ page, device }) => {
  await open(page, "list", ".task-row");
  await page.locator('.task-row [data-action="task-open"]:visible').first().click();
  await page.locator("#task-form").waitFor();
  const date = page.locator('#task-form .date-field > input[type="date"]:visible').first();
  await page.evaluate(() => {
    window.__dateFocus = 0;
    window.__dateDefault = [];
    document.addEventListener("focusin", (e) => { if (e.target.type === "date") window.__dateFocus++; }, true);
    for (const type of ["pointerdown", "mousedown", "click"])
      window.addEventListener(type, (e) => { if (e.target.type === "date") window.__dateDefault.push([type, e.defaultPrevented]); });
  });
  await (device === "phone" ? date.tap() : date.click());
  await page.locator("#shared-date-picker").waitFor();
  const [focus, defaults] = await page.evaluate(() => [window.__dateFocus, window.__dateDefault]);
  expect(defaults.length && defaults.every(([, prevented]) => prevented), `the platform's own handling is cancelled ${JSON.stringify(defaults)}`).toBe(true);
  if (device === "phone") expect(focus, "a tap leaves the field unfocused").toBe(0);
  const day = page.locator("#shared-date-picker table [data-date-value]").nth(15);
  const value = await day.getAttribute("data-date-value");
  await day.click();
  await expect(page.locator("#shared-date-picker")).toHaveCount(0);
  await expect(date).toHaveValue(value);
  if (device === "desktop") {
    // A click leaves the field focused, so typing still enters a date (en-GB: day, month, year).
    await date.click();
    await page.locator("#shared-date-picker").waitFor();
    await page.keyboard.type("24122026");
    await expect(date).toHaveValue("2026-12-24");
    await page.keyboard.press("Escape");
    await expect(page.locator("#shared-date-picker")).toHaveCount(0);
    // A double click leaves the calendar open.
    await date.dblclick();
    await expect(page.locator("#shared-date-picker")).toHaveCount(1);
    return;
  }
  // A tap on a date field's label text opens the calendar too, and focuses nothing.
  await open(page, "timeline", "[data-task-dates]");
  await page.locator("[data-task-dates]:visible").first().tap();
  const label = page.locator("#task-dates-popover label", { hasText: "Start date" });
  await label.waitFor();
  await page.evaluate(() => (window.__dateFocus = 0));
  await label.tap({ position: { x: 4, y: 4 } });
  await page.locator("#shared-date-picker").waitFor();
  expect(await page.evaluate(() => window.__dateFocus), "a label tap leaves the field unfocused").toBe(0);
}));

// Owner request (T16, 31 October 2026): the calendar's day numbers are a step smaller (12px)
// than the page's controls, with the same 32px (44px on touch) targets.
onDevices(["desktop", "phone"], () => test("the calendar's day numbers are a step smaller", async ({ page, device }) => {
  await open(page, "list", ".task-row");
  await page.locator('.task-row [data-action="task-open"]:visible').first().click();
  await page.locator("#task-form .date-picker-trigger:visible").first().click();
  const day = page.locator("#shared-date-picker table [data-date-value]").first();
  await day.waitFor();
  await expect(day).toHaveCSS("font-size", "12px");
  const height = (await day.boundingBox()).height;
  expect(height, `${device}: the target keeps its height`).toBeGreaterThanOrEqual(device === "phone" ? 44 : 32);
}));

// Menus of rows use the tighter menu padding; popovers that hold fields keep the popover padding.
test("popovers share padding and radius tokens", async ({ page }) => {
  await open(page, "list", ".task-row");
  await page.locator("[data-sort-menu]").click();
  await menu(page).waitFor();
  const select = await menu(page).evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).borderTopLeftRadius]);
  await page.keyboard.press("Escape");
  await page.locator('.task-row [data-action="task-open"]:visible').first().click();
  await page.locator("#task-form").waitFor();
  await page.locator("#task-form .date-picker-trigger").first().click();
  const picker = await page.locator(".date-picker-popover").evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).borderTopLeftRadius]);
  expect(select, "select menus use the menu padding").toEqual(["4px", picker[1]]);
  expect(picker, "the date picker keeps the popover padding and shares the radius").toEqual(["8px", select[1]]);
});

test("empty states share one component and the timeline empty state has text", async ({ page }) => {
  await open(page, "documents", ".documents-workspace");
  await expect(page.locator(".documents-workspace .empty"), "documents empty state uses .empty").toHaveCount(1);
  const empty = await app.store.createProject({ title: "Empty project" });
  await page.goto(`${app.base}/#project/${empty.id}/timeline`);
  await page.locator(".task-timeline").waitFor();
  await expect(page.locator(".task-timeline .empty").first()).toHaveText(/no cards yet|add a card/i);
});

test("toasts can be dismissed and md-tabs are gone", async ({ page }) => {
  await open(page, "list", ".task-row");
  const rules = await cssRules(page);
  expect(rules.some((r) => r.includes(".md-tabs")), ".md-tabs CSS remains").toBe(false);
  await page.evaluate(() => window.PencilsToast?.("Hello"));
  const toast = page.locator("#toasts .toast");
  if (await toast.count()) {
    await expect(toast.locator("[data-toast-close]"), "toast has a close control").toHaveCount(1);
    await page.keyboard.press("Escape");
    await toast.waitFor({ state: "detached", timeout: 2000 });
  }
});
