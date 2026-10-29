import test from "node:test";
import assert from "node:assert/strict";
import { schema } from "../server/model.js";
import { taskFieldColor, priorityColors } from "../public/task-colors.js";

test("projects may set their own priority colours, validated on the server", () => {
  assert.deepEqual(schema({ priority_colors: { high: "#123abc", none: "#ABCDEF" } }).priority_colors, { high: "#123abc", none: "#ABCDEF" });
  assert.equal(schema({}).priority_colors, undefined);
  for (const priority_colors of [{ huge: "#123abc" }, { high: "red" }, { high: "#12345" }, [], "#123abc"])
    assert.throws(() => schema({ priority_colors }), /priority colour/i, JSON.stringify(priority_colors));
});

test("priority colours come from the project, with today's colours as defaults", () => {
  const state = { config: { priority_colors: { high: "#123abc", none: "#010203" } } };
  assert.equal(taskFieldColor(state, "priority", "high"), "#123abc");
  assert.equal(taskFieldColor(state, "priority", "low"), priorityColors.low);
  assert.equal(taskFieldColor(state, "priority", undefined), "#010203");
  assert.equal(taskFieldColor({}, "priority", "urgent"), priorityColors.urgent);
});

test("a stored priority colour that isn't #rrggbb falls back to the default", () => {
  assert.equal(taskFieldColor({ config: { priority_colors: { high: 'red" onclick="x' } } }, "priority", "high"), priorityColors.high);
});
