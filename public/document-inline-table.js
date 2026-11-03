import { makeDocumentTable, tableRectangle, tableCells, insertTableAxis, deleteTableAxis, moveTableAxis, mergeTableCells, unmergeTableCells, tableTemplateLayout } from './document-table-model.js';
import { serializeDocumentTable } from './document-table-format.js';
import { parseTabSeparated, csv } from './document-tables.js';
import { focusOnOpen } from './open-focus.js';
import { textColor } from './document-text-color.js';
import { documentTableWindow, windowedTableRows, documentTableSourceCell } from './document-table-window.js';
import { documentSearchParts } from './document-reading-search.js';

const letters = n => { let out=''; for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out; return out; };
const blockSelector='pre,blockquote,ul,ol,h1,h2,h3,h4,h5,h6,hr,aside';
// Table structure and cell editing share the document's own source history.
export function editableDocumentTable({ element, token, field, fields, markdown, pipe, renderer, icon, panel, commit, activate, history, onError, toast, saveTemplate, requestMeasure, onPage, initialPage, readOnly = false }) {
  const table=element.querySelector('table'), nodes=new Map(), life=new AbortController();
  const rich=token.type==='documentRichTable', tableToken=renderer.tableToken?.(table)||(token.type==='documentTableLayout'?token.tokens[0]:token);
  const original=rich?[]:tableToken.raw.trim().split(/\r?\n/).filter((_,i)=>i!==1).map(line=>line.trim().replace(/^\|/,'').replace(new RegExp(`${pipe.source}$`),'').split(pipe).map(value=>value.trim()));
  const rows=[...table.rows], records=[], occupied=new Set(); let width=0;
  if(!rich){width=tableToken.header?.length||original.reduce((max,row)=>Math.max(max,row.length),1);original.forEach((values,r)=>{for(let c=0;c<width;c++){const id=`cell-${records.length}`;records.push({id,row:r,column:c,rows:1,columns:1,value:values[c]||''});if(rows[r]?.cells[c])nodes.set(id,rows[r].cells[c]);}});}
  else rows.forEach((row,r)=>{let c=0;for(const cell of row.cells){while(occupied.has(`${r}:${c}`))c++;const rs=Math.min(cell.rowSpan||1,rows.length-r),cs=cell.colSpan||1,id=`cell-${records.length}`;
    records.push({id,row:r,column:c,rows:rs,columns:cs,value:markdown(cell)});nodes.set(id,cell);
    for(let y=r;y<r+rs;y++)for(let x=c;x<c+cs;x++)occupied.add(`${y}:${x}`);c+=cs;width=Math.max(width,c);
  }});
  let model=makeDocumentTable(Array.from({length:rich?rows.length:original.length},()=>Array(width).fill('')),tableToken.align||[...rows[0].cells].map(cell=>cell.getAttribute('align')),records);
  model.rich=rich;model.layout=token.layout==='scroll'||token.type==='documentTableLayout'?'scroll':'fit';
  let selection=null, axisSelection=null, anchor=null, current=records[0]?.id, drag=null, touch=null, suppressClick=false, measureFrame=0;
  const viewport=document.createElement('div'),surface=document.createElement('div'),columns=document.createElement('div'),rowHandles=document.createElement('div');
  viewport.className='document-table-viewport';surface.className='document-table-surface';columns.className='document-table-column-handles';rowHandles.className='document-table-row-handles';
  const old=table.parentElement.matches('.document-table-scroll')?table.parentElement:null;
  (old||table).before(viewport);surface.append(table,columns,rowHandles);viewport.append(surface);old?.remove();
  const actions=document.createElement('div');actions.className='document-component-actions document-table-actions';
  const button=(label,glyph,run,parent=actions)=>{const b=document.createElement('button');b.type='button';b.className='icon-button';b.setAttribute('aria-label',label);b.title=label;b.innerHTML=icon(glyph);b.addEventListener('click',run);parent.append(b);return b;};
  const addColumn=button('Add column','plus',()=>safe(()=>addAxis('column')),surface);
  const addRow=button('Add row','plus',()=>safe(()=>addAxis('row')),surface);
  addColumn.classList.add('document-table-add-column');addRow.classList.add('document-table-add-row');
  const options=button('Table options','more',()=>openOptions());
  const merge=button('Merge cells','merge',()=>{capture();const cells=selected();if(!cells.length)return;const unmerge=cells.length===1&&(cells[0].rows>1||cells[0].columns>1);safe(()=>change(unmerge?unmergeTableCells(model,selection):mergeTableCells(model,selection),selection));});
  const layout=button('Horizontal scroll','expand',()=>{model.layout=model.layout==='fit'?'scroll':'fit';showLayout();commit(null,true);requestMeasure();});
  const announce=document.createElement('span');announce.className='sr-only';announce.setAttribute('role','status');actions.append(announce);element.append(actions);
  let byId=new Map(),mountedRows=new Map(),rowPage=initialPage?.rowPage||1,columnPage=initialPage?.columnPage||1,pageWindow;
  const htmlCache=new Map();
  const pages=document.createElement('div');pages.className='document-table-pages';pages.setAttribute('role','group');pages.setAttribute('aria-label','Table pages');viewport.before(pages);
  const rowControls=pageControls('rows','Table page'),columnControls=pageControls('columns','Table column page');
  const record=id=>byId.get(id);
  const rect=cell=>({r:cell.row,c:cell.column,rows:cell.rows,columns:cell.columns});
  const selected=()=>selection?tableCells(model,selection):[];
  function capture(changed){if(readOnly)return;for(const [id,node] of changed?.dataset.tableCell?[[changed.dataset.tableCell,changed]]:nodes){const cell=record(id);if(!cell)continue;if(node.innerHTML!==node.dataset.originalHtml){cell.value=markdown(node);node.dataset.originalHtml=node.innerHTML;node.dataset.originalMarkdown=cell.value;if(node.querySelector(blockSelector)||node.querySelector('p + p,div'))model.rich=true;} } }
  function html(value){if(htmlCache.has(value))return htmlCache.get(value);const holder=document.createElement('div');holder.innerHTML=renderer.render(value);if(holder.children.length===1&&holder.firstElementChild.matches('p'))holder.replaceChildren(...holder.firstElementChild.childNodes);
    for(const node of holder.querySelectorAll('[data-document-href]'))node.setAttribute('href',node.dataset.documentHref);
    for(const node of holder.querySelectorAll('[data-document-src]'))node.setAttribute('src',node.dataset.documentSrc);
    for(const node of holder.querySelectorAll('[style]')){const color=textColor(node.style.color);node.removeAttribute('style');if(color){node.dataset.documentColor=color;node.style.color=color;}}
    const output=holder.innerHTML.trim();htmlCache.set(value,output);if(htmlCache.size>2048)htmlCache.delete(htmlCache.keys().next().value);return output;
  }
  function cellText(cell){if(!/[\\`*_~[<!&#>]|==|^(?:[-+]|\d+[.)]\s)/.test(cell.value))return cell.value;const holder=document.createElement('div');holder.innerHTML=html(cell.value);return documentSearchParts(holder).text;}
  function serialize(changed){capture(changed);const next={...model,cells:model.rich?model.cells:model.cells.map(cell=>({...cell,value:cell.value.replace(/ *\r?\n+/g,'<br>').replace(new RegExp(pipe,'g'),'\\|')}))};return serializeDocumentTable(next,html);}
  function pageControls(axis,label){const group=document.createElement('div');group.className='document-table-page-control';pages.append(group);
    const previous=button(`Previous table ${axis}`,'arrow-left',()=>turn(-1),group),input=document.createElement('input');input.type='number';input.min='1';input.setAttribute('aria-label',label);group.append(input);
    const count=document.createElement('span');group.append(count);const next=button(`Next table ${axis}`,'arrow',()=>turn(1),group);
    function turn(delta=0){capture();const value=(axis==='rows'?rowPage:columnPage)+delta;if(axis==='rows')rowPage=delta?value:Number(input.value);else columnPage=delta?value:Number(input.value);render();requestMeasure();}
    input.addEventListener('change',()=>turn());input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();turn();}});
    return {group,input,count,previous,next};
  }
  function updatePages(){pageWindow=documentTableWindow(model.rows,model.columns,rowPage,columnPage);rowPage=pageWindow.rowPage;columnPage=pageWindow.columnPage;pages.hidden=!pageWindow.paged;
    for(const [control,value,total] of [[rowControls,rowPage,pageWindow.rowPages],[columnControls,columnPage,pageWindow.columnPages]]){control.group.hidden=total<=1;control.input.value=String(value);control.input.max=String(total);control.count.textContent=`/ ${total.toLocaleString()}`;control.previous.disabled=value===1;control.next.disabled=value===total;}
  }
  function ensureCell(cell){if(!nodes.has(cell.id)){capture();const bounds=documentTableWindow(model.rows,model.columns,rowPage,columnPage);rowPage=cell.row?Math.floor((cell.row-1)/bounds.rowSize)+1:rowPage;columnPage=Math.floor(cell.column/bounds.columnSize)+1;render();requestMeasure();}return nodes.get(cell.id);}
  function remember(node,value){field(node,'');node.dataset.originalMarkdown=value;node.dataset.originalHtml=node.innerHTML;}
  function render(){
    byId=new Map(model.cells.map(cell=>[cell.id,cell]));updatePages();
    const body=document.createElement('tbody');fields.length=0;
    const visible=new Set();mountedRows=new Map();
    for(const [r,cells] of windowedTableRows(model,pageWindow)){const row=document.createElement('tr');row.dataset.tableRow=String(r);mountedRows.set(r,row);body.append(row);for(const entry of cells){const cell=entry.cell;visible.add(cell.id);
      let node=nodes.get(cell.id),tag=r?'TD':'TH';
      if(!node||node.tagName!==tag){node=document.createElement(tag);node.innerHTML=html(cell.value);if(!readOnly)remember(node,cell.value);nodes.set(cell.id,node);}
      else if(!readOnly&&!node.dataset.componentField)remember(node,cell.value);
      if(node.dataset.originalMarkdown!==cell.value){node.innerHTML=html(cell.value);node.dataset.originalMarkdown=cell.value;node.dataset.originalHtml=node.innerHTML;for(const check of node.querySelectorAll('input[type=checkbox]'))check.disabled=false;}
      node.dataset.tableCell=cell.id;node.dataset.tableRow=String(r);node.dataset.tableColumn=String(cell.column);
      if(entry.rows>1)node.rowSpan=entry.rows;else node.removeAttribute('rowspan');if(entry.columns>1)node.colSpan=entry.columns;else node.removeAttribute('colspan');
      node.style.textAlign=model.aligns[cell.column]||'';node.removeAttribute('align');
      node.setAttribute('aria-label',`${r?`Row ${r}`:'Header'}, column ${cell.column+1}`);row.append(node);
    }}
    fields.length=0;for(const [id,node] of nodes)if(visible.has(id)){node.dataset.componentField=String(fields.length);fields.push(node);}else{nodes.delete(id);node.remove();}
    if(!nodes.has(current))current=nodes.keys().next().value;
    table.replaceChildren(body);
    for(const [axis,container,indices] of [['column',columns,Array.from({length:pageWindow.columnTo-pageWindow.columnFrom},(_,i)=>pageWindow.columnFrom+i)],['row',rowHandles,pageWindow.rows]]){container.replaceChildren();if(readOnly)continue;for(const i of indices){
      const b=button(axis==='column'?`Select column ${letters(i)}`:i?`Select row ${i}`:'Select header row',axis==='row'?'drag':'chevron',event=>{if(suppressClick){suppressClick=false;return;}selectAxis(axis,i,event.shiftKey);b.focus({preventScroll:true});},container);
      b.dataset.tableAxis=axis;b.dataset.tableIndex=String(i);b.draggable=true;if(axis==='column')b.textContent=letters(i);else if(i)b.textContent=String(i);
      b.addEventListener('keydown',event=>{if(['Delete','Backspace'].includes(event.key)){event.preventDefault();removeSelected();}else if(event.key==='Escape'){event.preventDefault();select(null);} });
    }}
    table.style.setProperty("--table-columns",pageWindow.columnTo-pageWindow.columnFrom);showLayout();paintSelection();scheduleMeasure();if(pageWindow.paged)onPage?.(surface);
  }
  function showLayout(){viewport.classList.toggle('document-table-scroll',model.layout==='scroll');surface.dataset.tableLayout=model.layout;layout.setAttribute('aria-pressed',String(model.layout==='scroll'));layout.title=model.layout==='scroll'?'Fit table width':'Scroll table horizontally';scheduleMeasure();}
  function measure(){measureFrame=0;if(!table.isConnected)return;const box=table.getBoundingClientRect(),base=surface.getBoundingClientRect(),x=box.left-base.left,y=box.top-base.top,edges=new Map([[0,0],[model.columns,box.width]]);
    edges.clear();edges.set(pageWindow.columnFrom,0);edges.set(pageWindow.columnTo,box.width);
    for(const [id,node] of nodes){const cell=record(id),b=node.getBoundingClientRect(),from=Math.max(cell.column,pageWindow.columnFrom),to=Math.min(cell.column+cell.columns,pageWindow.columnTo);for(let i=from;i<=to;i++)if(!edges.has(i)||to-from===1)edges.set(i,b.left-box.left+b.width*(i-from)/(to-from));}
    for(const b of columns.children){const c=Number(b.dataset.tableIndex);b.style.left=`${x+edges.get(c)}px`;b.style.setProperty("--axis-width",`${edges.get(c+1)-edges.get(c)}px`);}
    for(const b of rowHandles.children){const r=mountedRows.get(Number(b.dataset.tableIndex)).getBoundingClientRect();b.style.top=`${r.top-base.top}px`;b.style.setProperty("--axis-height",`${r.height}px`);}
    addColumn.style.setProperty("--axis-height",`${box.height}px`);addRow.style.setProperty("--axis-width",`${box.width}px`);
    Object.assign(addColumn.style,{left:`${x+box.width}px`,top:`${y}px`,height:`${box.height}px`});Object.assign(addRow.style,{left:`${x}px`,top:`${y+box.height}px`,width:`${box.width}px`});
  }
  function scheduleMeasure(){if(!measureFrame)measureFrame=requestAnimationFrame(measure);}
  const observer=new ResizeObserver(scheduleMeasure);observer.observe(table);observer.observe(viewport);
  function paintSelection(){const ids=new Set(selected().map(cell=>cell.id));for(const [id,node] of nodes){node.toggleAttribute('data-table-selected',ids.has(id));if(ids.has(id))node.dataset.tableSelected='true';}
    for(const b of surface.querySelectorAll('[data-table-axis]'))b.setAttribute('aria-pressed',String(axisSelection?.axis===b.dataset.tableAxis&&Number(b.dataset.tableIndex)>=axisSelection.from&&Number(b.dataset.tableIndex)<axisSelection.from+axisSelection.count));
    const cells=selected(),unmerge=cells.length===1&&(cells[0].rows>1||cells[0].columns>1);merge.disabled=!unmerge&&cells.length<2;merge.setAttribute('aria-label',unmerge?'Unmerge cells':'Merge cells');merge.title=merge.getAttribute('aria-label');announce.textContent=cells.length?`${cells.length} cells selected`:'';
  }
  function select(next,axis=null){selection=next?tableRectangle(model,next):null;axisSelection=axis;paintSelection();const cell=selected()[0];if(cell){current=cell.id;activate(ensureCell(cell));}}
  function selectAxis(axis,index,extend=false){const from=extend&&axisSelection?.axis===axis?Math.min(axisSelection.anchor,index):index,to=extend&&axisSelection?.axis===axis?Math.max(axisSelection.anchor,index):index;
    select(axis==='row'?{r:from,c:0,rows:to-from+1,columns:model.columns}:{r:0,c:from,rows:model.rows,columns:to-from+1},{axis,from,count:to-from+1,anchor:extend?axisSelection.anchor:index});
  }
  function safe(action){try{return action();}catch(error){onError(error.message);}}
  function change(next,nextSelection,focus=null){model=next;selection=nextSelection?tableRectangle(model,nextSelection):null;axisSelection=null;render();commit(null,true);requestMeasure();const cell=focus||selected()[0]||model.cells[0];current=cell.id;const node=ensureCell(cell);activate(node);if(focus)focusOnOpen(node,options);}
  function addAxis(axis){capture();const next=insertTableAxis(model,axis,model[axis==='row'?'rows':'columns']);const cell=next.cells.find(item=>axis==='row'?item.row===next.rows-1&&item.column===0:item.row===0&&item.column===next.columns-1);change(next,null,cell);}
  function removeSelected(){capture();if(axisSelection){const {axis,from,count}=axisSelection;safe(()=>change(deleteTableAxis(model,axis,from,count),null));}else if(selection){for(const cell of selected()){cell.value='';nodes.get(cell.id)?.replaceChildren();}render();commit(null,true);}}
  function menuClose(box){box.querySelector('[data-document-panel-close]')?.click();}
  function openOptions(){if(!panel)return;capture();activate(nodes.get(current)||nodes.get(model.cells[0].id));const cell=record(current)||model.cells[0],r=selection?.r??cell.row,c=selection?.c??cell.column,rc=selection?.columns===model.columns?selection.rows:1,cc=selection?.rows===model.rows?selection.columns:1;
    const items=[
      ['Insert row above','plus',false,()=>change(insertTableAxis(model,'row',r),null)],['Insert row below','plus',false,()=>change(insertTableAxis(model,'row',r+rc),null)],
      ['Move row up','up',r===0,()=>change(moveTableAxis(model,'row',r,rc,r-1),null)],['Move row down','down',r+rc>=model.rows,()=>change(moveTableAxis(model,'row',r,rc,r+rc+1),null)],
      [rc>1?'Delete selected rows':'Delete row','trash',model.rows===rc,()=>change(deleteTableAxis(model,'row',r,rc),null)],
      ['Insert column left','plus',false,()=>change(insertTableAxis(model,'column',c),null)],['Insert column right','plus',false,()=>change(insertTableAxis(model,'column',c+cc),null)],
      ['Move column left','arrow-left',c===0,()=>change(moveTableAxis(model,'column',c,cc,c-1),null)],['Move column right','arrow',c+cc>=model.columns,()=>change(moveTableAxis(model,'column',c,cc,c+cc+1),null)],
      ...[['left','Align left'],['center','Align centre'],['right','Align right']].map(([value,label])=>[label,`text-${value}`,false,()=>{for(let i=c;i<c+cc;i++)model.aligns[i]=model.aligns[i]===value?null:value;change(model,selection); }]),
      [cc>1?'Delete selected columns':'Delete column','trash',model.columns===cc,()=>change(deleteTableAxis(model,'column',c,cc),null)],
      ['Select cells','table',false,()=>selectPanel()],
      ['Save table layout','file',!saveTemplate,()=>savePanel()],
      ['Copy as CSV','duplicate',false,()=>{const matrix=Array.from({length:model.rows},()=>Array(model.columns).fill(''));for(const item of model.cells)matrix[item.row][item.column]=cellText(item);void navigator.clipboard.writeText(csv(matrix)).then(()=>toast?.('Table copied as CSV.'),error=>onError(error.message));}],
    ];
    const box=panel(options,'Table',items.map(([label,glyph,disabled],i)=>`${[5,13,14].includes(i)?'<hr>':''}<button type="button" class="document-panel-item${glyph==='trash'?' danger':''}" data-table-action="${i}" ${disabled?'disabled':''} ${i>=9&&i<=11?`aria-pressed="${model.aligns[c]===["left","center","right"][i-9]}"`:""}>${icon(glyph)}${label}</button>`).join(''),280);
    box.addEventListener('click',event=>{const choice=event.target.closest('[data-table-action]');if(!choice)return;menuClose(box);safe(items[Number(choice.dataset.tableAction)][3]);});
  }
  function selectPanel(){const box=panel(options,'Select cells','<form class="document-table-selection-form"><label>From<input name="from" value="A1" required pattern="[A-Za-z]+[1-9][0-9]*"></label><label>To<input name="to" value="B2" required pattern="[A-Za-z]+[1-9][0-9]*"></label><button class="button primary">Select cells</button></form>',280);
    box.querySelector('form').addEventListener('submit',event=>{event.preventDefault();safe(()=>{const parse=value=>{const [,col,row]=/^([A-Za-z]+)(\d+)$/.exec(value);return {r:Number(row)-1,c:[...col.toUpperCase()].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1};};const a=parse(event.target.elements.from.value),b=parse(event.target.elements.to.value);select({r:Math.min(a.r,b.r),c:Math.min(a.c,b.c),rows:Math.abs(a.r-b.r)+1,columns:Math.abs(a.c-b.c)+1});menuClose(box);options.focus();});});
  }
  function savePanel(){const box=panel(options,'Save table layout','<form class="document-table-template-form"><label>Template name<input name="title" required maxlength="100" autocomplete="off"></label><label class="check-control"><input name="contents" type="checkbox">Include existing cell content</label><p data-template-error role="alert" hidden></p><button class="button primary">Save layout</button></form>',320);const form=box.querySelector('form');
    form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{capture();await saveTemplate(form.elements.title.value.trim(),serializeDocumentTable(tableTemplateLayout({...model,rich:true},form.elements.contents.checked),html));menuClose(box);}catch(error){const message=form.querySelector('[data-template-error]');message.hidden=false;message.textContent=error.message;}finally{button.disabled=false;}});
    focusOnOpen(form.elements.title,box.querySelector('button'));
  }
  function dispose(){observer.disconnect();life.abort();cancelAnimationFrame(measureFrame);clearTimeout(touch?.timer);delete element.documentTableSearch;}
  if(readOnly){
    addColumn.remove();addRow.remove();actions.remove();surface.classList.add('document-table-readonly');
    const textCache=new Map();
    element.documentTableSearch=function*(){for(const cell of model.cells){let text=textCache.get(cell.id);if(text===undefined){text=cellText(cell);textCache.set(cell.id,text);}yield {text,locate:()=>nodes.get(cell.id),reveal:()=>ensureCell(cell)};}};
    render();return {destroy:dispose};
  }
  table.addEventListener('focusin',event=>{const node=event.target.closest('[data-table-cell]');if(!node)return;current=node.dataset.tableCell;if(!selected().some(cell=>cell.id===current))select(null);});
  table.addEventListener('click',event=>{const node=event.target.closest('[data-table-cell]');if(!node)return;const cell=record(node.dataset.tableCell);if(event.shiftKey&&anchor){event.preventDefault();select({r:Math.min(anchor.row,cell.row),c:Math.min(anchor.column,cell.column),rows:Math.abs(anchor.row-cell.row)+1,columns:Math.abs(anchor.column-cell.column)+1});}else{select(cell.rows>1||cell.columns>1?rect(cell):null);anchor=cell;current=cell.id;}});
  function insertLiteral(text){
    const selection=window.getSelection();if(!selection?.rangeCount)return;
    const range=selection.getRangeAt(0);range.deleteContents();const inserted=document.createTextNode(text);range.insertNode(inserted);range.setStartAfter(inserted);range.collapse(true);
    const code=inserted.parentElement.closest('pre code');
    if(code&&text.endsWith('\n')){
      // An empty final line needs a caret box. A trailing BR gives the browser
      // that box without adding a second newline to the code's text/source.
      const remaining=document.createRange();remaining.selectNodeContents(code);remaining.setStartAfter(inserted);
      if(!remaining.toString()){let end=code.querySelector('br[data-table-caret]');if(!end){end=document.createElement('br');end.dataset.tableCaret='true';code.append(end);}range.setStartBefore(end);range.collapse(true);}
    }
    selection.removeAllRanges();selection.addRange(range);
  }

  function moveTo(cell,start=false){const node=ensureCell(cell);node.focus();const range=document.createRange();range.selectNodeContents(node);range.collapse(start);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);}
  table.addEventListener('keydown',event=>{
    const node=event.target.closest('[data-table-cell]');if(!node||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return;
    const cell=record(node.dataset.tableCell),richCell=!!node.querySelector(blockSelector+',p,div');
    if(event.key==='Escape'&&selection){event.preventDefault();event.stopPropagation();select(null);return;}
    if(event.key==='Enter'&&node.querySelector('pre code')?.contains(window.getSelection()?.anchorNode)){event.preventDefault();event.stopPropagation();insertLiteral('\n');commit(node);return;}
    if(event.key==='Enter'&&richCell){event.documentTableRichEnter=true;return;}
    let next=null,start=false;
    if(event.key==='Enter'&&!event.shiftKey){capture();if(cell.row+cell.rows===model.rows){model=insertTableAxis(model,'row',model.rows);render();commit(null,true);}next=model.cells.find(item=>item.row===cell.row+cell.rows&&item.column<=cell.column&&item.column+item.columns>cell.column);}
    else if(event.key==='Tab'&&!event.shiftKey&&cell.id===model.cells.at(-1).id){capture();model=insertTableAxis(model,'row',model.rows);render();commit(null,true);next=model.cells.find(item=>item.row===model.rows-1);start=true;}
    else if(/^Arrow/.test(event.key)&&!event.shiftKey&&!richCell){const sel=window.getSelection();if(sel?.isCollapsed&&sel.rangeCount&&node.contains(sel.anchorNode)){
      const before=event.key==='ArrowLeft'||event.key==='ArrowUp',side=document.createRange();side.selectNodeContents(node);
      if(before)side.setEnd(sel.anchorNode,sel.anchorOffset);else side.setStart(sel.anchorNode,sel.anchorOffset);
      let atEdge=!side.toString();
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        const at=sel.getRangeAt(0).getClientRects()[0],all=document.createRange();all.selectNodeContents(node);const lines=all.getClientRects();
        atEdge=at&&lines.length?(before?at.top<lines[0].bottom-1:at.bottom>lines[lines.length-1].top+1):!side.toString().includes('\n');
      }
      if(atEdge){if(event.key==='ArrowDown'||event.key==='ArrowUp')next=model.cells.find(item=>item.row===cell.row+(before?-1:cell.rows)&&item.column===cell.column);else next=model.cells[model.cells.indexOf(cell)+(before?-1:1)];start=!before;}
    }}
    if(next){event.preventDefault();event.stopPropagation();moveTo(next,start);}
  },true);
  table.addEventListener('paste',event=>{const node=event.target.closest('[data-table-cell]');if(!node)return;const text=event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n').replace(/\n$/,'');event.preventDefault();event.stopPropagation();if(!text.includes('\t')){if(node.querySelector('pre code')?.contains(window.getSelection()?.anchorNode))insertLiteral(text);else document.execCommand('insertText',false,text);commit(node);return;}safe(()=>{capture();const cell=record(node.dataset.tableCell),values=parseTabSeparated(text),needed=values.reduce((max,row)=>Math.max(max,row.length),0);if(cell.column+needed>model.columns)model=insertTableAxis(model,'column',model.columns,cell.column+needed-model.columns);if(cell.row+values.length>model.rows)model=insertTableAxis(model,'row',model.rows,cell.row+values.length-model.rows);const targets=tableCells(model,{r:cell.row,c:cell.column,rows:values.length,columns:needed});if(targets.some(item=>item.rows>1||item.columns>1))throw Error('Unmerge these cells before pasting a spreadsheet range.');const positions=new Map(targets.map(item=>[item.row*model.columns+item.column,item]));values.forEach((row,r)=>row.forEach((value,c)=>{const target=positions.get((cell.row+r)*model.columns+cell.column+c);target.value=value.replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');}));const last=positions.get((cell.row+values.length-1)*model.columns+cell.column+values.at(-1).length-1);change(model,null);if(last)moveTo(last);});},true);
  actions.addEventListener('keydown',undoKey);surface.addEventListener('keydown',event=>{if(event.target.closest('[data-table-axis]'))undoKey(event);});
  function undoKey(event){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();history(event.shiftKey);}}
  // Native mouse drag, and a held touch drag, use the same insertion boundaries.
  const dragId=crypto.randomUUID();
  function begin(axis,index){capture();if(axisSelection?.axis!==axis||index<axisSelection.from||index>=axisSelection.from+axisSelection.count)selectAxis(axis,index);drag={axis,from:axisSelection.from,count:axisSelection.count,before:null};}
  function pointTarget(x,y){const hit=document.elementFromPoint(x,y)?.closest('[data-table-axis]');if(!hit||!surface.contains(hit)||hit.dataset.tableAxis!==drag?.axis)return;const b=hit.getBoundingClientRect(),index=Number(hit.dataset.tableIndex),after=drag.axis==='row'?y>b.top+b.height/2:x>b.left+b.width/2;for(const node of surface.querySelectorAll('[data-table-drop]'))node.removeAttribute('data-table-drop');hit.dataset.tableDrop=after?'after':'before';drag.before=index+(after?1:0);}
  function endDrag(){for(const node of surface.querySelectorAll('[data-table-drop]'))node.removeAttribute('data-table-drop');if(drag&&drag.before!==null){const {axis,from,count,before}=drag;safe(()=>change(moveTableAxis(model,axis,from,count,before),null));}drag=null;}
  surface.addEventListener('dragstart',event=>{const handle=event.target.closest('[data-table-axis]');if(!handle)return;if(touch){event.preventDefault();return;}begin(handle.dataset.tableAxis,Number(handle.dataset.tableIndex));event.dataTransfer.setData('application/x-pencils-table-axis',dragId);event.dataTransfer.effectAllowed='move';});
  surface.addEventListener('dragover',event=>{if(!drag)return;event.preventDefault();event.dataTransfer.dropEffect='move';pointTarget(event.clientX,event.clientY);});
  surface.addEventListener('drop',event=>{if(!drag||event.dataTransfer.getData('application/x-pencils-table-axis')!==dragId)return;event.preventDefault();event.stopPropagation();pointTarget(event.clientX,event.clientY);endDrag();});
  surface.addEventListener('dragend',()=>{drag=null;for(const node of surface.querySelectorAll('[data-table-drop]'))node.removeAttribute('data-table-drop');});
  surface.addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-table-axis]');if(!handle)return;touch={id:event.pointerId,handle,x:event.clientX,y:event.clientY,ready:event.pointerType!=='touch',timer:event.pointerType==='touch'?setTimeout(()=>{if(touch){touch.ready=true;touch.handle.dataset.tableHeld="true";}},300):0};try{handle.setPointerCapture(event.pointerId);}catch{ /* detached handle */ }});
  window.addEventListener('pointermove',event=>{if(!touch||event.pointerId!==touch.id)return;if(Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>6&&touch.ready){event.preventDefault();if(!drag)begin(touch.handle.dataset.tableAxis,Number(touch.handle.dataset.tableIndex));pointTarget(event.clientX,event.clientY);}}, {signal:life.signal,passive:false});
  const endTouch=event=>{if(!touch||event.pointerId!==touch.id)return;clearTimeout(touch.timer);delete touch.handle.dataset.tableHeld;touch=null;if(drag){event.preventDefault();suppressClick=true;endDrag();setTimeout(()=>{suppressClick=false;},0);}};
  window.addEventListener('pointerup',endTouch,{signal:life.signal});window.addEventListener('pointercancel',event=>{if(touch&&event.pointerId===touch.id){clearTimeout(touch.timer);delete touch.handle.dataset.tableHeld;touch=null;drag=null;}},{signal:life.signal});
  surface.addEventListener('contextmenu',event=>{if(event.target.closest('[data-table-axis]'))event.preventDefault();});
  document.addEventListener('pointerdown',event=>{if(!element.contains(event.target)&&!event.target.closest('.document-formatting,.document-panel,.document-selection-toolbar'))select(null);},{signal:life.signal});
  render();
  return {serialize,destroy:dispose,page:()=>({rowPage,columnPage}),
    revealSource(offset,source){const point=documentTableSourceCell(source,offset),cell=model.rich?model.cells.filter(cell=>cell.row===point.row)[point.column]:model.cells.find(cell=>cell.row<=point.row&&cell.row+cell.rows>point.row&&cell.column<=point.column&&cell.column+cell.columns>point.column);if(!cell)return;const node=ensureCell(cell);element.querySelector('.document-table-find-current')?.classList.remove('document-table-find-current');node.classList.add('document-table-find-current');node.scrollIntoView({block:'nearest',inline:'nearest'});},
    format(command,value,{focus=true}={}){
      const picked=selected(),cell=record(current);const block=['check','bullet','number','quote','codeblock','callout','paragraph','rule'].includes(command)||/^h[1-6]$/.test(command);
      const inline={bold:'strong',italic:'em',strike:'del',highlight:'mark',code:'code',color:'span'};
      if(!block&&!(picked.length&&inline[command]))return false;
      const targets=picked.length?picked:[cell];if(!targets[0])return false;
      for(const target of targets){const mounted=nodes.get(target.id),wrap={bold:'**',italic:'*',strike:'~~',highlight:'=='}[command];
        if(!mounted&&!model.rich&&wrap){target.value=wrap+target.value+wrap;continue;}
        const node=mounted||document.createElement('div');if(!mounted)node.innerHTML=html(target.value);let wrapper;
        if(inline[command]){if(command==='color'&&!textColor(value))continue;wrapper=document.createElement(inline[command]);if(command==='color'){wrapper.style.color=textColor(value);wrapper.dataset.documentColor=textColor(value);}wrapper.append(...node.childNodes);node.append(wrapper);}
        else if(command==='codeblock'){wrapper=document.createElement('pre');const code=document.createElement('code');code.textContent=node.innerText;wrapper.append(code);node.replaceChildren(wrapper);}
        else if(['check','bullet','number'].includes(command)){wrapper=document.createElement(command==='number'?'ol':'ul');const li=document.createElement('li');if(command==='check'){const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Checklist item');li.append(check,' ');}li.append(...node.childNodes);wrapper.append(li);node.replaceChildren(wrapper);}
        else if(command==='rule'){wrapper=document.createElement('hr');node.append(wrapper);}
        else if(command==='callout'){wrapper=document.createElement('aside');wrapper.className='document-callout';wrapper.dataset.documentCallout='[!note]';const title=document.createElement('strong');title.textContent='Note';const body=document.createElement('div');body.append(...node.childNodes);wrapper.append(title,body);node.append(wrapper);}
        else{wrapper=document.createElement(command==='quote'?'blockquote':command==='paragraph'?'p':command);wrapper.append(...node.childNodes);node.append(wrapper);}
        if(block)model.rich=true;if(!mounted)target.value=markdown(node);if(focus&&targets.length===1){const focused=mounted||ensureCell(target);if(!mounted)focused.innerHTML=node.innerHTML;focused.focus();const range=document.createRange();range.selectNodeContents(wrapper.matches('pre')?wrapper.firstChild:wrapper);range.collapse(false);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);}
      }
      commit(null,true);scheduleMeasure();return true;
    },
  };
}
