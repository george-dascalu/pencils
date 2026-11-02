import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { clickControl } from '../helpers/menu-controls.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Close an empty draft'})}));
onDevices(['desktop','ipad','phone'],()=>test('an untouched draft closes immediately without validating or creating a card @gate',async({page})=>{
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await clickControl(page.locator('[data-action="board-task"]'));await page.locator('[data-action="board-create-draft"]').click();
  const form=page.locator('#task-form');await expect(form).toBeVisible();await expect(form.locator('[name="title"]')).toHaveValue('');
  await form.locator('[data-action="dialog-close"]').click();await expect(form).toHaveCount(0);
  expect((await app.store.snapshot(app.project.id)).boards[0].nodes.some(n=>n.type==='draft')).toBe(false);
  expect((await app.store.snapshot(app.project.id)).tasks).toHaveLength(0);
}));
