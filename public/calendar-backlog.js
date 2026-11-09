// The Week board's Unscheduled board (F0.22-54): one board docked under the week, where a card goes
// where it's dropped, to the pixel (F0.22-62), and may overlap others, the one moved last on top. A
// card keeps its place in `backlog: { x, y, z }`; cards without one flow in order.
// 0.22.53 kept places as a column and row of card-sized cells.
import { naturalGroups } from "./task-group-order.js";
import { priorityLabel } from "./task-priority.js";
import { statusLabel } from "./workflow-model.js";
const CELL = { x: 192, y: 80 };
const whole = (value) => Number.isInteger(value) && value >= 0;

export function backlogPosition(backlog) {
  if (!backlog || typeof backlog !== "object" || Array.isArray(backlog)) return null;
  if (whole(backlog.x) && whole(backlog.y)) return { x: backlog.x, y: backlog.y, z: whole(backlog.z) ? backlog.z : 0 };
  if (whole(backlog.col) && whole(backlog.row)) return { x: backlog.col * CELL.x, y: backlog.row * CELL.y, z: 0 };
  return null;
}

// Within the 100,000 px the server keeps.
export const placeOnBoard = (value) => Math.min(100_000, Math.max(0, Math.round(value)));

// The layer that puts a card above every card on the board.
export const nextLayer = (cards) => cards.reduce((top, card) => Math.max(top, backlogPosition(card.backlog)?.z ?? 0), 0) + 1;

// One physical card, one place: tag combinations form their own group, in project tag order.
// These are arrangements, not live group constraints; dragging never edits these fields.
export function backlogGroups(cards, field, config, allCards = cards) {
  if (!["priority", "parent", "tags", "status"].includes(field)) throw new Error("Choose a field to arrange by.");
  const order = field === "parent" ? [] : naturalGroups(field, cards, config);
  const rank = new Map(order.map((key, i) => [key, i]));
  const parents = new Map(allCards.map(t => [t.id, t.title]));
  const groups = new Map();
  for (const card of cards) {
    const tags = field === "tags" ? [...new Set(card.tags || [])].sort((a, b) => rank.get(a) - rank.get(b)) : null;
    const key = tags ? JSON.stringify(tags) : card[field] || (field === "priority" ? "none" : "");
    if (!groups.has(key)) groups.set(key, {
      key, label: tags ? tags.join(" · ") || "No tag" : field === "parent" ? (key ? parents.get(key) || key : "No parent") : field === "priority" ? priorityLabel(key) : statusLabel(config, key),
      cards: [], tags,
    });
    groups.get(key).cards.push(card);
  }
  return [...groups.values()].sort((a, b) => {
    if (field === "parent") return !a.key ? 1 : !b.key ? -1 : a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
    if (field !== "tags") return (rank.get(a.key) ?? order.length) - (rank.get(b.key) ?? order.length);
    if (!a.tags.length || !b.tags.length) return a.tags.length ? -1 : b.tags.length ? 1 : 0;
    for (let i = 0; i < Math.min(a.tags.length, b.tags.length); i++) {
      const difference = rank.get(a.tags[i]) - rank.get(b.tags[i]);
      if (difference) return difference;
    }
    return a.tags.length - b.tags.length;
  });
}

// Fit each group in rows within the visible dock, with room for its heading and the tallest card
// in each row. Return only positions; dates, field values and stacking layers stay as they were.
export function arrangeBacklog(groups, { width, cardWidth, heights, headingHeight }) {
  const padding = 8, gap = 8, groupGap = 24, columns = Math.max(1, Math.floor((width - 2 * padding + gap) / (cardWidth + gap)));
  const positions = [], headings = [];
  let y = padding;
  for (const group of groups) {
    if (!group.cards.length) continue;
    headings.push({ key: group.key, label: group.label, ids: group.cards.map(t => t.id), x: padding, y });
    y += headingHeight + gap;
    for (let start = 0; start < group.cards.length; start += columns) {
      const row = group.cards.slice(start, start + columns);
      if (y > 100_000) throw new Error("Too many cards to arrange in this dock. Filter to fewer cards first.");
      row.forEach((t, i) => positions.push({ id: t.id, backlog: { x: padding + i * (cardWidth + gap), y: Math.round(y), z: backlogPosition(t.backlog)?.z ?? 0 } }));
      y += Math.max(...row.map(t => heights.get(t.id) || 80)) + gap;
    }
    y += groupGap - gap;
  }
  return { positions, groups: headings };
}
