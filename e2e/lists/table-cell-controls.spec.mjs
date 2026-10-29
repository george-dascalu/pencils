// Table cells for type, assignee, status, priority, parent and custom select/checkbox
// fields: icon and initial display, the shared dropdown kept inside the viewport, saved
// edits that survive a reload, read-only source fields, keyboard use and touch, in both
// themes. Assignee, status and priority match the card editor (no arrow, 0.19.10).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { browserTabShortcuts } from "../helpers/browser-tab-shortcuts.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({
    title: "Table studio",
    people: [{ id: "george", name: "George" }, { id: "alex", name: "Alex" }],
    teams: [{ id: "team", name: "Team", members: ["george", "alex"] }],
  });
  const project = await store.createProject({
    title: "Table controls", organisation: organisation.id, teams: ["team"],
    schema: {
      fields: [
        { id: "stage", name: "Stage", type: "select", options: ["Ready", "Later"] },
        { id: "approved", name: "Approved", type: "checkbox" },
      ],
    },
  });
  const parent = await store.createTask(project.id, { title: "Parent" });
  const task = await store.createTask(project.id, { title: "Editable task", assignee: "George", fields: { stage: "Ready" } });
  const remote = await store.createTask(project.id, { title: "Source task", assignee: "George", type: "bug" });
  const file = store.file(project.id, "tasks", remote.id), record = await store.read(file);
  await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one", key: "JIRA-1" } }, record.body, record);
  return { project, parent, task, remote };
});

const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);

function table(page, device) {
  const row = (id = app.task.id) => page.locator(`[data-table-task="${id}"]`);
  const cell = (name) => row().locator(`td[data-column-key="${name}"]`);
  const field = (name) => cell(name).locator("select");
  const visual = (name) => cell(name).locator(".table-cell-value");
  const menu = page.locator("#shared-select-menu");
  const activate = (locator) => (device === "phone" ? locator.tap() : locator.click());
  async function choose(name, label) {
    await activate(field(name));
    await activate(menu.getByRole("option", { name: label, exact: true }));
  }
  async function open() {
    await page.goto(`${app.base}/#project/${app.project.id}/table`);
    await row().waitFor();
    if (device === "phone") await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
  }
  return { row, cell, field, visual, menu, activate, choose, open };
}
const setTheme = (page, theme) => page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);

onDevices(["desktop", "phone"], () => {
  test("select cells show icons, open the shared menu inside the window and keep source fields read-only", async ({ page, device }) => {
    const { row, cell, field, visual, menu, activate, open } = table(page, device);
    const { width, height } = page.viewportSize();
    await open();
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      await expect(visual("type").locator(".icon")).toBeVisible();
      expect((await visual("type").textContent()).trim()).toBe("");
      const { assignee } = await saved();
      await expect(visual("assignee")).toHaveText(assignee[0]);
      await expect(cell("assignee").locator(".table-cell-select")).toHaveAttribute("title", assignee);
      for (const name of ["type", "assignee", "status", "priority", "parent", "fields.stage", "fields.approved"]) {
        await activate(field(name));
        const bounds = await menu.boundingBox();
        expect(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= height + 1, `${name}: menu fits viewport ${JSON.stringify(bounds)}`).toBe(true);
        await expect(menu.getByRole("option").first()).toBeAttached();
        const chevron = cell(name).locator(".table-cell-chevron svg");
        // Assignee, status and priority match the card editor, which shows no arrow (0.19.10).
        if (["assignee", "status", "priority"].includes(name)) await expect(chevron).toBeHidden();
        else expect(await chevron.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return [rect.width, rect.height, el.querySelector("path").getAttribute("d")];
        })).toEqual([16, 16, "m8 10 4 4 4-4"]);
        if (device === "phone") expect((await field(name).boundingBox()).height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press("Escape");
        await expect(field(name)).toBeFocused();
      }
      for (const name of ["type", "assignee"]) {
        const readonly = row(app.remote.id).locator(`td[data-column-key="${name}"]`);
        await expect(readonly.locator("select")).toHaveCount(0);
        await expect(readonly.locator('[role="img"]')).toHaveAttribute("aria-label", /Managed by the connected source/);
        await expect(readonly.locator(name === "type" ? ".icon" : ".task-assignee").first()).toBeAttached();
      }
    }
  });

  test("choices save, show their new value and survive a reload in both themes", async ({ page, device }) => {
    const { row, cell, visual, choose, open } = table(page, device);
    await open();
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      const before = await saved();
      const assignee = before.assignee === "George" ? "Alex" : "George";
      const type = before.type === "bug" ? "task" : "bug";
      const fieldColor = (locator) => locator.evaluate((el) => el.style.getPropertyValue("--task-field-color"));
      const oldColor = await fieldColor(visual("assignee").locator(".task-assignee"));
      await choose("assignee", assignee);
      await expect.poll(async () => (await saved()).assignee).toBe(assignee);
      await expect(visual("assignee")).toHaveText(assignee[0]);
      const newColor = await fieldColor(visual("assignee").locator(".task-assignee"));
      expect(newColor).not.toBe(oldColor);
      expect(await fieldColor(cell("assignee").locator(".table-cell-select"))).toBe(newColor);
      await choose("type", type === "bug" ? "Bug" : "Task");
      await expect.poll(async () => (await saved()).type).toBe(type);
      await expect(visual("type").locator(`.task-type.${type}`).first()).toBeAttached();
      await choose("priority", "Urgent");
      await choose("status", "In progress");
      await choose("parent", "Parent");
      await choose("fields.stage", "Later");
      await choose("fields.approved", "True");
      await expect.poll(async () => {
        const value = await saved();
        return value.priority === "urgent" && value.status === "in-progress" && value.parent === app.parent.id && value.fields.stage === "Later" && !!value.fields.approved;
      }).toBe(true);
      await expect(visual("status")).toHaveText("In progress");
      await page.reload();
      await row().waitFor();
      await expect(visual("assignee")).toHaveText(assignee[0]);
      await expect(visual("type").locator(`.task-type.${type}`).first()).toBeAttached();
      await expect(visual("parent")).toHaveText("Parent");
    }
  });

  test("keyboard users clear and choose the assignee and move between cells; copy keeps the full name", async ({ page, device }) => {
    const { cell, field, visual, menu, choose, open } = table(page, device);
    await open();
    await browserTabShortcuts(cell("assignee"));
    await choose("assignee", "Unassigned");
    await expect.poll(async () => (await saved()).assignee).toBe("");
    await expect(visual("assignee")).toHaveText("–");
    await choose("assignee", "George");
    await expect.poll(async () => (await saved()).assignee).toBe("George");
    await expect(field("assignee")).toBeEnabled();
    // Keyboard users enter a cell, open its menu, choose a value and navigate on.
    await cell("assignee").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await menu.getByRole("option", { name: "Alex", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await saved()).assignee).toBe("Alex");
    await expect(visual("assignee")).toHaveText("A");
    await expect(field("assignee")).toBeEnabled();
    await field("assignee").focus();
    await page.keyboard.press("Escape");
    await expect(cell("assignee")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    // Default columns run assignee, status, priority (0.19.9).
    await expect(cell("status")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    const copied = await cell("assignee").evaluate((el) => {
      const data = new DataTransfer();
      el.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, clipboardData: data }));
      return data.getData("text/plain");
    });
    expect(copied, "Copy keeps the full assignee name").toBe("Alex");
  });
});
