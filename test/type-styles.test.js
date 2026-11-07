// Owner request (F0.22-67): each card type can have its own colour and icon, set in project settings.
import test from "node:test";
import assert from "node:assert/strict";
import { schema } from "../server/model.js";
import { typeIcon, typeIconName, TYPE_ICONS } from "../public/task-types.js";
import { themeMatch, hexToHSV } from "../public/color-model.js";
import { typeLookChanges } from "../public/type-look-settings.js";

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
  assert.equal(typeIcon(icon, config, "chore"), `<svg style="color:#123abc;color:light-dark(#123abc, ${themeMatch("#123abc", true)})" class="icon" data-name="leaf"></svg>`);
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

// Owner request (F0.22-72): a type's colour has a light-mode and a dark-mode value.
test("a type's dark-mode colours are validated and pruned like its light ones", () => {
  const saved = schema({ types, type_colors: { bug: "#123abc" }, type_colors_dark: { bug: "#89a1f0", gone: "#ffffff" } });
  assert.deepEqual(saved.type_colors_dark, { bug: "#89a1f0" });
  for (const type_colors_dark of [{ bug: "blue" }, [], "#123abc"])
    assert.throws(() => schema({ types, type_colors_dark }), /type colour/i, JSON.stringify(type_colors_dark));
});

test("a type's icon takes its light colour in light mode and its dark one in dark mode", () => {
  const icon = (name) => `<svg class="icon" data-name="${name}"></svg>`;
  assert.equal(typeIcon(icon, { type_colors: { bug: "#123abc" }, type_colors_dark: { bug: "#89a1f0" } }, "bug"), '<svg style="color:#123abc;color:light-dark(#123abc, #89a1f0)" class="icon" data-name="bug"></svg>');
  // A colour chosen for one mode alone gets its match in the other.
  assert.equal(typeIcon(icon, { type_colors: { bug: "#123abc" } }, "bug"), `<svg style="color:#123abc;color:light-dark(#123abc, ${themeMatch("#123abc", true)})" class="icon" data-name="bug"></svg>`);
  assert.equal(typeIcon(icon, { type_colors_dark: { bug: "#89a1f0" } }, "bug"), `<svg style="color:${themeMatch("#89a1f0", false)};color:light-dark(${themeMatch("#89a1f0", false)}, #89a1f0)" class="icon" data-name="bug"></svg>`);
});

test("a colour's match keeps its hue, lighter and readable for dark mode, darker and readable for light mode", () => {
  const lightness = (hex) => { const { s, v } = hexToHSV(hex); return v * (1 - s / 2); };
  const luminance = (hex) => 0.2126 * lin(hex, 0) + 0.7152 * lin(hex, 1) + 0.0722 * lin(hex, 2);
  const lin = (hex, i) => { const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const hex of ["#958258", "#123abc", "#aed7dc", "#2244ff", "#000000", "#ffffff", "#b87969"]) {
    const dark = themeMatch(hex, true), light = themeMatch(hex, false);
    assert.match(dark, /^#[0-9a-f]{6}$/);
    assert.ok(contrast(dark, "#202c25") >= 3, `${hex} → ${dark} on dark`);
    assert.ok(contrast(light, "#ffffff") >= 3, `${hex} → ${light} on light`);
    if (hexToHSV(hex).s > 0.2) {
      assert.ok(Math.abs(hexToHSV(dark).h - hexToHSV(hex).h) < 3, `${hex} hue kept in ${dark}`);
      assert.ok(lightness(dark) > lightness(light), `${hex}: ${dark} lighter than ${light}`);
    }
  }
  // A colour picked for light mode gets a lighter one for dark mode, and back again.
  assert.ok(lightness(themeMatch("#958258", true)) > lightness("#958258"));
  assert.ok(lightness(themeMatch("#c8b89a", false)) < lightness("#c8b89a"));
});

test("a type's two colours are saved together once either differs from the type's own", () => {
  const data = (entries) => ({ get: (key) => entries[key] ?? null });
  // An epic's own colour is the same in both modes.
  assert.deepEqual(typeLookChanges(data({ "type-color-epic": "#123abc", "type-dark-color-epic": "#958258" }), ["epic"]).type_colors_dark, { epic: "#958258" });
  assert.deepEqual(typeLookChanges(data({ "type-color-epic": "#958258", "type-dark-color-epic": "#89a1f0" }), ["epic"]).type_colors, { epic: "#958258" });
  assert.deepEqual(typeLookChanges(data({ "type-color-epic": "#958258", "type-dark-color-epic": "#958258" }), ["epic"]), { type_icons: undefined, type_colors: undefined, type_colors_dark: undefined });
});
