import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium,firefox} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {Store} from '../server/store.js';
import {createServer} from '../server/index.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-comment-panels-'));
const store=new Store(root);await store.init();
const project=await store.createProject({title:'Formatted cards'});
const task=await store.createTask(project.id,{title:'Collect inspiration & early ideas',body:'Original description'});
let board=(await store.snapshot(project.id)).boards[0];
board=await store.updateBoard(project.id,board.id,{revision:board.revision,nodes:[{id:'card',type:'task',task:task.id,x:100,y:100,w:440,h:550,taskCollapsed:false}],edges:[]});
const server=createServer(store,{productionAssets:process.env.PRODUCTION_ASSETS==='1'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await(process.env.BROWSER==='firefox'?firefox:chromium).launch();
const context=await browser.newContext({viewport:{width:1500,height:1000}}), page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const url=`http://127.0.0.1:${server.address().port}/#project/${project.id}/board/${board.id}`;
const saved=async()=>(await store.snapshot(project.id)).tasks.find(t=>t.id===task.id);
const until=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await page.waitForTimeout(50)}throw Error('Timed out waiting for save')};
const oneLine=async panel=>{
 const positions=await panel.locator('.comment-rich-tools button:visible,.comment-rich-tools summary:visible').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().y));
 assert.ok(Math.max(...positions)-Math.min(...positions)<4,`Toolbar wraps: ${positions}`);
 const icons=await panel.locator('.comment-rich-tools button:visible > .icon').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));
 assert.ok(icons.every(width=>width<=13));
};
try{
 await fs.mkdir('artifacts',{recursive:true});await page.goto(url);
 const card=page.locator('[data-node=card]');await card.locator('[data-pro=comments]').click();
 const panel=page.locator('.board-comments');await oneLine(panel);assert.equal(await panel.locator('.board-comments-object').count(),0);
 const grip=panel.getByRole('button',{name:'Resize comments',exact:true}),start=await panel.boundingBox(),handle=await grip.boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+120,handle.y+handle.height/2+80,{steps:8});await page.mouse.up();
 let rect=await panel.boundingBox();assert.ok(rect.width>=start.width+119);assert.ok(rect.height>=start.height+79);
 await grip.focus();await grip.press('ArrowLeft');assert.ok((await panel.boundingBox()).width<rect.width);await oneLine(panel);
 await panel.getByRole('textbox',{name:'Comment',exact:true}).fill('A draft survives resizing');
 await panel.getByRole('button',{name:'Close comments',exact:true}).click();await card.locator('[data-pro=comments]').click();
 assert.equal(await panel.getByRole('textbox',{name:'Comment',exact:true}).innerText(),'A draft survives resizing');assert.ok((await panel.boundingBox()).width>start.width+90);
 await panel.locator('.rich-format-menu > summary').click();await panel.getByRole('button',{name:'Heading',exact:true}).click();
 assert.equal(await panel.locator('.inline-rich h2').innerText(),'A draft survives resizing');
 await page.screenshot({path:'artifacts/comments-resized-desktop.png'});
 await panel.getByRole('button',{name:'Close comments',exact:true}).click();
 await card.locator('[data-pro=task-details]').click();
 const rich=page.locator('#task-form .task-description .inline-rich');await rich.fill('');
 await rich.pressSequentially('# Heading typed');assert.equal(await rich.locator('h1').innerText(),'Heading typed');
 await rich.fill('');await rich.pressSequentially('**Bold**');assert.equal(await rich.locator('strong,b').innerText(),'Bold');
 for (const [text,selector,expected] of [['*Italic*','em,i','Italic'],['***Both***','strong em,em strong,b i,i b','Both'],['==Highlight==','mark','Highlight'],['~~Removed~~','del,s,strike','Removed'],['`code`','code','code']]) {
  await rich.fill('');await rich.pressSequentially(text);assert.equal(await rich.locator(selector).innerText(),expected);
 }
 await rich.fill('');await rich.pressSequentially('\\*Literal\\*');assert.equal(await rich.locator('em,i').count(),0);
 // Rich clipboard HTML keeps formatting while removing executable attributes.
 await rich.fill('');
 await rich.evaluate(el=>{el.focus();const clipboardData=new DataTransfer();clipboardData.setData('text/html','<p><strong>Clipboard</strong> <img src=x onerror="window.clipboardUnsafe=true"><a href="javascript:alert(1)">unsafe link</a></p>');const paste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:clipboardData});el.dispatchEvent(paste);});
 assert.equal(await rich.locator('strong,b').innerText(),'Clipboard');assert.equal(await rich.locator('[onerror],a[href^="javascript:"]').count(),0);assert.equal(await page.evaluate(()=>window.clipboardUnsafe),undefined);
 await rich.fill('');
 const source='# Heading\n\n## Details\n\n**Bold**, *italic*, ***both***, ~~removed~~, ==highlighted== and `code`.\n\n- [ ] Unchecked\n- [x] Checked\n\n| Item | State |\n| --- | --- |\n| Idea | Ready |\n\n> A quotation\n\n```js\nconst safe = true;\n```\n\n\\*Literal asterisks\\*';
 await rich.evaluate((el,text)=>{el.focus();const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);const paste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:clipboardData});el.dispatchEvent(paste);},source);
 assert.equal(await rich.locator('h1').innerText(),'Heading');assert.equal(await rich.locator('table td').count(),2);assert.equal(await rich.locator('mark').innerText(),'highlighted');
 await until(async()=>{const t=await saved();return t.body.includes('==highlighted==')&&t.body.includes('# Heading')&&!t.body.includes('\\# Heading')});
 await page.locator('#task-form [data-action=dialog-close]').click();
 const description=card.locator('.task-card-description');await description.locator('h1').waitFor();
 assert.equal(await description.locator('h2').innerText(),'Details');assert.equal(await description.locator('table td').count(),2);assert.equal(await description.locator('input[type=checkbox]').count(),2);assert.equal(await description.locator('mark').innerText(),'highlighted');assert.equal(await description.locator('pre code').innerText(),'const safe = true;\n');
 assert.match(await description.innerText(),/\*Literal asterisks\*/);
 const sizes=await description.evaluate(el=>({h1:parseFloat(getComputedStyle(el.querySelector('h1')).fontSize),body:parseFloat(getComputedStyle(el).fontSize)}));assert.ok(sizes.h1>sizes.body);
 await page.screenshot({path:'artifacts/task-card-markdown.png'});
 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.goto(url);await phone.locator('[data-node=card] [data-pro=comments]').click();
 const mobilePanel=phone.locator('.board-comments');await oneLine(mobilePanel);
 for(const theme of ['light','dark']){
  await phone.evaluate(theme=>window.PencilsAppearance.write({theme}),theme);
  const check=await new AxeBuilder({page:phone}).include('.board-comments').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(check.violations.map(v=>v.id),[]);
  const rect=await mobilePanel.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);
  await phone.screenshot({path:`artifacts/comments-compact-mobile-${theme}.png`});
 }
 await mobile.close();assert.deepEqual(errors,[]);
 console.log('PASS: comment resize with pointer/keyboard, retained size/draft, single-row small icons, mobile accessibility; typed/pasted Markdown and saved card headings, emphasis, tables, checklists, highlights and code');
}catch(error){await page.screenshot({path:'artifacts/comments-markdown-failure.png'});throw error}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();await fs.rm(root,{recursive:true,force:true});}
