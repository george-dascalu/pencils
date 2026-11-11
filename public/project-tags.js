import { PALETTE } from "./color-model.js";

// A project's tags (F0.21-73): the list in its settings, then any other tag its cards use, A to Z.
export function projectTags(config, tasks) {
  const listed = (config?.tags || []).filter((t) => t?.name), names = new Set(listed.map((t) => t.name));
  const others = [...new Set(tasks.flatMap((t) => t.tags || []))].filter((name) => !names.has(name)).sort((a, b) => a.localeCompare(b));
  return [...listed, ...others.map((name) => ({ name }))];
}
// A tag without a colour of its own takes one of the palette's, the same every time for its name, so
// tags tell apart at a glance (owner request, F0.23-22). White, the picker's "no colour", stays plain.
const AUTO = PALETTE.map(([color]) => color).filter((color) => color !== "#ffffff");
export const autoTagColor = (name) => AUTO[[...name].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) >>> 0, 0) % AUTO.length];
export function tagColor(config, name) {
  const color = config?.tags?.find((t) => t.name === name)?.color;
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color : autoTagColor(name);
}
// The names a project's list can hold (as server/model.js checks); others stay on their cards only.
export const listableTag = (name) => typeof name === "string" && !!name && name === name.trim() && name.length <= 80 && !name.includes(",");
