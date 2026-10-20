import { createHash } from "node:crypto";
import Turndown from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { Problem } from "./problem.js";
import { initialStatus } from "../public/workflow-model.js";

const markdown = new Turndown({ headingStyle: "atx", bulletListMarker: "-" });
markdown.use(gfm);
markdown.remove([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
]);
markdown.addRule("safe-link", {
  filter: "a",
  replacement: (content, node) => {
    const href = safeLink(node.getAttribute("href"));
    return href ? `[${content}](${href.replaceAll(")", "%29")})` : content;
  },
});
markdown.addRule("inline-image", {
  filter: "img",
  replacement: (_, n) => n.getAttribute("alt") || "",
});
export const miroMarkdown = (html) =>
  markdown.turndown(String(html || "").slice(0, 200000));
const plain = (html) =>
  miroMarkdown(html)
    .replace(/[*_`#]/g, "")
    .trim();
export const miroId = (board, id) =>
  `miro-${createHash("sha256").update(`${board}:${id}`).digest("hex").slice(0, 24)}`;
export function safeLink(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function miroBoardId(value) {
  let id = String(value || "").trim();
  if (/^https?:/i.test(id)) {
    const url = new URL(id);
    if (url.hostname !== "miro.com" && !url.hostname.endsWith(".miro.com"))
      throw new Problem(400, "Use a Miro board link or board ID.");
    id = decodeURIComponent(
      url.pathname.match(/^\/app\/board\/([^/]+)/)?.[1] || "",
    );
  }
  if (!/^[a-zA-Z0-9_=-]{1,100}$/.test(id))
    throw new Problem(400, "Use a Miro board link or board ID.");
  return id;
}
const colors = {
  gray: "#f5f6f8",
  light_yellow: "#fff9b1",
  yellow: "#f5d128",
  orange: "#ff9d48",
  light_green: "#d5f692",
  green: "#93d275",
  dark_green: "#67c6c0",
  cyan: "#23bfe7",
  light_pink: "#ffcee0",
  pink: "#ea94bb",
  violet: "#b384bb",
  red: "#f16c7f",
  light_blue: "#a6ccf5",
  blue: "#7b92ff",
  dark_blue: "#4262ff",
  black: "#000000",
};
const color = (value, fallback) =>
  /^#[a-f\d]{6}$/i.test(value || "") ? value : colors[value] || fallback;
const nearest = (n, values) =>
  values.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
const shapes = {
  rectangle: "rectangle",
  round_rectangle: "rounded",
  circle: "ellipse",
  ellipse: "ellipse",
  rhombus: "diamond",
  triangle: "triangle",
  parallelogram: "parallelogram",
  hexagon: "hexagon",
};
const caps = {
  none: "none",
  arrow: "arrow",
  stealth: "triangle",
  rounded_stealth: "triangle",
  triangle: "arrow",
  filled_triangle: "triangle",
  diamond: "diamond-outline",
  filled_diamond: "diamond",
  oval: "circle-outline",
  filled_oval: "circle",
  erd_one: "bar",
  erd_only_one: "bar",
};
const validDate = (v) => {
  const d = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    !Number.isNaN(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d
    ? d
    : null;
};

// All external objects become ordinary canvas objects; provenance is descriptive,
// never a live source or a remote write capability.
export function convertMiro(snapshot, options, config, people = []) {
  const board = snapshot.board.id,
    source = new Map(snapshot.items.map((i) => [String(i.id), i]));
  const issues = [...(snapshot.issues || [])],
    nodes = [],
    edges = [],
    positions = new Map();
  const selected = options.frames == null ? null : new Set(options.frames);
  const status = options.status || initialStatus(config);
  const type =
    options.type || (config.types.includes("task") ? "task" : config.types[0]);
  if (!config.statuses.includes(status) || !config.types.includes(type))
    throw new Problem(400, "Choose a task type and status from this project.");
  if (
    selected &&
    (!selected.size ||
      [...selected].some((id) => source.get(id)?.type !== "frame"))
  )
    throw new Problem(400, "Choose at least one available frame.");
  const notice = (item, message, kind = "converted") =>
    issues.push({
      id: String(item.id),
      type: item.type,
      title: plain(item.data?.title || item.data?.content || item.id).slice(
        0,
        120,
      ),
      kind,
      message,
    });
  const included = (item) => {
    if (!selected) return true;
    const visited = new Set();
    while (item && !visited.has(item.id)) {
      if (selected.has(String(item.id))) return true;
      visited.add(item.id);
      item = source.get(String(item.parent?.id));
    }
    return false;
  };
  function geometry(item, trail = new Set()) {
    if (positions.has(item.id)) return positions.get(item.id);
    if (trail.has(item.id))
      throw new Problem(400, "Miro returned a circular frame hierarchy.");
    trail.add(item.id);
    const defaults = {
      frame: [800, 600],
      card: [300, 180],
      app_card: [300, 180],
      sticky_note: [200, 200],
      text: [300, 100],
    }[item.type] || [200, 140];
    const w = Number(item.geometry?.width) || defaults[0],
      h = Number(item.geometry?.height) || defaults[1];
    let x = Number(item.position?.x ?? 0) - w / 2,
      y = Number(item.position?.y ?? 0) - h / 2;
    if (item.position?.relativeTo === "parent_top_left") {
      const parent = source.get(String(item.parent?.id));
      if (!parent)
        throw new Problem(
          400,
          "Miro returned an object without its parent. Reload the board and try again.",
        );
      const g = geometry(parent, trail);
      x += g.x;
      y += g.y;
    }
    if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1)
      throw new Problem(400, "Miro returned invalid object dimensions.");
    const result = {
      x,
      y,
      w,
      h,
      rotation: (Number(item.geometry?.rotation) || 0) % 360,
    };
    positions.set(item.id, result);
    return result;
  }
  for (const item of snapshot.items.filter(included)) {
    const data = item.data || {},
      style = item.style || {},
      url = `https://miro.com/app/board/${encodeURIComponent(board)}/?moveToWidget=${encodeURIComponent(item.id)}`;
    const n = {
      id: miroId(board, item.id),
      ...geometry(item),
      text: miroMarkdown(data.content || data.description || data.title),
      miro: { board, item: String(item.id), type: item.type, url },
    };
    const parent = source.get(String(item.parent?.id));
    if (parent?.type === "frame" && included(parent))
      n.frame = miroId(board, parent.id);
    if (item.type === "sticky_note")
      Object.assign(n, {
        type: "sticky",
        color: color(style.fillColor, "#fff9b1"),
      });
    else if (item.type === "text") n.type = "text";
    else if (item.type === "shape") {
      Object.assign(n, {
        type: "shape",
        shape: shapes[data.shape] || "rectangle",
        color: color(style.fillColor, "#ffffff"),
        borderColor: color(style.borderColor, "#1a1a1a"),
        borderWidth:
          Number(style.borderOpacity) === 0
            ? 0
            : nearest(Number(style.borderWidth) || 2, [0, 1, 2, 3, 5, 8]),
        borderStyle: ["dashed", "dotted"].includes(style.borderStyle)
          ? style.borderStyle
          : "solid",
      });
      if (!shapes[data.shape])
        notice(
          item,
          `${data.shape || "Unknown shape"} becomes a rectangle with its original label.`,
        );
      if (Number(style.fillOpacity) < 1)
        notice(item, "Fill transparency is approximated with a solid colour.");
    } else if (item.type === "frame")
      Object.assign(n, {
        type: "frame",
        text: plain(data.title),
        color: color(style.fillColor, "#f5f6ee"),
      });
    else if (["card", "app_card"].includes(item.type)) {
      const remoteAssignee = String(data.assigneeId || ""),
        assigned = options.assignees?.[remoteAssignee];
      const member = (snapshot.members || []).find(
        (p) => String(p.id) === remoteAssignee,
      );
      const matches = people.filter(
        (p) => p.name.toLocaleLowerCase() === member?.name?.toLocaleLowerCase(),
      );
      const person =
        assigned === ""
          ? null
          : people.find((p) => p.id === assigned) ||
            (matches.length === 1 ? matches[0] : null);
      n.type = "draft";
      n.draft = {
        title: plain(data.title).slice(0, 300) || "Imported card",
        type,
        status,
        priority: "medium",
        assignee: person?.name || "",
        start: validDate(data.startDate),
        due: validDate(data.dueDate),
      };
      if (n.draft.start && n.draft.due && n.draft.start > n.draft.due) {
        notice(
          item,
          "Start date is after the due date; the start date was omitted.",
        );
        n.draft.start = null;
      }
      if (remoteAssignee && !person)
        notice(
          item,
          `Assignee ${member?.name || remoteAssignee} is unmatched; the card will be unassigned.`,
        );
      if (data.fields?.length)
        n.text +=
          "\n\n" +
          data.fields
            .map(
              (f) =>
                `${plain(f.title || f.tooltip || "Field")}: ${plain(f.value)}`,
            )
            .join("\n\n");
      if (item.type === "app_card")
        notice(
          item,
          "App card copied as a local card; its external integration is not imported.",
        );
    } else if (
      ["image", "document"].includes(item.type) &&
      snapshot.assets?.[item.id]
    ) {
      const asset = snapshot.assets[item.id];
      if (item.type === "image")
        Object.assign(n, {
          type: "image",
          src: asset.path,
          text: plain(data.title),
        });
      else
        Object.assign(n, {
          type: "file",
          file: `Projects/${snapshot.project}/${asset.path}`,
          name: plain(data.title) || "Imported document",
        });
    } else if (["embed", "preview"].includes(item.type) && safeLink(data.url)) {
      Object.assign(n, {
        type: "link",
        url: safeLink(data.url),
        name: plain(data.title) || data.url,
      });
      notice(item, "Embedded content becomes a link.");
    } else {
      Object.assign(n, {
        type: "link",
        url,
        name: plain(data.title || data.content) || `Miro ${item.type}`,
      });
      notice(
        item,
        item.mediaError ||
          `${item.type} cannot be read as an editable object; a link at its original position is kept.`,
        "placeholder",
      );
    }
    if (["text", "sticky", "shape"].includes(n.type)) {
      if (["left", "center", "right"].includes(style.textAlign))
        n.textAlign = style.textAlign;
      if (["top", "middle", "bottom"].includes(style.textAlignVertical))
        n.verticalAlign = style.textAlignVertical;
      if (style.fontSize)
        n.fontSize = Math.max(8, Math.min(120, Number(style.fontSize) || 16));
      if (style.color)
        notice(
          item,
          "Text colour follows the Pencils theme for readability.",
          "style",
        );
      if (style.fontFamily)
        notice(
          item,
          "Text uses the available Pencils font; line wrapping may differ.",
          "style",
        );
    }
    nodes.push(n);
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const c of snapshot.connectors) {
    const from = miroId(board, c.startItem?.id),
      to = miroId(board, c.endItem?.id);
    if (!ids.has(from) || !ids.has(to) || from === to) {
      if (!selected || ids.has(from) || ids.has(to))
        notice(
          c,
          "Connector omitted because one or both endpoints are unavailable or outside the selected frames.",
          "skipped",
        );
      continue;
    }
    const s = c.style || {};
    const edge = {
      id: miroId(board, c.id),
      from,
      to,
      label: (c.captions || [])
        .map((t) => plain(t.content))
        .join(" · ")
        .slice(0, 500),
      routing:
        { curved: "curve", elbowed: "elbow", straight: "straight" }[c.shape] ||
        "curve",
      color: color(s.strokeColor, "#1a1a1a"),
      width: nearest(Number(s.strokeWidth) || 1, [1, 2, 3, 5]),
      lineStyle: ["dotted", "dashed"].includes(s.strokeStyle)
        ? s.strokeStyle
        : "solid",
      fromEnd: caps[s.startStrokeCap] || "none",
      toEnd: caps[s.endStrokeCap] || "triangle",
      miro: { board, item: String(c.id) },
    };
    for (const [key, endpoint] of [
      ["fromSide", c.startItem],
      ["toSide", c.endItem],
    ])
      if (["top", "bottom", "left", "right"].includes(endpoint.snapTo))
        edge[key] = endpoint.snapTo;
    if (
      c.isSupported === false ||
      [s.startStrokeCap, s.endStrokeCap].some((v) => v && !caps[v])
    )
      notice(c, "Connector routing or arrow decoration is approximated.");
    edges.push(edge);
  }
  if (nodes.length) {
    const minX = Math.min(...nodes.map((n) => n.x)),
      minY = Math.min(...nodes.map((n) => n.y));
    for (const n of nodes) {
      n.x = Math.round(n.x - minX + 40);
      n.y = Math.round(n.y - minY + 60);
    }
    if (nodes.some((n) => n.x + n.w > 99000 || n.y + n.h > 99000))
      throw new Problem(
        400,
        "This board is too spread out. Import fewer frames at a time.",
      );
  }
  return {
    nodes,
    edges,
    issues,
    counts: Object.fromEntries(
      [...new Set(nodes.map((n) => n.type))].map((type) => [
        type,
        nodes.filter((n) => n.type === type).length,
      ]),
    ),
  };
}
