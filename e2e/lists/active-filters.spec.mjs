// Owner request, 2 November 2026: show which filters are active without reopening Filters.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Active filters", key: "AF" });
  await store.createTask(project.id, { title: "Overdue work", status: "todo", due: "2020-01-01", assignee: "George", tags: ["planning"] });
  await store.createTask(project.id, { title: "Completed work", status: "done" });
  const organisation = await store.createOrganisation({ title: "Filter teams", people: [{ id: "alice", name: "Alice" }], teams: [{ id: "design", name: "Design", members: ["alice"] }] });
  const staffed = await store.createProject({ title: "Capacity filters", organisation: organisation.id, teams: ["design"] });
  return { project, staffed };
});

async function openFilters(page, device) {
  const trigger = device === "phone" || device === "small"
    ? page.locator(".mobile-view-options > summary")
    : page.locator('[data-board-menu="filters"] > summary');
  if (!(await trigger.evaluate(el => el.parentElement.open))) await trigger.click();
}
async function closeFilters(page, device) {
  const trigger = page.locator(device === "phone" || device === "small" ? ".mobile-view-options > summary" : '[data-board-menu="filters"] > summary');
  if (!(await trigger.evaluate(el => el.parentElement.open))) return;
  if (device === "phone" || device === "small") await page.getByRole("button", { name: "Close view options", exact: true }).click();
  else await page.locator('[data-board-menu="filters"] > summary').click();
}

onDevices(["desktop", "ipad", "phone", "small"], () => {
  for (const view of ["list", "calendar"]) test(`${view}: active filters remain visible and can be removed independently`, { tag: "@gate" }, async ({ page, device }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await openFilters(page, device);
    await page.locator("#filter-due").selectOption("overdue");
    await page.locator("#filter-completion").selectOption("open");
    await closeFilters(page, device);
    const active = page.getByRole("group", { name: "Active filters", exact: true });
    await expect(active).toBeVisible();
    await expect(active.locator("button")).toHaveText(["Overdue", "Open"]);
    if (view === "list") await expect(page.locator(".task-row")).toHaveCount(1);
    const layout = await active.evaluate(el => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return { display: cs.display, wrap: cs.flexWrap, overflow: cs.overflowX, left: r.left, right: r.right, viewport: innerWidth,
        width: r.width, available: el.parentElement.getBoundingClientRect().width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        heights: [...el.querySelectorAll("button")].map(b => b.getBoundingClientRect().height) };
    });
    expect(layout.display).toBe("flex");
    expect(layout.wrap).toBe("nowrap");
    expect(layout.overflow).toBe("auto");
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    expect(layout.scrollWidth, "both short filters fit without scrolling").toBeLessThanOrEqual(layout.clientWidth);
    if (device === "phone" || device === "small") expect(Math.abs(layout.width - layout.available)).toBeLessThanOrEqual(1);
    for (const height of layout.heights) expect(height).toBeGreaterThanOrEqual(device === "desktop" ? 32 : 44);
    await active.getByRole("button", { name: "Remove Deadline: Overdue filter", exact: true }).click();
    await expect(active.locator("button")).toHaveText(["Open"]);
    await expect(active.locator("button")).toBeFocused();
    await openFilters(page, device);
    await expect(page.locator("#filter-due")).toHaveValue("");
    await expect(page.locator("#filter-completion")).toHaveValue("open");
    await closeFilters(page, device);
    await active.getByRole("button", { name: "Remove Completion: Open filter", exact: true }).click();
    await expect(active).toHaveCount(0);
    const trigger = page.locator(device === "phone" || device === "small" ? ".mobile-view-options > summary" : '[data-board-menu="filters"] > summary');
    await expect(trigger).toBeFocused();
    await expect(trigger.locator(".filter-count")).toHaveCount(0);
    if (view === "list") await expect(page.locator(".task-row")).toHaveCount(2);
  });
});

onDevices(["desktop", "phone"], () => test("active chips fit long filters in both themes and Compact mode", { tag: "@gate" }, async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await openFilters(page, device);
  await page.locator("#filter-assignee").fill("A very long assignee name that should stay inside the active filter");
  await page.locator("#filter-assignee").blur();
  await openFilters(page, device);
  await page.locator("#filter-tag").fill("A long tag for checking the horizontal scrolling of the active filter list");
  await page.locator("#filter-tag").blur();
  await closeFilters(page, device);
  const active = page.getByRole("group", { name: "Active filters", exact: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => window.PencilsAppearance.write({ theme, look: "paper", density: "compact" }), theme);
    const styles = await active.evaluate(el => {
      const button = el.querySelector("button"), cs = getComputedStyle(button), label = button.querySelector("span");
      const sample = document.createElement("span"); sample.style.cssText = "color:var(--ink);background:var(--surface)"; el.append(sample);
      const palette = getComputedStyle(sample), ink = palette.color, surface = palette.backgroundColor; sample.remove();
      return { color: cs.color, background: cs.backgroundColor, ink, surface, height: button.offsetHeight,
        expected: parseFloat(cs.getPropertyValue("--control-height")), clipped: label.scrollWidth > label.clientWidth,
        overflow: document.documentElement.scrollWidth > innerWidth, right: el.getBoundingClientRect().right };
    });
    expect(styles.color).toBe(styles.ink);
    expect(styles.background).toBe(styles.surface);
    expect(styles.height).toBe(styles.expected);
    expect(styles.clipped).toBe(true);
    expect(styles.overflow).toBe(false);
    expect(styles.right).toBeLessThanOrEqual(page.viewportSize().width);
  }
  await active.locator("button").last().press("Enter");
  await expect(active.locator("button")).toHaveCount(1);
}));

onDevices(["desktop", "phone"], () => test("Capacity Scope and Team chips clear their own controls", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.staffed.id}/capacity`);
  await openFilters(page, device);
  await page.locator("#capacity-scope").selectOption("organisation");
  await page.locator("#capacity-team").selectOption("design");
  await closeFilters(page, device);
  const active = page.getByRole("group", { name: "Active filters", exact: true });
  await expect(active.locator("button")).toHaveText(["All accessible organisation projects", "Design"]);
  await active.getByRole("button", { name: "Remove Team: Design filter", exact: true }).click();
  await expect(active.locator("button")).toHaveText(["All accessible organisation projects"]);
  await active.locator("button").click();
  await expect(active).toHaveCount(0);
  await openFilters(page, device);
  await expect(page.locator("#capacity-scope")).toHaveValue("project");
  await expect(page.locator("#capacity-team")).toHaveValue("");
}));

test("filters use their displayed names, escape input, and leave grouping out", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openFilters(page, "desktop");
  await page.locator("#filter-status").selectOption("todo");
  await page.locator("#filter-type").selectOption("task");
  await page.locator("#filter-assignee").fill('George <b> & "');
  await page.locator("#filter-assignee").blur();
  await openFilters(page, "desktop");
  await page.locator("#filter-tag").fill("planning");
  await page.locator("#filter-tag").blur();
  await openFilters(page, "desktop");
  await page.locator("#filter-blocked").check();
  await page.locator("#filter-archived").check();
  await page.locator("#group-by").selectOption("type");
  await closeFilters(page, "desktop");
  const active = page.getByRole("group", { name: "Active filters", exact: true });
  await expect(active.locator("button")).toHaveText(["To do", "Task", 'Assignee: George <b> & "', "Tag: planning", "Blocked", "Include archived"]);
  await expect(active.locator("b")).toHaveCount(0);
  await openFilters(page, "desktop");
  await page.locator('[data-board-menu="filters"] [data-action="filters-reset"]').click();
  await expect(active).toHaveCount(0);
});
