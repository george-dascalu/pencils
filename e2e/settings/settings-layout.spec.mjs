// People, appearance and sidebar controls keep a compact, aligned layout on every device.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";
const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: "Layout", people: [{ id: "george", name: "George", capacity: 40 }], teams: [] });
  const project = await store.createProject({ title: "Layout", organisation: organisation.id });
  return { organisation, project };
});
onDevices(["desktop", "ipad", "phone"], () => {
  test("people fields align and availability expands below them", async ({ page, device }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/settings/organisation`);
    const person = page.locator('[data-person="george"]');
    await expect(person).toBeVisible();
    const fields = person.locator(':scope > label input');
    await expect(fields).toHaveCount(4);
    const before = await fields.evaluateAll(els => els.map(el => el.getBoundingClientRect().top - el.closest(".person-row").getBoundingClientRect().top));
    if (device === "desktop") expect(Math.max(...before) - Math.min(...before)).toBeLessThan(1);
    await person.locator("summary").click();
    expect(await fields.evaluateAll(els => els.map(el => el.getBoundingClientRect().top - el.closest(".person-row").getBoundingClientRect().top))).toEqual(before);
    expect(await person.locator("details").evaluate(el => getComputedStyle(el).gridColumn)).toBe("1 / -1");
    const days = person.locator("[data-person-day]");
    await days.first().uncheck();
    await expect.poll(async () => (await app.store.getOrganisation(app.organisation.id)).people[0].working_days).not.toContain(1);
    await days.first().check();
    await person.locator('[data-person-field="time_off"]').fill("2026-12-24, 2026-12-25");
    const scroll = await page.locator("#view-content").evaluate(el => el.scrollTop);
    await person.locator('[data-person-field="time_off"]').blur();
    await expect.poll(async () => (await app.store.getOrganisation(app.organisation.id)).people[0].time_off).toEqual(["2026-12-24", "2026-12-25"]);
    if (device === "phone") await expect.poll(() => page.locator("#view-content").evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test("appearance uses aligned controls and the sidebar links each own a row", async ({ page, device }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/settings/personal`);
    await expect(page.locator('[data-style-settings]')).toBeVisible();
    const nav = page.locator(".settings-navigation nav a");
    expect((await nav.allTextContents()).slice(0, 4)).toEqual(["Appearance & workspace", "Hotkeys", "Organisation", "General"]);
    await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("paper");
    await expect.poll(() => page.locator("html").getAttribute("data-look")).toBe("paper");
    const option = page.locator(".style-option").first();
    expect(await option.evaluate(el => getComputedStyle(el).display)).toBe("grid");
    if (device !== "phone") {
      const label = await option.locator(".style-label").boundingBox();
      const control = await option.locator(".style-control").boundingBox();
      expect(control.x).toBeGreaterThan(label.x + label.width);
      expect(Math.abs(label.y + label.height / 2 - control.y - control.height / 2)).toBeLessThan(1);
    }
    await openSidebar(page);
    const links = page.locator(".personal-links > .directory-link");
    await expect(links).toHaveCount(3);
    expect(await links.first().evaluate(el => getComputedStyle(el.parentElement).flexDirection)).toBe("column");
    const rects = await links.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, contained: el.scrollWidth <= el.clientWidth };
    }));
    expect(rects.every(r => r.contained)).toBe(true);
    expect(rects[1].top).toBeGreaterThanOrEqual(rects[0].bottom);
    expect(rects[2].top).toBeGreaterThanOrEqual(rects[1].bottom);
  });
});
