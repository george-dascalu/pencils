// Accessibility gate: axe finds no WCAG 2.1 AA violations in any project view, in the
// light and dark themes, with reduced motion. Part of the cross-browser release gate
// (@gate). Manual screen-reader and iPad checks remain separate.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Accessibility checks" });
  await store.createTask(project.id, { title: "Keyboard task", due: "2026-10-17" });
  return { project };
});

test.use({ viewportSize: { width: 1440, height: 1000 } });

const views = {
  overview: ".project-overview",
  list: ".list-group",
  tree: ".tree-wrapper",
  table: ".spreadsheet",
  kanban: ".kanban",
  calendar: ".calendar, .calendar-agenda",
  timeline: ".task-timeline",
  capacity: ".capacity-view",
  board: "#canvas",
};

for (const [view, ready] of Object.entries(views)) {
  test(`axe finds no WCAG 2.1 AA issues in ${view} in light and dark`, { tag: "@gate" }, async ({ page }, testInfo) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.locator(ready).first().waitFor();
    const issues = [];
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      for (const violation of report.violations)
        issues.push({ theme, view, id: violation.id, impact: violation.impact, nodes: violation.nodes.map((n) => ({ target: n.target, html: n.html, summary: n.failureSummary })) });
    }
    if (issues.length) await testInfo.attach("axe-violations.json", { body: JSON.stringify(issues, null, 2), contentType: "application/json" });
    expect(issues.map((v) => `${v.theme}/${v.view}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  });
}
