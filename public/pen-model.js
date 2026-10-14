// Shared by live preview, board objects and SVG/PNG export.
export function penStyle(n = {}) {
  return {
    color: /^#[a-f0-9]{6}$/i.test(n.color || "") ? n.color : "#263c34",
    strokeWidth: Math.max(1, Math.min(32, Number(n.strokeWidth) || 3.5)),
    opacity: Math.max(0.1, Math.min(1, Number(n.opacity) || 1)),
    brush: n.brush === "highlighter" ? "highlighter" : "pen",
    pressure: n.pressure !== false,
  };
}
const fmt = (n) => Math.round(n * 100) / 100;
const xy = (p) => `${fmt(p[0])} ${fmt(p[1])}`;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function strokeMarkup(n) {
  const s = penStyle(n),
    p = n.points || [];
  if (!p.length) return "";
  const width = (i) =>
    n.strokeWidth == null && n.pressures?.length
      ? 1 + (n.pressures[i] ?? 0.5) * 5
      : s.strokeWidth *
        (s.pressure && s.brush !== "highlighter" && n.pressures?.length
          ? 0.35 + 0.9 * (n.pressures[i] ?? 0.5)
          : 1);
  let marks = "";
  if (p.length === 1)
    marks = `<circle cx="${fmt(p[0][0])}" cy="${fmt(p[0][1])}" r="${fmt(width(0) / 2)}" fill="${s.color}"/>`;
  else if (!s.pressure || s.brush === "highlighter" || !n.pressures?.length) {
    let d = `M${xy(p[0])}`;
    for (let i = 1; i < p.length - 1; i++)
      d += ` Q${xy(p[i])} ${xy(mid(p[i], p[i + 1]))}`;
    d += ` L${xy(p.at(-1))}`;
    marks = `<path d="${d}" stroke-width="${s.strokeWidth}"/>`;
  } else {
    let start = p[0];
    for (let i = 0; i < p.length; i++) {
      const end = i === p.length - 1 ? p[i] : mid(p[i], p[i + 1]);
      marks += `<path d="M${xy(start)} Q${xy(p[i])} ${xy(end)}" stroke-width="${fmt(width(i))}"/>`;
      start = end;
    }
  }
  return `<g fill="none" stroke="${s.color}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}">${marks}</g>`;
}
export function makeStroke(samples, style, id) {
  const s = penStyle(style),
    margin = Math.ceil(s.strokeWidth * 0.65) + 2;
  const xs = samples.map((p) => p.x),
    ys = samples.map((p) => p.y),
    x = Math.floor(Math.min(...xs)) - margin,
    y = Math.floor(Math.min(...ys)) - margin;
  return {
    id,
    type: "draw",
    x,
    y,
    w: Math.max(40, Math.ceil(Math.max(...xs) - x) + margin),
    h: Math.max(30, Math.ceil(Math.max(...ys) - y) + margin),
    text: "",
    ...s,
    points: samples.map((p) => [p.x - x, p.y - y]),
    pressures: samples.map((p) => Math.max(0, Math.min(1, p.pressure ?? 0.5))),
  };
}
function distance(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
function segmentsNear(a, b, c, d, r) {
  const cross = (p, q, s) =>
    (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return true;
  return (
    Math.min(
      distance(a, c, d),
      distance(b, c, d),
      distance(c, a, b),
      distance(d, a, b),
    ) <= r
  );
}
export function hitsStroke(n, from, to, radius) {
  if (n.type !== "draw" || n.locked || !n.points?.length) return false;
  if(n.rotation){
    const angle=-n.rotation*Math.PI/180,cx=n.x+n.w/2,cy=n.y+n.h/2;
    const rotate=p=>({x:cx+(p.x-cx)*Math.cos(angle)-(p.y-cy)*Math.sin(angle),y:cy+(p.x-cx)*Math.sin(angle)+(p.y-cy)*Math.cos(angle)});
    from=rotate(from);to=rotate(to);
  }
  const r = radius + penStyle(n).strokeWidth * 0.65;
  if (
    Math.max(from.x, to.x) + r < n.x ||
    Math.min(from.x, to.x) - r > n.x + n.w ||
    Math.max(from.y, to.y) + r < n.y ||
    Math.min(from.y, to.y) - r > n.y + n.h
  )
    return false;
  const a = [from.x - n.x, from.y - n.y],
    b = [to.x - n.x, to.y - n.y];
  if (n.points.length === 1) return distance(n.points[0], a, b) <= r;
  return n.points.some(
    (p, i) => i > 0 && segmentsNear(a, b, n.points[i - 1], p, r),
  );
}

export function setStrokeWidth(n, width) {
  n.strokeWidth = width;
  if (!n.points?.length) return;
  const pad = Math.ceil(width * 0.65) + 2;
  const xs = n.points.map((p) => p[0]),
    ys = n.points.map((p) => p[1]);
  const dx = Math.max(0, pad - Math.min(...xs)),
    dy = Math.max(0, pad - Math.min(...ys));
  n.x -= dx;
  n.y -= dy;
  n.points = n.points.map(([x, y]) => [x + dx, y + dy]);
  n.w = Math.max(n.w + dx, Math.max(...xs) + dx + pad);
  n.h = Math.max(n.h + dy, Math.max(...ys) + dy + pad);
}
