import test from "node:test";
import assert from "node:assert/strict";
import { listCallouts, listCalloutAfterMarker, setListCallout, listCalloutLabel } from "../public/document-list-callouts.js";

test("a list item's text starting with a callout character and a space is a list callout", () => {
  assert.deepEqual(listCallouts.map((c) => c.char).join(""), "!?&~@$%");
  assert.deepEqual(listCalloutAfterMarker(" ! Ship it"), { callout: listCallouts[0], offset: 1 });
  assert.deepEqual(listCalloutAfterMarker(" [ ] ? Ask legal"), { callout: listCallouts[1], offset: 5 });
  assert.equal(listCalloutAfterMarker(" [x] @ Sam").callout.name, "person");
  assert.equal(listCalloutAfterMarker(" !important"), null, "the character needs a space after it");
  assert.equal(listCalloutAfterMarker(" plain"), null);
  assert.equal(listCalloutAfterMarker(" # heading"), null);
});

test("choosing a list callout replaces the line's callout or starts a list item", () => {
  assert.deepEqual(setListCallout("Plain text", "!"), { from: 0, to: 0, insert: "- ! " });
  assert.deepEqual(setListCallout("- Item", "?"), { from: 0, to: 2, insert: "- ? " });
  assert.deepEqual(setListCallout("  - [ ] ! Item", "$"), { from: 0, to: 10, insert: "  - [ ] $ " });
  assert.deepEqual(setListCallout("3) Item", "@"), { from: 0, to: 3, insert: "3) @ " });
  assert.deepEqual(setListCallout("## Plan", "!"), { from: 0, to: 3, insert: "- ! " }, "a heading becomes a list item");
  assert.deepEqual(setListCallout("> Quote", "!"), { from: 0, to: 2, insert: "- ! " });
});

test("checklist callouts are named by their callout", () => {
  assert.equal(listCalloutLabel("? Ask legal"), "Question: Ask legal");
  assert.equal(listCalloutLabel("Ask legal"), "Ask legal");
});
