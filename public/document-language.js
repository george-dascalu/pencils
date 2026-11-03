import { documentTextChange } from './document-performance.js';

// Lezer reparses a whole paragraph for an inline edit. For exceptionally long
// paragraphs, a word edit cannot change delimiter pairing: reuse complete
// inline elements on either side and parse the enclosing element/gap again.
// Changes to punctuation, whitespace or line structure use its full parser.
export function incrementalDocumentParagraphs(onParse = () => {}) {
  const entries=new Map();
  return {parseBlock:[{name:'DocumentParagraph',after:'SetextHeading',leaf(){return {
    nextLine(){return false;},
    finish(cx,leaf){
      const text=leaf.content,offset=leaf.start;
      if(text.length<8192)return false;
      const parse=(value,at)=>{onParse(value.length);return cx.parser.parseInline(value,at);};
      const previous=entries.get(offset);
      let nodes;
      const clone=(node,delta)=>cx.elt(cx.parser.nodeSet.types[node.type].name,node.from+delta,node.to+delta,node.children.map(child=>clone(child,delta)));
      if(previous?.text===text)nodes=previous.nodes;
      else if(previous){
        const change=documentTextChange(previous.text,text),{from,to,insert}=change;
        const safe=previous.nodes.every(node=>Number.isInteger(node.type)&&Array.isArray(node.children));
        if(safe&&/^[\p{L}\p{N}]*$/u.test(insert)&&/^[\p{L}\p{N}]*$/u.test(previous.text.slice(from,to))&&/[\p{L}\p{N}]/u.test(previous.text[from-1]||'')&&/[\p{L}\p{N}]/u.test(previous.text[to]||'')){
          const a=offset+from,b=offset+to,delta=insert.length-(to-from),before=[],after=[];
          let start=offset,end=offset+previous.text.length;
          for(const node of previous.nodes){
            if(node.to<a){before.push(node);start=node.to;}
            else if(node.from>b){after.push(clone(node,delta));if(end===offset+previous.text.length)end=node.from;}
          }
          nodes=[...before,...parse(text.slice(start-offset,end-offset+delta),start),...after];
        }
      }
      nodes??=parse(text,offset);
      entries.delete(offset);entries.set(offset,{text,nodes});
      let characters=0;for(const entry of entries.values())characters+=entry.text.length;
      while(entries.size>8||characters>2_000_000){const key=entries.keys().next().value;characters-=entries.get(key).text.length;entries.delete(key);}
      cx.addLeafElement(leaf,cx.elt('Paragraph',offset,offset+text.length,nodes));return true;
    },
  };}}]};
}
