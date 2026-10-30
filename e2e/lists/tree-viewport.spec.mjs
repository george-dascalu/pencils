// The Tree fills the window: rows scroll inside the tree (not the page) with its
// scrollbar at the bottom or above pagination, empty space shares the page background,
// sparse, empty, filtered, nested and overflowing tasks all fit, collapse and expand keep
// the scroll position and focus, deep hierarchies reflow on phones, Back restores the
// position, and new cards start at the root from the shared header. Desktop, phone width
// and both themes. Desktop tests belong to the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const gate = { tag: "@gate" };
// Real scrollbars take space, as for most desktop users (Chromium hides them by default in tests).
test.use({
  launchOptions: [async ({ browserName }, use) => use(browserName === "chromium" ? { args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] } : {}), { scope: "worker" }],
  viewportSize: { width: 1600, height: 1000 },
});

// A deep branch under the 13th of 35 roots, and optionally more roots for pagination.
async function deepTree(store, title, extraRoots = 0) {
  const project = await store.createProject({ title });
  const parent = await store.createTask(project.id, { title: "Parent task" });
  await store.createTask(project.id, { title: "Child task", parent: parent.id });
  let branch;
  for (let i = 0; i < 35; i++) {
    const task = await store.createTask(project.id, { title: `Root ${String(i).padStart(2, "0")}` });
    if (i === 12) branch = task;
  }
  let deepest = branch;
  for (let i = 0; i < 12; i++) deepest = await store.createTask(project.id, { title: `Nested task ${i}`, parent: deepest.id, tags: ["Planning"], assignee: "Alex", due: "2026-11-01" });
  for (let i = 35; i < 35 + extraRoots; i++) await store.createTask(project.id, { title: `Root ${i}` });
  return { project, branch, deepest };
}
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tree viewport" });
  const emptyProject = await store.createProject({ title: "Empty tree" });
  const parent = await store.createTask(project.id, { title: "Parent task" });
  const child = await store.createTask(project.id, { title: "Child task", parent: parent.id });
  return { project, emptyProject, parent, child, deep: await deepTree(store, "Deep tree"), paged: await deepTree(store, "Paged tree", 66) };
});

