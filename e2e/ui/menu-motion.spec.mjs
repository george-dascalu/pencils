// Owner request (T18, 31 October 2026): dropdowns open and close with a short fade when the
// device allows motion. The shared select menu fades in and out; board menus and the phone's
// View options fade in (their panels are native disclosures, which close at once). With reduced
// motion, as the fixtures ask for, nothing animates and every flow still ends with the menu gone.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { documentTool } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Menu motion", key: "MM" });
  const one = await store.createTask(project.id, { title: "One", status: "todo" });
  await store.createTask(project.id, { title: "Two", status: "done" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "note", type: "sticky", text: "Idea", comments: [{ id: "c1", text: "A comment", author: "Alice" }], x: 150, y: 120, w: 220, h: 220 }], edges: [] });
  const document = await store.createDocument(project.id, { title: "Notes", body: "Some notes" });
  return { project, one, document };
});
const menu = (page) => page.locator("#shared-select-menu");
// Seconds of the longest transition; reduced motion leaves a hair (0.01ms) rather than none.
const duration = (locator) => locator.evaluate((el) => Math.max(...getComputedStyle(el).transitionDuration.split(",").map(parseFloat)));

onDevices(["desktop", "phone"], () => test("dropdowns fade only when motion is allowed, and every way of closing still removes them", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  const status = page.locator("#filter-status");
  // The select sits in the Filters menu (View options on phones), which a click outside closes too.
  await clickControl(status);
  await menu(page).waitFor();
  expect(await duration(menu(page)), `${device}: no fade with reduced motion`).toBeLessThan(0.01);
  await menu(page).getByRole("option", { name: "Done", exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator(".task-row")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await clickControl(status);
  await menu(page).waitFor();
  expect(await duration(menu(page)), `${device}: a fade with motion`).toBeGreaterThanOrEqual(0.1);
  await expect(menu(page)).toHaveCSS("opacity", "1");
  // Closing fades the menu out, then removes it; while fading it is no longer the open menu
  // (no id), so the rest of the app doesn't wait on it. Checked in one task, before the fade ends.
  expect(await page.evaluate(() => {
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    const fading = document.querySelector(".select-menu");
    return fading && { closing: fading.classList.contains("closing"), id: fading.id, animating: fading.getAnimations().length > 0 };
  }), `${device}: fades out`).toEqual({ closing: true, id: "", animating: true });
  await expect(page.locator(".select-menu")).toHaveCount(0);
  // Opening fades in; opening again while the last menu still fades leaves one menu, not two.
  expect(await status.evaluate((select) => {
    select.click();
    const opened = document.querySelector("#shared-select-menu");
    const fadeIn = opened.getAnimations().length > 0;
    select.click();
    select.click();
    return { fadeIn, menus: document.querySelectorAll(".select-menu").length, open: document.querySelectorAll("#shared-select-menu").length };
  }), `${device}: fades in, one menu`).toEqual({ fadeIn: true, menus: 1, open: 1 });
  await expect(menu(page)).toHaveCount(1);
  // Choosing and a click outside each remove the menu once its fade ends.
  await menu(page).getByRole("option", { name: "All statuses", exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator(".task-row")).toHaveCount(2);
  await clickControl(status);
  await menu(page).waitFor();
  await page.mouse.click(6, page.viewportSize().height / 2);
  await expect(menu(page)).toHaveCount(0);
  // Disclosure menus fade in when opened by hand (the Filters menu on desktop, View options on
  // phones), but not when a re-render recreates them open, or every filter pick would flash.
  const details = page.locator(device === "phone" ? ".mobile-view-options" : '[data-board-menu="filters"]');
  const panelSelector = device === "phone" ? ".mobile-view-options-panel" : ".board-menu-panel";
  const panel = details.locator(panelSelector);
  if (await details.evaluate((el) => el.open)) await details.locator(":scope > summary").click();
  await expect(details).not.toHaveAttribute("open", "");
  expect(await details.evaluate((el, panelSelector) => {
    el.querySelector(":scope > summary").click();
    return el.open && el.querySelector(panelSelector).getAnimations().length > 0;
  }, panelSelector), `${device}: the panel fades in`).toBe(true);
  await expect(panel).toHaveCSS("opacity", "1");
  await status.click();
  await menu(page).getByRole("option", { name: "Done", exact: true }).click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  expect(await details.evaluate((el, panelSelector) => el.open && el.querySelector(panelSelector).getAnimations().length, panelSelector), `${device}: no fade on a re-render`).toBe(0);
}));

// Owner request (T53, 1 November 2026): every dropdown opens with the same small motion, a fade
// with a short drop and grow (--menu-motion in controls.css): menus, selects, the card editor's
// pickers, comment reactions and document search options. With reduced motion none moves. A gate
// test, since engines differ in @starting-style.
test("every dropdown opens with a fade, drop and grow only when motion is allowed, and still works", { tag: "@gate" }, async ({ page }) => {
  const modes = [["reduce", []], ["no-preference", ["opacity", "scale", "translate"]]];
  // What a dropdown's panel animates once its trigger is pressed, read in the press's own task.
  const opening = (trigger, panel) => trigger.evaluate((el, panel) => {
    el.click();
    return document.querySelector(panel).getAnimations().map((a) => a.transitionProperty).sort();
  }, panel);
  const closed = async (details) => {
    if (await details.evaluate((el) => el.open)) await details.locator(":scope > summary").click();
  };
  const saved = () => app.store.snapshot(app.project.id);

  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  const filters = page.locator('[data-board-menu="filters"]');
  for (const [reducedMotion, moves] of modes) {
    await page.emulateMedia({ reducedMotion });
    await closed(filters);
    expect(await opening(filters.locator(":scope > summary"), '[data-board-menu="filters"] > .board-menu-panel'), `a menu, ${reducedMotion}`).toEqual(moves);
    expect(await opening(page.locator("#filter-status"), "#shared-select-menu"), `a select, ${reducedMotion}`).toEqual(moves);
    await menu(page).getByRole("option", { name: "All statuses", exact: true }).click();
    await expect(menu(page)).toHaveCount(0);
  }

  await page.locator(`[data-action=task-open][data-id="${app.one.id}"]`).first().click();
  const priority = page.locator('#task-form [data-task-picker="priority"]');
  for (const [i, [reducedMotion, moves]] of modes.entries()) {
    await page.emulateMedia({ reducedMotion });
    expect(await opening(priority.locator(".task-picker-trigger"), '#task-form [data-task-picker="priority"] .task-picker-popover'), `a card editor picker, ${reducedMotion}`).toEqual(moves);
    const level = ["High", "Low"][i];
    await priority.getByRole("option", { name: level, exact: true }).click();
    await expect.poll(async () => (await saved()).tasks.find((t) => t.id === app.one.id).priority).toBe(level.toLowerCase());
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#task-form")).toBeHidden();

  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.document.id}`);
  await page.locator(".cm-content").first().waitFor();
  await documentTool(page, "Find in document");
  const options = page.locator(".document-search-options"), matchCase = options.getByRole("button", { name: "Match case", exact: true });
  for (const [reducedMotion, moves] of modes) {
    await page.emulateMedia({ reducedMotion });
    await closed(options);
    expect(await opening(options.locator(":scope > summary"), ".document-search-option-list"), `search options, ${reducedMotion}`).toEqual(moves);
    const pressed = await matchCase.getAttribute("aria-pressed");
    await matchCase.click();
    await expect(matchCase).toHaveAttribute("aria-pressed", String(pressed !== "true"));
  }

  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("[data-node=note]").click();
  await page.locator("#selection-tools [data-pro=comments]").click();
  const reactions = page.locator('.board-comments [data-comment-id="c1"] .comment-emoji-menu');
  for (const [i, [reducedMotion, moves]] of modes.entries()) {
    await page.emulateMedia({ reducedMotion });
    await closed(reactions);
    expect(await opening(reactions.locator(":scope > summary"), '.board-comments [data-comment-id="c1"] .comment-emoji-picker'), `reactions, ${reducedMotion}`).toEqual(moves);
    await reactions.locator('[data-emoji="👍"]').click();
    await expect.poll(async () => ((await saved()).boards[0].nodes[0].comments[0].reactions || []).length).toBe(1 - i);
  }
});
