import { documentReference } from './document-model.js';

export function embedReference(record, fragment = '') {
  const suffix = Array.isArray(fragment) ? fragment.map(encodeURIComponent).join('#') : encodeURIComponent(fragment).replaceAll('%21', '!').replaceAll('%3A', ':');
  return `![[${documentReference(record)}${suffix ? '#' + suffix : ''}]]`;
}
export function tableEmbedSpec(table, fragment = '') {
  const book = table.workbook;
  if (!fragment) return { sheets: [...book.sheetOrder], range: null };
  let value;
  try { value = decodeURIComponent(fragment.replace(/^#/, '')); } catch { throw Error('Invalid worksheet reference.'); }
  const named = name => book.sheetOrder.find(id => book.sheets[id].name.toLocaleLowerCase() === name.toLocaleLowerCase() || id === name);
  const exact = named(value);
  if (exact) return { sheets: [exact], range: null };
  const bang = value.lastIndexOf('!'), sid = bang < 0 ? book.sheetOrder[0] : named(value.slice(0, bang));
  if (!sid) throw Error('Worksheet not found.');
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,4})(?::\$?([A-Z]{1,3})\$?([1-9]\d{0,4}))?$/i.exec(bang < 0 ? value : value.slice(bang + 1));
  if (!match) throw Error('Choose a worksheet or a cell range such as Sheet 1!A1:D12.');
  const col = name => [...name.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const r = +match[2] - 1, c = col(match[1]), endR = +(match[4] || match[2]) - 1, endC = col(match[3] || match[1]), sheet = book.sheets[sid];
  if (endR < r || endC < c || endR >= sheet.rowCount || endC >= sheet.columnCount) throw Error('Choose a range within the worksheet, from its top-left to bottom-right cell.');
  return { sheets: [sid], range: { r, c, rows: endR - r + 1, columns: endC - c + 1 } };
}
