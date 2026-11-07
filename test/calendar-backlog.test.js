import test from "node:test";
import assert from "node:assert/strict";
import { backlogPosition, snapToBoard, nextLayer } from "../public/calendar-backlog.js";

// Owner request (F0.22-54): the Week board's Unscheduled cards sit on one board of their own, where
// a card goes where it's dropped, to the nearest 8 px, and may overlap others, the one moved last on top.
test("a card's place on the board is read from the card, places saved on the old grid included", () => {
  assert.deepEqual(backlogPosition({ x: 40, y: 16, z: 3 }), { x: 40, y: 16, z: 3 });
  assert.deepEqual(backlogPosition({ x: 40, y: 16 }), { x: 40, y: 16, z: 0 });
  // 0.22.53 kept a column and row of card-sized cells.
  assert.deepEqual(backlogPosition({ col: 2, row: 1 }), { x: 384, y: 80, z: 0 });
  for (const value of [undefined, null, {}, { x: 1 }, { x: -8, y: 0 }, { x: 1.5, y: 0 }, { x: "8", y: 0 }, { col: -1, row: 0 }, [8, 8]])
    assert.equal(backlogPosition(value), null, JSON.stringify(value));
});

test("a drop snaps to the nearest 8 px and stays on the board", () => {
  assert.deepEqual([snapToBoard(0), snapToBoard(3), snapToBoard(4), snapToBoard(13), snapToBoard(-20)], [0, 0, 8, 16, 0]);
  // The server keeps places within 100,000 px.
  assert.deepEqual([snapToBoard(100_003), snapToBoard(250_000)], [100_000, 100_000]);
});

test("the card moved last goes on top", () => {
  assert.equal(nextLayer([]), 1);
  assert.equal(nextLayer([{ backlog: { x: 0, y: 0, z: 4 } }, { backlog: { x: 8, y: 0 } }, {}, { backlog: { col: 1, row: 0 } }]), 5);
});
