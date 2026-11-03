// A project's tags (F0.21-73): the list in its settings, then any other tag its cards use, A to Z.
export function projectTags(config, tasks) {
  const listed = (config?.tags || []).filter((t) => t?.name), names = new Set(listed.map((t) => t.name));
  const others = [...new Set(tasks.flatMap((t) => t.tags || []))].filter((name) => !names.has(name)).sort((a, b) => a.localeCompare(b));
  return [...listed, ...others.map((name) => ({ name }))];
}
export function tagColor(config, name) {
  const color = config?.tags?.find((t) => t.name === name)?.color;
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "";
}
// The names a project's list can hold (as server/model.js checks); others stay on their cards only.
export const listableTag = (name) => typeof name === "string" && !!name && name === name.trim() && name.length <= 80 && !name.includes(",");
