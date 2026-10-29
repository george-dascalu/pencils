// Owner request, 28 October 2026: relationship arrows read from their start to
// their end ("parent of", "child of" instead of "parent / child"), and arrows of
// the same kind that fan out from one object share a single label.
import test from "node:test";
import assert from "node:assert/strict";
import { relationshipLabel, sharedLabels, sharedPrefix, labelSpot, spotOnRoute } from "../public/edge-labels.js";

const parentEdge = (label = "parent / child") => ({ planRelation: "parent", label });
const parent = { id: "t-parent", parent: null }, child = { id: "t-child", parent: "t-parent" };

test("parent arrows read from start to end", () => {
  assert.equal(relationshipLabel(parentEdge(), parent, child), "parent of");
  assert.equal(relationshipLabel(parentEdge(), child, parent), "child of", "an arrow drawn from the child reads child of");
  assert.equal(relationshipLabel(parentEdge("parent of"), parent, child), "parent of");
  assert.equal(relationshipLabel(parentEdge(""), parent, child), "parent of", "generated arrows without stored text still read");
  assert.equal(relationshipLabel(parentEdge(), null, null), "parent of", "cards without loaded tasks keep the generated direction");
});

test("custom and other relationship text is left alone", () => {
  assert.equal(relationshipLabel(parentEdge("owns"), parent, child), "owns");
  assert.equal(relationshipLabel({ label: "blocks" }, parent, child), "blocks");
  assert.equal(relationshipLabel({ planRelation: "dependency", label: "blocks" }, parent, child), "blocks");
  assert.equal(relationshipLabel({}, parent, child), "");
});

const elbow = (id, from, label, extra = {}) => ({ id, from, fromSide: "bottom", routing: "elbow", label, ...extra });

test("arrows leaving one side of one object with the same text share one label", () => {
  const groups = sharedLabels([
    elbow("e3", "p", "parent of"),
    elbow("e1", "p", "parent of"),
    elbow("e2", "p", "parent of"),
    elbow("x", "q", "parent of"),
  ]);
  assert.deepEqual(groups.get("e1"), { lead: "e1", members: ["e1", "e2", "e3"] }, "the first id leads, so the label does not jump");
  assert.equal(groups.get("e2").lead, "e1");
  assert.equal(groups.get("e3").lead, "e1");
  assert.equal(groups.has("x"), false, "a single arrow keeps its own label");
});

test("only arrows that can share a trunk are merged", () => {
  const groups = sharedLabels([
    elbow("a1", "p", "parent of"),
    elbow("a2", "p", "blocks"),
    elbow("b1", "p", "parent of", { fromSide: "right" }),
    elbow("c1", "p", "parent of", { routing: "straight" }),
    elbow("c2", "p", "parent of", { routing: "straight" }),
    elbow("d1", "p", "parent of", { fromSide: undefined }),
    elbow("d2", "p", "parent of", { fromSide: undefined }),
    elbow("f1", "p", "parent of", { bends: [{ x: 1, y: 2 }] }),
    elbow("g1", "p", ""),
    elbow("g2", "p", ""),
  ]);
  assert.equal(groups.size, 0, JSON.stringify([...groups]));
});

test("the shared trunk is the common start of every route", () => {
  const p = { x: 100, y: 0 };
  const routes = [
    [p, { x: 100, y: 18 }, { x: 40, y: 18 }, { x: 40, y: 200 }, { x: 120, y: 200 }],
    [p, { x: 100, y: 18 }, { x: 40, y: 18 }, { x: 40, y: 400 }, { x: 120, y: 400 }],
    [p, { x: 100, y: 18 }, { x: 40, y: 18 }, { x: 40, y: 120 }, { x: 120, y: 120 }],
  ];
  assert.deepEqual(sharedPrefix(routes), [p, { x: 100, y: 18 }, { x: 40, y: 18 }, { x: 40, y: 120 }]);
  // Collinear points along the way do not hide the overlap.
  assert.deepEqual(sharedPrefix([[p, { x: 100, y: 50 }, { x: 100, y: 90 }], [p, { x: 100, y: 60 }]]), [p, { x: 100, y: 60 }]);
  assert.deepEqual(sharedPrefix([[p, { x: 100, y: 50 }], [p, { x: 160, y: 0 }]]), [p], "routes leaving in different directions share nothing");
});

test("the shared label sits on the trunk where the arrows branch off", () => {
  // Parent arrows: a short drop, a jog left under the card, then the trunk.
  const vertical = labelSpot([{ x: 100, y: 0 }, { x: 100, y: 24 }, { x: 26, y: 24 }, { x: 26, y: 92 }]);
  // Left of the trunk: child cards hang off its right side.
  assert.deepEqual(vertical, { x: 20, y: 62, beside: true }, "beside the vertical trunk, at its middle, not on the longer jog");
  const horizontal = labelSpot([{ x: 0, y: 50 }, { x: 200, y: 50 }]);
  assert.deepEqual(horizontal, { x: 100, y: 41, beside: false }, "above a horizontal trunk, as single labels are");
  const shortLast = labelSpot([{ x: 0, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 60 }]);
  assert.deepEqual(shortLast, { x: 100, y: 41, beside: false }, "a last stretch too short for text falls back to the longest");
  assert.equal(labelSpot([{ x: 0, y: 0 }, { x: 0, y: 12 }]), null, "a stub too short for text falls back to the arrow's own label spot");
});

test("a single relationship label on a vertical stretch sits beside it", () => {
  const route = [{ x: 100, y: 0 }, { x: 100, y: 80 }, { x: 200, y: 80 }];
  assert.deepEqual(spotOnRoute(route, { x: 100, y: 40 }), { x: 94, y: 44, beside: true });
  assert.deepEqual(spotOnRoute(route, { x: 150, y: 80 }), { x: 150, y: 71, beside: false }, "above a horizontal stretch, as before");
  assert.equal(spotOnRoute(route, { x: 300, y: 300 }), null, "a point off the route keeps the default spot");
});
