import test from "node:test";
import assert from "node:assert/strict";
import { parseSearch, searchMatch, editDistance, rankResults } from "../server/search-query.js";

test("queries read words as prefixes, \"phrases\", -exclusions, #tags and in:kinds, as in Omnisearch", () => {
  const parsed = parseSearch('road "launch plan" -draft #ops/infra in:docs in:cards Café');
  assert.deepEqual(parsed.words, ["road", "Café"]);
  assert.deepEqual(parsed.phrases, ["launch plan"]);
  assert.deepEqual(parsed.exclude, ["draft"]);
  assert.deepEqual(parsed.tags, ["ops infra"]);
  assert.deepEqual([...parsed.kinds].sort(), ["card", "doc"]);
  assert.equal(searchMatch(parsed), '"road"* AND "Café"* AND "launch plan" AND tags : "ops infra" NOT "draft"');
  assert.equal(searchMatch(parseSearch("-only in:boards")), null, "nothing to find without a positive term");
  assert.equal(searchMatch(parseSearch('say "x\\" OR y')), '"say"* AND "OR"* AND "y"* AND "x"', "quotes and operators can't break out of a term");
});

test("edit distance stops early past its limit", () => {
  assert.equal(editDistance("recipt", "receipt", 2), 1);
  assert.equal(editDistance("kitten", "sitting", 3), 3);
  assert.ok(editDistance("short", "something else", 2) > 2);
});

test("titles that start with the query and recent changes move up", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const rows = [
    { id: "body", score: -6, title: "Notes", updated: "2026-01-01T00:00:00Z" },
    { id: "title", score: -5, title: "Roadmap", updated: "2026-01-01T00:00:00Z" },
    { id: "recent", score: -5.2, title: "Weekly", updated: "2026-10-28T00:00:00Z" },
  ];
  assert.deepEqual(rankResults(rows, parseSearch("road"), now).map((r) => r.id), ["title", "recent", "body"]);
});
