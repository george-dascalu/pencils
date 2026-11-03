// Native spreadsheet rich text, kept as text and style runs rather than HTML.
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw Error(message); };
export function richPlainText(p) { return typeof p?.body?.dataStream === 'string' ? p.body.dataStream.replace(/\r\n$/, '').replace(/\r/g, '\n') : ''; }
export function checkRichText(p) {
  if (!object(p) || typeof p.body?.dataStream !== 'string' || !p.body.dataStream.endsWith('\r\n')) fail('Invalid rich text document.');
  const text = richPlainText(p);
  if (text.length > 32000) fail('A cell supports up to 32,000 characters.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail('Invalid rich text characters.');
  if (['customBlocks','customRanges','tables','sectionBreaks'].some(k => p.body[k] != null && (!Array.isArray(p.body[k]) || p.body[k].length)) || Object.keys(p.drawings || {}).length) fail('Embedded content is not supported in cell rich text.');
  if (p.body.textRuns != null && !Array.isArray(p.body.textRuns)) fail('Invalid rich text runs.');
  let end = 0;
  for (const run of p.body.textRuns || []) {
    if (!object(run) || !Number.isInteger(run.st) || !Number.isInteger(run.ed) || run.st < end || run.ed <= run.st || run.ed > text.length || !object(run.ts)) fail('Invalid or overlapping rich text runs.');
    end = run.ed;
    for (const [key,value] of Object.entries(run.ts)) {
      if (['bl','it'].includes(key)) { if (![0,1].includes(value)) fail('Invalid rich text format.'); }
      else if (['ul','st'].includes(key)) { if (!object(value) || ![0,1].includes(value.s)) fail('Invalid rich text format.'); }
      else if (key === 'fs') { if (!Number.isFinite(value) || value < 8 || value > 72) fail('Rich text font size must be between 8 and 72.'); }
      else if (key === 'ff') { if (typeof value !== 'string' || value.length > 100 || /[;{}<>]/.test(value)) fail('Invalid rich text font.'); }
      else if (key === 'cl') { if (!object(value) || !/^#[0-9a-f]{6}$/i.test(value.rgb)) fail('Invalid rich text colour.'); }
      else fail('Unsupported rich text format.');
    }
  }
  if (p.body.paragraphs != null && (!Array.isArray(p.body.paragraphs) || p.body.paragraphs.some(v=>!object(v) || !Number.isInteger(v.startIndex) || v.startIndex < 0 || v.startIndex > text.length))) fail('Invalid rich text paragraphs.');
  return p;
}
export function richDocument(text, runs = [], id = 'cell-text') {
  const value=String(text).replace(/\r\n?/g,'\n'), stream=value.replace(/\n/g,'\r')+'\r\n';
  return checkRichText({id,body:{dataStream:stream,textRuns:structuredClone(runs),paragraphs:[...value.matchAll(/\n/g)].map(m=>({startIndex:m.index})).concat({startIndex:value.length})},documentStyle:{}});
}
export function formatRichText(p,start,end,patch) {
  checkRichText(p); const text=richPlainText(p);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) fail('Invalid rich text range.');
  const edges=[...new Set([0,text.length,start,end,...(p.body.textRuns||[]).flatMap(run=>[run.st,run.ed])])].sort((a,b)=>a-b), runs=[];
  let runIndex=0;const sourceRuns=p.body.textRuns||[];
  for(let i=1;i<edges.length;i++){
    const st=edges[i-1],ed=edges[i];if(st===ed)continue;
    while(sourceRuns[runIndex] && sourceRuns[runIndex].ed<=st)runIndex++;
    const source=sourceRuns[runIndex], ts={...(source?.st<=st && source.ed>=ed?source.ts:{}),...(st>=start&&ed<=end?patch:{})};
    if(!Object.keys(ts).length)continue;
    const previous=runs.at(-1);if(previous?.ed===st && JSON.stringify(previous.ts)===JSON.stringify(ts))previous.ed=ed;else runs.push({st,ed,ts});
  }
  return richDocument(text,runs,p.id);
}
