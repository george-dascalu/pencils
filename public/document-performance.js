// Shared document budgets and pure indexes; safe to import from the server.
export const DOCUMENT_CHARACTERS = 1_000_000;
export const INLINE_TABLE_CELLS = 100_000;
export const documentEditAllowed = (before, after) => after <= DOCUMENT_CHARACTERS || after <= before;
export function documentCodeFence(text) { let length=3;for(const match of text.matchAll(/`+/g))length=Math.max(length,match[0].length+1);return '`'.repeat(length); }

export function documentTextChange(before,after) {
  if(before===after)return null;
  const limit=Math.min(before.length,after.length),chunk=1024;let from=0,suffix=0;
  while(from+chunk<=limit&&before.slice(from,from+chunk)===after.slice(from,from+chunk))from+=chunk;
  while(from<limit&&before.charCodeAt(from)===after.charCodeAt(from))from++;
  const high=n=>n>=0xd800&&n<=0xdbff,low=n=>n>=0xdc00&&n<=0xdfff;
  if(from&&high(before.charCodeAt(from-1))&&(low(before.charCodeAt(from))||low(after.charCodeAt(from))))from--;
  while(suffix+chunk<=limit-from&&before.slice(before.length-suffix-chunk,before.length-suffix)===after.slice(after.length-suffix-chunk,after.length-suffix))suffix+=chunk;
  while(suffix<limit-from&&before.charCodeAt(before.length-suffix-1)===after.charCodeAt(after.length-suffix-1))suffix++;
  if(suffix&&low(before.charCodeAt(before.length-suffix))&&(high(before.charCodeAt(before.length-suffix-1))||high(after.charCodeAt(after.length-suffix-1))))suffix--;
  return {from,to:before.length-suffix,insert:after.slice(from,after.length-suffix)};
}

export function documentCounts(text) {
  let words=0,pairs=0;const word=/\S+/gu,pair=/[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  while(word.test(text))words++;while(pair.test(text))pairs++;
  return {words,characters:text.length-pairs};
}
export function documentStatsCache(count=documentCounts) {
  let previous=null,value;
  return (source,changes=[])=>{
    if(source===previous)return value;
    const valid=previous!==null&&changes.length&&previous.length+changes.reduce((n,c)=>n+c.toB-c.fromB-(c.toA-c.fromA),0)===source.length;
    if(!valid)value=count(source);
    else{
      const chunks=[];
      for(const change of changes){
        const chunk={a:Math.max(0,change.fromA-1),b:Math.min(previous.length,change.toA+1),c:Math.max(0,change.fromB-1),d:Math.min(source.length,change.toB+1)},last=chunks.at(-1);
        if(last&&chunk.a<=last.b){last.b=Math.max(last.b,chunk.b);last.d=Math.max(last.d,chunk.d);}else chunks.push(chunk);
      }
      value={...value};
      for(const chunk of chunks){const before=count(previous.slice(chunk.a,chunk.b)),after=count(source.slice(chunk.c,chunk.d));value.words+=after.words-before.words;value.characters+=after.characters-before.characters;}
    }
    previous=source;return value;
  };
}

export function documentRangeIndex(input) {
  const ranges = [];
  for (const [from, to] of [...input].sort((a,b) => a[0]-b[0])) {
    const last = ranges.at(-1);
    if (last && from < last[1]) last[1] = Math.max(last[1], to);
    else ranges.push([from,to]);
  }
  const before = at => {
    let lo=0,hi=ranges.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(ranges[mid][0]<=at)lo=mid+1;else hi=mid;}
    return lo-1;
  };
  return {
    encloses(from,to){const i=before(from);return i>=0&&ranges[i][1]>=to;},
    overlaps(from,to){const i=before(from);return i>=0&&ranges[i][1]>from||i+1<ranges.length&&ranges[i+1][0]<to;},
  };
}

export function documentBlockCache(tokenize) {
  let previous = null, entries = [];
  const lex = (source,offset=0) => {
    const result=[];let from=offset;
    for(const token of tokenize(source)){const to=from+token.raw.length;result.push({token,from,to});from=to;}
    return result;
  };
  return (source, changes=[], trusted=null) => {
    if(source===previous)return entries;
    let next;
    if(previous!==null&&changes.length&&entries.length&&entries.at(-1).to===previous.length){
      const first=Math.min(...changes.map(c=>c.fromA)),last=Math.max(...changes.map(c=>c.toA)),delta=source.length-previous.length;
      const find=at=>{let lo=0,hi=entries.length;while(lo<hi){const mid=(lo+hi)>>>1;if(entries[mid].to<=at)lo=mid+1;else hi=mid;}return Math.min(lo,entries.length-1);};
      const touched=find(first),entry=entries[touched],change=changes[0];
      const patch=(type=entry.token.type)=>entries.map((item,i)=>i<touched?item:i===touched?{token:{...item.token,raw:source.slice(item.from,item.to+delta),type},from:item.from,to:item.to+delta}:{...item,from:item.from+delta,to:item.to+delta});
      if(changes.length===1&&last<entry.to){
        const removed=previous.slice(first,last),inserted=source.slice(change.fromB,change.toB),letter=character=>/\p{L}/u.test(character||'');
        const insideWord=entry.token.type==='paragraph'&&/^[\p{L}\p{N}\p{Zs}]*$/u.test(removed+inserted)&&letter(previous[first-1])&&letter(previous[last])&&!/^ {0,3}</.test(previous.slice(previous.lastIndexOf('\n',first-1)+1,first));
        const checkbox=entry.token.type==='list'&&/^\[[ xX]\]$/.test(removed)&&/^\[[ xX]\]$/.test(inserted);
        if(insideWord||checkbox)next=patch();
      }
      const componentKind=['documentTableLayout','documentRichTable'].includes(entry.token.type)?'table':entry.token.type;
      if(!next&&changes.length===1&&trusted&&['table','code','blockquote'].includes(trusted.kind)&&componentKind===trusted.kind&&trusted.from===entry.from&&change.fromA>=trusted.from&&change.toA<=trusted.to&&trusted.to<=entry.to){
        const raw=source.slice(entry.from,entry.to+delta),type=trusted.kind==='table'?(/^(?:<!--[\s\S]*?-->\s*)?<table\b/i.test(raw)?'documentRichTable':entry.token.type):entry.token.type;
        next=patch(type);
      }
      if(!next&&changes.length===1&&last<entry.to&&['paragraph','heading'].includes(entry.token.type)&&/^[\p{L}\p{N}\p{Zs}.,!?;]*$/u.test(previous.slice(first,last)+source.slice(change.fromB,change.toB))){
        const local=lex(source.slice(entry.from,entry.to+delta),entry.from);
        if(local.length===1&&local[0].token.type===entry.token.type&&local[0].to===entry.to+delta)next=[...entries.slice(0,touched),...local,...entries.slice(touched+1).map(item=>({...item,from:item.from+delta,to:item.to+delta}))];
      }
      const start=Math.max(0,find(first)-2),changedEnd=find(last),from=entries[start].from;
      let end=Math.min(entries.length,changedEnd+4);
      while(!next){
        const to=end===entries.length?source.length:entries[end-1].to+delta;
        const local=lex(source.slice(from,to),from),guards=entries.slice(Math.max(changedEnd+1,end-2),end);
        const stable=end===entries.length||guards.length===2&&guards.every((entry,i)=>{const token=local[local.length-guards.length+i]?.token;return token?.type===entry.token.type&&token.raw===entry.token.raw;});
        if(stable&&(!local.length?from===to:local.at(-1).to===to)){
          next=[...entries.slice(0,start),...local,...entries.slice(end).map(entry=>({...entry,from:entry.from+delta,to:entry.to+delta}))];break;
        }
        if(end===entries.length)break;
        end=Math.min(entries.length,end+Math.max(4,end-start));
      }
    }
    entries=next||lex(source);previous=source;return entries;
  };
}
