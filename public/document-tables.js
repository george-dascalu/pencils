// Tables between documents and spreadsheets: cells copied from Excel, Sheets or Numbers arrive as
// tab-separated text, and a table copies out as CSV.

// Rows of cells from tab-separated text. A cell holding a tab, line break or quote comes quoted,
// with its quotes doubled; a quote that never closes is read as text.
export function parseTabSeparated(text, quotes = true) {
  const rows = [[]];
  let cell = "", quoted = false;
  const source = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (quotes && char === '"' && cell === "") quoted = true;
    else if (char === "\t") { rows.at(-1).push(cell); cell = ""; }
    else if (char === "\n") { rows.at(-1).push(cell); cell = ""; rows.push([]); }
    else cell += char;
  }
  if (quoted) return parseTabSeparated(text, false);
  rows.at(-1).push(cell);
  return rows;
}

// Spreadsheet cells, when pasted text has at least two rows and two columns, every row alike, and
// isn't just lines indented with tabs.
export function spreadsheetRows(text) {
  if (!text.includes("\t")) return null;
  const rows = parseTabSeparated(text);
  return rows.length > 1 && rows[0].length > 1 && rows.every((row) => row.length === rows[0].length) && !rows.every((row) => row[0] === "") ? rows : null;
}

// A Markdown table, with the first row as its header.
export function markdownTable(rows) {
  // Backslashes before a pipe double, so the pipe's own escape still counts.
  const cell = (value) => value.trim().replace(/(\\*)\|/g, "$1$1\\|").replace(/\n/g, "<br>");
  const line = (cells) => `| ${cells.map(cell).join(" | ")} |`;
  return [line(rows[0]), line(rows[0].map(() => "---")), ...rows.slice(1).map(line)].join("\n");
}

// CSV (RFC 4180): a cell with a comma, quote or line break is quoted, its quotes doubled.
export function csv(rows) {
  return rows.map((row) => row.map((value) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(",")).join("\n");
}
