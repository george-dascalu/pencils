import { resolveDocument } from './document-model.js';

// Refresh only embeds whose sources changed. The host's caret, undo history and other DOM stay put.
export function documentEmbedViews({ documents, loadTable, render }) {
  const signatures = new WeakMap(), tables = new WeakMap(), cache = new Map(), views = new Set();
  let destroyed = false;
  const changed = root => root.dispatchEvent(new Event('document-embed-resize', { bubbles: true }));
  function signature(root) {
    const refs = [root.dataset.documentEmbedRef, ...[...root.querySelectorAll('[data-document-ref]')].map(a => a.dataset.documentRef)];
    return refs.flatMap(ref => { const doc = resolveDocument(ref || '', documents()); return [ref, doc?.id, doc?.title, doc?.body, doc?.table_file, doc?.table]; });
  }
  function clearViews(root) { for (const view of views) if (root.contains(view.root)) { view.destroy(); views.delete(view); } }
  async function engineFor(record) {
    const key = record.table || record.table_file || record.revision;
    const previous = cache.get(record.id); if (previous?.key === key) return previous.promise;
    const entry = { key };
    entry.promise = (async () => {
      const table = record.table || await loadTable?.(record);
      if (!table) throw Error('Table data is unavailable. Open its source and check the saved data.');
      const { createSheetEngine } = await import('/vendor/sheets/deps.js');
      const engine = createSheetEngine(table); entry.engine = engine;
      try { await engine.calculated(); } catch (error) { engine.destroy(); throw error; }
      if (destroyed || cache.get(record.id) !== entry) { engine.destroy(); throw Error('This table changed while loading.'); }
      previous?.engine?.destroy(); return engine;
    })();
    cache.set(record.id, entry); return entry.promise;
  }
  function hydrate(root) {
    if (destroyed || !root) return;
    for (const view of views) if (!view.root.isConnected) { view.destroy(); views.delete(view); }
    const embeds = [...(root.matches?.('.document-transclusion') ? [root] : []), ...root.querySelectorAll('.document-transclusion')];
    for (const embed of embeds.filter(el => !el.parentElement?.closest('.document-transclusion') || !root.contains(el.parentElement.closest('.document-transclusion')))) {
      const next = signature(embed), before = signatures.get(embed);
      if (before && (before.length !== next.length || before.some((v, i) => v !== next[i]))) {
        tables.delete(embed);
        clearViews(embed);
        const holder = document.createElement('div'), alias = /\|([^\]]+)\]\]$/.exec(embed.dataset.documentSource || '')?.[1];
        holder.innerHTML = render(`![[${embed.dataset.documentEmbedRef}${alias ? '|' + alias : ''}]]`);
        const replacement = holder.querySelector('.document-transclusion');
        if (replacement) {
          for (const name of ['data-document-embed-id', 'data-document-embed-table', 'aria-label']) {
            if (replacement.hasAttribute(name)) embed.setAttribute(name, replacement.getAttribute(name)); else embed.removeAttribute(name);
          }
          embed.replaceChildren(...replacement.childNodes); changed(embed);
        }
      }
      signatures.set(embed, signature(embed));
      for (const node of [embed, ...embed.querySelectorAll('[data-document-embed-table]')]) {
        if (!node.hasAttribute('data-document-embed-table')) continue;
        const record = documents().find(d => d.id === node.dataset.documentEmbedId);
        if (record?.document_type !== 'table') continue;
        const key = record.table || record.table_file || record.revision;
        if (tables.get(node) === key) continue;
        tables.set(node, key);
        const content = node.querySelector(':scope > .document-embed-content');
        if (!content) continue;
        Promise.all([engineFor(record), import('./document-table-embed.js')]).then(([engine, { documentTableEmbed }]) => {
          if (destroyed || !node.isConnected || tables.get(node) !== key) return;
          clearViews(content);
          const view = documentTableEmbed(content, engine, node.dataset.documentEmbedTable); view.root = content; views.add(view); changed(node);
        }).catch(error => {
          if (destroyed || !node.isConnected || tables.get(node) !== key) return;
          const message = document.createElement('p'); message.className = 'field-hint'; message.setAttribute('role', 'status'); message.textContent = error.message;
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button small'; retry.textContent = 'Retry'; retry.setAttribute('aria-label', 'Retry embedded table');
          retry.onclick = () => { tables.delete(node); cache.get(record.id)?.engine?.destroy(); cache.delete(record.id); hydrate(embed); };
          content.replaceChildren(message, retry); changed(node);
        });
      }
    }
  }
  return { hydrate, destroy() { destroyed = true; for (const view of views) view.destroy(); views.clear(); for (const entry of cache.values()) entry.engine?.destroy(); cache.clear(); } };
}
