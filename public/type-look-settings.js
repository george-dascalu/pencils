// Each card type's icon and colours, in Settings → Card types (F0.22-67): a row per type with the icon
// from the shared select menu (each option shows its icon) and the shared colour picker, once for
// light mode and once for dark (F0.22-72). Only choices that differ from the type's own are saved, so
// the built-in colours can change later.
import { TYPE_ICONS, DEFAULT_TYPE_COLORS, typeIconName, typeColors, ownTypeIcon } from "./task-types.js";
import { themeMatch } from "./color-model.js";

// The muted text colour (appearance.css) that types without a colour of their own take, in each mode.
const MUTED = "#626b5e", MUTED_DARK = "#abb9ae";
const ownColor = (type) => (Object.hasOwn(DEFAULT_TYPE_COLORS, type) ? DEFAULT_TYPE_COLORS[type] : MUTED);
const ownDark = (type) => (Object.hasOwn(DEFAULT_TYPE_COLORS, type) ? DEFAULT_TYPE_COLORS[type] : MUTED_DARK);
const name = (value) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");
const picker = ({ colorPicker }, type, dark, value) =>
  colorPicker({ label: `${name(type)} colour in ${dark ? "dark" : "light"} mode`, value, name: `type-${dark ? "dark-" : ""}color-${type}` });

export function typeLooksHTML(types, config, ctx) {
  const { esc } = ctx;
  return `<fieldset class="card-fields priority-colors type-looks" data-type-looks><legend>Type icons and colours</legend><p class="field-hint">Each type has a colour for light mode, then one for dark mode. A type's first colour picks the other to match.</p><div class="priority-color-list">${types.map((type) => {
    const chosen = typeIconName(config, type), [light, dark] = typeColors(config, type);
    return `<div class="field">${esc(name(type))}<select name="type-icon-${esc(type)}" aria-label="${esc(name(type))} icon">${TYPE_ICONS.map((icon) => `<option value="${icon}" data-icon="${icon}"${icon === chosen ? " selected" : ""}>${name(icon)}</option>`).join("")}</select>${picker(ctx, type, false, light || ownColor(type))}${picker(ctx, type, true, dark || ownDark(type))}</div>`;
  }).join("")}</div></fieldset>`;
}

// The schema's type_icons and type colours from the form, for the types it now has. A type's two
// colours are kept together once either differs from its own, so neither is derived again.
export function typeLookChanges(data, types) {
  const map = (entries) => (entries.length ? Object.fromEntries(entries) : undefined);
  const colored = types.filter((type) => data.get(`type-color-${type}`) && data.get(`type-dark-color-${type}`) && (data.get(`type-color-${type}`) !== ownColor(type) || data.get(`type-dark-color-${type}`) !== ownDark(type)));
  return {
    type_icons: map(types.map((type) => [type, data.get(`type-icon-${type}`)]).filter(([type, icon]) => icon && icon !== ownTypeIcon(type))),
    type_colors: map(colored.map((type) => [type, data.get(`type-color-${type}`)])),
    type_colors_dark: map(colored.map((type) => [type, data.get(`type-dark-color-${type}`)])),
  };
}

// Shown after the type list, and redrawn when a type is added or removed, keeping what was chosen.
export function installTypeLooks(form, config, ctx) {
  const types = form.elements.types, list = form.querySelector(".type-list-field");
  if (!types || !list) return;
  // The types with a colour of their own already: the others' first colour picks its match.
  const paired = new Set(types.value.split(",").map((t) => t.trim()).filter((type) => typeColors(config, type).length));
  const draw = (redraw) => {
    const now = types.value.split(",").map((t) => t.trim()).filter(Boolean);
    for (const type of paired) if (!now.includes(type)) paired.delete(type);
    const looks = redraw ? { ...config, ...typeLookChanges(new FormData(form), now) } : config;
    form.querySelector("[data-type-looks]")?.remove();
    list.insertAdjacentHTML("afterend", typeLooksHTML(now, looks, ctx));
  };
  draw(false);
  types.addEventListener("change", () => draw(true));
  // Before the save, which waits for the picker to finish.
  form.addEventListener("change", (event) => {
    const [, dark, type] = /^type-(dark-)?color-(.+)$/.exec(event.target.name || "") || [];
    // A type's own colour picked again isn't a first choice.
    if (!type || paired.has(type) || event.target.value === (dark ? ownDark : ownColor)(type)) return;
    paired.add(type);
    const other = form.elements.namedItem(`type-${dark ? "" : "dark-"}color-${type}`)?.closest(".color-picker");
    if (other) other.outerHTML = picker(ctx, type, !dark, themeMatch(event.target.value, !dark));
  });
}
