// The Week board's Unscheduled board (F0.22-54): one board docked under the week, where a card goes
// where it's dropped, to the nearest 8 px, and may overlap others, the one moved last on top. A card
// keeps its place in `backlog: { x, y, z }`; cards without one flow in order.
const SNAP = 8;
// 0.22.53 kept places as a column and row of card-sized cells.
const CELL = { x: 192, y: 80 };
const whole = (value) => Number.isInteger(value) && value >= 0;

export function backlogPosition(backlog) {
  if (!backlog || typeof backlog !== "object" || Array.isArray(backlog)) return null;
  if (whole(backlog.x) && whole(backlog.y)) return { x: backlog.x, y: backlog.y, z: whole(backlog.z) ? backlog.z : 0 };
  if (whole(backlog.col) && whole(backlog.row)) return { x: backlog.col * CELL.x, y: backlog.row * CELL.y, z: 0 };
  return null;
}

// Within the 100,000 px the server keeps.
export const snapToBoard = (value) => Math.min(100_000, Math.max(0, Math.round(value / SNAP) * SNAP));

// The layer that puts a card above every card on the board.
export const nextLayer = (cards) => cards.reduce((top, card) => Math.max(top, backlogPosition(card.backlog)?.z ?? 0), 0) + 1;
