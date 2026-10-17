// Deterministic rectilinear routing in document coordinates. Zoom is not an input.
const cache = new Map();
const vectors = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const inside = (p, r) =>
  p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
function blocked(a, b, rects) {
  return rects.some((r) =>
    a.x === b.x
      ? a.x > r.left &&
        a.x < r.right &&
        Math.max(a.y, b.y) > r.top &&
        Math.min(a.y, b.y) < r.bottom
      : a.y > r.top &&
        a.y < r.bottom &&
        Math.max(a.x, b.x) > r.left &&
        Math.min(a.x, b.x) < r.right,
  );
}
export function orthogonalRoute(p, q, fromSide, toSide, nodes, source, target) {
  const margin = 16,
    step = 24;
  const boxes = nodes
    .filter((n) => !["frame", "grid"].includes(n.type) && !n.layerHidden)
    .map((n) => {
      const angle = ((n.rotation || 0) * Math.PI) / 180,
        w = Math.abs(n.w * Math.cos(angle)) + Math.abs(n.h * Math.sin(angle)),
        h = Math.abs(n.h * Math.cos(angle)) + Math.abs(n.w * Math.sin(angle)),
        cx = n.x + n.w / 2,
        cy = n.y + n.h / 2;
      return {
        id: n.id,
        left: cx - w / 2 - margin,
        right: cx + w / 2 + margin,
        top: cy - h / 2 - margin,
        bottom: cy + h / 2 + margin,
      };
    });
  const u = {
      x: p.x + vectors[fromSide][0] * step,
      y: p.y + vectors[fromSide][1] * step,
    },
    v = {
      x: q.x + vectors[toSide][0] * step,
      y: q.y + vectors[toSide][1] * step,
    };
  const rects = boxes.filter(
    (r) =>
      r.right >= Math.min(p.x, q.x) - 500 &&
      r.left <= Math.max(p.x, q.x) + 500 &&
      r.bottom >= Math.min(p.y, q.y) - 500 &&
      r.top <= Math.max(p.y, q.y) + 500,
  );
  if (rects.length > 80 || rects.some((r) => inside(u, r) || inside(v, r)))
    return null;
  const key = JSON.stringify([p, q, fromSide, toSide, rects]);
  if (cache.has(key)) return cache.get(key);
  const xs = [
      ...new Set([u.x, v.x, ...rects.flatMap((r) => [r.left, r.right])]),
    ].sort((a, b) => a - b),
    ys = [
      ...new Set([u.y, v.y, ...rects.flatMap((r) => [r.top, r.bottom])]),
    ].sort((a, b) => a - b);
  const start = [xs.indexOf(u.x), ys.indexOf(u.y)],
    end = [xs.indexOf(v.x), ys.indexOf(v.y)];
  const queue = [],
    distance = new Map(),
    parents = new Map();
  const push = (n) => {
    queue.push(n);
    let i = queue.length - 1;
    while (i) {
      const j = (i - 1) >> 1;
      if (queue[j].score <= n.score) break;
      queue[i] = queue[j];
      i = j;
    }
    queue[i] = n;
  };
  const pop = () => {
    const top = queue[0],
      last = queue.pop();
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let j = i * 2 + 1;
        if (j + 1 < queue.length && queue[j + 1].score < queue[j].score) j++;
        if (last.score <= queue[j].score) break;
        queue[i] = queue[j];
        i = j;
      }
      queue[i] = last;
    }
    return top;
  };
  const id = (x, y, d) => `${x},${y},${d}`;
  let finish = null,
    visits = 0;
  const first = {
    x: start[0],
    y: start[1],
    dir: -1,
    cost: 0,
    score: 0,
    key: id(...start, -1),
  };
  push(first);
  distance.set(first.key, 0);
  while (queue.length && visits++ < 40000) {
    const n = pop();
    if (n.cost !== distance.get(n.key)) continue;
    if (n.x === end[0] && n.y === end[1]) {
      finish = n.key;
      break;
    }
    const a = { x: xs[n.x], y: ys[n.y] };
    for (const [dx, dy, dir] of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 1],
      [0, 1, 1],
    ]) {
      const x = n.x + dx,
        y = n.y + dy;
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
      const b = { x: xs[x], y: ys[y] };
      if (blocked(a, b, rects)) continue;
      const cost =
          n.cost +
          Math.abs(b.x - a.x) +
          Math.abs(b.y - a.y) +
          (n.dir !== -1 && n.dir !== dir ? 12 : 0),
        key = id(x, y, dir);
      if (cost >= (distance.get(key) ?? Infinity)) continue;
      distance.set(key, cost);
      parents.set(key, n.key);
      push({
        x,
        y,
        dir,
        key,
        cost,
        score: cost + Math.abs(b.x - v.x) + Math.abs(b.y - v.y),
      });
    }
  }
  if (!finish) return null;
  const route = [];
  for (let key = finish; key; key = parents.get(key)) {
    const [x, y] = key.split(",").map(Number);
    route.unshift({ x: xs[x], y: ys[y] });
  }
  const points = [p, ...route, q].filter(
    (point, i, list) =>
      i === 0 || point.x !== list[i - 1].x || point.y !== list[i - 1].y,
  );
  for (let i = points.length - 2; i > 0; i--)
    if (
      (points[i - 1].x === points[i].x && points[i].x === points[i + 1].x) ||
      (points[i - 1].y === points[i].y && points[i].y === points[i + 1].y)
    )
      points.splice(i, 1);
  // Endpoint stubs may cross their own cards' inflated bounds, never another card.
  if (
    blocked(
      p,
      u,
      rects.filter((r) => r.id !== source),
    ) ||
    blocked(
      v,
      q,
      rects.filter((r) => r.id !== target),
    )
  )
    return null;
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (!best || length > best.length)
      best = { length, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const result = { points, x: best.x, y: best.y };
  cache.set(key, result);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return result;
}
