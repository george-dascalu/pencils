// Compact dates and times (owner request F0.23-11): the card editor and the List row's date popover
// share one date range, with each time beside its date (start date and time → due date and time) on
// one line where there is room, no labelled row of times (the names stay for screen readers), and
// fields as wide as what they hold; touch keeps 44px targets.
import { test, expect, useApp, onDevices } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Compact dates" }) }));
const seed = () => app.store.createTask(app.project.id, { title: "Timed card", start: "2026-11-11", due: "2026-11-13", start_time: "09:00", due_time: "17:30" });
const rects = (scope) => scope.evaluate((el) => {
  const box = (selector) => { const r = el.querySelector(selector)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, mid: r.y + r.height / 2 }; };
  const visibleText = [...el.querySelectorAll("label, span, p")].filter((n) => n.getClientRects().length && n.getBoundingClientRect().height > 1 && !n.closest(".sr-only")).map((n) => n.textContent.trim());
  return { group: box("[data-date-range]"), start: box('[name="start"]'), from: box('[name="start_time"]'), due: box('[name="due"]'), to: box('[name="due_time"]'), arrow: box("[data-date-range] > [aria-hidden]"), allDay: box("[data-task-allday]"), visibleText };
});
const sameLine = (a, b, what) => expect(Math.abs(a.mid - b.mid), what).toBeLessThanOrEqual(2);

onDevices(["desktop", "ipad", "phone"], () => {
  test("the card editor puts each time beside its date, without a labelled row, and fields fit what they hold @gate", async ({ page, device, browserName }) => {
    const card = await seed();
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
    const form = page.locator("#task-form"), dates = form.locator(".task-dates");
    await expect(form.getByLabel("Start time", { exact: true })).toHaveValue("09:00");
    await expect(form.getByLabel("End time", { exact: true })).toHaveValue("17:30");
    const r = await rects(dates);
    // Each time follows its date on the same line; the due pair follows the arrow.
    sameLine(r.start, r.from, "start time beside its date");
    sameLine(r.due, r.to, "end time beside its date");
    expect(r.from.x).toBeGreaterThanOrEqual(r.start.right - 1);
    expect(r.to.x).toBeGreaterThanOrEqual(r.due.right - 1);
    // One line where the panel has room (desktop and iPad, F0.23-13's wider panel); short of it (phones),
    // the due pair stacks under the start pair in the same box, the arrow turned down beside them.
    const range = dates.locator("[data-date-range]");
    // Linux WebKit draws times with seconds, wider than Safari's, so its line may wrap after the arrow.
    if (device !== "phone" && browserName !== "webkit") {
      sameLine(r.start, r.to, "one line on desktop");
      expect(r.arrow.x).toBeGreaterThanOrEqual(r.from.right - 1);
      expect(r.due.x).toBeGreaterThanOrEqual(r.arrow.right - 1);
      await expect(range).toHaveCSS("display", "flex");
    } else if (device === "phone") {
      expect(r.due.y, "due below start").toBeGreaterThanOrEqual(r.start.y + r.start.h - 1);
      expect(Math.abs(r.due.x - r.start.x), "lined up").toBeLessThanOrEqual(1);
      await expect(range).toHaveCSS("display", "grid");
      await expect(range.locator("> [aria-hidden]")).toHaveCSS("rotate", "90deg");
    }
    expect(r.visibleText.filter((t) => /Start time|End time/.test(t)), "no visible time labels").toEqual([]);
    // Inside the group; the group is as wide as its fields, and All day follows it.
    for (const key of ["start", "from", "due", "to"]) {
      expect(r[key].x, key).toBeGreaterThanOrEqual(r.group.x - 1);
      expect(r[key].right, key).toBeLessThanOrEqual(r.group.right + 1);
      if (device !== "desktop") expect(r[key].h, `${key} keeps a 44px target`).toBeGreaterThanOrEqual(44);
    }
    const cell = await dates.boundingBox();
    expect(r.group.w, "not stretched across the row").toBeLessThan(cell.width - r.allDay.w - 4);
    expect(r.allDay.x - r.group.right, "All day follows the dates").toBeLessThanOrEqual(12);
    // The date inputs hold their text without a wide gap after it.
    // The start date keeps room for the calendar button.
    const widths = await dates.locator('[name="due"], [name="start_time"], [name="due_time"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    for (const width of widths) expect(width, "sized to its value").toBeLessThan(150);
    expect(r.start.w, "start sized to its value and calendar button").toBeLessThan(200);
    await expect(dates.locator('[name="start_time"]')).toHaveCSS("border-top-width", "0px");
    await page.screenshot({ path: test.info().outputPath(`card-dates-${device}.png`) });
    // All day takes the times away and leaves the dates as they were.
    await form.getByRole("button", { name: "All day", exact: true }).click();
    await expect(form.getByLabel("Start time", { exact: true })).toBeHidden();
    await expect(form.getByLabel("End time", { exact: true })).toBeHidden();
    await expect(form.getByLabel("Start date", { exact: true })).toHaveValue("2026-11-11");
    const saved = async () => { const t = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === card.id); return [t.start, t.start_time, t.due, t.due_time]; };
    await expect.poll(saved).toEqual(["2026-11-11", null, "2026-11-13", null]);
    // Timed again: times come back beside their dates, an hour apart from nine, and save.
    await form.getByRole("button", { name: "All day", exact: true }).click();
    await expect(form.getByLabel("Start time", { exact: true })).toHaveValue("09:00");
    await expect(form.getByLabel("End time", { exact: true })).toHaveValue("10:00");
    await expect.poll(saved).toEqual(["2026-11-11", "09:00", "2026-11-13", "10:00"]);
  });

  test("the List row's date popover shares the compact range, each time beside its date @gate", async ({ page, device }) => {
    const card = await seed();
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator(`[data-task-order-row="${card.id}"] [data-row-dates]:visible`).click();
    const popover = page.locator("#task-dates-popover");
    await expect(popover).toBeVisible();
    const r = await rects(popover);
    sameLine(r.start, r.from, "start time beside its date");
    sameLine(r.due, r.to, "end time beside its date");
    expect(r.from.x).toBeGreaterThanOrEqual(r.start.right - 1);
    expect(r.visibleText.filter((t) => /^(Start|Due) date$|Start time|End time/.test(t)), "no visible field labels").toEqual([]);
    expect(r.allDay.y + r.allDay.h, "All day leads, above the dates").toBeLessThanOrEqual(r.group.y + 1);
    expect(await popover.evaluate((el) => el.scrollWidth - el.clientWidth), "no sideways overflow").toBeLessThanOrEqual(1);
    if (device !== "desktop") for (const key of ["start", "from", "due", "to"]) expect(r[key].h, key).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`popover-dates-${device}.png`) });
    // Times still save from here.
    await popover.getByLabel("End time", { exact: true }).fill("18:15");
    await popover.getByLabel("End time", { exact: true }).blur();
    await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === card.id).due_time).toBe("18:15");
  });
});

