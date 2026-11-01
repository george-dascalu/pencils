import AxeBuilder from '@axe-core/playwright';

// Axe measures element boxes, not associated labels or expanded hit areas.
// Accept only these verified exceptions; all other 2.2 findings remain failures.
export async function accessibilityReport(page) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  for (const violation of report.violations.filter(v => v.id === 'target-size')) {
    const remaining = [];
    for (const node of violation.nodes) {
      const valid = node.target.length === 1 && typeof node.target[0] === 'string' && await page.locator(node.target[0]).evaluate(el => {
        const label = el.matches('input[type=checkbox]') && el.labels?.[0];
        if (label) {
          const r = label.getBoundingClientRect();
          return r.width >= 24 && r.height >= 24 && label.control === el;
        }
        if (!el.matches('.phone-task-open')) return false;
        const row = el.closest('.phone-task').getBoundingClientRect();
        // The title's ::after covers the summary. Verify a 24px square actually
        // hits the button, instead of trusting its pseudo-element declaration.
        return [[2, 2], [25, 2], [2, 25], [25, 25]].every(([x, y]) => {
          const hit = document.elementFromPoint(row.left + x, row.top + y);
          return hit === el || el.contains(hit);
        });
      });
      if (!valid) remaining.push(node);
    }
    violation.nodes = remaining;
  }
  report.violations = report.violations.filter(v => v.nodes.length);
  return report;
}
