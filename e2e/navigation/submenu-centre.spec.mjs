import { test, expect, onDevices, useApp } from '../fixtures.mjs';
const app = useApp(async store => ({project: await store.createProject({title:'Menu centre'})}));
async function centred(page, location) {
  const tray = page.locator('.layout-tray[data-open]'), nav = page.locator('.topbar .tabs');
  await expect(tray).toBeVisible();
  await expect.poll(async () => {
    const [t, n] = await Promise.all([tray.boundingBox(), nav.boundingBox()]);
    return Math.abs(t.x + t.width / 2 - n.x - n.width / 2);
  }, {message:location + ': centre under navigation icons'}).toBeLessThan(1);
  const css = await tray.evaluate(el => ({left:parseFloat(getComputedStyle(el).left),position:getComputedStyle(el).position,wrap:getComputedStyle(el.firstElementChild).flexWrap}));
  const rect = await tray.boundingBox(), bar = await page.locator('.topbar').boundingBox();
  expect(css.position).toBe('fixed'); expect(css.wrap).toBe('nowrap'); expect(Math.abs(css.left - rect.x)).toBeLessThan(1);
  expect(rect.y).toBeGreaterThanOrEqual(bar.y + bar.height); expect(rect.x).toBeGreaterThanOrEqual(8);
  expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize().width - 8);
}
onDevices(['desktop','narrow'], () => test('Tasks and Planning submenus centre below the navigation icons at every desktop width @gate', async ({page}) => {
  for (const [view, tabName] of [['list','tasks'],['calendar','planning']]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const tab = page.locator(`.tabs [data-view="${tabName}"]`);
    await expect(tab).toHaveAttribute('aria-controls','layout-tray'); await tab.click();
    await centred(page, view);
    await page.setViewportSize({width:1100,height:850}); await centred(page, view + ' resized');
    await page.keyboard.press('Escape'); await expect(page.locator('.layout-tray')).toBeHidden();
  }
}));
onDevices(['ipad','phone'], () => test('touch layout trays remain above their bottom navigation @gate', async ({page}) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const tab=page.locator('.tabs [data-view="tasks"]'); await expect(tab).toHaveAttribute('aria-controls','layout-tray'); await tab.click();
  const tray=page.locator('.layout-tray[data-open]'); await expect(tray).toBeVisible();
  const [t,n]=await Promise.all([tray.boundingBox(),page.locator('.topbar .tabs').boundingBox()]);
  expect(t.y+t.height).toBeLessThanOrEqual(n.y); expect(Math.abs(t.x+t.width/2-n.x-n.width/2)).toBeLessThan(1);
}));
