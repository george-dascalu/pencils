import { inTemplatesFolder } from './document-templates.js';
export const TABLE_SCROLL_MARKER = '<!-- table: scroll -->';
export const TABLE_TEMPLATE_MARKER = '<!-- pencils:table-template -->';
export const richTableExtension = {
  name:'documentRichTable',level:'block',start:source=>source.search(/<table\b|<!--[ \t]*table:/i),
  tokenizer(source) {
    const marker=/^<!--[ \t]*table:[ \t]*scroll[ \t]*-->[ \t]*\r?\n/.exec(source),offset=marker?.[0].length||0,rest=source.slice(offset);
    if(!/^<table\b[^>]*\bdata-pencils-table=["']1["'][^>]*>/i.test(rest))return;
    let depth=0;
    for(const match of rest.matchAll(/<\/?table\b[^>]*>/gi)){
      depth+=/^<\//.test(match[0])?-1:1;
      if(!depth){const end=match.index+match[0].length,html=rest.slice(0,end),tail=/^[ \t]*(?:\r?\n|$)/.exec(rest.slice(end))?.[0]||'';return {type:'documentRichTable',raw:source.slice(0,offset+end+tail.length),html,layout:marker?'scroll':'fit'};}
    }
  },
  renderer:token=>token.layout==='scroll'?`<div class="document-table-scroll">${token.html}</div>`:token.html,
};
export function serializeDocumentTable(model,renderCell) {
  const prefix=model.layout==='scroll'?TABLE_SCROLL_MARKER+'\n':'';
  if(model.rich||model.cells.some(cell=>cell.rows>1||cell.columns>1)){
    if(!renderCell)throw Error('Rich tables need a cell renderer.');
    const cellsByRow=new Map();for(const cell of model.cells){if(!cellsByRow.has(cell.row))cellsByRow.set(cell.row,[]);cellsByRow.get(cell.row).push(cell);}
    const rows=Array.from({length:model.rows},(_,r)=>'<tr>'+(cellsByRow.get(r)||[]).map(cell=>{
      const tag=r?'td':'th',span=`${cell.rows>1?` rowspan="${cell.rows}"`:''}${cell.columns>1?` colspan="${cell.columns}"`:''}`,align=['left','center','right'].includes(model.aligns[cell.column])?` align="${model.aligns[cell.column]}"`:'';
      return `<${tag}${span}${align}>${renderCell(cell.value)}</${tag}>`;
    }).join('')+'</tr>');
    return prefix+`<table data-pencils-table="1">\n<tbody>\n${rows.join('\n')}\n</tbody>\n</table>`;
  }
  const values=new Map(model.cells.map(cell=>[`${cell.row}:${cell.column}`,cell.value]));
  const rows=Array.from({length:model.rows},(_,r)=>Array.from({length:model.columns},(_,c)=>values.get(`${r}:${c}`)||''));
  const line=cells=>`| ${cells.join(' | ')} |`,separators=model.aligns.map(value=>value==='center'?':---:':value==='right'?'---:':value==='left'?':---':'---');
  return prefix+[line(rows[0]),line(separators),...rows.slice(1).map(line)].join('\n');
}
export const tableLayoutTemplates = (documents,folders) => documents.filter(doc=>doc.document_type!=='table'&&doc.body?.trimStart().startsWith(TABLE_TEMPLATE_MARKER)&&inTemplatesFolder(doc.folder,folders));
