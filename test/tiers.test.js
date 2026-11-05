import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TIERS, steps } from "../scripts/tiers.mjs";
import { specFiles } from "../scripts/affected.mjs";
import { projectRoot } from "../scripts/deploy.mjs";

const unitFiles = () => fs.readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".test.js")).map((f) => `test/${f}`).sort();

test("every browser spec and unit test file has exactly one tier, and every listed file exists", () => {
  const listed = TIERS.flat();
  const twice = listed.filter((file, i) => listed.indexOf(file) !== i);
  assert.deepEqual(twice, [], "listed in more than one tier");
  const files = [...specFiles(projectRoot, "e2e"), ...unitFiles()];
  assert.deepEqual(files.filter((file) => !listed.includes(file)), [], "give these a tier in scripts/tiers.mjs");
  assert.deepEqual(listed.filter((file) => !files.includes(file)), [], "listed but missing");
});

test("the tiers run in the order asked, each its unit tests then its browser specs", () => {
  const tiers = [["test/a.test.js", "e2e/board/a.spec.mjs"], ["e2e/lists/b.spec.mjs"], ["test/c.test.js"]];
  assert.deepEqual(steps(["3", "1"], tiers), [
    { tier: 3, unit: ["test/c.test.js"], e2e: [] },
    { tier: 1, unit: ["test/a.test.js"], e2e: ["e2e/board/a.spec.mjs"] },
  ]);
  assert.deepEqual(steps([], tiers).map((s) => s.tier), [1, 2, 3], "all of them by default");
  assert.throws(() => steps(["4"], tiers), /tier 1, 2 or 3/);
});
