import test from "node:test";
import assert from "node:assert/strict";
import { backlogPosition, placeOnBoard, nextLayer, backlogGroups, arrangeBacklog } from "../public/calendar-backlog.js";

// Owner request (F0.22-54): the Week board's Unscheduled cards sit on one board of their own, where
// a card goes where it's dropped and may overlap others, the one moved last on top; since F0.22-62 to
// the pixel, not to an 8 px grid.
test("a card's place on the board is read from the card, places saved on the old grid included", () => {
  assert.deepEqual(backlogPosition({ x: 40, y: 16, z: 3 }), { x: 40, y: 16, z: 3 });
  assert.deepEqual(backlogPosition({ x: 40, y: 16 }), { x: 40, y: 16, z: 0 });
  // 0.22.53 kept a column and row of card-sized cells.
  assert.deepEqual(backlogPosition({ col: 2, row: 1 }), { x: 384, y: 80, z: 0 });
  for (const value of [undefined, null, {}, { x: 1 }, { x: -8, y: 0 }, { x: 1.5, y: 0 }, { x: "8", y: 0 }, { col: -1, row: 0 }, [8, 8]])
    assert.equal(backlogPosition(value), null, JSON.stringify(value));
  assert.equal(backlogPosition(Object.assign([], { x: 8, y: 8 })), null);
});

test("a drop goes to the nearest pixel, on the board", () => {
  assert.deepEqual([placeOnBoard(0), placeOnBoard(3), placeOnBoard(4.4), placeOnBoard(13.6), placeOnBoard(-20)], [0, 3, 4, 14, 0]);
  // The server keeps places within 100,000 px.
  assert.deepEqual([placeOnBoard(100_003), placeOnBoard(250_000)], [100_000, 100_000]);
});

test("the card moved last goes on top", () => {
  assert.equal(nextLayer([]), 1);
  assert.equal(nextLayer([{ backlog: { x: 0, y: 0, z: 4 } }, { backlog: { x: 8, y: 0 } }, {}, { backlog: { col: 1, row: 0 } }]), 5);
});

const config = { statuses: ['todo', 'doing', 'done'], tags: [{ name: 'Work' }, { name: 'Home' }] };
const cards = [
  { id: 'a', title: 'A', priority: 'low', status: 'doing', parent: 'p', tags: ['Home', 'Work'] },
  { id: 'b', title: 'B', priority: 'urgent', status: 'todo', parent: 'p', tags: ['Work', 'Home', 'Work'] },
  { id: 'c', title: 'C', priority: 'none', status: 'legacy', parent: null, tags: [] },
  { id: 'd', title: 'D', priority: 'high', status: 'todo', parent: 'q', tags: ['Work'] },
];
const ids = groups => groups.map(g => g.cards.map(t => t.id));
test('dock arrangement groups follow priority and workflow order, keeping unknown statuses', () => {
  assert.deepEqual(ids(backlogGroups(cards, 'priority', config)), [['b'], ['d'], ['a'], ['c']]);
  assert.deepEqual(ids(backlogGroups(cards, 'status', config)), [['b', 'd'], ['a'], ['c']]);
  assert.equal(backlogGroups(cards, 'priority', config).at(-1).label, 'Lowest');
  assert.deepEqual(backlogGroups([], 'status', config), []);
  assert.throws(() => backlogGroups(cards, 'assignee', config), /arrange/i);
});
test('parent arrangement uses the parent title and leaves unrelated cards in No parent', () => {
  const groups = backlogGroups(cards, 'parent', config, [{ id: 'p', title: 'Parent B' }, { id: 'q', title: 'Parent A' }]);
  assert.deepEqual(ids(groups), [['d'], ['a', 'b'], ['c']]);
  assert.deepEqual(groups.map(g => g.label), ['Parent A', 'Parent B', 'No parent']);
});
test('tag arrangement puts each physical card once under its complete tag combination', () => {
  const groups = backlogGroups(cards, 'tags', config);
  assert.deepEqual(ids(groups), [['d'], ['a', 'b'], ['c']]);
  assert.deepEqual(groups.map(g => g.label), ['Work', 'Work · Home', 'No tag']);
  assert.equal(new Set(groups.flatMap(g => g.cards.map(t => t.id))).size, cards.length);
  assert.deepEqual(cards[0].tags, ['Home', 'Work']);
});
test('arrangement wraps within the dock, clears headings and tall cards, and changes only positions', () => {
  const before = structuredClone(cards), groups = backlogGroups(cards, 'status', config);
  const sizes = new Map([['b', 70], ['d', 110], ['a', 80], ['c', 65]]);
  const layout = arrangeBacklog(groups, { width: 400, cardWidth: 184, heights: sizes, headingHeight: 20 });
  assert.deepEqual(layout.positions.map(p => [p.id, p.backlog.x, p.backlog.y]), [['b', 8, 36], ['d', 200, 36], ['a', 8, 198], ['c', 8, 330]]);
  assert.deepEqual(layout.groups.map(g => [g.label, g.x, g.y]), [['To do', 8, 8], ['Doing', 8, 170], ['Legacy', 8, 302]]);
  assert.deepEqual(cards, before);
  assert.ok(layout.positions.every(p => Object.keys(p).join() === 'id,backlog'));
  const narrow = arrangeBacklog(groups, { width: 280, cardWidth: 232, heights: sizes, headingHeight: 20 });
  assert.ok(narrow.positions.every(p => p.backlog.x === 8));
  assert.ok(narrow.positions[1].backlog.y >= narrow.positions[0].backlog.y + 70 + 8);
});

test('arrangement fits the last allowed coordinate and rejects overflow before any positions save', () => {
  const groups = backlogGroups([cards[1], cards[0]], 'priority', config);
  const options = { width: 200, cardWidth: 184, heights: new Map([['b', 99912], ['a', 80]]), headingHeight: 20 };
  assert.equal(arrangeBacklog(groups, options).positions.at(-1).backlog.y, 100_000);
  options.heights.set('b', 99913);
  assert.throws(() => arrangeBacklog(groups, options), /Too many cards/);
});
