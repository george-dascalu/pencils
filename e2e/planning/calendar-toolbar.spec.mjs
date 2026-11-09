import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Calendar toolbar'})}));

onDevices(['desktop','ipad','ipad-portrait','phone'],()=>test('calendar centres its date range and its themed icon toggles weekends',{tag:'@gate'},async({page,device})=>{
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  if(await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button',{name:'Close view options',exact:true}).click();
  const period=page.locator('.planning-period');
  const p=await period.boundingBox();
  expect(p.x+p.width/2).toBeCloseTo(page.viewportSize().width/2,0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  if(device!=='phone') {
    const left=await page.locator('.toolbar-left').boundingBox(), right=await page.locator('.planning-options').boundingBox();
    expect(left.x+left.width<=right.x).toBe(true);
    if(Math.abs(left.y-p.y)<10) expect(left.x+left.width<=p.x && p.x+p.width<=right.x).toBe(true);
  }
  const toggle=page.getByRole('button',{name:'Show weekends',exact:true,includeHidden:true});
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await (await reveal(toggle)).click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect(toggle).toHaveText('');
  await expect(toggle).toHaveCSS('height',device==='desktop'?'32px':'44px');
  await expect(page.locator('.calendar-hours-day')).toHaveCount(5);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await (await reveal(toggle)).click();
  await expect(page.locator('.calendar-hours-day')).toHaveCount(7);
  for(const mode of ['month','agenda']) {
    await (await reveal(page.locator('#calendar-mode'))).selectOption(mode);
    if(await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button',{name:'Close view options',exact:true}).click();
    const box=await period.boundingBox();
    expect(box.x+box.width/2).toBeCloseTo(page.viewportSize().width/2,0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
  await reveal(page.locator('#calendar-mode'));
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>{document.documentElement.dataset.look='paper';document.documentElement.dataset.theme=theme;},theme);
    await expect.poll(()=>page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement), swatch=document.createElement('div');
      swatch.style.backgroundColor=root.getPropertyValue('--surface');document.body.append(swatch);
      const expected=getComputedStyle(swatch).backgroundColor;swatch.remove();
      return ['[data-calendar-unscheduled]','#calendar-mode-button'].every(s=>getComputedStyle(document.querySelector(s)).backgroundColor===expected);
    })).toBe(true);
  }
}));

// Owner request: the period remains readable on hover, and compact icon menus leave room
// for the calendar's display toggles together on the right.
onDevices(['desktop', 'ipad', 'phone'], () => test('calendar icon menus show named icons and group the display toggles', { tag: '@gate' }, async ({ page, device }) => {
  if (device === 'desktop') await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(page.locator('[data-calendar-unscheduled]')).toHaveCount(0);
  const layout = page.locator('#calendar-mode-button'), rows = page.locator('#week-board-rows-button');
  await (await reveal(rows)).click();
  const menu = page.getByRole('listbox', { name: 'Group by', exact: true });
  await expect(menu.getByRole('option', { name: 'Time of day', exact: true }).locator('.icon')).toHaveCount(2);
  await menu.getByRole('option', { name: 'Time of day', exact: true }).click();
  await expect(rows).toHaveAttribute('aria-label', 'Group by: Time of day');
  await expect(rows).toBeFocused();
  await expect(rows).toHaveText('');
  await (await reveal(layout)).click();
  await expect(page.getByRole('listbox', { name: 'Layout', exact: true }).getByRole('option', { name: 'Week board', exact: true }).locator('.icon')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(layout).toBeFocused();
  for (const button of [layout, rows]) {
    const r = await button.boundingBox();
    expect(r.width).toBe(r.height);
    expect(r.height).toBe(device === 'desktop' ? 32 : 44);
  }
  const display = page.getByRole('group', { name: 'Calendar display', exact: true });
  await expect(display.locator('[data-card-ids]')).toHaveCount(1);
  await expect(display.locator('[data-calendar-weekends]')).toHaveCount(1);
  await expect(page.locator('[data-card-ids]')).toHaveCount(1);
  await display.locator('[data-card-ids]').click();
  await expect(page.locator('[data-card-ids]')).toHaveAttribute('aria-pressed', 'false');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  if (device === 'desktop') for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.look = 'paper'; document.documentElement.dataset.theme = theme; }, theme);
    const date = page.locator('.period-field > .date-picker-trigger');
    await date.hover();
    await expect(date).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await date.click();
    await expect(date).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
  }
}));
