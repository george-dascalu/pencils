import { usedTableRange } from './document-sheet-model.js';
import { renderRichText } from './document-sheet-rich-editor.js';
import { applySheetStyle } from './document-sheet.js';
import { tableEmbedSpec } from './document-embed-model.js';

const columnName = n => { let name = ''; for (n++; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; };
const lower = (prefix, value) => { let a = 0, b = prefix.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (prefix[m] <= value) a = m; else b = m - 1; } return a; };

// A read-only projection of the same workbook/formula engine as Tables. Both axes are windowed.
export function documentTableEmbed(root, engine, fragment) {
  const table = engine.snapshot(), spec = tableEmbedSpec(table, fragment), life = new AbortController();
  let sid = spec.sheets[0], frame, destroyed = false, rows, columns, rowEdges, colEdges;
  root.replaceChildren(); root.classList.add('document-table-embed'); root.contentEditable = 'false';
  const tabs = document.createElement('div'); tabs.className = 'document-embed-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Embedded worksheets');
  const scroll = document.createElement('div'); scroll.className = 'document-embed-grid-scroll'; scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
  root.append(tabs, scroll);
  function layout() {
    const sheet = table.workbook.sheets[sid], used = usedTableRange(sheet);
    for (const m of sheet.mergeData || []) { used.rows = Math.max(used.rows, m.endRow + 1); used.columns = Math.max(used.columns, m.endColumn + 1); }
    const range = spec.range || { r: 0, c: 0, rows: used.rows, columns: used.columns };
    rows = Array.from({ length: range.rows }, (_, i) => i + range.r).filter(r => sheet.rowData?.[r]?.hd !== 1);
    columns = Array.from({ length: range.columns }, (_, i) => i + range.c).filter(c => sheet.columnData?.[c]?.hd !== 1);
    rowEdges = [0]; for (const r of rows) rowEdges.push(rowEdges.at(-1) + Math.max(28, Math.min(240, sheet.rowData?.[r]?.h || sheet.defaultRowHeight || 28)));
    colEdges = [0]; for (const c of columns) colEdges.push(colEdges.at(-1) + Math.max(48, Math.min(400, sheet.columnData?.[c]?.w || sheet.defaultColumnWidth || 120)));
    scroll.setAttribute('aria-label', `Embedded worksheet: ${sheet.name}`);
    tabs.replaceChildren(); tabs.hidden = spec.sheets.length < 2;
    for (const id of spec.sheets) {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'tab'); button.textContent = table.workbook.sheets[id].name; button.setAttribute('aria-selected', String(id === sid));
      button.addEventListener('click', () => { sid = id; scroll.scrollTop = scroll.scrollLeft = 0; layout(); render(); }, { signal: life.signal }); tabs.append(button);
    }
  }
  function render() {
    if (destroyed || !root.isConnected) return;
    if (!rows.length || !columns.length) { const empty = document.createElement('p'); empty.className = 'field-hint'; empty.textContent = 'Empty worksheet'; scroll.replaceChildren(empty); return; }
    const top = scroll.scrollTop, left = scroll.scrollLeft, sheet = table.workbook.sheets[sid];
    const firstR = Math.max(0, lower(rowEdges, top) - 3), endR = Math.min(rows.length, lower(rowEdges, top + (scroll.clientHeight || 280)) + 5);
    const firstC = Math.max(0, lower(colEdges, left) - 2), endC = Math.min(columns.length, lower(colEdges, left + (scroll.clientWidth || 600)) + 4);
    const grid = document.createElement('table'); grid.className = 'document-embed-grid'; grid.setAttribute('aria-label', sheet.name); grid.style.width = `${42 + colEdges.at(-1)}px`;
    const group = document.createElement('colgroup');
    const widths = [42, ...(firstC ? [colEdges[firstC]] : []), ...columns.slice(firstC, endC).map((_, i) => colEdges[firstC + i + 1] - colEdges[firstC + i]), ...(endC < columns.length ? [colEdges.at(-1) - colEdges[endC]] : [])];
    for (const width of widths) { const col = document.createElement('col'); col.style.width = `${width}px`; group.append(col); } grid.append(group);
    const head = grid.createTHead().insertRow(), corner = document.createElement('th'); corner.setAttribute('aria-label', 'Row'); head.append(corner);
    const pad = row => { const cell = row.insertCell(); cell.className = 'document-embed-spacer'; cell.setAttribute('aria-hidden', 'true'); };
    if (firstC) pad(head);
    for (const c of columns.slice(firstC, endC)) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = sheet.columnData?.[c]?.custom?.pencilsLabel || columnName(c); head.append(th); }
    if (endC < columns.length) pad(head);
    const body = grid.createTBody(), spacer = height => { if (height <= 0) return; const row = body.insertRow(), cell = row.insertCell(); cell.colSpan = widths.length; cell.className = 'document-embed-spacer'; cell.style.height = `${height}px`; cell.setAttribute('aria-hidden', 'true'); };
    spacer(rowEdges[firstR]);
    const merged = new Map();
    for (const m of sheet.mergeData || []) {
      const rr = rows.slice(firstR, endR).map((r, i) => r >= m.startRow && r <= m.endRow ? firstR + i : -1).filter(i => i >= 0);
      const cc = columns.slice(firstC, endC).map((c, i) => c >= m.startColumn && c <= m.endColumn ? firstC + i : -1).filter(i => i >= 0);
      for (const ri of rr) for (const ci of cc) merged.set(`${ri}:${ci}`, { m, anchor: ri === rr[0] && ci === cc[0], rows: rr.length, columns: cc.length });
    }
    let display; try { display = engine.sheet(sid).getRange(rows[firstR], columns[firstC], rows[endR - 1] - rows[firstR] + 1, columns[endC - 1] - columns[firstC] + 1).getDisplayValues(); } catch { display = []; }
    for (let ri = firstR; ri < endR; ri++) {
      const r = rows[ri], tr = body.insertRow(), label = document.createElement('th'), height = rowEdges[ri + 1] - rowEdges[ri]; tr.style.height = `${height}px`;
      label.scope = 'row'; label.textContent = sheet.rowData?.[r]?.custom?.pencilsLabel || String(r + 1); tr.append(label); if (firstC) pad(tr);
      for (let ci = firstC; ci < endC; ci++) {
        const merge = merged.get(`${ri}:${ci}`); if (merge && !merge.anchor) continue;
        const c = columns[ci], row = merge ? merge.m.startRow : r, col = merge ? merge.m.startColumn : c;
        const cell = sheet.cellData?.[row]?.[col] || {}, td = tr.insertCell(), text = document.createElement('span');
        td.dataset.embedCell = `${columnName(col)}${row + 1}`; text.className = 'document-embed-cell-text'; text.style.maxHeight = `${merge ? 232 : height - 8}px`;
        if (merge) { td.rowSpan = merge.rows; td.colSpan = merge.columns; }
        if (cell.p) renderRichText(text, cell.p); else text.textContent = merge ? engine.sheet(sid).getRange(row, col, 1, 1).getDisplayValues()[0][0] : display[r - rows[firstR]]?.[c - columns[firstC]] ?? String(cell.v ?? '');
        td.append(text); applySheetStyle(td, typeof cell.s === 'string' ? table.workbook.styles[cell.s] : cell.s); td.title = td.textContent;
      }
      if (endC < columns.length) pad(tr);
    }
    spacer(rowEdges.at(-1) - rowEdges[endR]); scroll.replaceChildren(grid); scroll.scrollTop = top; scroll.scrollLeft = left;
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = null; render(); }); };
  scroll.addEventListener('scroll', schedule, { passive: true, signal: life.signal });
  const observer = new ResizeObserver(schedule); observer.observe(scroll);
  layout(); render();
  return { destroy() { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); life.abort(); } };
}