const area = (page) => page.locator("#view-content > .tree-wrapper");
const toggle = (page, id) => page.locator(`.tree-toggle[data-id="${id}"]`);
async function open(page, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/tree`);
  await page.waitForFunction(() => history.state?.kind === "pencils-navigation-v1");
  await area(page).waitFor();
}
async function fits(page) {
  const actual = await area(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const parent = el.parentElement.getBoundingClientRect();
    const ps = getComputedStyle(el.parentElement);
    const style = getComputedStyle(el);
    return {
      width: r.width,
      availableWidth: parent.width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight),
      nextTop: el.nextElementSibling?.getBoundingClientRect().top ?? parent.bottom - parseFloat(ps.paddingBottom),
      bottom: r.bottom,
      parentBottom: parent.bottom,
      lastBottom: el.parentElement.lastElementChild.getBoundingClientRect().bottom,
      height: innerHeight,
      usableBottom: (() => { const bar = document.querySelector(".topbar .tabs"); return bar && getComputedStyle(bar).position === "fixed" ? innerHeight - parseFloat(getComputedStyle(document.querySelector(".main")).paddingBottom) : innerHeight; })(),
      widthLimit: innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  });
  const facts = JSON.stringify(actual);
  expect(Math.abs(actual.width - actual.availableWidth), `Tree fills component width ${facts}`).toBeLessThan(2);
  // On phones the views end at the bottom tab bar (0.19.33), elsewhere at the window bottom.
  expect(Math.abs(actual.parentBottom - actual.usableBottom), `Tree component fills the page ${facts}`).toBeLessThan(2);
  expect(actual.nextTop - actual.bottom >= -1 && actual.nextTop - actual.bottom < 30, `Scroll track stays at the bottom or above pagination ${facts}`).toBe(true);
  expect(actual.lastBottom, `Bottom controls remain visible ${facts}`).toBeLessThanOrEqual(actual.height + 1);
  await expect(page.locator(".view-footnote")).toHaveCount(0);
  await expect(page.locator('#view-content [data-action="task-new"]'), "Task creation uses the shared header").toHaveCount(0);
  await expect(area(page), "Tree's empty space shares the page background").toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(actual.documentWidth, "No horizontal page overflow").toBeLessThanOrEqual(actual.widthLimit);
  expect(actual.documentHeight, "Rows scroll inside the tree").toBeLessThanOrEqual(actual.height + 1);
  expect(actual.overflowX).toBe("auto");
  expect(actual.overflowY).toBe("auto");
}

test("the tree fills the window at desktop and phone width with sparse, collapsed, expanded and filtered rows", gate, async ({ page }) => {
  await open(page);
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await fits(page);
      const height = await area(page).evaluate((el) => el.clientHeight);
      const rowHeight = await area(page).locator(".tree-row").evaluateAll((rows) => rows.reduce((h, row) => h + row.offsetHeight, 0));
      expect(height, "Sparse rows leave space inside the tree").toBeGreaterThan(rowHeight + 100);
    }
    await toggle(page, app.parent.id).click();
    await expect(area(page).locator(".tree-row")).toHaveCount(1);
    await fits(page);
    await page.locator('[data-action="tree-cycle"]').click();
    await expect(area(page).locator(".tree-row")).toHaveCount(2);
    await page.locator("#search").fill("Nothing matches");
    await area(page).locator(".empty").waitFor();
    await fits(page);
    await area(page).getByRole("button", { name: "Clear filters", exact: true }).click();
    await area(page).locator(".tree-row").first().waitFor();
  }
});

test("at phone width the row summary opens the card, and New starts a root card", gate, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  // Phone rows open the card from their summary button.
  await area(page).locator(`.phone-task-open[data-id="${app.child.id}"]`).click();
  await page.locator("#task-form").waitFor();
  await expect(page.locator('#task-form [name="title"]')).toHaveValue("Child task");
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  // The header New control is a menu offering a card or a document (PEN-6).
  await newCard(page);
  await page.locator("#task-form").waitFor();
  await expect(page.locator('#task-form [name="parent"]')).toHaveValue("");
  await page.locator('[data-action="dialog-close"]').click();
});

test("keyboard scrolling, collapse and expand keep the tree's position and focus", gate, async ({ page }) => {
  const { project, branch } = app.deep;
  await open(page, project);
  await area(page).focus();
  await page.keyboard.press("PageDown");
  await page.waitForFunction(() => document.querySelector(".tree-wrapper").scrollTop > 100);
  await fits(page);
  await toggle(page, branch.id).scrollIntoViewIfNeeded();
  const previousTop = await area(page).evaluate((el) => el.scrollTop);
  await toggle(page, branch.id).click();
  expect(Math.abs((await area(page).evaluate((el) => el.scrollTop)) - previousTop), "Collapse preserves position").toBeLessThan(2);
  await expect(toggle(page, branch.id), "Collapse keeps keyboard focus").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle(page, branch.id)).toHaveAttribute("aria-label", "Collapse subtasks");
  expect(Math.abs((await area(page).evaluate((el) => el.scrollTop)) - previousTop), "Expansion preserves position").toBeLessThan(2);
});

test("a deep hierarchy reflows at phone width, and Back restores the tree's position", gate, async ({ page }) => {
  const { project, deepest } = app.deep;
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page, project);
  // Phone rows show the title in their summary button; the row's title field is hidden.
  const deepestTitle = area(page).locator(`.phone-task-open[data-id="${deepest.id}"] .phone-task-title`);
  await deepestTitle.scrollIntoViewIfNeeded();
  expect(await area(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "Deep hierarchy reflows within the mobile viewport").toBe(true);
  const titleBounds = await deepestTitle.boundingBox();
  expect(titleBounds.x >= 0 && titleBounds.x + titleBounds.width <= 391, `The deepest task title remains visible ${JSON.stringify(titleBounds)}`).toBe(true);
  await fits(page);
  const position = await area(page).evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  await page.waitForFunction(({ x, y }) => history.state?.scroll?.treeX === x && history.state?.scroll?.treeY === y, position);
  await selectProjectView(page, "overview");
  await page.goBack();
  await page.waitForFunction(({ x, y }) => {
    const tree = document.querySelector(".tree-wrapper");
    return tree && Math.abs(tree.scrollLeft - x) < 2 && Math.abs(tree.scrollTop - y) < 2;
  }, position);
  await fits(page);
});

test("root-group pagination stays visible outside the scrolling rows", gate, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page, app.paged.project);
  await fits(page);
  const pagination = page.locator("#pagination");
  await pagination.waitFor();
  const p = await pagination.boundingBox();
  expect(p.y + p.height, "Pagination remains visible with overflowing rows").toBeLessThan(700);
});

test("an empty tree invites the first card, and New opens the card editor", gate, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`${app.base}/#project/${app.emptyProject.id}/tree`);
  // Since 0.19.0 creation copy says "card" ("Create your first card").
  await area(page).getByRole("heading", { name: "Create your first card" }).waitFor();
  await fits(page);
  await newCard(page);
  await page.locator("#task-form").waitFor();
});
