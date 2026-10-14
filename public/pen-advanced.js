import { makeStroke, penStyle } from "./pen-model.js";
export function partialErase(n, from, to, radius, uid) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    near = (p) => {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - from.x) * dx + (p.y - from.y) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      return (
        Math.hypot(p.x - from.x - t * dx, p.y - from.y - t * dy) <=
        radius + penStyle(n).strokeWidth * 0.65
      );
    };
  const samples = [];
  for (let i = 0; i < n.points.length; i++) {
    const p = n.points[i],
      prev = n.points[Math.max(0, i - 1)],
      steps = i
        ? Math.min(
            200,
            Math.max(
              1,
              Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 4),
            ),
          )
        : 1;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      samples.push({
        x: n.x + prev[0] + (p[0] - prev[0]) * t,
        y: n.y + prev[1] + (p[1] - prev[1]) * t,
        pressure:
          (n.pressures?.[i - 1] ?? 0.5) * (1 - t) +
          (n.pressures?.[i] ?? 0.5) * t,
      });
    }
  }
  if (n.rotation) {
    const a = (n.rotation * Math.PI) / 180,
      cx = n.x + n.w / 2,
      cy = n.y + n.h / 2;
    for (const p of samples) {
      const x = p.x - cx,
        y = p.y - cy;
      p.x = cx + x * Math.cos(a) - y * Math.sin(a);
      p.y = cy + x * Math.sin(a) + y * Math.cos(a);
    }
  }
  if (!samples.some(near)) return [n];
  const parts = [];
  let part = [];
  for (const p of samples) {
    if (near(p)) {
      if (part.length) parts.push(part);
      part = [];
    } else part.push(p);
  }
  if (part.length) parts.push(part);
  return parts.map((p, i) => ({
    ...n,
    ...makeStroke(p.slice(0, 10000), n, i === 0 ? n.id : uid("n")),
    rotation: 0,
  }));
}
export function recogniseStroke(n) {
  if (n.points.length < 3) return n;
  const points = n.points,
    first = points[0],
    last = points.at(-1),
    closed =
      Math.hypot(first[0] - last[0], first[1] - last[1]) <
      Math.min(n.w, n.h) * 0.25;
  if (!closed) {
    const dx = last[0] - first[0],
      dy = last[1] - first[1],
      length = Math.hypot(dx, dy);
    if (
      length > 40 &&
      points.every(
        (p) =>
          Math.abs((p[0] - first[0]) * dy - (p[1] - first[1]) * dx) / length <
          8,
      )
    )
      return {
        ...n,
        points: [first, last],
        pressures: [0.5, 0.5],
        pressure: false,
      };
    return n;
  }
  if (Math.min(n.w, n.h) < 50) return n;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys),
    cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  const rectScore =
    points.filter(
      (p) =>
        Math.min(
          Math.abs(p[0] - left),
          Math.abs(p[0] - right),
          Math.abs(p[1] - top),
          Math.abs(p[1] - bottom),
        ) <
        Math.min(n.w, n.h) * 0.1,
    ).length / points.length;
  const ellipseScore =
    points.filter(
      (p) =>
        Math.abs(
          (((p[0] - cx) / (right - left)) * 2) ** 2 +
            (((p[1] - cy) / (bottom - top)) * 2) ** 2 -
            1,
        ) < 0.3,
    ).length / points.length;
  if (Math.max(rectScore, ellipseScore) < 0.8) return n;
  return {
    id: n.id,
    type: "shape",
    shape: rectScore > ellipseScore ? "rectangle" : "ellipse",
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    text: "",
    color: "#ffffff",
    borderColor: n.color,
    borderWidth: [1, 2, 3, 5, 8].reduce(
      (a, b) =>
        Math.abs(b - n.strokeWidth) < Math.abs(a - n.strokeWidth) ? b : a,
      2,
    ),
  };
}
export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function lassoTool(ctx, basic) {
  let drag = null;
  const { state, $, board } = ctx;
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        state.tool !== "lasso" ||
        !e.target.closest("#canvas") ||
        e.target.closest(
          "button,input,select,.canvas-panel,#selection-tools",
        ) ||
        e.button !== 0
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      drag = { id: e.pointerId, points: [basic.point(e)] };
      $("#canvas-world").insertAdjacentHTML(
        "beforeend",
        '<svg id="lasso-path" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none"><path fill="#78906f22" stroke="#78906f" stroke-dasharray="6 4"/></svg>',
      );
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      drag.points.push(basic.point(e));
      $("#lasso-path path")?.setAttribute(
        "d",
        `M${drag.points.map((p) => `${p.x},${p.y}`).join(" L")} Z`,
      );
    },
    true,
  );
  function end(e, cancel = false) {
    if (!drag || (e?.pointerId != null && e.pointerId !== drag.id)) return;
    e?.stopImmediatePropagation();
    const p = drag.points;
    drag = null;
    $("#lasso-path")?.remove();
    if (!cancel) {
      const nodes = board().nodes.filter(
        (n) =>
          !n.layerHidden &&
          pointInPolygon({ x: n.x + n.w / 2, y: n.y + n.h / 2 }, p),
      );
      basic.selected.clear();
      nodes.forEach((n) => basic.selected.add(n.id));
      state.selectedNode = nodes[0]?.id || null;
      {
        state.selectedEdge = null;
        state.selectedEdges?.clear();
      }
      state.tool = "cursor";
      ctx.renderView();
      basic.focusSelection();
    }
  }
  document.addEventListener("pointerup", (e) => end(e), true);
  document.addEventListener("pointercancel", (e) => end(e, true), true);
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") end(e, true);
    },
    true,
  );
  window.addEventListener("blur", () => end(null, true));
}
