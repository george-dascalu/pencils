import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from './values.js';
import { Problem } from './problem.js';
import { checkTable, tablePreview } from '../public/document-sheet-model.js';

export async function readDocumentTable(store, data, version) {
  const relative = version ? `tables/${data.id}/${version}.json` : data.table_file;
  if (data.document_type !== 'table' || typeof relative !== 'string' || !new RegExp(`^tables/${data.id}/[a-f0-9]{64}\\.json$`).test(relative)) throw new Problem(422, 'Invalid spreadsheet data reference.');
  const file = path.join(path.dirname(store.file(data.project, 'documents', data.id)), relative);
  await store.safe(file);
  try {
    const text = await fs.readFile(file, 'utf8');
    if (hash(text) !== path.basename(relative, '.json')) throw new Error('Spreadsheet data changed outside Pencils. Restore a previous version or restore the original data file from backup.');
    return checkTable(JSON.parse(text), data.id);
  } catch (error) { throw new Problem(422, error.code === 'ENOENT' ? 'Spreadsheet data is missing. Restore a version from Document tools.' : error.message); }
}
export async function writeDocumentTable(store, project, id, input) {
  let table;
  try { table = checkTable(input, id); } catch (error) { throw new Problem(400, error.message); }
  const text = JSON.stringify(table, null, 2) + '\n', relative = `tables/${id}/${hash(text)}.json`;
  const file = path.join(path.dirname(store.file(project, 'documents', id)), relative);
  await store.safe(file); await fs.mkdir(path.dirname(file), { recursive: true });
  try { if (await fs.readFile(file, 'utf8') === text) return { table, relative }; throw new Problem(409, 'This spreadsheet snapshot was modified outside Pencils.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    await store.journal.stage(file, text);
    // Match Store.write: the vault watcher must recognise our immutable data
    // write rather than reporting it as an external, unclassified file change.
    store.recentWrites.set(file, { hash: hash(text) });
    if (store.recentWrites.size > 2000) store.recentWrites.delete(store.recentWrites.keys().next().value);
    await fs.link(temporary, file);
    const directory = await fs.open(path.dirname(file), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await fs.rm(temporary, { force: true }); }
  return { table, relative };
}
export function tableDocumentBody(table, relative, notes = '') {
  const start = '<!-- pencils:table-preview -->', end = '<!-- /pencils:table-preview -->';
  const preview = `${start}\n[Spreadsheet data](${relative})\n\n${tablePreview(table)}\n${end}`;
  const from = notes.lastIndexOf(start), to = from < 0 ? -1 : notes.indexOf(end, from + start.length);
  return to >= 0 ? notes.slice(0, from) + preview + notes.slice(to + end.length) : `${notes.trim()}${notes.trim() ? '\n\n' : ''}${preview}\n`;
}
