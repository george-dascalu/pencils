// Large inline tables keep their complete model, with a bounded editable page.
export function documentTableSourceCell(source,offset) {
  const marker=/^<!--[ \t]*table:[^\n]*-->\r?\n/.exec(source)?.[0].length||0;
  source=source.slice(marker);offset=Math.max(0,offset-marker);
  if(/^<table\b/i.test(source)){
    let depth=0,row=-1,column=-1;
    for(const match of source.matchAll(/<\/?(?:table|tr|td|th)\b[^>]*>/gi)){
      if(match.index>offset)break;
      if(/^<table\b/i.test(match[0]))depth++;
      else if(/^<\/table\b/i.test(match[0]))depth--;
      else if(depth===1&&/^<tr\b/i.test(match[0])){row++;column=-1;}
      else if(depth===1&&/^<t[dh]\b/i.test(match[0]))column++;
    }
    return {row:Math.max(0,row),column:Math.max(0,column)};
  }
  const prefix=source.slice(0,offset),start=prefix.lastIndexOf('\n')+1,line=source.slice(start,source.indexOf('\n',start)<0?source.length:source.indexOf('\n',start));
  let row=0;for(const _ of prefix.matchAll(/\n/g))row++;
  let column=0;for(const match of line.matchAll(/(?<=(?<!\\)(?:\\\\)*)\|/g)){if(match.index>=offset-start)break;if(!line.slice(0,match.index).trim())continue;column++;}
  return {row:Math.max(0,row-1),column};
}
export function documentTableWindow(rows, columns, rowPage=1, columnPage=1) {
  const paged=rows*columns>2000,columnSize=paged?Math.min(20,columns):columns;
  const rowSize=paged?Math.max(1,Math.min(100,Math.floor(800/columnSize))):Math.max(1,rows-1);
  const rowPages=Math.max(1,Math.ceil((rows-1)/rowSize)),columnPages=Math.max(1,Math.ceil(columns/columnSize));
  rowPage=Math.max(1,Math.min(rowPages,Math.trunc(rowPage)||1));columnPage=Math.max(1,Math.min(columnPages,Math.trunc(columnPage)||1));
  const rowFrom=1+(rowPage-1)*rowSize,rowTo=Math.min(rows,rowFrom+rowSize),columnFrom=(columnPage-1)*columnSize,columnTo=Math.min(columns,columnFrom+columnSize);
  return {paged,rowPage,columnPage,rowPages,columnPages,rowSize,columnSize,rowFrom,rowTo,columnFrom,columnTo,rows:[0,...Array.from({length:Math.max(0,rowTo-rowFrom)},(_,i)=>rowFrom+i)]};
}

export function windowedTableRows(model,window) {
  const rows=new Map(window.rows.map(row=>[row,[]]));
  for(const cell of model.cells){
    const left=Math.max(cell.column,window.columnFrom),right=Math.min(cell.column+cell.columns,window.columnTo);
    if(left>=right)continue;
    const top=Math.max(cell.row,window.rowFrom),bottom=Math.min(cell.row+cell.rows,window.rowTo),header=cell.row===0;
    if(!header&&top>=bottom)continue;
    const row=header?0:top;
    rows.get(row)?.push({cell,rows:(header?1:0)+Math.max(0,bottom-top),columns:right-left,column:left});
  }
  return rows;
}
