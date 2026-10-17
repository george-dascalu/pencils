import { mergedCell, validMerges, unmergeGrid } from "./grid-merge.js";
// Grid content stays portable Markdown; layout and cell styling are Canvas metadata.
export const GRID_LIMIT = 30;
export const GRID_DEFAULT_SIZE = { w: 540, h: 312 };
export function newGrid(rows = 3, columns = 3) {
  return {
    rows: Array(rows).fill(96),
    columns: Array(columns).fill(180),
    cells: Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ({ text: "" })),
    ),
    header: true,
  };
}
export function validGrid(g) {
  return (
    !!g &&
    (g.title == null ||
      (typeof g.title === "string" &&
        g.title.length <= 300 &&
        !/[\r\n]/.test(g.title))) &&
    validMerges(g) &&
    [g.rows, g.columns].every(
      (a) =>
        Array.isArray(a) &&
        a.length >= 1 &&
        a.length <= GRID_LIMIT &&
        a.every((v) => Number.isFinite(v) && v >= 1 && v <= 100000),
    ) &&
    typeof g.header === "boolean" &&
    Array.isArray(g.cells) &&
    g.cells.length === g.rows.length &&
    g.cells.every(
      (row) =>
        Array.isArray(row) &&
        row.length === g.columns.length &&
        row.every(
          (c) =>
            c &&
            typeof c.text === "string" &&
            c.text.length <= 6000 &&
            ["bold", "italic", "strike"].every(
              (key) => c[key] == null || typeof c[key] === "boolean",
            ) &&
            (c.fontSize == null ||
              (Number.isFinite(c.fontSize) &&
                c.fontSize >= 8 &&
                c.fontSize <= 144)) &&
            (c.verticalAlign == null ||
              ["auto", "top", "middle", "bottom"].includes(c.verticalAlign)) &&
            (c.autoFit == null || typeof c.autoFit === "boolean") &&
            (c.fontFamily == null ||
              [
                "inherit",
                "Manrope",
                "DM Sans",
                "Space Grotesk",
                "Outfit",
                "Sora",
                "Work Sans",
                "Lora",
                "Fraunces",
              ].includes(c.fontFamily)) &&
            (c.color == null || /^#[a-f0-9]{6}$/i.test(c.color)) &&
            (c.align == null ||
              ["left", "center", "right", "justify"].includes(c.align)),
        ),
    ) &&
    gridMarkdown(g).length <= 200000
  );
}
export function gridMarkdown(g) {
  const row = (cells) =>
    `| ${cells.map((c) => c.text.replaceAll("|", "\\|").replaceAll("\n", "<br>")).join(" | ")} |`;
  return [
    ...(g.title
      ? [`## ${g.title.replace(/[\\`*_{}\[\]<>()#+.!|~-]/g, "\\$&")}`, ""]
      : []),
    row(g.cells[0]),
    `| ${g.columns.map(() => "---").join(" | ")} |`,
    ...g.cells.slice(1).map(row),
  ].join("\n");
}
export function syncGrid(n) {
  const text = gridMarkdown(n.grid);
  if (text.length > 200000)
    throw new Error(
      "This grid is full (200,000 Markdown characters). Split the content into another grid.",
    );
  n.text = text;
}
export function gridTracks(n) {
  const scale = (values, size) => {
    const sum = values.reduce((a, b) => a + b, 0);
    return values.map((v) => (v / sum) * size);
  };
  return {
    rows: scale(n.grid.rows, n.h - 24),
    columns: scale(n.grid.columns, n.w),
  };
}
// Border resizing uses the gesture's original geometry, never cumulative deltas.
// An individual track grows the grid; an outside edge scales all tracks.
export function resizeGrid(n, original, axis, at, delta, edge, children = []) {
  const tracks = gridTracks(original),
    sizes = tracks[axis],
    columns = axis === "columns",
    sizeKey = columns ? "w" : "h",
    posKey = columns ? "x" : "y",
    coord = columns ? "column" : "row",
    minimum = sizes.map(() => (columns ? 80 : 48)),
    limit = columns ? 100000 : 99976;
  for (const child of children) {
    if (child.frame !== original.id || !child.gridCell) continue;
    const i = child.gridCell[coord];
    if (i >= 0 && i < minimum.length)
      minimum[i] = Math.max(minimum[i], child[sizeKey] + 32);
  }
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (edge) {
    const reverse = edge === "left" || edge === "top",
      minScale = Math.max(...minimum.map((v, i) => v / sizes[i])),
      scale = Math.min(
        limit / sum,
        Math.max(minScale, (sum + delta * (reverse ? -1 : 1)) / sum),
      );
    tracks[axis] = sizes.map((v) => v * scale);
  } else {
    sizes[at] = Math.max(
      minimum[at],
      Math.min(limit - sum + sizes[at], sizes[at] + delta),
    );
  }
  n.grid.rows = tracks.rows;
  n.grid.columns = tracks.columns;
  n.w = tracks.columns.reduce((a, b) => a + b, 0);
  n.h = 24 + tracks.rows.reduce((a, b) => a + b, 0);
  n.x = original.x;
  n.y = original.y;
  if (edge === "left" || edge === "top")
    n[posKey] += original[sizeKey] - n[sizeKey];
  return tracks[axis];
}
export function editGrid(n, axis, action, at) {
  unmergeGrid(n.grid);
  const g = n.grid,
    rows = axis === "rows",
    tracks = g[axis];
  at = Math.max(0, Math.min(tracks.length - 1, at));
  if (action === "add") {
    if (tracks.length >= GRID_LIMIT)
      throw new Error(`A grid supports up to ${GRID_LIMIT} rows and columns.`);
    const sizes = gridTracks(n)[axis],
      size = sizes[at];
    // Keep every existing cell at its current visual size.
    g[axis] = sizes;
    g[axis].splice(at + 1, 0, size);
    if (rows) {
      g.cells.splice(
        at + 1,
        0,
        g.columns.map(() => ({ text: "" })),
      );
      n.h += size;
    } else {
      g.cells.forEach((row) => row.splice(at + 1, 0, { text: "" }));
      n.w += size;
    }
  } else if (action === "remove") {
    if (tracks.length === 1) return;
    const sizes = gridTracks(n)[axis],
      size = sizes[at];
    g[axis] = sizes;
    g[axis].splice(at, 1);
    if (rows) {
      g.cells.splice(at, 1);
      n.h -= size;
    } else {
      g.cells.forEach((row) => row.splice(at, 1));
      n.w -= size;
    }
  } else {
    const to = at + (action === "previous" ? -1 : 1);
    if (to < 0 || to >= tracks.length) return;
    [tracks[at], tracks[to]] = [tracks[to], tracks[at]];
    if (rows) [g.cells[at], g.cells[to]] = [g.cells[to], g.cells[at]];
    else
      g.cells.forEach((row) => {
        [row[at], row[to]] = [row[to], row[at]];
      });
    at = to;
  }
  syncGrid(n);
  return at;
}
// Quoted TSV from spreadsheets may contain tabs and newlines inside a cell.
export function parseGridPaste(text) {
  const rows = [[]];
  let value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || value === "")) {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "\t" || c === "\n" || c === "\r")) {
      rows.at(-1).push(value);
      value = "";
      if (c !== "\t") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        rows.push([]);
      }
    } else value += c;
  }
  rows.at(-1).push(value);
  if (rows.length > 1 && rows.at(-1).length === 1 && rows.at(-1)[0] === "")
    rows.pop();
  return rows;
}
export function pasteGrid(n, text, r, c) {
  const values = parseGridPaste(text),
    nr = r + values.length,
    nc = c + Math.max(...values.map((row) => row.length));
  if (
    nr > GRID_LIMIT ||
    nc > GRID_LIMIT ||
    values.some((row) => row.some((v) => v.length > 6000))
  )
    throw new Error(
      "Paste exceeds the grid limit (30 × 30 cells; 6,000 characters per cell).",
    );
  while (n.grid.rows.length < nr)
    editGrid(n, "rows", "add", n.grid.rows.length - 1);
  while (n.grid.columns.length < nc)
    editGrid(n, "columns", "add", n.grid.columns.length - 1);
  values.forEach((row, ri) =>
    row.forEach((text, ci) => {
      n.grid.cells[r + ri][c + ci].text = text;
    }),
  );
  syncGrid(n);
}
export function gridCSV(g) {
  return g.cells
    .map((row) =>
      row.map((c) => '"' + c.text.replaceAll('"', '""') + '"').join(","),
    )
    .join("\r\n");
}

