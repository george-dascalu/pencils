import { test, expect, onDevices, useApp } from '../fixtures.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Navigation tray'})}));
onDevices(['desktop','narrow'],()=>test('desktop layouts are centred icons with interruptible open and close motion', {tag:'@gate'}, async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const tab=page.locator('.tabs [data-view="tasks"]'),tray=page.locator('.layout-tray');
  await expect(tab).toHaveAttribute('aria-controls','layout-tray');
  await tab.click();
  await expect(tray).toHaveCSS('opacity','1');
  const bar=await page.locator('#board-project-tools').boundingBox(),r=await tray.boundingBox();
  expect(Math.abs(r.x+r.width/2-bar.x-bar.width/2)).toBeLessThan(1);
  const styles=await tray.locator('button').evaluateAll(buttons=>buttons.map(el=>({label:el.getAttribute('aria-label'),text:[...el.querySelectorAll('span')].every(span=>getComputedStyle(span).display==='none'),width:el.offsetWidth,height:el.offsetHeight})));
  for(const s of styles){expect(s.label).toBeTruthy();expect(s.text).toBe(true);expect(s.width).toBe(s.height);}
  expect(await tray.evaluate(el=>getComputedStyle(el).transitionDuration)).toContain('0.16s');
  await tab.click();
  expect(await tray.evaluate(el=>el.inert)).toBe(true);
  expect(await tray.evaluate(el=>el.getAnimations().length)).toBeGreaterThan(0);
  await tab.click();
  await expect(tray).toHaveCSS('opacity','1');
  expect(await tray.evaluate(el=>el.inert)).toBe(false);
  await tray.getByRole('button',{name:'Table',exact:true}).click();
  await expect(page).toHaveURL(/\/table$/);
  await tab.click();await page.keyboard.press('Escape');await expect(tray).toBeHidden();await expect(tab).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});await tab.click();
  expect(await tray.evaluate(el=>el.getAnimations().length)).toBe(0);
  await tab.click();await expect(tray).toBeHidden();
}));
