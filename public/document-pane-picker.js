import { documentTags } from './document-properties.js';
export function documentPaneChoices({ documents, folders = [], current, exclude, opened = [], bookmarked = [] }) {
  const open = new Set(opened), marked = new Set(bookmarked), byId = new Map(folders.map(folder => [folder.id, folder]));
  function path(id) {
    const names = [], seen = new Set();
    while (byId.has(id) && !seen.has(id)) { seen.add(id); const folder = byId.get(id); names.unshift(folder.title); id = folder.parent; }
    return names.join(' / ');
  }
  return documents.filter(doc => doc.id !== exclude).map(doc => {
    const type = doc.document_type === 'table' ? 'table' : 'markdown', location = path(doc.folder);
    const categories = [type, ...(open.has(doc.id) ? ['open'] : []), ...(marked.has(doc.id) ? ['bookmarked'] : [])];
    return { id: doc.id, title: doc.title, type, icon: type === 'table' ? 'table' : 'file', path: location,
      description: [location || 'Project root', type === 'table' ? 'Table' : 'Markdown'].join(' · '),
      keywords: documentTags(doc).map(tag => '#' + tag.replace(/^#/, '')).join(' '), categories,
      rank: doc.id === current ? 0 : open.has(doc.id) ? 1 : marked.has(doc.id) ? 2 : 3 };
  }).sort((a,b) => a.rank-b.rank || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id));
}
