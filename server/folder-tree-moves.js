import { planTreeMove } from '../public/folder-order.js';
import { documentFolders } from './document-folders.js';
import { Problem } from './problem.js';
import { now } from './values.js';

// Called inside ctx.mutate: moving a file and saving its sibling order commit together through
// the write journal. Normal Store writers also record the project's and file's audit entries.
export async function moveTree(store, project, input) {
  const move = input.tree_move;
  if (!move || !['document', 'board'].includes(move.kind)) throw new Problem(400, 'Choose Documents or Boards.');
  const kind = move.kind, field = `${kind}_folders`, orderField = `${kind}_order`;
  const file = store.file(project, 'project'), current = await store.read(file);
  store.checkRevision(current, input.revision);
  const { items, warnings } = await store.children(project, `${kind}s`);
  if (warnings.length) throw new Problem(409, `Repair unreadable ${kind}s before organising the list.`);
  let plan;
  try { plan = planTreeMove(current.data[field] || [], items, current.data[orderField], move); }
  catch (error) { throw new Problem(400, error.message); }
  // Check every folder rule, including duplicate names and the depth limit, before staging writes.
  const folders = documentFolders(plan.folders, kind);
  const source = items.find(d => d.id === move.id);
  if (move.what === 'item') store.checkRevision(source, input.item_revision);
  if (!plan.changed) return { project: store.public(current, file), item: null };
  let item = null;
  if (move.what === 'item' && (source.folder || null) !== move.parent) {
    const values = { revision: source.revision, folder: move.parent };
    item = kind === 'document' ? await store.updateDocument(project, move.id, values) : await store.updateBoard(project, move.id, values);
  }
  const saved = await store.write(file, { ...current.data, [field]: folders, [orderField]: plan.order, updated: now() }, current.body, current);
  return { project: saved, item };
}
