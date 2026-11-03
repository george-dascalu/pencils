import {expect} from '@playwright/test';

export async function chooseCardPane(page, pane) {
  const form=page.locator('#task-form'), picker=form.getByRole('combobox',{name:'Card section',exact:true});
  const current=await form.evaluate(el=>el.closest('dialog').classList.contains('with-task-history')?'history':el.closest('dialog').classList.contains('with-task-comments')?'comments':'details');
  if(current!==pane){
    if(await picker.isVisible())await picker.selectOption(pane);
    else await form.locator(`[data-feature="task-${pane==='details'?current:pane}"]`).click();
  }
  if(pane==='details'){
    await expect(form.locator('.task-history-panel')).toBeHidden();
    await expect(form.locator('.task-comments-panel')).toHaveCount(0);
    await expect(form.locator('.task-editor-content > .dialog-body')).toBeVisible();
  }else await expect(form.locator(pane==='history'?'.task-history-panel':'.task-comments-panel')).toBeVisible();
}
