import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { chooseDocumentView, editorSource } from '../helpers/documents.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Web links',key:'WL'})}));
const url='https://example.test/guide?q=hello#section';
async function open(page,body=url+'\n') {
  const record=await app.store.createDocument(app.project.id,{title:'Web links',body});
  await page.context().route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<title>Linked page</title><p>Opened web page.</p>'}));
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);await page.locator('#document-form .cm-content').waitFor();return record;
}
async function clickSource(page,text,modifier='Control') {
  const point=await page.evaluate(async text=>{const {EditorView}=await import('/vendor/editor/deps.js');const view=EditorView.findFromDOM(document.querySelector('#document-form .cm-editor'));const at=view.state.doc.toString().indexOf(text)+Math.floor(text.length/2),box=view.coordsAtPos(at);return {x:box.left+1,y:(box.top+box.bottom)/2};},text);
  if(modifier)await page.keyboard.down(modifier);try{await page.mouse.click(point.x,point.y);}finally{if(modifier)await page.keyboard.up(modifier);}
}
test('Ctrl-click on a plain URL opens its webpage without changing the document',{tag:'@gate'},async({page})=>{
  const record=await open(page),popup=page.waitForEvent('popup');await clickSource(page,url);
  const tab=await popup;await expect(tab).toHaveURL(url);await expect(tab).toHaveTitle('Linked page');expect(await tab.evaluate(()=>window.opener)).toBe(null);await tab.close();
  expect(await editorSource(page)).toBe(url+'\n');expect((await app.store.getDocument(app.project.id,record.id)).body).toBe(url+'\n');
});
for(const modifier of ['Control','Meta'])test(`${modifier}-click opens a revealed Markdown label and a raw URL in Source`,{tag:'@gate'},async({page})=>{
  await open(page,`[Example](https://example.test/a_(b))\n\n${url}\n`);await chooseDocumentView(page,'Source');
  for(const [text,target] of [['Example','https://example.test/a_(b)'],[url,url]]){const popup=page.waitForEvent('popup');await clickSource(page,text,modifier);const tab=await popup;await expect(tab).toHaveURL(target);await tab.close();}
});
onDevices(['desktop','ipad','phone'],()=>test('rendered links in text, callouts and cells open the same URL',{tag:'@gate'},async({page})=>{
  await open(page,`[Text](${url})\n\n> [!note] Links\n> [Callout](${url})\n\n| Link |\n| --- |\n| [Cell](${url}) |\n`);
  for(const name of ['Text','Callout','Cell']){const popup=page.waitForEvent('popup');await page.locator('#document-form').getByRole('link',{name,exact:true}).click({modifiers:['Control']});const tab=await popup;await expect(tab).toHaveURL(url);await tab.close();}
  await chooseDocumentView(page,'Reading');const popup=page.waitForEvent('popup');await page.locator('.document-reading').getByRole('link',{name:'Text',exact:true}).click({modifiers:['Control']});const tab=await popup;await expect(tab).toHaveURL(url);await tab.close();
}));
test('Ctrl-click also opens URLs typed inside editable callouts, cells and code blocks',{tag:'@gate'},async({page})=>{
  await open(page,'> [!note] Links\n> Text\n\n| Link |\n| --- |\n| Text |\n\n```text\nText\n```\n');
  for(const name of ['Callout content','Row 1, column 1','Code block']){
    const field=page.getByRole('textbox',{name,exact:true});await field.fill(url);
    const point=await field.evaluate((el,url)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode,at=node.data.indexOf(url);if(at<0)continue;const range=document.createRange();range.setStart(node,at+8);range.setEnd(node,at+9);const box=range.getBoundingClientRect();return {x:(box.left+box.right)/2,y:(box.top+box.bottom)/2};}},url);
    const popup=page.waitForEvent('popup');await page.keyboard.down('Control');await page.mouse.click(point.x,point.y);await page.keyboard.up('Control');const tab=await popup;await expect(tab).toHaveURL(url);await tab.close();
  }
});
test('ordinary clicks keep a raw URL editable and preserve the current document',async({page})=>{
  await open(page);await chooseDocumentView(page,'Source');await page.evaluate(()=>{window.webOpens=0;window.open=()=>{window.webOpens++;return null;};});
  await clickSource(page,url,null);await page.keyboard.press('End');await page.keyboard.type(' note');expect(await page.evaluate(()=>window.webOpens)).toBe(0);expect(await editorSource(page)).toContain(url+' note');
});
