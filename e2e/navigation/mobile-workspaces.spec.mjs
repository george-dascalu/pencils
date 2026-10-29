// Phone workspaces: Table leads with the title and opens the card from its key without
// rewriting desktop column preferences; Calendar, Timeline and Capacity keep their options in
// the view-options panel and stay on screen; the Board uses a bottom dock with a canvas tools
// palette (placement, search, minimap, settings) that stays on screen and above the selection
// toolbar, and returns to the vertical toolbar at desktop width.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal, setWeekends } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({ title: "Mobile workspace", people: [{ id: "george", name: "George", capacity: 40 }], teams: [{ id: "team", name: "Design", members: ["george"] }] });
  const project = await store.createProject({ title: "Phone layout", organisation: organisation.id, teams: ["team"] });
  const task = await store.createTask(project.id, { title: "Review the plan with the team", assignee: "George", start: "2026-10-19", due: "2026-10-23", estimate: 8 });
  return { project, task };
});

async function goto(page, view) {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(".mobile-menu").waitFor();
}
const options = async (page) => (await reveal(page.locator(".mobile-view-options-panel"))).waitFor();
const closeOptions = (page) => page.getByRole("button", { name: "Close view options", exact: true }).click();
async function fits(page, locator) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  expect(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box)).toBe(true);
}
async function palette(page) {
  await page.getByRole("button", { name: "More canvas tools", exact: true }).click();
  await page.locator("#phone-board-palette").waitFor();
}

