import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-editor-"));
const store = new Store(root);
await store.init();
const organisation = await store.createOrganisation({
  title: "Studio",
  people: [{ id: "g", name: "George", capacity: 32 }],
  teams: [{ id: "team", name: "Studio team", members: ["g"] }],
});
const project = await store.createProject({
  title: "Task editor",
  organisation: organisation.id,
  teams: ["team"],
});
const original = await store.createTask(project.id, {
  title: "Plan the next release",
  body: "## Scope\n\n**Keep this** and [[Reference]]\n\n- First item",
  start: "2026-10-14",
  estimate: 3,
  tags: ["design", "release"],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const open = async () =>
  page
    .locator(`[data-action="task-open"][data-id="${original.id}"]`)
    .first()
    .click();
const save = async () => {
  await page.locator('#task-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator("#organisation-select").selectOption(organisation.id);
  await page.locator(".project-link").click();
  await open();
  assert.equal(
    await page.locator(".dialog-head [name=title]").inputValue(),
    original.title,
  );
  assert.equal(
    await page.locator(".task-extra").first().getAttribute("open"),
    null,
  );
  const type = page.locator("#task-form [name=type]"),
    priority = page.locator("#task-form [name=priority]");
  const pick = async (name, value) => {
    await page
      .locator(`[data-task-picker="${name}"] .task-picker-trigger`)
      .click();
    await page
      .locator(`[data-task-picker="${name}"] [data-picker-value="${value}"]`)
      .click();
  };
  const typeIcon = () =>
    page
      .locator("[data-task-picker=type] [data-picker-symbol] path")
      .getAttribute("d");
  const priorityIcon = () =>
    page
      .locator("[data-task-picker=priority] [data-picker-symbol] path")
      .getAttribute("d");
  const originalTypeIcon = await typeIcon(),
    originalPriorityIcon = await priorityIcon();
  await pick("type", "story");
  assert.notEqual(
    await typeIcon(),
    originalTypeIcon,
    "Changing task type immediately updates its icon",
  );
  await pick("priority", "urgent");
  assert.notEqual(
    await priorityIcon(),
    originalPriorityIcon,
    "Priority has a distinct icon",
  );
  await page.getByLabel("Status", { exact: true }).selectOption("review");
  await page.getByLabel("Assignee", { exact: true }).selectOption("George");
  await page.getByLabel("Due date", { exact: true }).fill("2026-11-01");
  assert.ok(await page.locator('[name="tags"]').isHidden());
  const rich = page.getByRole("textbox", {
    name: "Task description",
    exact: true,
  });
  assert.ok(await rich.isVisible());
  assert.ok(await rich.locator("h2").isVisible());
  assert.ok(await rich.locator("strong").isVisible());
  assert.ok(await page.locator('#task-form [name="body"]').isHidden());
  assert.equal(
    await page.locator('#task-form [name="body"]').inputValue(),
    original.body,
  );
  await save();
  const savedMetadata = (await store.snapshot(project.id)).tasks[0];
  assert.equal(savedMetadata.type, "story");
  assert.equal(savedMetadata.priority, "urgent");
  assert.equal(savedMetadata.status, "review");
  assert.equal(savedMetadata.assignee, "George");
  assert.equal(savedMetadata.due, "2026-11-01");
  assert.deepEqual(savedMetadata.tags, ["design", "release"]);
  assert.equal(
    (await store.snapshot(project.id)).tasks[0].body,
    original.body,
    "Opening and saving must preserve original Markdown",
  );
  await open();
  await rich.fill("- Tree item");
  await rich.press("Control+Home");
  await rich.press("ArrowRight");
  await rich.press("Delete");
  await page.keyboard.type(" ");
  assert.equal(await rich.locator("ul li").count(), 1);
  await rich.press("End");
  await rich.press("Enter");
  await page.keyboard.type("Next item");
  await page.locator('#task-form [data-rich-mode="source"]').click();
  const source = page.locator('#task-form [name="body"]');
  assert.match(await source.inputValue(), /-\s+Tree item/);
  assert.match(await source.inputValue(), /-\s+Next item/);
  await source.fill(
    "## Description\n\n**Rich text** with [[Reference]]\n\n- One\n- Two",
  );
  await page.locator('#task-form [data-rich-mode="rich"]').click();
  assert.ok(await rich.locator("strong").isVisible());
  await page.locator("#task-form [data-rich-preview]").click();
  assert.ok(await page.locator("#markdown-preview h2").isVisible());
  await page.locator("#task-form [data-rich-preview]").click();
  for (const width of [1400, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const r = await page.locator("dialog").boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= width);
      assert.ok(await page.locator('#task-form [type="submit"]').isVisible());
      const submitBox = await page.locator('#task-form [type="submit"]').boundingBox();
      assert.ok(submitBox.y >= r.y && submitBox.y + submitBox.height <= r.y + r.height, 'Save stays inside the modal on every screen size');

      const layout = await page.locator("#task-form").evaluate((form) => {
        const rect = (selector) =>
          form.querySelector(selector).getBoundingClientRect();
        return {
          identity: [
            ".task-key",
            '[data-task-picker="type"]',
            '[name="title"]',
          ].map((s) => {
            const r = rect(s);
            return r.top + r.height / 2;
          }),
          fields: [...form.querySelectorAll(".task-metadata .field")].map(
            (el) => el.getBoundingClientRect().top,
          ),

          overflow: form.scrollWidth > form.clientWidth,
          iconOnly: form
            .querySelector('[data-task-picker="type"]')
            .classList.contains("icon-only"),
        };
      });
      if (width === 1400) {
        assert.ok(
          Math.max(...layout.identity) - Math.min(...layout.identity) < 2,
          "ID, type and title share a row",
        );
        assert.ok(
          Math.max(...layout.fields) - Math.min(...layout.fields) < 2,
          "Metadata shares a single desktop row",
        );
      }

      assert.ok(layout.iconOnly, "Task type remains icon-only in both themes");
      assert.equal(layout.overflow, false, "Dialog fields do not overflow");
      assert.ok(
        await rich.evaluate(
          (el) => parseFloat(getComputedStyle(el).fontSize) <= 14,
        ),
      );
      await page.screenshot({
        path: `/tmp/pencils-task-editor-${width}-${theme}.png`,
      });
    }
  }
  await save();
  const task = (await store.snapshot(project.id)).tasks[0];
  assert.match(task.body, /\*\*Rich text\*\*/);
  assert.match(task.body, /\[\[Reference\]\]/);
  assert.equal(task.start, original.start);
  assert.equal(task.estimate, 3);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await open();
  await rich.fill("Retain this description draft");
  await pick("type", "bug");
  await pick("priority", "low");
  const draftTypeIcon = await typeIcon(),
    draftPriorityIcon = await priorityIcon();
  const draftBody = await source.inputValue();
  await page.mouse.click(5, 5);
  await page.locator("dialog").waitFor({ state: "detached" });
  await open();
  await page.locator('[data-feature="form-restore"]').click();
  assert.equal(await rich.innerText(), "Retain this description draft");
  assert.equal(await type.inputValue(), "bug");
  assert.equal(await priority.inputValue(), "low");
  assert.equal(
    await typeIcon(),
    draftTypeIcon,
    "Draft restoration updates the type icon",
  );
  assert.equal(
    await priorityIcon(),
    draftPriorityIcon,
    "Draft restoration updates the priority icon",
  );
  await save();
  assert.equal((await store.snapshot(project.id)).tasks[0].body, draftBody);
  await open();
  await page.getByLabel("New subtask title").fill("Test child");
  await page.locator("[data-task-modal=subtask-add]").click();
  await page.locator(".task-subtask-row").waitFor();
  assert.equal(await page.locator("dialog").count(), 1);
  const child = (await store.snapshot(project.id)).tasks.find(
    (t) => t.title === "Test child",
  );
  assert.equal(child.parent, original.id);
  await page.locator(".dialog-head [name=title]").fill("Unsaved title");
  await page.locator("[data-feature=task-history]").click();
  await page.locator(".task-history-panel .recovery-item").first().waitFor();
  assert.equal(
    await page.locator(".dialog-head [name=title]").inputValue(),
    "Unsaved title",
  );
  assert.equal(await page.locator("dialog").count(), 1);
  const panel = await page.locator(".task-history-panel").boundingBox();
  const body = await page
    .locator(".task-editor-content > .dialog-body")
    .boundingBox();
  assert.ok(
    panel.x >= body.x + body.width - 1,
    "History is alongside the editor",
  );
  await page.screenshot({ path: "/tmp/pencils-task-history.png" });
  await page.locator(".task-history-panel .recovery-item summary").first().click();
  await page.locator('dialog').evaluate(el => el.dataset.sameDialog = 'yes');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-task-modal=history-restore]').first().click();
  await page.waitForFunction(() => document.querySelector('[data-feature=task-history]')?.getAttribute('aria-expanded') === 'true' && document.querySelector('#task-form [name=title]')?.value !== 'Unsaved title');
  assert.equal(await page.locator('dialog').getAttribute('data-same-dialog'),'yes','Restoration keeps the same modal');
  await page.locator("[data-task-modal=history-close]").click();
  await page.locator("[data-task-picker=parent] .task-picker-trigger").click();
  assert.equal(
    await page.locator(`[data-picker-value="${child.id}"]`).count(),
    0,
    "Cannot parent a task to its child",
  );
  await page.keyboard.press("Escape");
  assert.ok(await page.locator("dialog").isVisible());
  await page.mouse.click(5, 5);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: compact task dialog, collapsed planning, WYSIWYG formatting and bullets, Markdown preservation, preview, draft restore, desktop/mobile and light/dark themes.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-task-editor-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
