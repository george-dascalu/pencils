export const isTaskNote = (node) =>
  node.type === "task" && node.displayAs === "note";
export const visualNodeType = (node) =>
  isTaskNote(node) ? "sticky" : node.type === "draft" ? "task" : node.type;
export const nodeFill = (node, fallback = "#ffffff") =>
  node.color || (visualNodeType(node) === "sticky" ? "#f5e7a2" : fallback);
export function readableText(fill) {
  const rgb = /^#[\da-f]{6}$/i.test(fill) ? fill.slice(1).match(/../g).map(v => parseInt(v, 16) / 255) : [1, 1, 1];
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  // Black and white guarantee at least 4.5:1 for every opaque sRGB fill.
  return luminance > .179 ? "#000000" : "#ffffff";
}

export function nodeMinimum(node) {
  if (node.type === "grid")
    return {
      w: node.grid
        ? (node.grid.columns.reduce((a, b) => a + b, 0) /
            Math.min(...node.grid.columns)) *
          80
        : 240,
      h: node.grid
        ? (node.grid.rows.reduce((a, b) => a + b, 0) /
            Math.min(...node.grid.rows)) *
            48 +
          24
        : 168,
    };
  const sizes = {
    task: [220, node.taskCollapsed ? 96 : 180],
    file: [200, 140],
    query: [220, 160],
    sticky: [120, 100],
    text: [100, 64],
    shape: [80, 60],
    frame: [160, 100],
    link: [180, 100],
    image: [80, 60],
    draw: [40, 30],
  };
  const [w, h] = sizes[visualNodeType(node)] || [80, 60];
  return { w, h };
}
export function resizedNode(
  node,
  original,
  dx,
  dy,
  { axis = null, snap = false } = {},
) {
  const min = nodeMinimum(node),
    round = (value) => (snap ? Math.round(value / 20) * 20 : Math.round(value));
  return {
    w:
      axis === "y"
        ? original.w
        : Math.min(100000, Math.max(min.w, round(original.w + dx))),
    h:
      axis === "x"
        ? original.h
        : Math.min(100000, Math.max(min.h, round(original.h + dy))),
  };
}
export function placeholder(node) {
  return (
    {
      frame: "Frame title",
      sticky: "Add a note…",
      text: "Add text…",
      shape: "Add a label…",
      query: "Live tasks",
      image: "Add a caption…",
      draw: "Add a label…",
      link: "Add a link…",
    }[visualNodeType(node)] || "Add notes…"
  );
}
export function defaultText(node) {
  return (
    !node.text ||
    [
      "New frame",
      "A little idea…",
      "Think bigger.",
      "A piece of the plan",
      "Double-click to add your thoughts",
    ].includes(node.text)
  );
}
