// A fixed-cell spatial index. Large objects stay in one overflow bucket rather
// than occupying thousands of cells. Queries preserve original stacking order.
export class SpatialIndex {
  constructor(items = [], rectangle = item => item, cellSize = 1024) {
    this.cellSize = cellSize;
    this.entries = items.map((item, order) => ({ item, order, ...rectangle(item) }));
    this.byId = new Map(this.entries.map(e => [e.item.id, e]));
    this.cells = new Map(); this.large = [];
    for (const e of this.entries) {
      const [x1, y1, x2, y2] = this.range(e);
      if ((x2 - x1 + 1) * (y2 - y1 + 1) > 64) { this.large.push(e); continue; }
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(e);
      }
    }
  }
  range(r) { const c = this.cellSize; return [Math.floor(r.x / c), Math.floor(r.y / c), Math.floor((r.x + r.w) / c), Math.floor((r.y + r.h) / c)]; }
  search(r) {
    const [x1, y1, x2, y2] = this.range(r);
    let entries;
    if ((x2 - x1 + 1) * (y2 - y1 + 1) > this.cells.size) entries = this.entries;
    else {
      const found = new Set(this.large);
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++)
        for (const e of this.cells.get(`${x},${y}`) || []) found.add(e);
      entries = [...found];
    }
    return entries.filter(e => e.x <= r.x + r.w && e.x + e.w >= r.x && e.y <= r.y + r.h && e.y + e.h >= r.y).map(e => e.item);
  }
  order(item) { return this.byId.get(item.id)?.order ?? 0; }
}
export function objectBounds(n) {
  const a = (n.rotation || 0) * Math.PI / 180;
  const w = Math.abs(n.w * Math.cos(a)) + Math.abs(n.h * Math.sin(a));
  const h = Math.abs(n.h * Math.cos(a)) + Math.abs(n.w * Math.sin(a));
  return { x: n.x + (n.w - w) / 2, y: n.y + (n.h - h) / 2, w, h };
}
