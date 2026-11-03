import { test, expect, onDevices, useApp } from '../fixtures.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Popup motion', key: 'PM' });
  const one = await store.createTask(project.id, { title: 'First card' });
  const two = await store.createTask(project.id, { title: 'Second card' });
  return { project, one, two };
});
const card = page => page.locator('#dialogs > dialog');
const open = (page, id) => page.locator(`[data-action="task-open"][data-id="${id}"]:visible`).first().click();

onDevices(['desktop', 'ipad', 'phone'], () => test('card editors and date popups fade in and out, save edits, and reopen safely', { tag: '@gate' }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  // Capture opening motion within the same task as the trigger, before it can finish.
  const opening = await page.locator(`[data-action="task-open"][data-id="${app.one.id}"]`).first().evaluate(el => {
    el.click(); const dialog = document.querySelector('#dialogs > dialog');
    return { properties: dialog.getAnimations().map(a => a.transitionProperty).sort(), duration: getComputedStyle(dialog).transitionDuration };
  });
  expect(opening.properties).toEqual(['opacity', 'scale', 'translate']);
  expect(parseFloat(opening.duration)).toBeGreaterThanOrEqual(.1);
  await expect(card(page)).toHaveCSS('opacity', '1');
  await page.locator('#task-form [name=title]').fill('Edited during motion');
  const closing = await page.getByRole('button', { name: 'Close card', exact: true }).evaluate(el => {
    el.click(); const dialog = document.querySelector('#dialogs > dialog');
    return { closing: dialog.hasAttribute('data-popup-closing'), inert: dialog.inert, animating: dialog.getAnimations().length > 0 };
  });
  expect(closing).toEqual({ closing: true, inert: true, animating: true });
  await expect(card(page)).toHaveCount(0);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.one.id).title).toBe('Edited during motion');
  await open(page, app.two.id);
  await expect(page.locator('#task-form [name=title]')).toHaveValue('Second card');
  await expect(card(page)).toHaveCSS('opacity', '1');
  // Closing and reopening in one task must not leave a stale cleanup that destroys the new editor.
  await page.getByRole('button', { name: 'Close card', exact: true }).evaluate((el, id) => {
    el.click(); document.querySelector(`[data-action="task-open"][data-id="${id}"]`).click();
  }, app.one.id);
  await expect(card(page)).toHaveCount(1);
  await expect(page.locator('#task-form [name=title]')).toHaveValue('Edited during motion');
  await page.locator('[data-action="task-delete"]').click();
  await expect(page.locator('.confirm-popover')).toHaveCSS('opacity', '1');
  expect(parseFloat(await page.locator('.confirm-popover').evaluate(el => getComputedStyle(el).transitionDuration))).toBeGreaterThanOrEqual(.1);
  await page.locator('[data-confirm-cancel]').click();
  await expect(page.locator('.confirm-popover')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close card', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
  const date = page.locator(`[data-row-dates="${app.one.id}"]:visible`).first();
  await date.click();
  await expect(page.locator('#task-dates-popover')).toHaveCSS('opacity', '1');
  expect(parseFloat(await page.locator('#task-dates-popover').evaluate(el => getComputedStyle(el).transitionDuration))).toBeGreaterThanOrEqual(.1);
  await page.getByRole('button', { name: 'Close date editor' }).click();
  await expect(page.locator('#task-dates-popover')).toHaveCount(0);
}));

onDevices(['desktop', 'phone'], () => test('reduced motion closes card editors immediately without animation', async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, app.one.id);
  expect(await card(page).evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await page.getByRole('button', { name: 'Close card', exact: true }).evaluate(el => {
    el.click(); return !!document.querySelector('#dialogs > dialog');
  })).toBe(false);
}));
