import { richPlainText, richDocument } from './document-sheet-richtext.js';
// Safe DOM/CSS projection is shared by read cells and the inline editor.
export function richStyle(ts = {}) {
  const style={};
  if(ts.bl!=null)style.fontWeight=ts.bl?'700':'400';if(ts.it!=null)style.fontStyle=ts.it?'italic':'normal';
  if(ts.ul || ts.st)style.textDecoration=[ts.ul?.s?'underline':'',ts.st?.s?'line-through':''].filter(Boolean).join(' ')||'none';
  if(ts.fs)style.fontSize=`${ts.fs}px`;if(ts.ff)style.fontFamily=ts.ff;if(ts.cl?.rgb)style.color=ts.cl.rgb;
  return style;
}
export function renderRichText(parent,p){
  const text=richPlainText(p);let cursor=0;parent.replaceChildren();
  for(const run of p.body.textRuns||[]){if(run.st>cursor)parent.append(document.createTextNode(text.slice(cursor,run.st)));const span=document.createElement('span');Object.assign(span.style,richStyle(run.ts));span.textContent=text.slice(run.st,run.ed);parent.append(span);cursor=run.ed;}
  parent.append(document.createTextNode(text.slice(cursor)));
}
export function readRichText(parent,id='cell-text') {
  let text='',runs=[];
  function walk(node,inherited={}){
    if(node.nodeType===3){const st=text.length;text+=node.nodeValue;if(text.length>st&&Object.keys(inherited).length)runs.push({st,ed:text.length,ts:inherited});return;}
    if(node.nodeType!==1)return;
    if(node.tagName==='BR'){text+='\n';return;}
    const block=['DIV','P','LI'].includes(node.tagName);if(block&&text&&!text.endsWith('\n'))text+='\n';
    const ts={...inherited},s=node.style;
    if(['B','STRONG'].includes(node.tagName)||s.fontWeight==='700'||s.fontWeight==='bold')ts.bl=1;
    if(s.fontWeight==='400'||s.fontWeight==='normal')ts.bl=0;
    if(['I','EM'].includes(node.tagName)||s.fontStyle==='italic')ts.it=1;if(s.fontStyle==='normal')ts.it=0;
    if(node.tagName==='U'||s.textDecoration.includes('underline'))ts.ul={s:1};
    if(['S','STRIKE'].includes(node.tagName)||s.textDecoration.includes('line-through'))ts.st={s:1};
    if(s.textDecoration==='none'){ts.ul={s:0};ts.st={s:0};}
    if(s.fontSize)ts.fs=parseFloat(s.fontSize);if(s.fontFamily)ts.ff=s.fontFamily;
    if(s.color){const nums=s.color.match(/\d+/g);if(s.color.startsWith('#'))ts.cl={rgb:s.color};else if(nums?.length>=3)ts.cl={rgb:'#'+nums.slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join('')};}
    for(const child of node.childNodes)walk(child,ts);
    if(block&&node.nextSibling&&!text.endsWith('\n'))text+='\n';
  }
  for(const node of parent.childNodes)walk(node);
  if(parent.childNodes.length===1&&parent.firstChild.nodeName==='BR')text='';
  return richDocument(text,runs,id);
}
export function richSelection(parent){
  const s=parent.ownerDocument.getSelection();if(!s?.rangeCount)return null;const r=s.getRangeAt(0);
  if(!parent.contains(r.startContainer)||!parent.contains(r.endContainer))return null;
  const before=r.cloneRange();before.selectNodeContents(parent);before.setEnd(r.startContainer,r.startOffset);
  const start=richPlainText(readRichText(before.cloneContents())).length;before.setEnd(r.endContainer,r.endOffset);return {start,end:richPlainText(readRichText(before.cloneContents())).length};
}
export function restoreRichSelection(parent,{start,end}){
  const walker=parent.ownerDocument.createTreeWalker(parent,4),nodes=[];let node,total=0;
  while((node=walker.nextNode())){nodes.push({node,start:total,end:total+node.length});total+=node.length;}
  if(!nodes.length){parent.append(document.createTextNode(''));nodes.push({node:parent.firstChild,start:0,end:0});}
  const at=offset=>{const n=nodes.find(n=>n.end>=offset)||nodes.at(-1);return[n.node,Math.min(n.node.length,Math.max(0,offset-n.start))];};
  const range=document.createRange();range.setStart(...at(start));range.setEnd(...at(end));const s=parent.ownerDocument.getSelection();s.removeAllRanges();s.addRange(range);
}
