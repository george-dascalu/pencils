// One saved order for each explorer, shared by its folders and files. Unknown/deleted keys are
// ignored; new entries follow in their original folder-first alphabetical order.
export function orderedEntries(folders, items, order = [], parent = null) {
  const known = new Set(folders.map(f => f.id));
  const entries = [
    ...folders.filter(f => (f.parent || null) === parent).map(value => ({ key: `folder:${value.id}`, what: 'folder', value })),
    ...items.filter(d => (known.has(d.folder) ? d.folder : null) === parent).map(value => ({ key: `item:${value.id}`, what: 'item', value })),
  ];
  return sortEntries(entries, order);
}
function sortEntries(entries, order) {
  const ranks = new Map((Array.isArray(order) ? order : []).map((key, index) => [key, index]));
  return entries.sort((a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity) ||
    (a.what === b.what ? 0 : a.what === 'folder' ? -1 : 1) ||
    a.value.title.localeCompare(b.value.title, undefined, { numeric: true, sensitivity: 'base' }) || a.key.localeCompare(b.key));
}
export function planTreeMove(folders, items, order, move) {
  if (!move || !['folder', 'item'].includes(move.what) || typeof move.id !== 'string' ||
      !('parent' in move) || (move.parent !== null && typeof move.parent !== 'string') ||
      (move.before != null && typeof move.before !== 'string')) throw Error('Choose a valid file or folder destination.');
  const { what, id, parent, before = null } = move;
  const source = (what === 'folder' ? folders : items).find(f => f.id === id);
  if (!source) throw Error('This file or folder no longer exists. Refresh the list and try again.');
  if (parent !== null && !folders.some(f => f.id === parent)) throw Error('The destination folder no longer exists.');
  if (what === 'folder') {
    const seen = new Set([id]);
    for (let p = parent; p; p = folders.find(f => f.id === p)?.parent) {
      if (seen.has(p)) throw Error('Choose a folder outside this folder and its subfolders.');
      seen.add(p);
    }
  }
  const key = `${what}:${id}`, oldParent = (what === 'folder' ? source.parent : source.folder) || null;
  const siblings = orderedEntries(folders, items, order, parent).map(e => e.key);
  if (before !== null && !siblings.includes(before)) throw Error('The destination row changed. Try the move again.');
  if (before === key) return { changed: false, folders, order };
  const nextSiblings = siblings.filter(k => k !== key);
  nextSiblings.splice(before === null ? nextSiblings.length : nextSiblings.indexOf(before), 0, key);
  const changed = oldParent !== parent || nextSiblings.join('\n') !== siblings.join('\n');
  // Keep only live keys, materialising the default order before inserting. A flat order permits
  // mixed siblings without changing descendant order when their parent moves.
  const all = sortEntries([...folders.map(value => ({ key: `folder:${value.id}`, what: 'folder', value })),
    ...items.map(value => ({ key: `item:${value.id}`, what: 'item', value }))], order).map(e => e.key);
  const next = all.filter(k => k !== key);
  next.splice(before === null ? next.length : next.indexOf(before), 0, key);
  return { changed, folders: folders.map(f => what === 'folder' && f.id === id ? { ...f, parent } : f), order: next };
}
