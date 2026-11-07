// @ts-check
// Shared by new-project defaults, task editors and the Markdown schema.
export const DEFAULT_TASK_TYPES = Object.freeze([
  "epic", "milestone", "story", "task", "activity", "bug",
]);

// The icons a card type can take (F0.22-67), by name in the app's icon set: the built-in types' own
// first.
export const TYPE_ICONS = Object.freeze([
  "task", "story", "epic", "milestone", "bug", "activity", "check", "checklist", "flag", "star", "idea", "leaf",
  "home", "person", "people", "calendar", "clock", "sun", "tag", "file", "link", "comment", "cost", "folder", "repeat", "archive",
]);
// The built-in types' colours (styles.css); other types take the text's muted colour.
export const DEFAULT_TYPE_COLORS = Object.freeze({ epic: "#958258", bug: "#b87969", milestone: "#8780ad", story: "#789180" });
// A project's choice for a type, its own key only: a type may be named like an object's built-in one.
/** @param {any} map @param {string | undefined} type */
const chosen = (map, type) => (map && type && Object.hasOwn(map, type) ? map[type] : undefined);
// A type's own icon: its name, where the app offers that icon, as Settings shows it.
/** @param {string | undefined} type */
export const ownTypeIcon = (type) => (type && TYPE_ICONS.includes(type) ? type : "task");
/** @param {any} config @param {string | undefined} type */
export const typeIconName = (config, type) => chosen(config?.type_icons, type) || ownTypeIcon(type);
/** @param {any} config @param {string | undefined} type */
export const typeColor = (config, type) => chosen(config?.type_colors, type);
/**
 * A card type's icon, the one its project chose or its own, in the project's colour for it. It stays
 * the plain `.icon` svg, so the rules that hide or size it still apply.
 * @param {(name: string) => string} icon @param {any} config @param {string | undefined} type
 */
export function typeIcon(icon, config, type) {
  const svg = icon(typeIconName(config, type)), color = typeColor(config, type);
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? svg.replace("<svg ", `<svg style="color:${color}" `) : svg;
}