onDevices(["phone"], () => {
  test("Table leads with the title, edits it and opens the card from its key without rewriting desktop columns", async ({ page }) => {
    const { task } = app;
    await goto(page, "table");
    await page.locator(".spreadsheet").waitFor();
    const headings = () => page.locator(".spreadsheet th[data-column-key]").evaluateAll((els) => els.map((el) => el.dataset.columnKey));
    expect((await headings())[0]).toBe("title");
    await fits(page, page.locator('td[data-column-key="title"]').first());
    await expect(page.locator(".phone-table-key").first()).toHaveText(task.key);
    // A fresh title each run, so the edit always saves.
    const updated = `Updated on a phone ${Date.now()}`;
    const title = page.locator(`[data-task-field="title"][data-id="${task.id}"]`);
    await title.fill(updated);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${task.id}`)),
      title.press("Tab"),
    ]);
    // The key on the title line opens the card on phones (0.19.8); there is no separate open button.
    await expect(page.locator(`[data-table-task="${task.id}"] .table-open:visible`)).toHaveCount(0);
    await page.locator(`[data-table-task="${task.id}"] .phone-table-key`).tap();
    await page.locator("#task-form").waitFor();
    await expect(page.locator('#task-form [name="title"]')).toHaveValue(updated);
    await page.locator('[data-action="dialog-close"]').first().click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.querySelector(".spreadsheet th[data-column-key]")?.dataset.columnKey === "key");
    expect((await headings()).slice(0, 2), "Phone layout did not rewrite desktop preferences").toEqual(["key", "title"]);
  });

  test("Calendar options, period navigation and agenda cards work on a phone", async ({ page }) => {
    await goto(page, "calendar");
    await options(page);
    await page.locator("#agenda-date").fill("2026-10-21");
    await page.locator("#agenda-period").selectOption("week");
    await closeOptions(page);
    await fits(page, page.locator(".planning-period"));
    await page.getByRole("button", { name: "Next period", exact: true }).tap();
    await expect(page.locator(".planning-period")).toHaveText(/2026/);
    await page.getByRole("button", { name: "Previous period", exact: true }).tap();
    await page.locator(".agenda-row [data-action=task-open]").first().tap();
    await page.locator("#task-form").waitFor();
    await page.locator('[data-action="dialog-close"]').first().click();
    await options(page);
    await page.locator("#calendar-mode").selectOption("month");
    await closeOptions(page);
    await page.locator(".calendar").waitFor();
  });

  test("Timeline options set scale, weekends and range, and a tap opens the dates", async ({ page }) => {
    await goto(page, "timeline");
    await options(page);
    await page.locator("[data-timeline-scale]").selectOption("day");
    await setWeekends(page, false);
    await expect(page.locator(".task-timeline")).toHaveAttribute("data-weekends", "false");
    await page.getByRole("button", { name: "Timeline range", exact: true }).click();
    await page.getByLabel("Timeline start date", { exact: true }).fill("2026-10-01");
    await page.getByLabel("Timeline end date", { exact: true }).fill("2026-11-01");
    await page.getByRole("button", { name: "Apply range", exact: true }).click();
    await expect(page.locator(".task-timeline")).toHaveAttribute("data-range-start", "2026-10-01");
    await closeOptions(page);
    await page.locator("[data-task-dates]").first().tap();
    await page.getByRole("dialog", { name: /dates/i }).waitFor();
    await page.keyboard.press("Escape");
  });

  test("Capacity options set the unit and team, and weeks navigate", async ({ page }) => {
    await goto(page, "capacity");
    await options(page);
    await page.locator("#capacity-unit").selectOption("hours");
    await page.locator("#capacity-team").selectOption("team");
    await closeOptions(page);
    await page.locator(".capacity-table").waitFor();
    await fits(page, page.locator(".planning-period"));
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await options(page);
    await page.getByRole("button", { name: "This week", exact: true }).click();
    await closeOptions(page);
  });

  test("the Board dock and canvas tools palette place, search, show the minimap and stay on screen", async ({ page }) => {
    await goto(page, "board");
    await page.locator(".phone-board-dock").waitFor();
    await expect(page.locator("#canvas-minimap")).toBeHidden();
    await fits(page, page.locator(".phone-board-dock"));
    await palette(page);
    await fits(page, page.locator("#phone-board-palette"));
    const a11y = await new AxeBuilder({ page }).include(".phone-board-dock").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(a11y.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
    await page.getByRole("button", { name: "Minimap", exact: true }).click();
    await page.locator("#phone-board-palette").waitFor({ state: "hidden" });
    await expect(page.locator("#canvas-minimap")).toBeVisible();
    await palette(page);
    await page.getByRole("button", { name: "Add sticky note", exact: true }).click();
    await page.locator("#phone-board-palette").waitFor({ state: "hidden" });
    const canvas = await page.locator("#canvas").boundingBox();
    await page.touchscreen.tap(canvas.x + 180, canvas.y + 180);
    await page.locator(".board-node[data-node]").first().waitFor();
    await page.keyboard.press("Escape");
    await palette(page);
    await page.getByRole("button", { name: "Search board", exact: true }).click();
    await page.locator("#canvas-find").waitFor();
    await page.locator("#phone-board-palette").waitFor({ state: "hidden" });
    await palette(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".phone-board-more")).toHaveAttribute("aria-expanded", "false");
    for (const width of [320, 390, 600]) {
      await page.setViewportSize({ width, height: 844 });
      await fits(page, page.locator(".phone-board-dock"));
      await palette(page);
      await fits(page, page.locator("#phone-board-palette"));
      expect(await page.locator("#phone-board-palette").evaluate((panel) => {
        const rect = panel.getBoundingClientRect();
        return panel.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), "Canvas tools must stay above the selected object's toolbar").toBe(true);
      for (const theme of ["light", "dark"]) await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
      await page.getByRole("button", { name: "Close canvas tools", exact: true }).click();
    }
    await options(page);
    await page.keyboard.press("Escape");
    expect(await page.locator(".mobile-view-options").evaluate((el) => el.open)).toBe(false);
    await options(page);
    await page.getByRole("button", { name: "Board settings", exact: true }).click();
    await page.getByRole("dialog", { name: "Board settings", exact: true }).waitFor();
    await page.keyboard.press("Escape");
  });

  test("turning to desktop width replaces the Board dock with the vertical toolbar", async ({ page }) => {
    await goto(page, "board");
    await page.locator(".phone-board-dock").waitFor();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".phone-board-dock").waitFor({ state: "detached" });
    await expect(page.locator(".phone-board-dock")).toHaveCount(0);
    await expect(page.locator(".board-tools")).toHaveAttribute("aria-orientation", "vertical");
    await expect(page.getByRole("button", { name: "Add sticky note", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
  });
});
