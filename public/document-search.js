import { SearchQuery, getSearchQuery, setSearchQuery, findNext, findPrevious, selectMatches,
  replaceNext, replaceAll, closeSearchPanel } from '/vendor/editor/deps.js';

// Compact, keyboard-accessible search for Live preview and Source. Reading uses
// the same control sizes but searches rendered text without moving the editor.
export function documentSearchPanel(view, icon) {
  const dom = document.createElement('div');
  dom.className = 'cm-search document-editor-search';
  dom.setAttribute('role', 'search'); dom.setAttribute('aria-label', 'Search document');
  const button = (name, label, glyph, extra = '') => `<button type="button" name="${name}" class="icon-button" aria-label="${label}" title="${label}" ${extra}>${icon(glyph)}</button>`;
  dom.innerHTML = `<div class="document-find-row">
    ${button('toggleReplace', 'Show replace', 'chevron', 'aria-expanded="false"')}
    <input class="cm-textfield" type="search" name="search" main-field="true" form="" aria-label="Find in document" placeholder="Find…" autocomplete="off" spellcheck="false">
    <span class="document-find-count" role="status" aria-live="polite"></span>
    ${button('prev', 'Previous match', 'chevron')}${button('next', 'Next match', 'chevron')}
    <details class="document-search-options"><summary class="icon-button" aria-label="Search options" title="Search options">${icon('settings')}</summary>
      <div class="document-search-option-list">
        ${[['caseSensitive','Match case','case-sensitive'],['wholeWord','Whole word','whole-word'],['regexp','Regular expression','regexp']].map(([key,label,glyph]) => button(key,label,glyph,'aria-pressed="false"')).join('')}
        ${button('select', 'Select all matches', 'select-all')}
      </div></details>
    ${button('close', 'Close search', 'close')}
    </div><div class="document-replace-row" hidden>
      <input class="cm-textfield" name="replace" form="" aria-label="Replace with" placeholder="Replace…" autocomplete="off">
      ${button('replace', 'Replace next', 'replace')}${button('replaceAll', 'Replace all', 'replace-all')}
    </div>`;
  const find = dom.querySelector('input[name=search]'), replacement = dom.querySelector('input[name=replace]');
  const count = dom.querySelector('.document-find-count');
  let query = getSearchQuery(view.state), total = 0, ranges = [], limited = false;
  function showQuery() {
    if (find.value !== query.search) find.value = query.search;
    if (replacement.value !== query.replace) replacement.value = query.replace;
    for (const key of ['caseSensitive','wholeWord','regexp']) dom.querySelector(`[name=${key}]`).setAttribute('aria-pressed', String(query[key]));
  }
  function matches(recompute = true) {
    if (recompute) {
      ranges = []; limited = false;
      if (query.valid) {
        const cursor = query.getCursor(view.state);
        for (let item = cursor.next(); !item.done; item = cursor.next()) {
          if (ranges.length === 5000) { limited = true; break; } ranges.push(item.value);
        }
      }
      total = ranges.length;
    }
    const selection = view.state.selection.main;
    const selected = ranges.findIndex(r => r.from === selection.from && r.to === selection.to);
    count.textContent = !query.search ? '' : !query.valid ? 'Invalid pattern' : !total ? 'No matches' : `${selected < 0 ? 0 : selected + 1}/${total}${limited ? '+' : ''}`;
    find.setAttribute('aria-invalid', String(!!query.search && !query.valid));
    for (const name of ['prev','next','select','replace','replaceAll']) dom.querySelector(`button[name=${name}]`).disabled = !total;
  }
  function commit(extra = {}) {
    query = new SearchQuery({ ...query, search: find.value, replace: replacement.value, ...extra });
    view.dispatch({ effects: setSearchQuery.of(query) });
  }
  dom.addEventListener('input', e => { if (e.target === find || e.target === replacement) commit(); });
  dom.addEventListener('click', e => {
    const name = e.target.closest('button')?.name;
    if (!name) return;
    if (['caseSensitive','wholeWord','regexp'].includes(name)) commit({ [name]: !query[name] });
    else if (name === 'close') { closeSearchPanel(view); view.focus(); }
    else if (name === 'toggleReplace') {
      const row = dom.querySelector('.document-replace-row'), button = dom.querySelector('[name=toggleReplace]');
      row.hidden = !row.hidden;
      button.setAttribute('aria-expanded', String(!row.hidden));
      button.setAttribute('aria-label', row.hidden ? 'Show replace' : 'Hide replace');
      button.title = row.hidden ? 'Show replace' : 'Hide replace';
      if (!row.hidden) replacement.focus();
      view.requestMeasure();
    } else ({ next: findNext, prev: findPrevious, select: selectMatches, replace: replaceNext, replaceAll }[name])?.(view);
  });
  dom.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSearchPanel(view); view.focus(); }
    if (e.key === 'Enter' && (e.target === find || e.target === replacement)) {
      e.preventDefault(); e.stopPropagation();
      if (e.target === replacement) replaceNext(view);
      else if (e.target === find) (e.shiftKey ? findPrevious : findNext)(view);
    }
  });
  showQuery(); matches();
  return { dom, top: true, update(update) {
    const next = getSearchQuery(update.state), changed = !query.eq(next);
    query = next; showQuery(); matches(changed || update.docChanged || update.transactions.some(tr => tr.effects.some(e => e.is(setSearchQuery))));
  } };
}
