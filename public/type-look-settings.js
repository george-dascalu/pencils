// Each card type's icon and colour, in Settings → Card types (F0.22-67): a row per type with the icon
// from the shared select menu (each option shows its icon) and the shared colour picker. Only choices
// that differ from the type's own are saved, so the built-in colours can change later.
import { TYPE_ICONS, DEFAULT_TYPE_COLORS, typeIconName, typeColor, ownTypeIcon } from "./task-types.js";

// The muted text colour (styles.css) that types without a colour of their own take.
const MUTED = "#626b5e";
const ownColor = (type) => (Object.hasOwn(DEFAULT_TYPE_COLORS, type) ? DEFAULT_TYPE_COLORS[type] : MUTED);
const name = (value) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");

export function typeLooksHTML(types, config, { esc, colorPicker }) {
  return `<fieldset class="card-fields priority-colors type-looks" data-type-looks><legend>Type icons and colours</legend><div class="priority-color-list">${types.map((type) => {
    const chosen = typeIconName(config, type);
    return `<div class="field">${esc(name(type))}<select name="type-icon-${esc(type)}" aria-label="${esc(name(type))} icon">${TYPE_ICONS.map((icon) => `<option value="${icon}" data-icon="${icon}"${icon === chosen ? " selected" : ""}>${name(icon)}</option>`).join("")}</select>${colorPicker({ label: `${name(type)} colour`, value: typeColor(config, type) || ownColor(type), name: `type-color-${type}` })}</div>`;
  }).join("")}</div></fieldset>`;
}

// The schema's type_icons and type_colors from the form, for the types it now has.
export function typeLookChanges(data, types) {
  const chosen = (prefix, own) => Object.fromEntries(types.map((type) => [type, data.get(`${prefix}${type}`)]).filter(([type, value]) => value && value !== own(type)));
  const icons = chosen("type-icon-", ownTypeIcon), colors = chosen("type-color-", ownColor);
  return { type_icons: Object.keys(icons).length ? icons : undefined, type_colors: Object.keys(colors).length ? colors : undefined };
}

// Shown after the type list, and redrawn when a type is added or removed, keeping what was chosen.
export function installTypeLooks(form, config, ctx) {
  const types = form.elements.types, list = form.querySelector(".type-list-field");
  if (!types || !list) return;
  const draw = (redraw) => {
    const now = types.value.split(",").map((t) => t.trim()).filter(Boolean);
    const looks = redraw ? { ...config, ...typeLookChanges(new FormData(form), now) } : config;
    form.querySelector("[data-type-looks]")?.remove();
    list.insertAdjacentHTML("afterend", typeLooksHTML(now, looks, ctx));
  };
  draw(false);
  types.addEventListener("change", () => draw(true));
}
