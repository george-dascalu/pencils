// Recheck the first mutation report's survivor lines against the added boundary
// and recovery cases. Every mutation lives in its own temporary checkout.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {mutants} from '../../../scripts/mutants.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),output=new URL('.',import.meta.url),log=await fs.readFile(new URL('mutation-initial.txt',import.meta.url),'utf8');
const lines=new Map();let module;
for(const line of log.split('\n')){const header=/^(public\/[^:]+): \d+ mutants/.exec(line);if(header){module=header[1];lines.set(module,new Set());}const row=/^\s+(\d+)\s+"/.exec(line);if(row&&module)lines.get(module).add(Number(row[1]));}
const jobs=[];for(const [module,lineNumbers] of lines){const source=await fs.readFile(path.join(root,module),'utf8');for(const mutant of mutants(source))if(lineNumbers.has(mutant.line))jobs.push({module,source,mutant});}
const base=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-mutation-followup-')),results=[];
try{
  const copies=await Promise.all(Array.from({length:6},async(_,i)=>{const copy=path.join(base,String(i));await fs.mkdir(copy);for(const dir of ['public','server','test'])await fs.cp(path.join(root,dir),path.join(copy,dir),{recursive:true});await fs.copyFile(path.join(root,'package.json'),path.join(copy,'package.json'));await fs.symlink(path.join(root,'node_modules'),path.join(copy,'node_modules'));return copy;}));
  await Promise.all(copies.map(async copy=>{for(let job;(job=jobs.shift());){const {module,source,mutant}=job,file=path.join(copy,module);await fs.writeFile(file,source.slice(0,mutant.from)+mutant.text+source.slice(mutant.to));
    let status='survived';for(const file of ['test/document-boundaries.test.js','test/document-performance.test.js','test/document-table-window.test.js','test/document-table-model.test.js','test/document-autosave.test.js','test/sync.test.js']){const killed=await new Promise(resolve=>execFile(process.execPath,[file],{cwd:copy,timeout:5000,killSignal:'SIGKILL'},error=>resolve(!!error)));if(killed){status='killed';break;}}
    await fs.writeFile(file,source);results.push({module,line:mutant.line,from:mutant.from,to:mutant.to,old:source.slice(mutant.from,mutant.to),replacement:mutant.text,status});
  }}));
  await fs.writeFile(new URL('mutation-followup.json',output),JSON.stringify(results,null,2));console.log(JSON.stringify({checked:results.length,killed:results.filter(r=>r.status==='killed').length,survived:results.filter(r=>r.status==='survived').length}));
}finally{await fs.rm(base,{recursive:true,force:true});}
