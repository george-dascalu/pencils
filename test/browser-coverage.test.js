import test from "node:test";
import assert from "node:assert/strict";
import { ranBytes, spans, merge, table, records } from "../scripts/browser-coverage.mjs";

test("inner ranges override the function around them, whatever order V8 lists the functions in", () => {
  const entry = {
    source: "0123456789",
    functions: [
      { ranges: [{ startOffset: 2, endOffset: 6, count: 0 }, { startOffset: 3, endOffset: 4, count: 2 }] },
      { ranges: [{ startOffset: 0, endOffset: 10, count: 1 }] },
    ],
  };
  assert.deepEqual(spans(ranBytes(entry)), [[0, 2], [3, 4], [6, 10]]);
});

test("workers' runs of the same module add up", () => {
  const merged = merge([
    [{ path: "/app.js", length: 10, ran: [[0, 2]] }, { path: "/home.js", length: 4, ran: [] }],
    [{ path: "/app.js", length: 10, ran: [[1, 5], [8, 10]] }],
  ]);
  assert.deepEqual(spans(merged.get("/app.js")), [[0, 5], [8, 10]]);
  assert.deepEqual(spans(merged.get("/home.js")), []);
});

test("the table lists the least covered modules first, then the total", () => {
  const merged = merge([[{ path: "/a.js", length: 4, ran: [[0, 4]] }, { path: "/b.js", length: 4, ran: [[0, 1]] }]]);
  const lines = table(merged).split("\n");
  assert.match(lines[0], /^\s*25\.0%\s+\/b\.js$/);
  assert.match(lines[1], /^\s*100\.0%\s+\/a\.js$/);
  assert.match(lines.at(-1), /^\s*62\.5%\s+all 2 modules$/);
});

test("only the app's own modules count, not vendor bundles, built assets or the page", () => {
  const ran = { source: "ab", functions: [{ ranges: [{ startOffset: 0, endOffset: 2, count: 1 }] }] };
  const urls = ["http://127.0.0.1:5/app.js?v=1", "http://127.0.0.1:5/vendor/marked.js", "http://127.0.0.1:5/assets/app-x.js", "http://127.0.0.1:5/", ""];
  assert.deepEqual(records(urls.map((url) => ({ url, ...ran }))), [{ path: "/app.js", length: 2, ran: [[0, 2]] }]);
  assert.deepEqual(records([{ url: urls[0], functions: ran.functions }]), [], "V8 leaves out the source of a script it has let go");
});
