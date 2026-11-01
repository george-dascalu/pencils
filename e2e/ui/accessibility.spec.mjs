// Accessibility gate: axe finds no WCAG 2.2 AA violations in any project view, in the
// light and dark themes, with reduced motion. Part of the cross-browser release gate
// (@gate). Manual screen-reader and iPad checks remain separate.
import { accessibilityReport } from "../helpers/accessibility.mjs";
import { test, expect, useApp, onDevices } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Accessibility checks" });
  await store.createTask(project.id, { title: "Keyboard task", due: "2026-10-17" });
  const doc = await store.createDocument(project.id, { title: "Accessible editing", body: "# Notes\n\n> [!note]+ Remember\n> Review the work.\n\n| Item | State |\n| --- | --- |\n| Card | Ready |" });
  return { project, doc };
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
  documents: ".document-editor",
};

for (const [view, ready] of Object.entries(views)) {
  test(`axe finds no WCAG 2.2 AA issues in ${view} in light and dark`, { tag: "@gate" }, async ({ page }, testInfo) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view === "documents" ? `documents/${app.doc.id}` : view}`);
    await page.locator(ready).first().waitFor();
    const issues = [];
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const report = await accessibilityReport(page);
      for (const violation of report.violations)
        issues.push({ theme, view, id: violation.id, impact: violation.impact, nodes: violation.nodes.map((n) => ({ target: n.target, html: n.html, summary: n.failureSummary })) });
    }
    if (issues.length) await testInfo.attach("axe-violations.json", { body: JSON.stringify(issues, null, 2), contentType: "application/json" });
    expect(issues.map((v) => `${v.theme}/${v.view}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  });
}


test('Table open-card buttons fill their reserved target width', { tag: '@gate' }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  const button = page.locator('.table-open').first();
  await expect(button).toBeVisible();
  const size = await button.evaluate(el => ({ width: parseFloat(getComputedStyle(el).width), height: el.getBoundingClientRect().height }));
  expect(size.width).toBeGreaterThanOrEqual(24);
  expect(size.height).toBeGreaterThanOrEqual(24);
  await button.click();
  await expect(page.locator('#task-form')).toBeVisible();
});


onDevices(['phone', 'ipad'], () => {
  test.use({ viewportSize: null });
  test('WCAG 2.2 checks editable documents and actual compact list targets on touch', async ({ page }) => {
    for (const [view, ready] of [['list', '.task-row'], ['documents', '.document-editor']]) {
      await page.goto(`${app.base}/#project/${app.project.id}/${view === 'documents' ? `documents/${app.doc.id}` : view}`);
      await page.locator(ready).first().waitFor();
      const report = await accessibilityReport(page);
      expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    }
  });
});
