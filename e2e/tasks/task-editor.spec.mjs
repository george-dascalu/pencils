// The card editor: a compact dialog where type and priority pickers update their icons,
// metadata saves automatically, removed planning sections keep their saved values,
// the description is WYSIWYG over portable Markdown (bullets, source mode, preview),
// closed drafts restore, history restores in the same editor, and the layout holds on
// desktop, tablet and phone widths in light and dark themes. Part of the cross-browser
// release gate (Firefox, WebKit).
import { test, expect, useApp } from "../fixtures.mjs";
import { acceptConfirm } from "../helpers/menu-controls.mjs";

const body = "## Scope\n\n**Keep this** and [[Reference]]\n\n- First item";
const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({
    title: "Studio",
    people: [{ id: "g", name: "George", capacity: 32 }],
    teams: [{ id: "team", name: "Studio team", members: ["g"] }],
  });
  const project = await store.createProject({ title: "Task editor", organisation: organisation.id, teams: ["team"] });
  const ancestor = await store.createTask(project.id, { title: "Release", type: "epic" });
  return { project, ancestor };
});
// Each test edits its own card, created with the planning values the editor no longer shows.
const createCard = (title = "Plan the next release") =>
  app.store.createTask(app.project.id, {
    title,
    body,
    start: "2026-10-14",
    estimate: 3,
    parent: app.ancestor.id,
    dependencies: [app.ancestor.id],
    recurrence: { unit: "week", interval: 2 },
    tags: ["design", "release"],
  });
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id);

const open = async (page, id) => {
  await page.locator(`[data-action="task-open"][data-id="${id}"]`).first().click();
  await page.locator("#task-form").waitFor();
};
const visit = async (page, id) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, id);
};
const save = async (page) => {
  await page.locator("#task-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("[data-autosave-status]").filter({ hasText: /^Saved automatically$/ })).toHaveCount(1);
  await page.locator("[data-action=dialog-close]").click();
  await expect(page.locator("dialog")).toHaveCount(0);
};
const pick = async (page, name, value) => {
  await page.locator(`[data-task-picker="${name}"] .task-picker-trigger`).click();
  await page.locator(`[data-task-picker="${name}"] [data-picker-value="${value}"]`).click();
};
const icon = (page, name) => page.locator(`[data-task-picker=${name}] [data-picker-symbol] path`).getAttribute("d");
const rich = (page) => page.getByRole("textbox", { name: "Task description", exact: true });
const source = (page) => page.locator('#task-form [name="body"]');

test("metadata saves from the compact editor without changing the Markdown description", { tag: "@gate" }, async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await expect(page.locator(".dialog-head [name=title]")).toHaveValue(card.title);
  await expect(page.locator(".task-extra,.task-parent-field,.task-dependencies,#task-form .file-path,[data-task-picker=parent]")).toHaveCount(0);
  const typeIcon = await icon(page, "type");
  const priorityIcon = await icon(page, "priority");
  await pick(page, "type", "story");
  expect(await icon(page, "type"), "Changing task type immediately updates its icon").not.toBe(typeIcon);
  await pick(page, "priority", "urgent");
  expect(await icon(page, "priority"), "Priority has a distinct icon").not.toBe(priorityIcon);
  await page.getByLabel("Status", { exact: true }).selectOption("review");
  await page.getByLabel("Assignee", { exact: true }).selectOption("George");
  await page.getByLabel("Due date", { exact: true }).fill("2026-11-01");
  await expect(page.locator('[name="tags"]')).toBeHidden();
  await expect(rich(page)).toBeVisible();
  await expect(rich(page).locator("h2")).toBeVisible();
  await expect(rich(page).locator("strong")).toBeVisible();
  await expect(source(page)).toBeHidden();
  await expect(source(page)).toHaveValue(body);
  await save(page);
  const task = await saved(card.id);
  expect(task).toMatchObject({ type: "story", priority: "urgent", status: "review", assignee: "George", due: "2026-11-01", tags: ["design", "release"] });
  expect(task.body, "Opening and saving must preserve original Markdown").toBe(body);
});