// Owner request (F0.23-17): beside the dates (desktop and iPad), the status is as wide as its longest
// name, not the whole row, and its box ends with its last field, leaving the rest of the row to the
// dates. Phones keep the box that ends where Close does (e2e/ui/pencils-tasks.spec.mjs).
onDevices(["desktop", "ipad"], () => {
  test("the card editor's status is as wide as its longest name and its box no wider than its fields @gate", async ({ page }) => {
    const card = await seed();
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
    const fields = page.locator("#task-form .task-fields");
    await expect(fields).toBeVisible();
    const fit = await fields.evaluate((box) => {
      const select = box.querySelector('select[name="status"]'), field = select.closest(".field");
      const pen = document.createElement("canvas").getContext("2d");
      pen.font = getComputedStyle(select).font;
      const longest = Math.max(...[...select.options].map((option) => pen.measureText(option.text).width));
      const last = [...box.children].filter((el) => el.getClientRects().length).at(-1).getBoundingClientRect();
      return { status: field.getBoundingClientRect().width, longest, gap: box.getBoundingClientRect().right - last.right };
    });
    expect(fit.status, `status ${JSON.stringify(fit)}`).toBeLessThanOrEqual(fit.longest + 72);
    expect(fit.gap, `box ends with its last field ${JSON.stringify(fit)}`).toBeLessThanOrEqual(2);
  });
});
