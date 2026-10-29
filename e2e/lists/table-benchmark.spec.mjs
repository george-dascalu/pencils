// Table query model benchmark: in-memory query, grouping, sort and hierarchy for
// 1,000, 10,000 and 50,000 tasks (excludes HTTP and rendering). It needs no browser;
// each size's time is recorded as a test annotation.
import { performance } from "node:perf_hooks";
import { test, expect } from "../fixtures.mjs";
import { tableResult } from "../../public/table-model.js";
import { DEFAULT_SCHEMA } from "../../server/model.js";

for (const size of [1000, 10000, 50000]) {
  test(`the query model returns every one of ${size} tasks once`, async ({}, testInfo) => {
    const tasks = Array.from({ length: size }, (_, i) => ({ id: `t-${i}`, key: `BENCH-${i}`, title: `Task ${i}`, status: i % 3 ? "todo" : "done", type: "task", assignee: `Person ${i % 20}`, estimate: i % 8, due: "2026-10-20", parent: i % 5 ? `t-${i - (i % 5)}` : null }));
    const prefs = { groups: ["assignee", "status"], sorts: [{ field: "title", dir: 1 }], filters: [], outline: true, query: { match: "all", rules: [{ field: "due", op: "not-empty" }, { field: "title", op: "contains", value: "Task" }] } };
    const start = performance.now();
    const result = tableResult(tasks, prefs, DEFAULT_SCHEMA);
    const milliseconds = Math.round(performance.now() - start);
    expect(result.tasks.length).toBe(size);
    expect(new Set(result.tasks.map((t) => t.id)).size).toBe(size);
    testInfo.annotations.push({ type: "benchmark", description: JSON.stringify({ tasks: size, milliseconds, groups: result.counts.size, scope: "in-memory query, grouping, sort and hierarchy; excludes HTTP/rendering" }) });
  });
}
