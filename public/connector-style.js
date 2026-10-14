// Used by the canvas, drag preview, toolbar samples and SVG/PNG exports.
export const arrowHeads = [
  ["none", "None"],
  ["arrow", "Open arrow"],
  ["triangle", "Filled triangle"],
  ["circle", "Filled circle"],
  ["circle-outline", "Open circle"],
  ["diamond", "Filled diamond"],
  ["diamond-outline", "Open diamond"],
  ["bar", "Bar"],
];
export function headShape(kind) {
  switch (kind) {
    case "arrow":
      return '<path d="M1 1L9 5L1 9" fill="none"/>';
    case "triangle":
      return '<path d="M1 1L9 5L1 9Z"/>';
    case "circle":
    case "circle-outline":
      return `<circle cx="5" cy="5" r="4" ${kind.endsWith("outline") ? 'fill="none"' : ""}/>`;
    case "diamond":
    case "diamond-outline":
      return `<path d="M1 5L5 1L9 5L5 9Z" ${kind.endsWith("outline") ? 'fill="none"' : ""}/>`;
    case "bar":
      return '<path d="M9 0V10" fill="none"/>';
    default:
      return "";
  }
}
export function headSample(kind, start = false) {
  return `<svg class="connector-sample" viewBox="0 0 44 20" aria-hidden="true"><g ${start ? 'transform="translate(44 0) scale(-1 1)"' : ""} stroke="currentColor" fill="currentColor" stroke-width="1.3"><path d="M3 10H32" fill="none"/><g transform="translate(30 5)">${headShape(kind)}</g></g></svg>`;
}
export function connectorStyle(edge, color, esc, prefix = "edge") {
  const id =
    prefix +
    "-" +
    Array.from(edge.id || "draft", (c) => c.codePointAt(0).toString(16)).join(
      "-",
    );
  const markers = {};
  let defs = "",
    attrs = "";
  for (const [end, key, fallback] of [
    ["start", "fromEnd", "none"],
    ["end", "toEnd", "arrow"],
  ]) {
    const shape = headShape(edge[key] || fallback);
    if (!shape) continue;
    const marker = `${id}-${end}`;
    defs += `<marker id="${marker}" viewBox="0 0 10 10" markerWidth="7" markerHeight="7" refX="9" refY="5" orient="auto-start-reverse" overflow="visible"><g fill="${esc(color)}" stroke="${esc(color)}" stroke-width="1.2">${shape}</g></marker>`;
    markers[`marker-${end}`] = `url(#${marker})`;
    attrs += ` marker-${end}="url(#${marker})"`;
  }
  const width = [1, 2, 3, 5].includes(edge.width) ? edge.width : 2;
  const dash = { dashed: "8 5", dotted: "1 5" }[edge.lineStyle] || "none";
  return {
    defs,
    markers,
    width,
    dash,
    attrs: `${attrs} style="stroke-width:${width};stroke-dasharray:${dash}"`,
  };
}
