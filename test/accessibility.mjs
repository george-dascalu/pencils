import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-a11y-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Accessibility checks" });
await store.createTask(project.id, {
  title: "Keyboard task",
  due: "2026-10-17",
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
    process.env.BROWSER === "webkit"
      ? webkit
      : process.env.BROWSER === "firefox"
        ? firefox
        : chromium
  ).launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  page = await context.newPage(),
  issues = [];
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const view of [
      "overview",
      "list",
      "tree",
      "table",
      "kanban",
      "calendar",
      "timeline",
      "capacity",
      "board",
      ]) {
      await selectProjectView(page, view);
      await page.waitForTimeout(100);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      for (const violation of report.violations)
        issues.push({
          theme,
          view,
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((n) => ({
            target: n.target,
            html: n.html,
            summary: n.failureSummary,
          })),
        });
    }
  }
  await fs.writeFile(
    "/tmp/pencils-accessibility.json",
    JSON.stringify(issues, null, 2),
  );
  assert.deepEqual(
    issues.map((v) => `${v.theme}/${v.view}: ${v.id} (${v.nodes.length})`),
    [],
  );
  console.log(
    "PASS: axe WCAG 2.1 AA checks across 9 views in light/dark with reduced motion. Manual screen-reader/iPad checks remain separate.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
