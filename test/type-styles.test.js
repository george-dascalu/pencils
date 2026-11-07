// Owner request (F0.22-67): each card type can have its own colour and icon, set in project settings.
import test from "node:test";
import assert from "node:assert/strict";
import { schema } from "../server/model.js";
import { typeIcon, typeIconName, TYPE_ICONS } from "../public/task-types.js";

const types = ["task", "bug", "chore"];

test("a project may give its card types colours and icons, validated on the server", () => {
  const saved = schema({ types, type_colors: { bug: "#123abc", chore: "#ABCDEF" }, type_icons: { chore: "leaf" } });
  assert.deepEqual(saved.type_colors, { bug: "#123abc", chore: "#ABCDEF" });
  assert.deepEqual(saved.type_icons, { chore: "leaf" });
  assert.equal(schema({ types }).type_colors, undefined);
  for (const type_colors of [{ bug: "red" }, { bug: "#12345" }, [], "#123abc"])
    assert.throws(() => schema({ types, type_colors }), /type colour/i, JSON.stringify(type_colors));
  for (const type_icons of [{ bug: "rocket" }, { bug: 3 }, [], "bug"])
    assert.throws(() => schema({ types, type_icons }), /type icon/i, JSON.stringify(type_icons));
});

test("a type taken out of the project leaves its colour and icon behind", () => {
  const saved = schema({ types: ["task"], type_colors: { task: "#123abc", bug: "#654321" }, type_icons: { bug: "flag" } });
  assert.deepEqual(saved.type_colors, { task: "#123abc" });
  assert.equal(saved.type_icons, undefined);
});

test("a card type shows the icon and colour its project chose, or its own icon", () => {
  const icon = (name) => `<svg class="icon" data-name="${name}"></svg>`;
  const config = { type_icons: { chore: "leaf" }, type_colors: { chore: "#123abc" } };
  assert.equal(typeIcon(icon, config, "chore"), '<svg style="color:#123abc" class="icon" data-name="leaf"></svg>');
  assert.equal(typeIcon(icon, config, "bug"), '<svg class="icon" data-name="bug"></svg>');
  assert.equal(typeIcon(icon, {}, undefined), '<svg class="icon" data-name="task"></svg>');
  // Only a #rrggbb colour reaches the page.
  assert.equal(typeIcon(icon, { type_colors: { bug: 'red" onclick="x' } }, "bug"), '<svg class="icon" data-name="bug"></svg>');
  for (const name of ["task", "story", "epic", "milestone", "bug", "activity"]) assert.ok(TYPE_ICONS.includes(name), name);
});

test("a type's own icon is its name when the app offers that icon, else the task's, as Settings shows", () => {
  assert.equal(typeIconName({}, "flag"), "flag");
  assert.equal(typeIconName({}, "pencil"), "task");
  // A type named like an object's own key reads nothing inherited.
  const icon = (name) => `<svg class="icon" data-name="${name}"></svg>`;
  assert.equal(typeIcon(icon, { type_icons: { bug: "flag" }, type_colors: { bug: "#123456" } }, "constructor"), '<svg class="icon" data-name="task"></svg>');
});
