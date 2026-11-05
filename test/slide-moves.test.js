import test from "node:test";
import assert from "node:assert/strict";
import { slideMoves } from "../public/slide-moves.js";

// A stand-in element whose top moves when the page changes, recording the slides it is given.
function element(before, after, parentElement = null) {
  const el = { parentElement, offsetHeight: 40, slides: [], top: before };
  el.getBoundingClientRect = () => ({ top: el.top });
  el.animate = (frames) => el.slides.push(frames[0].transform);
  el.move = () => (el.top = after);
  return el;
}

test("a card that moves only with its lane doesn't slide on its own, even when the sums leave a rounding error", (t) => {
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.innerHeight = 900;
  t.after(() => { delete globalThis.matchMedia; delete globalThis.innerHeight; });
  const lane = element(100.7, 140.9);
  // Both move 40.2px down; the difference comes out as 1.4e-14, not 0 (the browser's was -0.00003px).
  const card = element(233.3, 273.5, lane), alone = element(500, 520);
  slideMoves([lane, card, alone], () => [lane, card, alone].forEach((el) => el.move()));
  assert.notEqual((233.3 - card.top) - (100.7 - lane.top), 0, "the sums differ by a rounding error");
  assert.equal(lane.slides.length, 1, "the lane slides");
  assert.deepEqual(card.slides, [], "its card moves with it, not again on its own");
  assert.deepEqual(alone.slides, ["translateY(-20px)"], "a card that moved by itself still slides");
});
