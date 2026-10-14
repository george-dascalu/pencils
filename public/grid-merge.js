export function mergedCell(g, r, c) {
  return (g.merges || []).find(
    (m) =>
      r >= m.row &&
      r < m.row + m.rows &&
      c >= m.column &&
      c < m.column + m.columns,
  );
}
export function validMerges(g) {
  if (!Array.isArray(g.rows) || !Array.isArray(g.columns)) return false;
  if (g.resizeMode != null && !["auto", "manual"].includes(g.resizeMode))
    return false;
  if (g.merges == null) return true;
  if (!Array.isArray(g.merges) || g.merges.length > 450) return false;
  const used = new Set();
  for (const m of g.merges) {
    if (
      !m ||
      ![m.row, m.column, m.rows, m.columns].every(Number.isInteger) ||
      m.row < 0 ||
      m.column < 0 ||
      m.rows < 1 ||
      m.columns < 1 ||
      m.row + m.rows > g.rows.length ||
      m.column + m.columns > g.columns.length ||
      typeof m.originalText !== "string" ||
      typeof m.combinedText !== "string" ||
      m.originalText.length > 6000 ||
      m.combinedText.length > 6000
    )
      return false;
    for (let r = m.row; r < m.row + m.rows; r++)
      for (let c = m.column; c < m.column + m.columns; c++) {
        const k = `${r}:${c}`;
        if (used.has(k)) return false;
        used.add(k);
      }
  }
  return true;
}
export function unmergeGrid(g, selected = null) {
  g.merges = (g.merges || []).filter((m) => {
    if (
      selected &&
      !selected.some(
        ([r, c]) =>
          r >= m.row &&
          r < m.row + m.rows &&
          c >= m.column &&
          c < m.column + m.columns,
      )
    )
      return true;
    const cell = g.cells[m.row][m.column];
    if (cell.text === m.combinedText) cell.text = m.originalText;
    return false;
  });
}
export function mergeGrid(g, cells) {
  if (cells.length < 2) throw Error("Select at least two cells to merge.");
  const rs = cells.map((c) => c[0]),
    cs = cells.map((c) => c[1]),
    row = Math.min(...rs),
    column = Math.min(...cs),
    rows = Math.max(...rs) - row + 1,
    columns = Math.max(...cs) - column + 1;
  if (rows * columns !== new Set(cells.map((c) => c.join(":"))).size)
    throw Error("Select a complete rectangle of cells.");
  const merged = structuredClone(g);
  unmergeGrid(merged, cells);
  const originalText = merged.cells[row][column].text;
  const combinedText = merged.cells
    .slice(row, row + rows)
    .flatMap((r) => r.slice(column, column + columns).map((c) => c.text))
    .filter(Boolean)
    .join("\n\n");
  if (combinedText.length > 6000)
    throw Error("Merged text exceeds 6,000 characters.");
  merged.cells[row][column].text = combinedText;
  (merged.merges ||= []).push({
    row,
    column,
    rows,
    columns,
    originalText,
    combinedText,
  });
  Object.assign(g, merged);
}
