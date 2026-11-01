import test from "node:test";
import assert from "node:assert/strict";
import { mutants, testsFor } from "../scripts/mutants.mjs";

test("mutants flip comparisons and logic and drop negations, calls and throws, never inside strings, regexes or comments", () => {
  const source = 'if (a === b && !c) x();\nconst r = /a<b/g, s = "a < b"; // a < b\nconst t = `${a < b}`, u = true;\nthrow new Error("no");\nawait y();\n';
  assert.deepEqual(mutants(source).map(({ line, from, to, text }) => [line, source.slice(from, to), text]), [
    [1, "===", "!=="],
    [1, "&&", "||"],
    [1, "!", ""],
    [1, "x();", ";"],
    [3, "<", "<="],
    [3, "true", "false"],
    [4, 'throw new Error("no");', ";"],
    [5, "await y();", ";"],
  ]);
});

test("a module's tests are those that import it, directly or through other modules, its own test first", () => {
  const tests = testsFor("server/journal.js");
  assert.equal(tests[0], "test/journal.test.js");
  assert.ok(tests.includes("test/bookmarks.test.js"), "through the store");
  assert.ok(!tests.includes("test/uuid.test.js"));
  assert.ok(testsFor("server/http/access.ts").includes("test/route-access.test.js"), "TypeScript modules through their compiled JavaScript");
});
