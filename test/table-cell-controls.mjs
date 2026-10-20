import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-table-cells-"));
const store = new Store(root);
await store.init();
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
const task = await store.createTask(project.id, {
  title: "Editable task", assignee: "George", fields: { stage: "Ready" },
});
const remote = await store.createTask(project.id, {
  title: "Source task", assignee: "George", type: "bug",
});
const file = store.file(project.id, "tasks", remote.id), record = await store.read(file);
await store.write(file, {
  ...record.data, source: { provider: "jira", external_id: "one", key: "JIRA-1" },
}, record.body, record);
const server = createServer(store);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browserName = process.env.BROWSER || "chromium";
const browser = await { chromium, webkit }[browserName].launch();
const errors = [];
const saved = async () => (await store.snapshot(project.id)).tasks.find(t => t.id === task.id);
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw Error("Timed out waiting for saved task");
}
try {
  for (const width of [1500, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 }, hasTouch: width === 390,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    const row = (id = task.id) => page.locator(`[data-table-task="${id}"]`);
    const cell = name => row().locator(`td[data-column-key="${name}"]`);
    const field = name => cell(name).locator("select");
    const visual = name => cell(name).locator(".table-cell-value");
    const menu = () => page.locator("#shared-select-menu");
    async function activate(locator) {
      if (width === 390) await locator.tap();
      else await locator.click();
    }
    async function choose(name, label) {
      await activate(field(name));
      await activate(menu().getByRole("option", { name: label, exact: true }));
    }
    await page.goto(`${base}/#project/${project.id}/table`);
    await row().waitFor();
    if (width === 390) await page.waitForFunction(() =>
      document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      assert.ok(await visual("type").locator(".icon").isVisible());
      assert.equal((await visual("type").textContent()).trim(), "");
      assert.equal(await visual("assignee").textContent(), (await saved()).assignee[0]);
      assert.equal(await cell("assignee").locator(".table-cell-select").getAttribute("title"), (await saved()).assignee);
      for (const name of ["type", "assignee", "status", "priority", "parent", "fields.stage", "fields.approved"]) {
        await activate(field(name));
        const bounds = await menu().boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 &&
          bounds.y >= 0 && bounds.y + bounds.height <= 901, `${name}: menu fits viewport`);
        assert.ok(await menu().getByRole("option").count());
        const chevron = cell(name).locator(".table-cell-chevron svg");
        assert.deepEqual(await chevron.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return [rect.width, rect.height, el.querySelector("path").getAttribute("d")];
        }), [16, 16, "m8 10 4 4 4-4"]);
        if (width === 390) assert.ok((await field(name).boundingBox()).height >= 44);
        await page.keyboard.press("Escape");
        assert.ok(await field(name).evaluate(el => el === document.activeElement));
      }
      for (const name of ["type", "assignee"]) {
        const readonly = row(remote.id).locator(`td[data-column-key="${name}"]`);
        assert.equal(await readonly.locator("select").count(), 0);
        assert.match(await readonly.locator('[role="img"]').getAttribute("aria-label"), /Managed by the connected source/);
        assert.ok(await readonly.locator(name === "type" ? ".icon" : ".task-assignee").count());
      }
      const assignee = (await saved()).assignee === "George" ? "Alex" : "George";
      const type = (await saved()).type === "bug" ? "task" : "bug";
      const oldColor = await visual("assignee").locator(".task-assignee").evaluate(el =>
        el.style.getPropertyValue("--task-field-color"));
      await choose("assignee", assignee);
      await until(async () => (await saved()).assignee === assignee);
      assert.equal(await visual("assignee").textContent(), assignee[0]);
      const newColor = await visual("assignee").locator(".task-assignee").evaluate(el =>
        el.style.getPropertyValue("--task-field-color"));
      assert.notEqual(newColor, oldColor);
      assert.equal(await cell("assignee").locator(".table-cell-select").evaluate(el =>
        el.style.getPropertyValue("--task-field-color")), newColor);
      await choose("type", type === "bug" ? "Bug" : "Task");
      await until(async () => (await saved()).type === type);
      assert.ok(await visual("type").locator(`.task-type.${type}`).count());
      await choose("priority", "Urgent");
      await choose("status", "In progress");
      await choose("parent", "Parent");
      await choose("fields.stage", "Later");
      await choose("fields.approved", "True");
      await until(async () => {
        const value = await saved();
        return value.priority === "urgent" && value.status === "in-progress" &&
          value.parent === parent.id && value.fields.stage === "Later" && value.fields.approved;
      });
      assert.equal(await visual("status").textContent(), "In progress");
      await page.reload();
      await row().waitFor();
      assert.equal(await visual("assignee").textContent(), assignee[0]);
      assert.ok(await visual("type").locator(`.task-type.${type}`).count());
      assert.equal(await visual("parent").textContent(), "Parent");
      // Scroll the native control into view; overlay icons must remain noninteractive.
      await field("type").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/pencils-table-cells-${width}-${theme}-${browserName}.png` });
    }
    await choose("assignee", "Unassigned");
    await until(async () => (await saved()).assignee === "");
    assert.equal(await visual("assignee").textContent(), "–");
    await choose("assignee", "George");
    await until(async () => (await saved()).assignee === "George");
    await until(async () => await field("assignee").isEnabled());
    // Keyboard users enter a cell, open its menu, choose a value and navigate on.
    await cell("assignee").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await menu().getByRole("option", { name: "Alex", exact: true }).focus();
    await page.keyboard.press("Enter");
    await until(async () => (await saved()).assignee === "Alex");
    assert.equal(await visual("assignee").textContent(), "A");
    await until(async () => await field("assignee").isEnabled());
    await field("assignee").focus();
    await page.keyboard.press("Escape");
    assert.ok(await cell("assignee").evaluate(el => el === document.activeElement));
    await page.keyboard.press("ArrowRight");
    assert.ok(await cell("start").evaluate(el => el === document.activeElement));
    await page.keyboard.press("ArrowLeft");
    assert.equal(await cell("assignee").evaluate(el => {
      const data = new DataTransfer();
      el.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, clipboardData: data }));
      return data.getData("text/plain");
    }), "Alex", "Copy keeps the full assignee name");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${browserName}: table icon controls, shared dropdowns, saved edits, source restrictions, keyboard, touch and themes passed`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await store.close();
  await fs.rm(root, { recursive: true, force: true });
}
