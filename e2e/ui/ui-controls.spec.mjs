// Regression checks for the 27 October 2026 controls audit
// (reports/2026-10-27-controls-audit.md) and the shared dropdown rule: every
// select opens the app menu, never the platform picker. Cosmetic checks moved to
// ui-controls-polish.spec.mjs, split by tier (F0.22-21).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Controls project", key: "CT" });
  const statuses = ["backlog", "todo", "in-progress", "review", "done"];
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  for (let i = 0; i < 8; i++)
    await store.createTask(project.id, { title: `Control task ${i}`, status: statuses[i % 5], start: day(i - 2), due: day(i + 3), assignee: i % 2 ? "George" : "", priority: ["low", "medium", "high"][i % 3] });
  return { project };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const open = async (page, view, wait) => { await page.goto(url(view)); await page.locator(wait).first().waitFor(); };
const menu = (page) => page.locator("#shared-select-menu");

// ----- Dropdowns -----
onDevices(["ipad"], () => {
  test("choosing an option by touch leaves the select unfocused so iOS shows no native picker", async ({ page }) => {
    await open(page, "calendar", ".calendar, .calendar-agenda");
    const select = page.locator("#calendar-mode");
    await page.locator("#calendar-mode-button").tap({ position: { x: 6, y: 8 } });
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
    await open(page, "settings/views", "#project-form");
    const target = (await page.locator("#settings-section-select").count()) && (await page.locator("#settings-section-select").isVisible()) ? page.locator("label:has(> #settings-section-select)") : page.locator("#project-form label:has(> select)").first();
    await target.tap({ position: { x: 6, y: 8 } });
    await menu(page).waitFor({ timeout: 3000 });
  });
});

test("clicking the calendar layout icon opens the app menu on desktop", async ({ page }) => {
  await open(page, "calendar", ".calendar, .calendar-agenda");
  await page.locator("#calendar-mode-button").click({ position: { x: 6, y: 8 } });
  await menu(page).waitFor({ timeout: 3000 });
  await expect(page.locator("#calendar-mode")).toHaveAttribute("aria-expanded", "true");
});

test("every visible select on planning and settings pages opens the app menu", async ({ page }) => {
  const misses = [];
  for (const [view, wait] of [["calendar", ".calendar, .calendar-agenda"], ["capacity", ".capacity-view"], ["settings/general", "#project-form"], ["kanban", ".kanban-column"]]) {
    await open(page, view, wait);
    const count = await page.locator("select:visible:not([aria-hidden=true])").count();
    for (let i = 0; i < count; i++) {
      const select = page.locator("select:visible:not([aria-hidden=true])").nth(i);
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

// Owner request (T15, 31 October 2026): a tap or click on a date field opens the app's calendar,
// never the platform's picker (iOS wheels, Firefox's popup); a tap leaves the field unfocused, as
// iOS opens its wheels on focus, and the keyboard still types a date.
onDevices(["desktop", "phone"], (device) => test("a tap or click on a date field opens only the app's calendar", device === "desktop" ? { tag: "@gate" } : {}, async ({ page, device, browserName }) => {
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
  // Pick a valid start before the existing due date, even as the seed month changes.
  const prior = new Date(`${await date.inputValue()}T12:00:00`); prior.setDate(prior.getDate() === 1 ? 2 : prior.getDate() - 1);
  // Match the picker's ISO key for every valid year, including years below 1000.
  const value = `${String(prior.getFullYear()).padStart(4, "0")}-${String(prior.getMonth() + 1).padStart(2, "0")}-${String(prior.getDate()).padStart(2, "0")}`;
  const day = page.locator(`#shared-date-picker table [data-date-value="${value}"]`);
  await day.click();
  // The start and due pair shares one calendar: after the start it waits for the due date.
  await expect(page.locator('#shared-date-picker [data-date-phase="due"]')).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(2, 2); // a click outside keeps the staged start
  await expect(page.locator("#shared-date-picker")).toHaveCount(0);
  await expect(date).toHaveValue(value);
  if (device === "desktop") {
    // A click leaves the field focused, so typing still enters a date.
    // Linux WebKit's date fields take no typing at all (Safari's do), so it checks the rest.
    await date.click();
    await page.locator("#shared-date-picker").waitFor();
    if (!(browserName === "webkit" && process.platform === "linux")) {
      // Firefox's native field can retain month/day order despite the context's en-GB locale.
      await page.keyboard.type("12122026");
      await expect(date).toHaveValue("2026-12-12");
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("#shared-date-picker")).toHaveCount(0);
    // A double click leaves the calendar open.
    await date.dblclick();
    await expect(page.locator("#shared-date-picker")).toHaveCount(1);
    return;
  }
  // A tap on the date popover's field opens the calendar too, and focuses nothing. Its fields have no
  // visible labels since F0.23-11 (compact-dates.spec.mjs).
  await open(page, "timeline", "[data-task-dates]");
  await page.locator("[data-task-dates]:visible").first().tap();
  const field = page.locator("#task-dates-popover").getByLabel("Start date", { exact: true });
  await field.waitFor();
  await page.evaluate(() => (window.__dateFocus = 0));
  await field.tap({ position: { x: 4, y: 4 } });
  await page.locator("#shared-date-picker").waitFor();
  expect(await page.evaluate(() => window.__dateFocus), "a tap leaves the field unfocused").toBe(0);
}));