export function gridSVG(n, esc) {
  const tracks = gridTracks(n);
  let y = 24,
    out = `<rect width="${n.w}" height="${n.h}" fill="${n.color || "#ffffff"}" stroke="#82937d"/><text x="10" y="16" font-size="11">Grid</text>`;
  n.grid.cells.forEach((row, r) => {
    let x = 0;
    row.forEach((cell, c) => {
      const merged = mergedCell(n.grid, r, c);
      if (merged && (merged.row !== r || merged.column !== c)) {
        x += tracks.columns[c];
        return;
      }
      const w = tracks.columns
          .slice(c, c + (merged?.columns || 1))
          .reduce((a, b) => a + b, 0),
        h = tracks.rows
          .slice(r, r + (merged?.rows || 1))
          .reduce((a, b) => a + b, 0),
        id = `grid-${n.id}-${r}-${c}`,
        align = cell.align || n.textAlign || "left",
        anchor =
          align === "center" ? "middle" : align === "right" ? "end" : "start",
        tx =
          align === "center"
            ? x + w / 2
            : align === "right"
              ? x + w - 16
              : x + 16;
      out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${cell.color || n.color || (n.grid.header && r === 0 ? "#edf1e8" : "#ffffff")}" stroke="#c9d1c3"/><clipPath id="${esc(id)}"><rect x="${x + 8}" y="${y + 4}" width="${Math.max(1, w - 16)}" height="${Math.max(1, h - 8)}"/></clipPath><g clip-path="url(#${esc(id)})">`;
      const fontSize = cell.fontSize || n.fontSize || 14,
        chars = Math.max(1, Math.floor((w - 32) / (fontSize * 0.57))),
        lines = cell.text
          .split("\n")
          .flatMap(
            (t) =>
              t.match(
                new RegExp(`.{1,${chars}}(?:\\s|$)|.{1,${chars}}`, "g"),
              ) || [""],
          );
      const lineHeight = fontSize * 1.5,
        vertical = cell.verticalAlign || n.verticalAlign,
        offset =
          vertical === "bottom"
            ? Math.max(16, h - lines.length * lineHeight - 16)
            : vertical === "middle"
              ? Math.max(16, (h - lines.length * lineHeight) / 2)
              : 16;
      out +=
        lines
          .slice(0, Math.ceil(h / lineHeight))
          .map(
            (t, i) =>
              `<text x="${tx}" y="${y + offset + fontSize + i * lineHeight}" font-size="${fontSize}" font-family="${esc(cell.fontFamily || n.fontFamily || "sans-serif")}" font-weight="${cell.bold ? "700" : "normal"}" font-style="${cell.italic ? "italic" : "normal"}" text-decoration="${cell.strike ? "line-through" : "none"}" text-anchor="${anchor}" fill="#263c34">${esc(t)}</text>`,
          )
          .join("") + "</g>";
      x += tracks.columns[c];
    });
    y += tracks.rows[r];
  });
  return out;
}

