import { gridMarkdown, validGrid } from "./grid-model.js";
import { arrowHeads } from "./connector-style.js";
// JSON Canvas 1.0 is the on-disk interchange format. Standard fields always win
// over extensions, so edits made by Obsidian are never replaced by stale metadata.
export const palette = {
  1: "#f1a9a0",
  2: "#edc48b",
  3: "#f5e7a2",
  4: "#d6e4d3",
  5: "#aed7dc",
  6: "#d4bee5",
};
const omit = (obj, keys) =>
  Object.fromEntries(
    Object.entries(obj || {}).filter(([k]) => !keys.includes(k)),
  );
export function decodeCanvas(source, defaults = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw new Error("Invalid JSON Canvas document.");
  if (source.nodes !== undefined && !Array.isArray(source.nodes))
    throw new Error("Canvas nodes must be an array.");
  if (source.edges !== undefined && !Array.isArray(source.edges))
    throw new Error("Canvas edges must be an array.");
  const meta = source.pencils || {},
    project = defaults.project || meta.project;
  const nodes = (source.nodes || []).map((n) => {
    const ext = n.pencils || {};
    const node = {
      ...omit(ext, [
        "id",
        "x",
        "y",
        "w",
        "h",
        "text",
        "color",
        "task",
        "src",
        "file",
        "subpath",
        "native",
      ]),
      id: n.id,
      x: n.x,
      y: n.y,
      w: n.width,
      h: n.height,
      native: omit(n, [
        "pencils",
        "id",
        "type",
        "x",
        "y",
        "width",
        "height",
        "text",
        "label",
        "file",
        "subpath",
        "url",
        "color",
      ]),
      color: palette[n.color] || n.color,
    };
    if (palette[n.color]) node.native.color = n.color;
    if (!Object.keys(node.native).length) delete node.native;
    if (!node.color) delete node.color;
    if (n.type === "group")
      Object.assign(node, { type: "frame", text: n.label || "" });
    else if (n.type === "file") {
      const taskMatch = new RegExp(
        `^Projects/${project}/tasks/([a-zA-Z0-9_-]+)\\.md$`,
      ).exec(n.file);
      if (taskMatch) Object.assign(node, { type: "task", task: taskMatch[1] });
      else if (
        n.file?.startsWith(`Projects/${project}/attachments/`) &&
        /\.(png|jpe?g|webp|gif)$/i.test(n.file)
      )
        Object.assign(node, {
          type: "image",
          src: n.file.split("/").slice(2).join("/"),
          text: typeof ext.caption === "string" ? ext.caption : n.file.split("/").pop(),
        });
      else Object.assign(node, { type: "file", file: n.file });
      if (n.subpath) node.subpath = n.subpath;
    } else if (n.type === "link")
      Object.assign(node, { type: "link", url: n.url, text: n.url });
    else if (n.type === "text")
      Object.assign(node, {
        type: ["sticky", "shape", "draw", "query", "grid", "draft"].includes(ext.type)
          ? ext.type
          : "text",
        text: n.text || "",
      });
    else throw new Error(`Unsupported JSON Canvas node type: ${n.type}`);
    if (node.type === "grid" && !validGrid(node.grid))
      throw new Error("Invalid Canvas grid data.");
    if (node.type === "grid" && n.text !== gridMarkdown(node.grid)) {
      node.type = "text"; // An external editor changed the Markdown fallback.
      delete node.grid;
    }
    return node;
  });
  const edges = (source.edges || []).map((e) => ({
    ...omit(e.pencils, ["id", "from", "to", "label", "native"]),
    ...omit(e, ["pencils", "fromNode", "toNode"]),
    id: e.id,
    from: e.fromNode,
    to: e.toNode,
    native: omit(e, [
      "pencils",
      "id",
      "fromNode",
      "toNode",
      "fromSide",
      "toSide",
      "fromEnd",
      "toEnd",
      "color",
      "label",
    ]),
  }));
  for (const [i, e] of edges.entries()) {
    if (!Object.keys(e.native).length) delete e.native;
    // JSON Canvas supports none/arrow. Restore richer shapes only while the
    // native endpoint still matches the arrow fallback written by Pencils.
    for (const key of ["fromEnd", "toEnd"]) {
      const custom = source.edges[i].pencils?.[key];
      if (
        e[key] === "arrow" &&
        !["none", "arrow"].includes(custom) &&
        arrowHeads.some(([value]) => value === custom)
      )
        e[key] = custom;
    }
  }
  // External Markdown edits can turn a grid back into a normal text object.
  // Keep its children at their world positions, without stale cell membership.
  const containers = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes)
    if (
      n.gridCell &&
      !containers.get(n.frame)?.grid?.cells[n.gridCell.row]?.[n.gridCell.column]
    ) {
      delete n.frame;
      delete n.gridCell;
    }
  return {
    ...meta,
    ...defaults,
    kind: "board",
    project,
    title: meta.title || defaults.title || "Canvas",
    nodes,
    edges,
    native: omit(source, ["nodes", "edges", "pencils"]),
  };
}
export function encodeCanvas(board) {
  return {
    ...board.native,
    nodes: board.nodes.map((n) => {
      const result = {
        ...n.native,
        id: n.id,
        x: Math.round(n.x),
        y: Math.round(n.y),
        width: Math.round(n.w),
        height: Math.round(n.h),
      };
      if (n.color)
        result.color =
          palette[n.native?.color] === n.color ? n.native.color : n.color;
      else delete result.color;
      for (const k of ["text", "label", "file", "subpath", "url"])
        delete result[k];
      if (n.type === "frame")
        Object.assign(result, { type: "group", label: n.text || "" });
      else if (["task", "image", "file"].includes(n.type)) {
        Object.assign(result, {
          type: "file",
          file:
            n.type === "task"
              ? `Projects/${board.project}/tasks/${n.task}.md`
              : n.type === "image"
                ? `Projects/${board.project}/${n.src}`
                : n.file,
        });
        if (n.subpath) result.subpath = n.subpath;
      } else if (n.type === "link")
        Object.assign(result, { type: "link", url: n.url });
      else
        Object.assign(result, {
          type: "text",
          text:
            n.type === "grid"
              ? gridMarkdown(n.grid)
              : n.type === "query"
                ? n.text || "Live task view (open in Pencils)"
                : n.text || "",
        });
      result.pencils = omit(n, [
        "native",
        "id",
        "x",
        "y",
        "w",
        "h",
        "text",
        "color",
        "task",
        "src",
        "file",
        "subpath",
        "url",
      ]);
      if(n.type==="image")result.pencils.caption=n.text||"";
      return result;
    }),
    edges: board.edges.map((e) => ({
      ...e.native,
      ...omit(e, [
        "native",
        "from",
        "to",
        "routing",
        "relationship",
        "dependency",
        "projectFrameOwner",
        "planRelation",
        "width",
        "lineStyle",
      ]),
      fromNode: e.from,
      toNode: e.to,
      ...(e.fromEnd
        ? { fromEnd: e.fromEnd === "none" ? "none" : "arrow" }
        : {}),
      ...(e.toEnd ? { toEnd: e.toEnd === "none" ? "none" : "arrow" } : {}),
      pencils: omit(e, [
        "native",
        "id",
        "from",
        "to",
        "fromNode",
        "toNode",
        "fromSide",
        "toSide",
        "color",
        "label",
      ]),
    })),
    pencils: omit(board, [
      "native",
      "nodes",
      "edges",
      "revision",
      "file",
      "body",
    ]),
  };
}
// Heading sections include nested headings; block IDs select a paragraph/list block.
export function markdownSlice(text, subpath = "") {
  if (!subpath) return { start: 0, end: text.length, text };
  const target = subpath.replace(/^#/, ""),
    lines = text.split("\n");
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  if (target.startsWith("^")) {
    const id = target.slice(1),
      index = lines.findIndex((l) =>
        new RegExp(
          `(?:^|\\s)\\^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
        ).test(l),
      );
    if (index < 0) return null;
    let first = index;
    while (
      first > 0 &&
      lines[first - 1].trim() &&
      !/^#{1,6}\s/.test(lines[first - 1])
    )
      first--;
    const start = offsets[first],
      end = Math.min(text.length, offsets[index] + lines[index].length);
    return { start, end, text: text.slice(start, end) };
  }
  let index = -1,
    level = 0,
    fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    if (fenced) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (m && m[2].toLowerCase() === target.toLowerCase()) {
      index = i;
      level = m[1].length;
      break;
    }
  }
  if (index < 0) return null;
  let end = text.length;
  fenced = false;
  for (let i = index + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (!fenced && m && m[1].length <= level) {
      end = offsets[i];
      break;
    }
  }
  return { start: offsets[index], end, text: text.slice(offsets[index], end) };
}
