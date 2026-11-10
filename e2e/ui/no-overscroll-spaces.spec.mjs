// Owner request (F0.22-92): on iPad the New project dialog's Workflow step could be dragged past its
// edges, sideways too, as its status list was wider than the dialog. No dialog, panel or page scrolls
// past its edges (overscroll-behavior: none on each axis it scrolls), and none scrolls sideways.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({ title: "Spaces", people: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}` })) });
  const project = await store.createProject({ title: "Spaces", key: "SP", organisation: organisation.id });
  for (let i = 0; i < 40; i++) await store.createTask(project.id, { title: `Card ${i}`, status: "todo" });
  return { project };
});

// Every scroll container on the page that can scroll an axis which still bounces, and every
// content space (a dialog's body, the settings panel) wider than its box.
const problems = (page) => page.evaluate(() => [...document.querySelectorAll("body *")].flatMap((el) => {
  if (!el.getClientRects().length) return [];
  const style = getComputedStyle(el), scrolls = (overflow) => /auto|scroll/.test(overflow);
  const name = el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
  const axes = [
    scrolls(style.overflowX) && el.scrollWidth > el.clientWidth + 1 && style.overscrollBehaviorX !== "none" && "x",
    scrolls(style.overflowY) && el.scrollHeight > el.clientHeight + 1 && style.overscrollBehaviorY !== "none" && "y",
  ].filter(Boolean);
  const wide = el.matches("dialog[open] .dialog-body, #view-content.project-settings-page, .settings-panel, #list-panel, .sidebar") && el.scrollWidth > el.clientWidth + 1;
  return [...(axes.length ? [`${name} bounces (${axes.join(", ")})`] : []), ...(wide ? [`${name} scrolls sideways`] : [])];
}));

onDevices(["ipad", "phone"], () => {
  test("the New project dialog's steps stay inside their edges", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await clickControl(page.locator('.sidebar [data-action="project-new"]'));
    const form = page.locator("#project-form");
    const found = {}, note = async (space) => { const list = await problems(page); if (list.length) found[space] = list; };
    await form.locator('[name="title"]').fill("Bounded");
    await note("Details");
    await form.getByRole("button", { name: "Next", exact: true }).click();
    await expect(form).toHaveAttribute("data-step", "2");
    await note("Card types");
    await form.getByRole("button", { name: "Next", exact: true }).click();
    await expect(form).toHaveAttribute("data-step", "3");
    await form.locator("[data-status-details] > summary").click();
    await note("Workflow");
    await form.locator("[data-workflow-rules]").check();
    await note("Workflow with rules");
    expect(found).toEqual({});
  });

  test("the card editor and sidebar stay inside their edges", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await newCard(page);
    await expect(page.locator(".task-dialog[open]")).toBeVisible();
    const found = {}, note = async (space) => { const list = await problems(page); if (list.length) found[space] = list; };
    await note("card editor");
    await page.keyboard.press("Escape");
    await expect(page.locator(".task-dialog[open]")).toHaveCount(0);
    await page.locator(".mobile-menu").click();
    await page.locator(".sidebar.open").waitFor();
    await note("sidebar");
    expect(found).toEqual({});
  });

  test("every settings section stays inside its edges", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/settings/general`);
    await page.locator(".settings-loading").waitFor({ state: "detached" });
    const sections = await page.locator(".settings-navigation [data-settings-section]").evaluateAll((links) => links.map((a) => a.dataset.settingsSection));
    expect(sections.length).toBeGreaterThan(5);
    const found = {};
    for (const section of sections) {
      await page.goto(`${app.base}/#project/${app.project.id}/settings/${section}`);
      await page.locator(".settings-loading").waitFor({ state: "detached" });
      const list = await problems(page);
      if (list.length) found[section] = list;
    }
    expect(found).toEqual({});
  });
});
