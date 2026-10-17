import { dependencyStyle } from "./dependency-style.js";
import { connectorStyle } from "./connector-style.js";

export function readDependencyStyle(form) {
  return Object.fromEntries(
    ["color", "lineStyle", "width", "toEnd"].map((key) => {
      const value = form.elements[`dependency-${key}`].value;
      return [key, key === "width" ? Number(value) : value];
    }),
  );
}
function preview(style, esc) {
  const rendered = connectorStyle(
    { id: "dependency-style-preview", ...style, fromEnd: "none" },
    style.color,
    esc,
  );
  return `<svg viewBox="0 0 320 70" role="img" aria-label="Dependency arrow preview"><defs>${rendered.defs}</defs><rect x="4" y="14" width="65" height="42" rx="6"/><rect x="251" y="14" width="65" height="42" rx="6"/><text x="36" y="40" text-anchor="middle">A</text><text x="284" y="40" text-anchor="middle">B</text><path d="M69 35H247" fill="none" stroke-linecap="round" stroke="${esc(style.color)}" ${rendered.attrs}/></svg>`;
}
export function dependencyStyleHTML(board, { esc, colorPicker, state }) {
  const style = dependencyStyle(board, state.project);
  const select = (key, title, choices, symbol = "") =>
    `<label class="field">${title}<select name="dependency-${key}" aria-label="Dependency ${title.toLowerCase()}" ${symbol ? `data-select-symbol="${symbol}"` : ""}>${choices.map(([value, label]) => `<option value="${value}" ${String(style[key]) === String(value) ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
  return `<fieldset class="dependency-style-settings"><legend>Dependency arrow style</legend><p class="field-hint">Applies to every dependency arrow on this board. Changes save automatically and can be undone with Ctrl / ⌘ Z. A → B means A must finish before B.</p><div class="dependency-style-fields"><div class="field">Colour${colorPicker({ label: "Dependency arrow colour", name: "dependency-color", value: style.color })}</div>${select(
    "lineStyle",
    "Stroke",
    [
      ["solid", "Solid"],
      ["dashed", "Dashed"],
      ["dotted", "Dotted"],
    ],
    "borderStyle",
  )}${select(
    "width",
    "Thickness",
    [1, 2, 3, 5].map((width) => [width, `${width} px`]),
    "borderWidth",
  )}${select("toEnd", "Arrowhead", [
    ["arrow", "Open arrow"],
    ["triangle", "Filled triangle"],
  ])}</div><div class="dependency-style-preview">${preview(style, esc)}</div></fieldset>`;
}
export function previewDependencyStyle(form, esc) {
  form.querySelector(".dependency-style-preview").innerHTML = preview(
    readDependencyStyle(form),
    esc,
  );
}
