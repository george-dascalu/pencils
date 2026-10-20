import { selectSettingsPage } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-visual-rules-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Visual rules",
  schema: {
    statuses: ["todo", "doing", "done"],
    done: ["done"],
    types: ["epic", "task", "bug"],
  },
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const diagram = (id) => page.locator(`[data-rule-diagram="${id}"]`);
const schema = () =>
  page.locator("[name=workflowSchema]").inputValue().then(JSON.parse);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-action=project-edit]").click();
  await selectSettingsPage(page, "workflow");
  assert.ok(
    await diagram("workflow").locator("[data-rule-connect]").isDisabled(),
  );
  await page.locator("[data-workflow-rules]").check();
  const workflow = diagram("workflow");
  await workflow.locator("[data-rule-connect]").click();
  await workflow.locator("[data-rule-node=todo]").click();
  await workflow.locator("[data-rule-node=done]").click();
  assert.ok(!(await schema()).transitions.todo.includes("done"));
  await workflow.locator("[data-rule-node=todo]").click();
  await workflow.locator("[data-rule-node=done]").click();
  assert.ok((await schema()).transitions.todo.includes("done"));
  await workflow.locator("[data-rule-remove=done]").click();
  assert.ok(!(await schema()).transitions.todo.includes("done"));
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  await selectSettingsPage(page, "hierarchy");
  const hierarchy = diagram("hierarchy");
  await hierarchy.locator("[data-rule-node=epic]").click();
  await hierarchy.locator("[data-rule-remove=bug]").click();
  assert.ok(!(await schema()).hierarchy.children.epic.includes("bug"));
  await hierarchy.locator("[data-rule-connect]").click();
  await hierarchy.locator("[data-rule-node=epic]").click();
  await hierarchy.locator("[data-rule-node=bug]").click();
  assert.ok((await schema()).hierarchy.children.epic.includes("bug"));
  await page.locator("[data-hierarchy-mode]").selectOption("enforced");
  await hierarchy.locator('[data-rule-node="@root"]').click();
  await hierarchy.locator("[data-rule-remove=bug]").click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await hierarchy.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/tmp/pencils-visual-hierarchy-${width}-${theme}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForTimeout(800);
  const saved = (await store.snapshot(project.id)).project.schema;
  assert.ok(!saved.transitions.todo.includes("done"));
  assert.equal(saved.hierarchy.mode, "enforced");
  assert.ok(!saved.hierarchy.roots.includes("bug"));
  await page.reload();
  await page
    .getByRole("button", { name: "Back to project", exact: true })
    .click();
  await page.locator("[data-action=project-edit]").click();
  await selectSettingsPage(page, "hierarchy");
  assert.ok(!(await schema()).transitions.todo.includes("done"));
  assert.ok(!(await schema()).hierarchy.roots.includes("bug"));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: visual workflow and hierarchy connections add/remove, modes, persistence, desktop/mobile and light/dark layouts",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
