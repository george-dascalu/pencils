// Inline document tables: coordinates and Markdown values, independent of their editable DOM.
const fail = message => { throw Error(message); };
const clone = value => structuredClone(value);
function dimensions(rows, columns) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows * columns > 20000) fail('Keep at least one row and column, and at most 20,000 cells in an inline table.');
}
function fill(model) {
  dimensions(model.rows,model.columns);
  const used = new Uint8Array(model.rows*model.columns);
  for (const cell of model.cells) {
    if (![cell.row,cell.column,cell.rows,cell.columns].every(Number.isInteger) || cell.row<0 || cell.column<0 || cell.rows<1 || cell.columns<1 || cell.row+cell.rows>model.rows || cell.column+cell.columns>model.columns || typeof cell.value!=='string') fail('Invalid table cell.');
    for(let r=cell.row;r<cell.row+cell.rows;r++)for(let c=cell.column;c<cell.column+cell.columns;c++){const at=r*model.columns+c;if(used[at])fail('Merged cells must not overlap.');used[at]=1;}
  }
  for(let r=0;r<model.rows;r++)for(let c=0;c<model.columns;c++)if(!used[r*model.columns+c])model.cells.push({id:`cell-${model.nextId++}`,row:r,column:c,rows:1,columns:1,value:''});
  model.cells.sort((a,b)=>a.row-b.row||a.column-b.column); return model;
}
export function makeDocumentTable(rows, aligns = [], cells = null) {
  const count=rows.length, columns=Math.max(1,...rows.map(row=>row.length));
  dimensions(count,columns);
  const records=cells ? clone(cells) : rows.flatMap((row,r)=>Array.from({length:columns},(_,c)=>({id:`cell-${r*columns+c}`,row:r,column:c,rows:1,columns:1,value:row[c]||''})));
  return fill({rows:count,columns,aligns:Array.from({length:columns},(_,c)=>aligns[c]||null),layout:'fit',cells:records,nextId:count*columns});
}
export function tableRectangle(model, rect) {
  let {r,c,rows,columns}=rect;
  if(![r,c,rows,columns].every(Number.isInteger)||r<0||c<0||rows<1||columns<1||r+rows>model.rows||c+columns>model.columns)fail('Select cells within this table.');
  let changed=true;
  while(changed){changed=false;for(const cell of model.cells)if(cell.row<r+rows&&cell.row+cell.rows>r&&cell.column<c+columns&&cell.column+cell.columns>c){const top=Math.min(r,cell.row),left=Math.min(c,cell.column),bottom=Math.max(r+rows,cell.row+cell.rows),right=Math.max(c+columns,cell.column+cell.columns);if(top!==r||left!==c||bottom!==r+rows||right!==c+columns){r=top;c=left;rows=bottom-top;columns=right-left;changed=true;}}}
  return {r,c,rows,columns};
}
export function tableCells(model, rect) {
  const b=tableRectangle(model,rect);
  return model.cells.filter(cell=>cell.row>=b.r&&cell.row<b.r+b.rows&&cell.column>=b.c&&cell.column<b.c+b.columns);
}
const axisKeys = axis => axis==='row' ? ['row','rows','rows'] : axis==='column' ? ['column','columns','columns'] : fail('Choose rows or columns.');
function axisRange(model,axis,from,count,insert=false) {
  const keys=axisKeys(axis), total=model[keys[2]];
  if(!Number.isInteger(from)||!Number.isInteger(count)||from<0||count<1||from+(insert?0:count)>total)fail('Choose rows or columns within this table.');
  return keys;
}
export function insertTableAxis(model,axis,before,count=1) {
  const [at,span,size]=axisRange(model,axis,before,count,true), next=clone(model); next[size]+=count; dimensions(next.rows,next.columns);
  for(const cell of next.cells){if(cell[at]>=before)cell[at]+=count;else if(cell[at]+cell[span]>before)cell[span]+=count;}
  if(axis==='column')next.aligns.splice(before,0,...Array(count).fill(null));return fill(next);
}
export function deleteTableAxis(model,axis,from,count=1) {
  const [at,span,size]=axisRange(model,axis,from,count),next=clone(model);
  if(next[size]-count<1)fail('Keep at least one row and column.');
  const end=from+count;next[size]-=count;
  next.cells=next.cells.filter(cell=>{
    const start=cell[at],stop=start+cell[span],removed=Math.max(0,Math.min(stop,end)-Math.max(start,from));cell[span]-=removed;
    cell[at]=start>=end?start-count:start>=from?from:start;return cell[span]>0;
  });
  if(axis==='column')next.aligns.splice(from,count);return fill(next);
}
export function moveTableAxis(model,axis,from,count,before) {
  const [at,span,size]=axisRange(model,axis,from,count),total=model[size];
  if(!Number.isInteger(before)||before<0||before>total)fail('Choose a position within this table.');
  if(before>=from&&before<=from+count)return clone(model);
  const order=Array.from({length:total},(_,i)=>i),moving=order.splice(from,count);order.splice(before>from?before-count:before,0,...moving);
  const positions=new Map(order.map((old,index)=>[old,index])),next=clone(model);
  for(const cell of next.cells){const mapped=Array.from({length:cell[span]},(_,i)=>positions.get(cell[at]+i)).sort((a,b)=>a-b);if(mapped.some((value,i)=>value!==mapped[0]+i))fail('Move the complete merged rows or columns, or unmerge them first.');cell[at]=mapped[0];}
  if(axis==='column')next.aligns=order.map(index=>model.aligns[index]);return fill(next);
}
export function mergeTableCells(model,rect) {
  const b=tableRectangle(model,rect),cells=tableCells(model,b);if(cells.length<2)fail('Select at least two cells to merge.');
  const next=clone(model),ids=new Set(cells.map(cell=>cell.id));next.cells=next.cells.filter(cell=>!ids.has(cell.id));
  next.cells.push({...clone(cells[0]),row:b.r,column:b.c,rows:b.rows,columns:b.columns,value:cells.map(cell=>cell.value).filter(value=>value.trim()).join('\n\n')});return fill(next);
}
export function unmergeTableCells(model,rect) {
  const next=clone(model),ids=new Set(tableCells(model,rect).map(cell=>cell.id));for(const cell of next.cells)if(ids.has(cell.id)){cell.rows=1;cell.columns=1;}return fill(next);
}
export function tableTemplateLayout(model,includeContents=false) {
  const next=clone(model);if(!includeContents)for(const cell of next.cells)if(cell.row>0)cell.value='';return next;
}