test("the rich description edits bullets and Markdown, previews, fits every width and keeps planning values", { tag: "@gate" }, async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await rich(page).fill("- Tree item");
  await rich(page).press("Control+Home");
  await rich(page).press("ArrowRight");
  await rich(page).press("Delete");
  await page.keyboard.type(" ");
  await expect(rich(page).locator("ul li")).toHaveCount(1);
  await rich(page).press("End");
  await rich(page).press("Enter");
  await page.keyboard.type("Next item");
  await page.locator('#task-form [data-rich-mode="source"]').click();
  await expect(source(page)).toHaveValue(/-\s+Tree item/);
  await expect(source(page)).toHaveValue(/-\s+Next item/);
  await source(page).fill("## Description\n\n**Rich text** with [[Reference]]\n\n- One\n- Two");
  await page.locator('#task-form [data-rich-mode="rich"]').click();
  await expect(rich(page).locator("strong")).toBeVisible();
  await page.locator("#task-form [data-rich-preview]").click();
  await expect(page.locator("#markdown-preview h2")).toBeVisible();
  await page.locator("#task-form [data-rich-preview]").click();
  // The open editor is resized through desktop, tablet and phone widths.
  for (const width of [1400, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await page.waitForFunction(() => {
        const r = document.querySelector("dialog").getBoundingClientRect();
        return r.x >= 0 && r.right <= innerWidth;
      });
      const r = await page.locator("dialog").boundingBox();
      expect(r.x >= 0 && r.x + r.width <= width).toBe(true);
      await expect(page.locator('#task-form [type="submit"]')).toHaveCount(0);
      await expect(page.locator("[data-autosave-status]")).toBeVisible();
      const layout = await page.locator("#task-form").evaluate((form) => {
        const rect = (selector) => form.querySelector(selector).getBoundingClientRect();
        return {
          identity: ['[data-task-picker="type"]', ".task-key", '[name="title"]'].map((s) => {
            const r = rect(s);
            return r.top + r.height / 2;
          }),
          fields: [...form.querySelectorAll(".task-metadata [name]")].map((el) => el.closest(".field").getBoundingClientRect().top),
          overflow: form.scrollWidth > form.clientWidth,
          iconOnly: form.querySelector('[data-task-picker="type"]').classList.contains("icon-only"),
        };
      });
      const where = `${width}px ${theme}`;
      if (width === 1400)
        expect(Math.abs(layout.identity[1] - layout.identity[2]) < 2 && layout.identity[2] > layout.identity[0] + 20, `Title has its own row below the type, with the ID beside the title (${where})`).toBe(true);
      expect(Math.max(...layout.fields.slice(0, 3)) - Math.min(...layout.fields.slice(0, 3)), `Assignee, priority and status share the first metadata row (${where})`).toBeLessThan(2);
      expect(Math.abs(layout.fields[3] - layout.fields[4]), `Dates share a row (${where})`).toBeLessThan(2);
      if (width === 1400) expect(Math.max(...layout.fields) - Math.min(...layout.fields), "All five metadata fields share a row on desktop").toBeLessThan(2);
      expect(layout.iconOnly, `Task type remains icon-only (${where})`).toBe(true);
      expect(layout.overflow, `Dialog fields do not overflow (${where})`).toBe(false);
      expect(await rich(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(14);
    }
  }
  await save(page);
  const task = await saved(card.id);
  expect(task.body).toMatch(/\*\*Rich text\*\*/);
  expect(task.body).toMatch(/\[\[Reference\]\]/);
  expect(task.start).toBe("2026-10-14");
  expect(task.estimate).toBe(3);
  expect(task.parent).toBe(app.ancestor.id);
  expect(task.dependencies).toEqual([app.ancestor.id]);
  expect(task.recurrence).toEqual({ unit: "week", interval: 2 });
});

test("a closed editor's draft restores with its type and priority icons", { tag: "@gate" }, async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await rich(page).fill("Retain this description draft");
  await pick(page, "type", "bug");
  await pick(page, "priority", "low");
  const draftTypeIcon = await icon(page, "type");
  const draftPriorityIcon = await icon(page, "priority");
  const draftBody = await source(page).inputValue();
  await page.locator("[data-action=dialog-close]").click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await open(page, card.id);
  if (await page.locator('[data-feature="form-restore"]').count()) await page.locator('[data-feature="form-restore"]').click();
  await expect(rich(page)).toHaveText("Retain this description draft");
  await expect(page.locator("#task-form [name=type]")).toHaveValue("bug");
  await expect(page.locator("#task-form [name=priority]")).toHaveValue("low");
  expect(await icon(page, "type"), "Draft restoration updates the type icon").toBe(draftTypeIcon);
  expect(await icon(page, "priority"), "Draft restoration updates the priority icon").toBe(draftPriorityIcon);
  await save(page);
  expect((await saved(card.id)).body).toBe(draftBody);
});

test("history opens beside the editor and restores a version in the same dialog", { tag: "@gate" }, async ({ page }) => {
  const created = await createCard();
  const card = await app.store.updateTask(app.project.id, created.id, { revision: created.revision, title: "Plan the release" });
  const child = await app.store.createTask(app.project.id, { title: "Test child", parent: card.id });
  await visit(page, card.id);
  await expect(page.locator(".task-subtasks,.related-record-list,[data-feature=attach],[data-feature=task-template]")).toHaveCount(0);
  expect((await saved(child.id)).parent).toBe(card.id);
  await page.locator(".dialog-head [name=title]").fill("Unsaved title");
  await page.locator("[data-feature=task-history]").click();
  await page.locator(".task-history-panel .recovery-item").first().waitFor();
  await expect(page.locator(".dialog-head [name=title]")).toHaveValue("Unsaved title");
  await expect(page.locator("dialog")).toHaveCount(1);
  const panel = await page.locator(".task-history-panel").boundingBox();
  const content = await page.locator(".task-editor-content > .dialog-body").boundingBox();
  expect(panel.x + panel.width, "History shares the left-side position beside a right-docked editor").toBeLessThanOrEqual(content.x);
  await page.locator(".task-history-panel .recovery-item:has([data-task-modal=history-restore]) summary").first().click();
  await page.locator("dialog").evaluate((el) => (el.dataset.sameDialog = "yes"));
  await page.locator("[data-task-modal=history-restore]").first().click();
  await acceptConfirm(page);
  await expect(page.locator("[data-feature=task-history]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#task-form [name=title]")).not.toHaveValue("Unsaved title");
  await expect(page.locator("dialog"), "Restoration keeps the same modal").toHaveAttribute("data-same-dialog", "yes");
});

test("Escape closes the type picker without closing the editor", { tag: "@gate" }, async ({ page }) => {
  const card = await createCard();
  await visit(page, card.id);
  await page.locator('.task-pane-switcher [data-feature="task-details"]').first().click();
  await page.locator("[data-task-picker=type] .task-picker-trigger").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("[data-action=dialog-close]").click();
});
