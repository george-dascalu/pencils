import {expect} from '@playwright/test';

export async function chooseCardPane(page, pane) {
  const form=page.locator('#task-form'), picker=form.getByRole('combobox',{name:'Card section',exact:true});
  const current=await form.evaluate(el=>{const d=el.closest('dialog').classList;return d.contains('with-task-history')?'history':d.contains('with-task-comments')?'comments':d.contains('card-board')?'board':'details';});
  if(current!==pane){
    // Just after a resize the layout may still swap the picker for the pane buttons: use the one shown.
    await expect(async()=>{
      if(await picker.isVisible())await picker.selectOption(pane,{timeout:1000});
      else await form.locator(`[data-feature="task-${pane==='details'?current:pane}"]`).click({timeout:1000});
    }).toPass();
  }
  if(pane==='board')return expect(form.locator('xpath=ancestor::dialog')).toHaveClass(/\bcard-board\b/);
  await expect(form.locator('xpath=ancestor::dialog')).not.toHaveClass(/\bcard-board\b/);
  if(pane==='details'){
    await expect(form.locator('.task-history-panel')).toBeHidden();
    await expect(form.locator('.task-comments-panel')).toHaveCount(0);
    await expect(form.locator('.task-editor-content > .dialog-body')).toBeVisible();
  }else await expect(form.locator(pane==='history'?'.task-history-panel':'.task-comments-panel')).toBeVisible();
}
// On desktop and iPad a card's Attachments, Notes, Relationships, Documents and Boards are tabs (F0.23-10);
// phones and the card's board show them all. cardSection finds one whichever way it shows, and
// chooseCardSection picks its tab first where there is one.
export const cardSection=(page,name)=>page.locator(`#task-form section[aria-label="${name}"]`);
export async function chooseCardSection(page,name){
  const tab=page.locator('#task-form').getByRole('tablist',{name:'Card sections',exact:true}).getByRole('tab',{name:new RegExp(`^${name}( \\d+)?$`)});
  if(await tab.isVisible()){await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');}
  await expect(cardSection(page,name)).toBeVisible();
  return cardSection(page,name);
}
