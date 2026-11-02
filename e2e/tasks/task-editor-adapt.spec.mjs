import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async store => {
  const name = "Alexandra Montgomery";
  const organisation = await store.createOrganisation({ title: "Adapt", people: [{ id: "alex", name, short_name: "AL" }], teams: [{ id: "team", name: "Team", members: ["alex"] }] });
  const project = await store.createProject({ title: "Adaptive editor", organisation: organisation.id, teams: ["team"] });
  return { project, name };
});

onDevices(["phone", "ipad", "desktop"], device => {
  const widths = device === "phone" ? [320, 350, 390, 844] : device === "ipad" ? [640, 1024] : [620, 640, 1440];
  for (const width of widths) test(`card controls remain reachable at ${width}px`, { tag: "@gate" }, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    const card = await app.store.createTask(app.project.id, { title: "Plan the next release", assignee: app.name, priority: "high", start: "2026-11-02", due: "2026-11-06", body: "## Next steps\n\nReview the plan.\n\n".repeat(16) });
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator(`[data-action=task-open][data-id="${card.id}"]:visible`).first().click();
    const form = page.locator('#task-form');
    await expect(form).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      const geometry = await form.evaluate(el => {
        const fields = el.querySelector('.task-fields'), bounds = fields.getBoundingClientRect();
        const actions = [...el.querySelectorAll('.task-editor-header-row button')].filter(b => b.getClientRects().length).map(b => ({ name: b.getAttribute('aria-label'), ...b.getBoundingClientRect().toJSON() }));
        const overlap = actions.flatMap((a, i) => actions.slice(i + 1).filter(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1).map(b => `${a.name} / ${b.name}`));
        return { actions, overlap, overflow: fields.scrollWidth - fields.clientWidth,
          contained: [...fields.querySelectorAll('select[name=status], .task-picker-trigger, .task-assignee-choice')].every(e => { const r = e.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right; }),
          short: getComputedStyle(fields.querySelector('.task-assignee'), '::after').content,
          dates: [...el.querySelectorAll('.task-date-range .date-field')].map(e => ({ ...e.getBoundingClientRect().toJSON(), room: e.clientWidth - parseFloat(getComputedStyle(e.querySelector('input')).paddingRight) })),
          dateLayout: getComputedStyle(el.querySelector('.task-date-range')).display,
        };
      });
      expect(geometry.overlap, theme).toEqual([]);
      for (const a of geometry.actions) {
        expect(a.left, a.name).toBeGreaterThanOrEqual(0);
        expect(a.right, a.name).toBeLessThanOrEqual(width);
        if (device !== 'desktop') { expect(a.width, a.name).toBeGreaterThanOrEqual(44); expect(a.height, a.name).toBeGreaterThanOrEqual(44); }
      }
      expect(geometry.overflow, theme).toBeLessThanOrEqual(1);
      expect(geometry.contained, theme).toBe(true);
      if (device !== 'desktop' && [320, 640, 844, 1024].includes(width)) expect(geometry.short).toBe('"AL"');
      if (width === 320) {
        expect(geometry.dateLayout).toBe('grid');
        expect(geometry.dates[1].top).toBeGreaterThanOrEqual(geometry.dates[0].bottom);
      }
      for (const date of geometry.dates) expect(date.room, 'room for a full date beside the calendar target').toBeGreaterThanOrEqual(100);
    }
    // Both pane navigation and metadata editing remain available at the adapted sizes.
    await form.locator('[data-editor-pane=comments]').click();
    await expect(page.locator('.task-dialog')).toHaveClass(/with-task-comments/);
    if (width < 1320) await form.locator('[data-editor-pane=details]').click();
    await form.getByLabel('Status', { exact: true }).selectOption('review');
    await form.getByRole('button', { name: 'Choose Due date', exact: true }).click();
    const calendar = page.locator('.date-picker-popover');
    await expect(calendar).toBeVisible();
    await calendar.locator('table [data-date-value="2026-11-09"]').click();
    await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id)?.due).toBe('2026-11-09');
    await form.getByLabel('Assignee', { exact: true }).selectOption('');
    await expect(form.locator('.task-assignee.unassigned .icon')).toBeVisible();
    await form.getByLabel('Assignee', { exact: true }).selectOption(app.name);
    await expect(form.locator('.task-assignee')).toHaveAttribute('title', app.name);
    if (width === 320) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(form.locator('.task-date-range')).toHaveCSS('display', 'flex');
      const actions = await form.locator('.task-secondary-actions').boundingBox();
      const close = await form.locator('[data-action=dialog-close]').boundingBox();
      expect(actions.y + actions.height / 2).toBeCloseTo(close.y + close.height / 2, 0);
      expect(actions.x + actions.width).toBeLessThanOrEqual(close.x);
      await page.setViewportSize({ width: 320, height: 844 });
      await expect(form.locator('.task-date-range')).toHaveCSS('display', 'grid');
      await expect(form.locator('[name=due]')).toHaveValue('2026-11-09');
    }
    await form.locator('[data-action=dialog-close]').click();
    await expect(form).toHaveCount(0);
  });
});
