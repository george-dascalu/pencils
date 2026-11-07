import test from "node:test";
import assert from "node:assert/strict";
import { backlogLayout, backlogMove } from "../public/calendar-backlog.js";

// Owner request (F0.22-53): the Week board's Unscheduled row is a grid as wide as the days shown,
// with each card where it was put and one card to a place.
const card = (id, backlog) => ({ id, ...(backlog ? { backlog } : {}) });
const at = (layout) => Object.fromEntries([...layout.places].map(([id, { col, row }]) => [id, `${col},${row}`]));

test("cards keep their places, and the rest take the place of their turn, or the next free one", () => {
  const layout = backlogLayout([card("a"), card("b", { col: 0, row: 0 }), card("c", { col: 2, row: 1 }), card("d")], 3);
  assert.deepEqual(at(layout), { b: "0,0", c: "2,1", a: "1,0", d: "0,1" });
  // One spare row to drop into below the last used one.
  assert.equal(layout.rows, 3);
  assert.deepEqual(backlogLayout([], 5), { places: new Map(), rows: 1 });
});

test("a place taken by an earlier card, or past the days shown, is given up for a free one", () => {
  const layout = backlogLayout([card("a", { col: 1, row: 0 }), card("b", { col: 1, row: 0 }), card("c", { col: 6, row: 0 }), card("d", { col: 0, row: -1 }), card("e", { col: "1", row: 0 })], 5);
  assert.deepEqual(at(layout), { a: "1,0", b: "2,0", c: "3,0", d: "4,0", e: "0,1" });
  assert.equal(layout.rows, 3);
});

test("moving one card leaves the cards without a saved place where they were", () => {
  const before = at(backlogLayout([card("a"), card("b"), card("c")], 3));
  const after = at(backlogLayout([card("a", { col: 1, row: 2 }), card("b"), card("c")], 3));
  assert.deepEqual([before.b, before.c], [after.b, after.c]);
});

test("moving a card to a free place saves only it", () => {
  const cards = [card("a"), card("b")];
  assert.deepEqual(backlogMove(cards, 3, "a", { col: 2, row: 4 }), [{ id: "a", backlog: { col: 2, row: 4 } }]);
  // Back onto its own place, nothing changes.
  assert.deepEqual(backlogMove(cards, 3, "b", { col: 1, row: 0 }), []);
});

test("moving onto another card swaps them; one coming from a day sends it to the first free place", () => {
  const cards = [card("a"), card("b"), card("c")];
  assert.deepEqual(backlogMove(cards, 3, "c", { col: 0, row: 0 }), [{ id: "c", backlog: { col: 0, row: 0 } }, { id: "a", backlog: { col: 2, row: 0 } }]);
  // A card that was scheduled has no place in the row yet.
  assert.deepEqual(backlogMove(cards, 3, "new", { col: 1, row: 0 }), [{ id: "new", backlog: { col: 1, row: 0 } }, { id: "b", backlog: { col: 0, row: 1 } }]);
});

test("cards a move would shift are saved where they are", () => {
  // b and c were pushed along by a's place; moving a away would let them slide back.
  const cards = [card("a", { col: 1, row: 0 }), card("b"), card("c")];
  assert.deepEqual(at(backlogLayout(cards, 3)), { a: "1,0", b: "2,0", c: "0,1" });
  assert.deepEqual(backlogMove(cards, 3, "a", { col: 0, row: 5 }), [{ id: "a", backlog: { col: 0, row: 5 } }, { id: "b", backlog: { col: 2, row: 0 } }, { id: "c", backlog: { col: 0, row: 1 } }]);
  // A card whose place is under a hidden weekend keeps that place for when weekends show again.
  const weekend = [card("a", { col: 1, row: 0 }), card("b", { col: 6, row: 0 }), card("c")];
  assert.deepEqual(backlogMove(weekend, 5, "a", { col: 0, row: 5 }), [{ id: "a", backlog: { col: 0, row: 5 } }, { id: "c", backlog: { col: 3, row: 0 } }]);
});
