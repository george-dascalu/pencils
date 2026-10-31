// Home's grid (12 columns): panels keep their place; one moved or resized onto others pushes them
// down, in reading order, so nothing overlaps. Shared by the page and its tests.
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const stackOrder = (panels) => [...panels].sort((a, b) => a.y - b.y || a.x - b.x);
export function compact(panels, movedId = null) {
  const placed = [];
  const order = stackOrder(panels);
  if (movedId) {
    const moved = order.find((p) => p.id === movedId);
    if (moved) order.splice(order.indexOf(moved), 1), order.unshift(moved);
  }
  for (const panel of order) {
    const next = { ...panel };
    while (placed.some((other) => overlaps(next, other))) next.y++;
    placed.push(next);
  }
  return panels.map((p) => placed.find((q) => q.id === p.id));
}
