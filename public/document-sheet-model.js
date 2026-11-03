import { checkRichText, richPlainText } from './document-sheet-richtext.js';
import { csv, markdownTable } from './document-tables.js';

export const TABLE_LIMITS = { sheets: 20, rows: 10000, columns: 200, cells: 100000, bytes: 1500000 };
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw new Error(message); };
export function blankTable(id, name = 'Untitled table') {
  return { format: 1, workbook: { id, name, appVersion: '1.3.1', locale: 'enUS', styles: {}, sheetOrder: ['sheet-1'], sheets: { 'sheet-1': { id: 'sheet-1', name: 'Sheet 1', rowCount: 100, columnCount: 26, defaultRowHeight: 28, defaultColumnWidth: 120, cellData: {}, rowData: {}, columnData: {}, freeze: { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 } } } }, filters: {} };
}
export function checkTable(input, id) {
  let entries = 0, cells = 0;
  function walk(value, depth = 0) {
    if (depth > 16 || ++entries > 1200000) fail('Table data is too complex.');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('Table numbers must be finite.');
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Invalid table property.');
      walk(value[key], depth + 1);
    }
    else if (value !== null && !['string', 'number', 'boolean', 'undefined'].includes(typeof value)) fail('Invalid table value.');
  }
  walk(input);
  if (!object(input) || input.format !== 1 || !object(input.workbook)) fail('Unsupported table format.');
  const book = input.workbook;
  if (book.id !== id || typeof book.name !== 'string' || !book.name.trim() || book.name.length > 300) fail('Invalid table identity.');
  if (!Array.isArray(book.sheetOrder) || !book.sheetOrder.length || book.sheetOrder.length > TABLE_LIMITS.sheets || new Set(book.sheetOrder).size !== book.sheetOrder.length || !object(book.sheets)) fail('Use between 1 and 20 worksheets.');
  const names = new Set();
  for (const sid of book.sheetOrder) {
    const sheet = book.sheets[sid];
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sid) || !object(sheet) || sheet.id !== sid || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 80 || /[\[\]:*?/\\]/.test(sheet.name) || names.has(sheet.name.toLowerCase())) fail('Worksheet names must be unique, up to 80 characters, without []:*?/\\.');
    names.add(sheet.name.toLowerCase());
    if (!Number.isInteger(sheet.rowCount) || sheet.rowCount < 1 || sheet.rowCount > TABLE_LIMITS.rows || !Number.isInteger(sheet.columnCount) || sheet.columnCount < 1 || sheet.columnCount > TABLE_LIMITS.columns) fail('A worksheet supports up to 10,000 rows and 200 columns.');
    if (!object(sheet.cellData)) fail('Invalid worksheet cells.');
    for (const [row, columns] of Object.entries(sheet.cellData)) {
      if (!/^\d+$/.test(row) || +row >= sheet.rowCount || !object(columns)) fail('Cell is outside the worksheet.');
      for (const [column, cell] of Object.entries(columns)) {
        if (!/^\d+$/.test(column) || +column >= sheet.columnCount || !object(cell)) fail('Cell is outside the worksheet.');
        if (++cells > TABLE_LIMITS.cells) fail('A Table supports up to 100,000 populated cells.');
        if (cell.v != null && !['string', 'number', 'boolean'].includes(typeof cell.v)) fail('Invalid cell value.');
        if (typeof cell.v === 'string' && cell.v.length > 32000) fail('A cell supports up to 32,000 characters.');
        if (cell.f != null && (typeof cell.f !== 'string' || !cell.f.startsWith('=') || cell.f.length > 8192)) fail('A formula must start with = and fit within 8,192 characters.');
        if (cell.p != null) checkRichText(cell.p);
      }
    }
    if (sheet.mergeData != null) {
      if (!Array.isArray(sheet.mergeData)) fail('Invalid merged cells.');
      const occupied = new Uint8Array(sheet.mergeData.length ? sheet.rowCount * sheet.columnCount : 0);
      for (const m of sheet.mergeData) {
        if (!object(m) || !['startRow','endRow','startColumn','endColumn'].every(k=>Number.isInteger(m[k])) || m.startRow < 0 || m.startColumn < 0 || m.endRow >= sheet.rowCount || m.endColumn >= sheet.columnCount || m.endRow < m.startRow || m.endColumn < m.startColumn || m.startRow === m.endRow && m.startColumn === m.endColumn) fail('Merged cells must be inside the worksheet and cover at least two cells.');
        for(let r=m.startRow;r<=m.endRow;r++)for(let c=m.startColumn;c<=m.endColumn;c++){const key=r*sheet.columnCount+c;if(occupied[key])fail('Merged cells must not overlap.');occupied[key]=1;}
      }
    }
    for (const [field, bound] of [['rowData', sheet.rowCount], ['columnData', sheet.columnCount]]) if (sheet[field] != null) {
      if (!object(sheet[field])) fail('Invalid row or column settings.');
      for (const [index, value] of Object.entries(sheet[field])) {
        if (!/^\d+$/.test(index) || +index >= bound || !object(value)) fail('Invalid row or column settings.');
        if (value.hd != null && ![0, 1].includes(value.hd)) fail('Invalid hidden row or column.');
        const label = value.custom?.pencilsLabel;
        if (label != null && (typeof label !== 'string' || label.length > 80 || /[\u0000-\u001f]/.test(label))) fail('Row and column names use up to 80 characters.');
        const size = field === 'rowData' ? value.h : value.w;
        if (size != null && (!Number.isFinite(size) || size < 16 || size > 2000)) fail('Row and column sizes must be between 16 and 2,000 pixels.');
      }
    }
    if (sheet.freeze != null && (!object(sheet.freeze) || !Number.isInteger(sheet.freeze.xSplit) || !Number.isInteger(sheet.freeze.ySplit) || sheet.freeze.xSplit < 0 || sheet.freeze.ySplit < 0 || sheet.freeze.xSplit > Math.min(5, sheet.columnCount) || sheet.freeze.ySplit > Math.min(5, sheet.rowCount))) fail('Freeze up to five rows or columns.');
  }
  if (Object.keys(book.sheets).some(sid => !book.sheetOrder.includes(sid))) fail('Invalid worksheet order.');
  if (book.styles != null && (!object(book.styles) || Object.keys(book.styles).length > 10000)) fail('Invalid cell styles.');
  if (input.filters != null) {
    if (!object(input.filters)) fail('Invalid table filters.');
    for (const [sid, filter] of Object.entries(input.filters)) if (!book.sheetOrder.includes(sid) || !object(filter) || Object.entries(filter).some(([col, text]) => !/^\d+$/.test(col) || +col >= book.sheets[sid].columnCount || typeof text !== 'string' || text.length > 300)) fail('Invalid table filters.');
  }
  if (new TextEncoder().encode(JSON.stringify(input)).length > TABLE_LIMITS.bytes) fail('Table data exceeds the 1.5 MB limit. Split it into smaller Tables.');
  return structuredClone(input);
}
export function parseCSV(text, delimiter = ',') {
  if (![',', ';', '\t'].includes(delimiter)) fail('Choose comma, semicolon or tab.');
  const source = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === delimiter || char === '\n') {
      row.push(cell); cell = ''; closed = false;
      if (char === '\n') { rows.push(row); row = []; }
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else if (closed && char !== ' ') fail('Unexpected text after a CSV quote.');
    else if (!closed) cell += char;
  }
  if (quoted) fail('CSV has an unclosed quote.');
  if (!source.endsWith('\n') || !rows.length) { row.push(cell); rows.push(row); }
  if (rows.length > TABLE_LIMITS.rows || rows.some(r => r.length > TABLE_LIMITS.columns)) fail('CSV exceeds the worksheet size limit.');
  return rows;
}
export function tableFromRows(rows, { id, name, sheetName = 'Sheet 1', formulas = false }) {
  const table = blankTable(id, name), sheet = table.workbook.sheets['sheet-1'];
  sheet.name = sheetName; sheet.rowCount = Math.max(100, rows.length); sheet.columnCount = Math.max(26, ...rows.map(r => r.length));
  rows.forEach((row, r) => row.forEach((raw, c) => {
    if (raw === '') return;
    const value = String(raw), numeric = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && !/^0\d/.test(value) && Number.isFinite(+value);
    const cell = formulas && value.startsWith('=') ? { f: value } : { v: numeric && Number.isFinite(+value) ? +value : value, t: numeric ? 2 : 1 };
    (sheet.cellData[r] ||= {})[c] = cell;
  }));
  return checkTable(table, id);
}
export function usedTableRange(sheet) {
  let row = -1, column = -1;
  for (const [r, cells] of Object.entries(sheet.cellData)) for (const [c, cell] of Object.entries(cells)) if (cell && (cell.v != null && cell.v !== '' || cell.f || cell.p && richPlainText(cell.p))) { row = Math.max(row, +r); column = Math.max(column, +c); }
  return { rows: row + 1, columns: column + 1 };
}
export function tableCSV(table, sid, { formulas = false } = {}) {
  const sheet = table.workbook.sheets[sid]; if (!sheet) fail('Worksheet not found.');
  const size = usedTableRange(sheet);
  return csv(Array.from({ length: size.rows }, (_, r) => Array.from({ length: size.columns }, (_, c) => { const cell = sheet.cellData[r]?.[c]; return String(formulas && cell?.f ? cell.f : cell?.t === 3 ? cell.v ? 'TRUE' : 'FALSE' : cell?.p ? richPlainText(cell.p) : cell?.v ?? ''); })));
}
export function tablePreview(table) {
  const literal = value => String(value ?? '').slice(0, 80).replace(/[&<>\\|`*_\[\]~]/g, c => `&#${c.charCodeAt(0)};`);
  return table.workbook.sheetOrder.map(sid => {
    const sheet = table.workbook.sheets[sid], size = usedTableRange(sheet);
    const rows = Array.from({ length: Math.min(size.rows, 10) }, (_, r) => Array.from({ length: Math.min(size.columns, 8) }, (_, c) => literal(sheet.cellData[r]?.[c]?.p ? richPlainText(sheet.cellData[r][c].p) : sheet.cellData[r]?.[c]?.v ?? sheet.cellData[r]?.[c]?.f ?? '')));
    return `### ${literal(sheet.name)}\n\n${rows.length ? markdownTable(rows) : '*Empty worksheet*'}${size.rows > 10 || size.columns > 8 ? '\n\nPreview: first 10 rows and 8 columns.' : ''}`;
  }).join('\n\n');
}
