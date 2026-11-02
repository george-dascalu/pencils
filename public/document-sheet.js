import { checkTable, parseCSV, tableFromRows, tableCSV, TABLE_LIMITS, usedTableRange } from './document-sheet-model.js';
import { parseTabSeparated } from './document-tables.js';

const columnName = n => { let name = ''; for (n++; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; };
const address = (row, col) => `${columnName(col)}${row + 1}`;
const formats = [['General', 'General'], ['Number', '#,##0.00'], ['Currency (£)', '£#,##0.00'], ['Currency ($)', '$#,##0.00'], ['Percent', '0.00%'], ['Date', 'yyyy-mm-dd']];
export function sheetFormatting(icon) {
  const button = (action, label, glyph, extra = '') => `<button type="button" class="icon-button ${extra}" data-sheet-action="${action}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;
  return `<div class="sheet-format-tools" role="toolbar" aria-label="Format table">${button('undo', 'Undo', 'undo')}${button('redo', 'Redo', 'redo')}${button('format', 'Cell formatting', 'text')}${button('bold', 'Bold', 'bold', 'sheet-desktop-tool')}${button('italic', 'Italic', 'italic', 'sheet-desktop-tool')}${button('structure', 'Rows and columns', 'table', 'sheet-desktop-tool')}${button('sort', 'Sort worksheet', 'sort', 'sheet-desktop-tool')}${button('filter', 'Filter worksheet', 'filter')}${button('freeze', 'Freeze rows and columns', 'lock', 'sheet-desktop-tool')}</div>`;
}
export function sheetContent(icon) {
  return `<section class="document-sheet" aria-label="Table worksheet" data-ready="false"><div class="sheet-formula-bar"><output class="sheet-address" aria-label="Selected cell">A1</output><span aria-hidden="true">ƒx</span><input class="sheet-formula" aria-label="Cell value or formula" autocomplete="off" spellcheck="false"><button type="button" class="icon-button" data-sheet-action="apply" aria-label="Apply cell value" title="Apply cell value">${icon('check')}</button></div><div class="sheet-error" role="status" hidden></div><div class="document-sheet-scroll" tabindex="0" role="region" aria-label="Worksheet grid"><p class="sheet-loading" role="status">Opening table…</p></div><footer class="sheet-footer"><button type="button" class="icon-button" data-sheet-action="add-sheet" aria-label="Add worksheet" title="Add worksheet">${icon('plus')}</button><div class="sheet-tabs" role="tablist" aria-label="Worksheets"></div><button type="button" class="icon-button" data-sheet-action="sheet-menu" aria-label="Worksheet options" title="Worksheet options">${icon('more')}</button><output class="sheet-selection-summary" aria-live="polite"></output></footer></section>`;
}

export function createDocumentSheet({ form, record, load, onChange, icon, esc, colorPicker, panels, storage, toast }) {
  const root = form.querySelector('.document-sheet'), scroll = root.querySelector('.document-sheet-scroll'), formula = root.querySelector('.sheet-formula');
  const lifecycle = new AbortController(), signal = lifecycle.signal;
  const editableControls = [...form.querySelectorAll('[data-sheet-action]:not([data-sheet-action="tools"])'), formula];
  editableControls.forEach(control => { control.disabled = true; });
  let engine, sid, selected = { r: 0, c: 0, endR: 0, endC: 0 }, editing, formulaDirty = false, destroyed = false, frame, rowMap = [], prefix = [], dragged = false;
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const safe = fn => { try { return fn(); } catch (error) { toast(error.message, true); } };
  const data = () => engine.snapshot();
  const sheet = () => data().workbook.sheets[sid];
  const worksheet = () => engine.sheet(sid);
  const bounds = () => ({ r: Math.min(selected.r, selected.endR), c: Math.min(selected.c, selected.endC), h: Math.abs(selected.r - selected.endR) + 1, w: Math.abs(selected.c - selected.endC) + 1 });
  const range = () => { const { r, c, h, w } = bounds(); return worksheet().getRange(r, c, h, w); };
  const current = () => sheet().cellData?.[selected.r]?.[selected.c] || {};
  const error = message => { const el = root.querySelector('.sheet-error'); el.hidden = !message; el.textContent = message; };
  function refresh() { if (!destroyed && !frame) frame = requestAnimationFrame(() => { frame = null; if (engine && !editing) render(); }); }
  function rawText(cell) { return cell.f || (cell.t === 3 && cell.v !== null ? cell.v ? 'TRUE' : 'FALSE' : String(cell.v ?? '')); }
  function setSelection(r, c, extend = false, reveal = false) {
    if (!engine) return;
    r = Math.max(0, Math.min(sheet().rowCount - 1, r)); c = Math.max(0, Math.min(sheet().columnCount - 1, c));
    selected = extend ? { ...selected, endR: r, endC: c } : { r, c, endR: r, endC: c };
    if (document.activeElement !== formula) formula.value = rawText(current());
    const b = bounds(); root.querySelector('.sheet-address').value = b.h === 1 && b.w === 1 ? address(r, c) : `${address(b.r, b.c)}:${address(b.r + b.h - 1, b.c + b.w - 1)}`;
    for (const cell of scroll.querySelectorAll('[data-r][data-c]')) {
      const row = +cell.dataset.r, col = +cell.dataset.c;
      const on = row >= b.r && row < b.r + b.h && col >= b.c && col < b.c + b.w;
      cell.setAttribute('aria-selected', String(on)); cell.classList.toggle('sheet-active', row === selected.r && col === selected.c);
    }
    const numbers = [];
    if (b.h * b.w <= TABLE_LIMITS.cells) for (let row = b.r; row < b.r + b.h; row++) for (let col = b.c; col < b.c + b.w; col++) { const v = sheet().cellData?.[row]?.[col]?.v; if (typeof v === 'number') numbers.push(v); }
    root.querySelector('.sheet-selection-summary').value = b.h * b.w > 1 ? `${b.h * b.w} cells${numbers.length ? ` · Sum ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(numbers.reduce((a, b) => a + b, 0))}` : ''}` : '';
    if (reveal) {
      const index = rowMap.indexOf(r), y = prefix[index] || 0, height = touch() ? 44 : 28;
      if (y < scroll.scrollTop + height) scroll.scrollTop = Math.max(0, y - height);
      if (y + height * 2 > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = y + height * 2 - scroll.clientHeight;
      refresh();
      requestAnimationFrame(() => scroll.querySelector(`[data-sheet-cell="${address(r, c)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
  }
  function applyStyle(cell, style) {
    if (!style) return;
    if (style.bl) cell.style.fontWeight = '700'; if (style.it) cell.style.fontStyle = 'italic';
    if (style.cl?.rgb) cell.style.color = style.cl.rgb; if (style.bg?.rgb) cell.style.backgroundColor = style.bg.rgb;
    if (style.fs) cell.style.fontSize = `${Math.max(touch() ? 16 : 10, Math.min(40, style.fs))}px`;
    if (style.ff) cell.style.fontFamily = style.ff;
    cell.style.textAlign = ({ 1: 'left', 2: 'center', 3: 'right' })[style.ht] || '';
    if (style.tb === 3) cell.style.whiteSpace = 'pre-wrap';
    for (const [key, side] of [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']]) if (style.bd?.[key]?.s) cell.style[`border${side}`] = `1px solid ${style.bd[key].cl?.rgb || 'currentColor'}`;
  }
  function render() {
    const table = data(), s = sheet(), minimum = touch() ? 44 : 28, header = minimum;
    const filters = engine.filters[sid] || {}, entries = Object.entries(filters);
    rowMap = Array.from({ length: s.rowCount }, (_, i) => i).filter(r => r === 0 || entries.every(([c, value]) => String(s.cellData?.[r]?.[c]?.v ?? '').toLocaleLowerCase().includes(value.toLocaleLowerCase())));
    prefix = [0];
    for (const r of rowMap) {
      let height = Math.max(minimum, s.rowData?.[r]?.h || s.defaultRowHeight || 28);
      for (const [col, cell] of Object.entries(s.cellData?.[r] || {})) {
        const style = typeof cell.s === 'string' ? table.workbook.styles[cell.s] : cell.s;
        if (style?.tb === 3) { const width = s.columnData?.[col]?.w || 120; height = Math.max(height, Math.min(400, (Math.ceil(String(cell.v ?? '').length * 8 / Math.max(30, width - 16)) + String(cell.v ?? '').split('\n').length - 1) * 20 + 8)); }
      }
      prefix.push(prefix.at(-1) + height);
    }
    let start = 0; while (start < rowMap.length && prefix[start + 1] < scroll.scrollTop - minimum * 6) start++;
    let end = start; while (end < rowMap.length && prefix[end] < scroll.scrollTop + (scroll.clientHeight || 500) + minimum * 8) end++;
    const frozenRows = Math.min(5, s.freeze?.ySplit || 0), frozenCols = Math.min(5, s.freeze?.xSplit || 0);
    const visible = [...new Set([...Array.from({ length: Math.min(frozenRows, rowMap.length) }, (_, i) => i), ...Array.from({ length: end - start }, (_, i) => start + i)])].sort((a, b) => a - b);
    const grid = document.createElement('table'); grid.className = 'document-sheet-grid'; grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', s.name); grid.setAttribute('aria-rowcount', String(s.rowCount + 1)); grid.setAttribute('aria-colcount', String(s.columnCount + 1));
    const widths = Array.from({ length: s.columnCount }, (_, col) => s.columnData?.[col]?.w || s.defaultColumnWidth || 120), offsets = [48]; for (const width of widths) offsets.push(offsets.at(-1) + width);
    grid.style.width = `${offsets.at(-1)}px`;
    const colgroup = document.createElement('colgroup'); colgroup.innerHTML = '<col style="width:48px">' + widths.map(width => `<col style="width:${width}px">`).join(''); grid.append(colgroup);
    const head = grid.createTHead().insertRow(); const corner = document.createElement('th'); corner.textContent = '#'; corner.className = 'sheet-corner'; head.append(corner);
    widths.forEach((width, c) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = columnName(c); th.dataset.column = c; th.style.height = `${header}px`; if (c < frozenCols) { th.className = 'sheet-frozen-column'; th.style.left = `${offsets[c]}px`; } const handle = document.createElement('span'); handle.className = 'sheet-column-resize'; handle.dataset.resizeColumn = c; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-label', `Resize column ${columnName(c)}`); th.append(handle); head.append(th); });
    const body = grid.createTBody(); let cursor = 0;
    const spacer = height => { if (height <= 0) return; const tr = body.insertRow(); tr.className = 'sheet-spacer'; tr.setAttribute('aria-hidden', 'true'); const td = tr.insertCell(); td.colSpan = s.columnCount + 1; td.style.height = `${height}px`; };
    for (const index of visible) {
      spacer(prefix[index] - prefix[cursor]); const r = rowMap[index], tr = body.insertRow(), height = prefix[index + 1] - prefix[index]; tr.style.height = `${height}px`; tr.setAttribute('aria-rowindex', String(r + 2));
      const label = document.createElement('th'); label.scope = 'row'; label.textContent = r + 1; label.dataset.row = r; const handle = document.createElement('span'); handle.className = 'sheet-row-resize'; handle.dataset.resizeRow = r; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-label', `Resize row ${r + 1}`); label.append(handle); tr.append(label);
      let display; try { display = worksheet().getRange(r, 0, 1, s.columnCount).getDisplayValues()[0]; } catch { display = []; }
      for (let c = 0; c < s.columnCount; c++) {
        const cell = s.cellData?.[r]?.[c] || {}, td = tr.insertCell(); td.setAttribute('role', 'gridcell'); td.setAttribute('aria-colindex', String(c + 2)); td.dataset.r = r; td.dataset.c = c; td.dataset.sheetCell = address(r, c); const text = document.createElement('span'); text.className = 'sheet-cell-text'; text.textContent = display[c] ?? String(cell.v ?? ''); text.style.maxHeight = `${height - 8}px`; td.append(text); td.title = cell.f ? `${cell.f}\n${td.textContent}` : td.textContent; td.setAttribute('aria-label', `${address(r, c)}${cell.f ? `, formula ${cell.f}` : ''}`);
        if (typeof cell.v === 'number') td.style.textAlign = 'right';
        applyStyle(td, typeof cell.s === 'string' ? table.workbook.styles[cell.s] : cell.s);
        if (c < frozenCols) { td.classList.add('sheet-frozen-column'); td.style.left = `${offsets[c]}px`; }
      }
      if (index < frozenRows) for (const cell of tr.children) { cell.classList.add('sheet-frozen-row'); cell.style.top = `${header + prefix[index]}px`; }
      cursor = index + 1;
    }
    spacer(prefix.at(-1) - prefix[cursor]);
    scroll.replaceChildren(grid);
    const tabs = root.querySelector('.sheet-tabs');
    tabs.innerHTML = table.workbook.sheetOrder.map(id => `<button type="button" role="tab" data-sheet-tab="${esc(id)}" aria-selected="${id === sid}">${esc(table.workbook.sheets[id].name)}</button>`).join('');
    setSelection(selected.r, selected.c, true);
    root.dataset.ready = 'true'; error(entries.length ? 'Filters active' : '');
  }
  function commit(value = editing?.input.value ?? formula.value) {
    if (!engine) return;
    formulaDirty = false;
    if (editing) { const input = editing.input; editing = null; input.remove(); }
    engine.setValue(sid, selected.r, selected.c, value); formula.value = value; refresh();
  }
  function beginEdit(initial) {
    if (!engine || editing) return;
    const cell = scroll.querySelector(`[data-sheet-cell="${address(selected.r, selected.c)}"]`); if (!cell) return;
    const input = document.createElement('textarea'); input.dataset.sheetEditor = ''; input.setAttribute('aria-label', `Edit cell ${address(selected.r, selected.c)}`); input.value = initial ?? rawText(current()); cell.append(input); editing = { input };
    input.focus({ preventScroll: true }); if (initial === undefined) input.select();
    input.addEventListener('blur', () => { if (editing?.input === input) commit(input.value); }, { once: true });
  }
  const item = (action, label, glyph = 'table', extra = '') => `<button type="button" class="document-panel-item" data-sheet-action="${action}" ${extra}>${icon(glyph)}${esc(label)}</button>`;
  function panel(button, title, html, width = 340, menu = false) {
    const el = panels.show(button, title, html, width, { menu }); if (!el) return;
    el.addEventListener('click', handleAction, { signal });
    el.addEventListener('submit', event => event.preventDefault(), { signal });
    return el;
  }
  function namePanel(button, rename = false) {
    const label = rename ? 'Rename worksheet' : 'Add worksheet';
    const el = panel(button, label, `<form class="sheet-panel-form"><label class="field">Worksheet name<input name="sheet-name" maxlength="80" required value="${rename ? esc(sheet().name) : ''}"></label><p class="form-error" role="alert" hidden></p><button type="submit" class="button primary">${label}</button></form>`);
    el?.querySelector('form').addEventListener('submit', event => { event.preventDefault(); safe(() => {
      const name = el.querySelector('input').value.trim();
      if (!name || /[\[\]:*?/\\]/.test(name)) throw Error('Use a worksheet name without [ ] : * ? / or \\.');
      if (Object.values(data().workbook.sheets).some(s => s.name.toLocaleLowerCase() === name.toLocaleLowerCase() && (!rename || s.id !== sid))) throw Error('A worksheet already has that name.');
      if (rename) engine.mutate(() => worksheet().setName(name));
      else { if (data().workbook.sheetOrder.length >= TABLE_LIMITS.sheets) throw Error('A table supports up to 20 worksheets.'); engine.mutate(() => { const created = engine.book.insertSheet(name, { sheet: { rowCount: 1000, columnCount: 26, defaultRowHeight: 28, defaultColumnWidth: 120 } }); sid = created.getSheetId(); }); selected = { r: 0, c: 0, endR: 0, endC: 0 }; scroll.scrollTop = scroll.scrollLeft = 0; }
      storage.set(`table-sheet:${record.id}`, sid); panels.close(); refresh();
    }); }, { signal });
  }
  function formatPanel(button) {
    const style = worksheet().getRange(selected.r, selected.c).getCellStyleData() || {};
    const el = panel(button, 'Cell formatting', `<div class="sheet-panel-form"><div class="sheet-inline-actions sheet-touch-tools">${item('bold', 'Bold', 'bold')}${item('italic', 'Italic', 'italic')}</div><label class="sheet-setting">Number format<select name="sheet-format" aria-label="Number format">${formats.map(([label, value]) => `<option value="${esc(value)}" ${style.n?.pattern === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="sheet-setting">Text colour${colorPicker({ label: 'Cell text colour', name: 'sheet-text', value: style.cl?.rgb || '#33463b' })}</div><div class="sheet-setting">Fill colour${colorPicker({ label: 'Cell fill colour', name: 'sheet-fill', value: style.bg?.rgb || '#ffffff' })}</div><label class="sheet-setting">Alignment<select name="sheet-alignment" aria-label="Alignment"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label><label class="sheet-setting check-control"><input type="checkbox" name="sheet-wrap" ${style.tb === 3 ? 'checked' : ''}>Wrap text</label><div class="sheet-inline-actions">${item('borders', 'Cell borders', 'table')}${item('clear-format', 'Clear formatting', 'close')}</div><div class="sheet-touch-tools">${item('structure', 'Rows and columns', 'table')}${item('sort', 'Sort worksheet', 'sort')}${item('freeze', 'Freeze rows and columns', 'lock')}</div></div>`);
    el?.addEventListener('change', event => safe(() => engine.mutate(() => {
      const { name, value, checked } = event.target;
      if (name === 'sheet-format') range().setNumberFormat(value);
      if (name === 'sheet-text') range().setFontColor(value);
      if (name === 'sheet-fill') range().setBackgroundColor(value);
      if (name === 'sheet-alignment') range().setHorizontalAlignment(value);
      if (name === 'sheet-wrap') range().setWrap(checked);
    })), { signal });
  }
  function sortPanel(button) {
    const el = panel(button, 'Sort worksheet', `<form class="sheet-panel-form"><label class="field">Column<select name="column" aria-label="Column">${Array.from({ length: sheet().columnCount }, (_, c) => `<option value="${c}" ${c === selected.c ? 'selected' : ''}>${columnName(c)}${sheet().cellData?.[0]?.[c]?.v ? ` — ${esc(String(sheet().cellData[0][c].v))}` : ''}</option>`).join('')}</select></label><label class="check-control"><input name="header" type="checkbox" checked>First row is a header</label><div class="sheet-inline-actions"><button type="submit" name="order" value="asc" class="button">Ascending</button><button type="submit" name="order" value="desc" class="button">Descending</button></div></form>`);
    el?.querySelector('form').addEventListener('submit', event => { event.preventDefault(); safe(() => {
      const used = usedTableRange(sheet()); if (!used) return;
      const start = el.querySelector('[name="header"]').checked ? 1 : 0;
      const column = +el.querySelector('[name="column"]').value;
      if (used.rows > start) engine.mutate(() => worksheet().getRange(start, 0, used.rows - start, used.columns).sort({ column, ascending: event.submitter?.value !== 'desc' }));
      panels.close(); refresh();
    }); }, { signal });
  }
  function filterPanel(button) {
    const el = panel(button, 'Filter worksheet', `<form class="sheet-panel-form"><label class="field">Column<select name="column" aria-label="Column">${Array.from({ length: sheet().columnCount }, (_, c) => `<option value="${c}" ${c === selected.c ? 'selected' : ''}>${columnName(c)}</option>`).join('')}</select></label><label class="field">Contains<input name="contains" value="${esc(engine.filters[sid]?.[selected.c] || '')}"></label><div class="sheet-inline-actions"><button type="submit" class="button primary">Apply filter</button><button type="button" class="button" data-clear-filters>Clear filters</button></div></form>`);
    el?.querySelector('select').addEventListener('change', () => { el.querySelector('[name="contains"]').value = engine.filters[sid]?.[el.querySelector('select').value] || ''; }, { signal });
    el?.querySelector('form').addEventListener('submit', event => { event.preventDefault(); engine.mutate(() => { const filters = engine.filters[sid] ||= {}, key = el.querySelector('select').value, value = el.querySelector('[name="contains"]').value; if (value) filters[key] = value; else delete filters[key]; }); panels.close(); scroll.scrollTop = 0; refresh(); }, { signal });
    el?.querySelector('[data-clear-filters]').addEventListener('click', () => { engine.mutate(() => delete engine.filters[sid]); panels.close(); refresh(); }, { signal });
  }
  function freezePanel(button) {
    const el = panel(button, 'Freeze rows and columns', `<form class="sheet-panel-form"><label class="sheet-setting">Rows<input name="rows" type="number" min="0" max="5" value="${sheet().freeze?.ySplit || 0}"></label><label class="sheet-setting">Columns<input name="columns" type="number" min="0" max="5" value="${sheet().freeze?.xSplit || 0}"></label><button class="button primary" type="submit">Apply</button></form>`);
    el?.querySelector('form').addEventListener('submit', event => { event.preventDefault(); const r = +el.querySelector('[name="rows"]').value, c = +el.querySelector('[name="columns"]').value; if (![r, c].every(n => Number.isInteger(n) && n >= 0 && n <= 5)) return; safe(() => engine.mutate(() => { worksheet().setFrozenRows(r); worksheet().setFrozenColumns(c); })); panels.close(); refresh(); }, { signal });
  }
  function download(text, extension, mime) { const url = URL.createObjectURL(new Blob([text], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = `${(form.elements.title.value || record.title).replace(/[\\/:*?"<>|]/g, '-')}.${extension}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function importPanel(button) {
    const el = panel(button, 'Import CSV', `<div class="sheet-panel-form"><label class="field">CSV file<input type="file" data-sheet-import accept=".csv,.tsv,text/csv,text/tab-separated-values"></label><label class="sheet-setting">Delimiter<select name="delimiter"><option value=",">Comma</option><option value=";">Semicolon</option><option value="tab">Tab</option></select></label><label class="check-control"><input name="formulas" type="checkbox">Interpret formulas beginning with =</label><div class="sheet-import-preview" tabindex="0"></div><p class="sheet-import-status" role="status"></p><button type="button" class="button primary" data-import-confirm disabled>Import worksheet</button></div>`, 480);
    if (!el) return; let text, rows, fileName;
    const preview = () => { try { rows = parseCSV(text, el.querySelector('[name="delimiter"]').value === 'tab' ? '\t' : el.querySelector('[name="delimiter"]').value); el.querySelector('.sheet-import-preview').innerHTML = `<table>${rows.slice(0, 5).map(row => `<tr>${row.slice(0, 8).map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</table>`; el.querySelector('.sheet-import-status').textContent = `${rows.length.toLocaleString()} rows · ${Math.max(...rows.map(row => row.length))} columns · imports into a new worksheet`; el.querySelector('[data-import-confirm]').disabled = false; } catch (error) { rows = null; el.querySelector('.sheet-import-status').textContent = error.message; el.querySelector('[data-import-confirm]').disabled = true; } };
    el.querySelector('[data-sheet-import]').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; if (file.size > TABLE_LIMITS.bytes) { el.querySelector('.sheet-import-status').textContent = 'Choose a CSV file smaller than 1.5 MB.'; return; } text = await file.text(); fileName = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 65) || 'Imported'; if (/\.tsv$/i.test(file.name)) el.querySelector('[name="delimiter"]').value = 'tab'; preview(); }, { signal });
    el.querySelector('[name="delimiter"]').addEventListener('change', () => { if (text !== undefined) preview(); }, { signal });
    el.querySelector('[data-import-confirm]').addEventListener('click', () => safe(() => {
      if (!rows) return; if (data().workbook.sheetOrder.length >= TABLE_LIMITS.sheets) throw Error('A table supports up to 20 worksheets.');
      let name = fileName, i = 2; while (Object.values(data().workbook.sheets).some(s => s.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${fileName} ${i++}`;
      const imported = Object.values(tableFromRows(rows, { id: record.id, name: record.title, sheetName: name, formulas: el.querySelector('[name="formulas"]').checked }).workbook.sheets)[0];
      engine.mutate(() => { const added = engine.book.insertSheet(name, { sheet: { ...imported, id: undefined } }); sid = added.getSheetId(); });
      selected = { r: 0, c: 0, endR: 0, endC: 0 }; storage.set(`table-sheet:${record.id}`, sid); scroll.scrollTop = scroll.scrollLeft = 0; panels.close(); refresh();
    }), { signal });
  }
  async function handleAction(event) {
    const button = event.target.closest('[data-sheet-action]'); if (!button) return;
    event.preventDefault(); event.stopPropagation();
    try {
      const action = button.dataset.sheetAction;
      if (action !== 'tools' && !engine) return;
      if (action === 'apply') { commit(formula.value); formula.blur(); return; }
      if (action === 'undo' || action === 'redo') { await engine[action](); return; }
      if (action === 'format') return formatPanel(button);
      if (action === 'add-sheet' || action === 'rename-sheet') return namePanel(button, action === 'rename-sheet');
      if (action === 'filter') return filterPanel(button);
      if (action === 'sort') return sortPanel(button);
      if (action === 'freeze') return freezePanel(button);
      if (action === 'import') return importPanel(button);
      if (action === 'export') { engine.flush(); download(tableCSV(data(), sid), 'csv', 'text/csv;charset=utf-8'); return; }
      if (action === 'tools') {
        const documentItem = (action, label, glyph) => `<button type="button" class="document-panel-item ${action === 'confirm-delete' ? 'danger' : ''}" data-document-action="${action}">${icon(glyph)}${label}</button>`;
        panel(button, 'Document tools', `<section class="document-tool-group">${item('import', 'Import CSV', 'upload', engine ? '' : 'disabled')}${item('export', 'Export CSV', 'download', engine ? '' : 'disabled')}</section><section class="document-tool-group">${documentItem('rename', 'Rename', 'pencil')}${documentItem('move', 'Move to folder', 'folder')}${documentItem('property-add', 'Add property', 'plus')}${documentItem('versions', 'Page versions', 'clock')}${documentItem('links', 'Backlinks and mentions', 'link')}${documentItem('export', 'Export Markdown', 'download')}${documentItem('obsidian', 'Open in Obsidian', 'file')}${documentItem('obsidian-settings', 'Obsidian settings', 'settings')}</section><section class="document-tool-group">${documentItem('confirm-delete', 'Delete document', 'trash')}</section>`, 260, true); return;
      }
      if (action === 'sheet-menu') { panel(button, 'Worksheet options', `${item('rename-sheet', 'Rename worksheet', 'pencil')}${item('delete-sheet', 'Delete worksheet', 'trash', data().workbook.sheetOrder.length < 2 ? 'disabled' : '')}`, 240, true); return; }
      if (action === 'delete-sheet') {
        if (data().workbook.sheetOrder.length < 2) throw Error('Keep at least one worksheet.');
        const el = panel(button, 'Delete worksheet', `<p>Delete “${esc(sheet().name)}” and its cells? You can undo this change or restore a document version.</p><button type="button" class="button danger" data-delete-worksheet>Delete worksheet</button>`);
        el?.querySelector('[data-delete-worksheet]').addEventListener('click', () => { engine.mutate(() => { engine.book.deleteSheet(sid); sid = engine.book.save().sheetOrder[0]; }); selected = { r: 0, c: 0, endR: 0, endC: 0 }; panels.close(); refresh(); }, { signal }); return;
      }
      if (action === 'structure') { panel(button, 'Rows and columns', [['insert-row', 'Insert row above'], ['delete-row', 'Delete selected rows'], ['insert-column', 'Insert column before'], ['delete-column', 'Delete selected columns']].map(([action, label]) => item(action, label)).join(''), 270, true); return; }
      engine.mutate(() => {
        if (action === 'bold') range().setFontWeight(current().s && range().getCellStyleData()?.bl ? 'normal' : 'bold');
        if (action === 'italic') range().setFontStyle(range().getCellStyleData()?.it ? 'normal' : 'italic');
        if (action === 'borders') range().setBorder(engine.api.Enum.BorderType.ALL, engine.api.Enum.BorderStyleTypes.THIN, '#89958c');
        if (action === 'clear-format') { const b = bounds(); range().setValues(Array.from({ length: b.h }, (_, r) => Array.from({ length: b.w }, (_, c) => ({ ...sheet().cellData?.[b.r + r]?.[b.c + c], s: null })))); }
        const b = bounds();
        if (action === 'insert-row') { if (sheet().rowCount + b.h > TABLE_LIMITS.rows) throw Error('A worksheet supports up to 10,000 rows.'); worksheet().insertRowsBefore(b.r, b.h); }
        if (action === 'insert-column') { if (sheet().columnCount + b.w > TABLE_LIMITS.columns) throw Error('A worksheet supports up to 200 columns.'); worksheet().insertColumnsBefore(b.c, b.w); }
        if (action === 'delete-row') { if (b.h >= sheet().rowCount) throw Error('Keep at least one row.'); worksheet().deleteRows(b.r, b.h); }
        if (action === 'delete-column') { if (b.w >= sheet().columnCount) throw Error('Keep at least one column.'); worksheet().deleteColumns(b.c, b.w); }
      });
      if (['borders', 'clear-format', 'insert-row', 'insert-column', 'delete-row', 'delete-column'].includes(action)) panels.close();
    } catch (error) { toast(error.message, true); }
  }
  form.addEventListener('click', event => {
    if (event.target.closest('[data-sheet-action]')) { void handleAction(event); return; }
    const tab = event.target.closest('[data-sheet-tab]');
    if (tab && engine) { if (editing || formulaDirty) commit(); engine.flush(); sid = tab.dataset.sheetTab; storage.set(`table-sheet:${record.id}`, sid); selected = { r: 0, c: 0, endR: 0, endC: 0 }; scroll.scrollTop = scroll.scrollLeft = 0; render(); }
  }, { signal });
  let lastTap = 0, tappedCell;
  scroll.addEventListener('click', event => {
    const header = event.target.closest('th[data-column], th[data-row]');
    if (header && !event.target.closest('[role=separator]')) { if (editing || formulaDirty) commit(); if (header.hasAttribute('data-column')) { selected = { r: 0, c: +header.dataset.column, endR: sheet().rowCount - 1, endC: +header.dataset.column }; } else { selected = { r: +header.dataset.row, c: 0, endR: +header.dataset.row, endC: sheet().columnCount - 1 }; } setSelection(selected.endR, selected.endC, true); scroll.focus({ preventScroll: true }); return; }
    const cell = event.target.closest('[data-r][data-c]'); if (!cell || event.target.closest('textarea') || !engine) return;
    if (dragged) { dragged = false; return; }
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const again = selected.r === r && selected.c === c && tappedCell === address(r, c) && Date.now() - lastTap < 1100;
    if (editing || formulaDirty) commit(); setSelection(r, c, event.shiftKey); scroll.focus({ preventScroll: true });
    if (touch() && again) beginEdit(); tappedCell = address(r, c); lastTap = Date.now();
  }, { signal });
  scroll.addEventListener('dblclick', event => { if (!touch() && event.target.closest('[data-r][data-c]')) beginEdit(); }, { signal });
  scroll.addEventListener('scroll', () => { if (editing) commit(); refresh(); }, { passive: true, signal });
  const resize = new ResizeObserver(refresh); resize.observe(scroll);
  scroll.addEventListener('pointerdown', event => {
    if (!engine) return;
    const handle = event.target.closest('[data-resize-column], [data-resize-row]');
    if (handle) {
      event.preventDefault(); event.stopPropagation();
      const isColumn = handle.hasAttribute('data-resize-column'), key = +(isColumn ? handle.dataset.resizeColumn : handle.dataset.resizeRow), initial = isColumn ? sheet().columnData?.[key]?.w || 120 : sheet().rowData?.[key]?.h || (touch() ? 44 : 28), origin = isColumn ? event.clientX : event.clientY;
      const moving = new AbortController(); let size = initial;
      const move = e => { size = Math.round(Math.max(isColumn ? 48 : touch() ? 44 : 28, Math.min(1000, initial + (isColumn ? e.clientX : e.clientY) - origin))); handle.title = `${size}px`; const track = isColumn ? scroll.querySelectorAll('col')[key + 1] : handle.closest('tr'); if (track) track.style[isColumn ? 'width' : 'height'] = `${size}px`; };
      window.addEventListener('pointermove', move, { signal: moving.signal });
      const finish = () => { moving.abort(); if (!destroyed) safe(() => engine.mutate(() => isColumn ? worksheet().setColumnWidth(key, size) : worksheet().setRowHeight(key, size))); refresh(); };
      window.addEventListener('pointerup', finish, { once: true, signal: moving.signal }); window.addEventListener('pointercancel', () => { moving.abort(); refresh(); }, { once: true, signal: moving.signal });
      return;
    }
    const cell = event.target.closest('[data-r][data-c]');
    if (!cell || event.pointerType === 'touch' || event.button || event.target.closest('textarea')) return;
    dragged = false; event.preventDefault(); if (editing || formulaDirty) commit(); setSelection(+cell.dataset.r, +cell.dataset.c, event.shiftKey); scroll.focus({ preventScroll: true });
    const drag = new AbortController();
    window.addEventListener('pointermove', e => { const to = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-r][data-c]'); if (to && scroll.contains(to) && (+to.dataset.r !== selected.r || +to.dataset.c !== selected.c)) { dragged = true; setSelection(+to.dataset.r, +to.dataset.c, true); } }, { signal: drag.signal });
    window.addEventListener('pointerup', () => drag.abort(), { once: true, signal: drag.signal }); window.addEventListener('pointercancel', () => drag.abort(), { once: true, signal: drag.signal });
  }, { signal });
  formula.addEventListener('input', () => { formulaDirty = true; }, { signal });
  formula.addEventListener('blur', () => { if (formulaDirty) commit(formula.value); }, { signal });
  formula.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); commit(formula.value); engine?.flush(); return; }
    if (event.key === 'Enter') { event.preventDefault(); commit(formula.value); formula.blur(); scroll.focus({ preventScroll: true }); }
    if (event.key === 'Escape') { event.preventDefault(); formulaDirty = false; formula.value = rawText(current()); formula.blur(); scroll.focus({ preventScroll: true }); }
  }, { signal });
  scroll.addEventListener('keydown', event => {
    if (!engine || (event.key === 'Tab' && (event.ctrlKey || event.metaKey))) return;
    const input = event.target.closest('[data-sheet-editor]');
    if (input) {
      if (event.key === 'Escape') { event.preventDefault(); editing = null; input.remove(); refresh(); scroll.focus({ preventScroll: true }); return; }
      if ((event.key === 'Enter' && !event.altKey && !event.shiftKey) || event.key === 'Tab') { event.preventDefault(); commit(input.value); setSelection(selected.r + (event.key === 'Enter' ? 1 : 0), selected.c + (event.key === 'Tab' ? event.shiftKey ? -1 : 1 : 0), false, true); scroll.focus({ preventScroll: true }); }
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); void (event.shiftKey ? engine.redo() : engine.undo()); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); void engine.redo(); }
      if (event.key.toLowerCase() === 'a') { event.preventDefault(); selected = { r: 0, c: 0, endR: sheet().rowCount - 1, endC: sheet().columnCount - 1 }; setSelection(selected.endR, selected.endC, true); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); engine.flush(); }
      return;
    }
    const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, event.shiftKey ? -1 : 1], Enter: [1, 0] };
    if (event.key === 'Tab' && ((!event.shiftKey && selected.r === sheet().rowCount - 1 && selected.c === sheet().columnCount - 1) || (event.shiftKey && selected.r === 0 && selected.c === 0))) return;
    if (directions[event.key]) { event.preventDefault(); const [dr, dc] = directions[event.key]; setSelection((event.shiftKey && event.key !== 'Tab' ? selected.endR : selected.r) + dr, (event.shiftKey && event.key !== 'Tab' ? selected.endC : selected.c) + dc, event.shiftKey && event.key !== 'Tab', true); }
    else if (event.key === 'F2') { event.preventDefault(); beginEdit(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); engine.mutate(() => range().clearContent()); }
    else if (event.key.length === 1 && !event.altKey) { event.preventDefault(); beginEdit(event.key); }
  }, { signal });
  scroll.addEventListener('copy', event => {
    if (!engine || event.target.closest('textarea,input')) return;
    const b = bounds(), s = sheet();
    if (b.h * b.w > TABLE_LIMITS.cells) { toast('Select up to 100,000 cells to copy.', true); return; }
    const cells = Array.from({ length: b.h }, (_, r) => Array.from({ length: b.w }, (_, c) => { const cell = structuredClone(s.cellData?.[b.r + r]?.[b.c + c] || {}); if (typeof cell.s === 'string') cell.s = structuredClone(data().workbook.styles[cell.s]); return cell; }));
    const copyData = { format: 1, r: b.r, c: b.c, cells };
    const text = cells.map(row => row.map(rawText).map(value => /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join('\t')).join('\n');
    event.preventDefault(); event.clipboardData.setData('text/plain', text); event.clipboardData.setData('application/x-pencils-table', JSON.stringify(copyData));
  }, { signal });
  scroll.addEventListener('paste', event => {
    if (!engine || event.target.closest('textarea,input')) return;
    event.preventDefault(); safe(() => {
      const payload = event.clipboardData.getData('application/x-pencils-table'), plain = event.clipboardData.getData('text/plain');
      if (payload && payload.length <= TABLE_LIMITS.bytes) {
        const pasted = JSON.parse(payload); if (pasted.format !== 1 || !Array.isArray(pasted.cells) || !pasted.cells.length || !Number.isInteger(pasted.r) || !Number.isInteger(pasted.c)) throw Error('Invalid table clipboard data.');
        const rows = pasted.cells.length, cols = pasted.cells[0].length;
        if (rows * cols > TABLE_LIMITS.cells || selected.r + rows > sheet().rowCount || selected.c + cols > sheet().columnCount || pasted.cells.some(row => !Array.isArray(row) || row.length !== cols)) throw Error('The pasted cells do not fit this worksheet.');
        const cells = structuredClone(pasted.cells);
        const candidate = structuredClone(data()); candidate.workbook.sheets[sid].cellData ||= {};
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (cells[r][c].f) cells[r][c].f = engine.api.getFormula().moveFormulaRefOffset(cells[r][c].f, selected.c - pasted.c, selected.r - pasted.r); (candidate.workbook.sheets[sid].cellData[selected.r + r] ||= {})[selected.c + c] = cells[r][c]; }
        checkTable(candidate, record.id); engine.mutate(() => worksheet().getRange(selected.r, selected.c, rows, cols).setValues(cells));
        setSelection(selected.r + rows - 1, selected.c + cols - 1, true);
      } else if (plain) {
        if (plain.length > TABLE_LIMITS.bytes) throw Error('Paste up to 1.5 MB of table data.');
        const rows = parseTabSeparated(plain), width = Math.max(...rows.map(row => row.length));
        if (selected.r + rows.length > sheet().rowCount || selected.c + width > sheet().columnCount) throw Error('The pasted cells do not fit this worksheet.');
        engine.setValues(sid, selected.r, selected.c, rows); setSelection(selected.r + rows.length - 1, selected.c + width - 1, true);
      }
    });
  }, { signal });
  const ready = (async () => {
    try {
      const [{ createSheetEngine }, table] = await Promise.all([import('/vendor/sheets/deps.js'), load()]);
      if (destroyed) return;
      checkTable(table, record.id);
      engine = createSheetEngine(table, { onChange: value => { try { checkTable(value, record.id); onChange(value); error(''); } catch (problem) { error(problem.message); toast(problem.message, true); } }, onRefresh: refresh });
      sid = storage.get(`table-sheet:${record.id}`, null); if (!table.workbook.sheets[sid]) sid = table.workbook.sheetOrder[0];
      editableControls.forEach(control => { control.disabled = false; });
      render();
    } catch (problem) { if (!destroyed) { scroll.replaceChildren(); error(`${problem.message} Your saved table has not been changed.`); } }
  })();
  return {
    ready, flush() { if (editing || formulaDirty) commit(); engine?.flush(); },
    destroy() { if (editing || formulaDirty) commit(); destroyed = true; resize.disconnect(); lifecycle.abort(); cancelAnimationFrame(frame); engine?.destroy(); },
    value: () => form.elements.body.value,
    escape() { if (editing) { const input = editing.input; editing = null; input.remove(); refresh(); } },
    insert: text => { if (engine) engine.setValue(sid, selected.r, selected.c, text); },
    focus: () => scroll.focus({ preventScroll: true }),
  };
}