export function cellBounds(n, row, column) {
  const t = gridTracks(n),
    m = mergedCell(n.grid, row, column),
    anchor = m && m.row === row && m.column === column;
  return {
    x: n.x + t.columns.slice(0, column).reduce((a, b) => a + b, 0),
    y: n.y + 24 + t.rows.slice(0, row).reduce((a, b) => a + b, 0),
    w: anchor
      ? t.columns.slice(column, column + m.columns).reduce((a, b) => a + b, 0)
      : t.columns[column],
    h: anchor
      ? t.rows.slice(row, row + m.rows).reduce((a, b) => a + b, 0)
      : t.rows[row],
  };
}
export function cellAt(n, x, y) {
  if (x < n.x || x >= n.x + n.w || y < n.y + 24 || y >= n.y + n.h) return null;
  const t = gridTracks(n);
  const index = (sizes, p) => {
    let at = 0;
    for (let i = 0; i < sizes.length; i++) {
      at += sizes[i];
      if (p < at) return i;
    }
    return sizes.length - 1;
  };
  const row = index(t.rows, y - n.y - 24),
    column = index(t.columns, x - n.x),
    m = mergedCell(n.grid, row, column);
  return m ? { row: m.row, column: m.column } : { row, column };
}
export function moveGridTrack(n, axis, from, to) {
  if (from === to || to < 0 || to >= n.grid[axis].length) return;
  unmergeGrid(n.grid);
  const move = (a) => a.splice(to, 0, a.splice(from, 1)[0]);
  move(n.grid[axis]);
  if (axis === "rows") move(n.grid.cells);
  else n.grid.cells.forEach(move);
  syncGrid(n);
}
export function movedTrackIndex(index, from, to) {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}
