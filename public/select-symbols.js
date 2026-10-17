// Visual choices share their symbols between the closed field and its menu.
export function selectSymbol(kind, value) {
  let art;
  if (kind === "borderStyle") {
    const dash = { solid: "", dashed: "7 5", dotted: "1 5" }[value];
    if (dash == null) return "";
    art = `<path d="M4 12H40" stroke-dasharray="${dash}"/>`;
  } else if (kind === "borderWidth") {
    const width = Number(value);
    if (![0, 1, 2, 3, 5, 8].includes(width)) return "";
    art = width
      ? `<path d="M4 12H40" stroke-width="${width}"/>`
      : '<circle cx="22" cy="12" r="8"/><path d="M16 18L28 6"/>';
  } else if (kind === "shape") {
    art = {
      rectangle: '<rect x="10" y="4" width="24" height="16"/>',
      rounded: '<rect x="10" y="4" width="24" height="16" rx="5"/>',
      ellipse: '<ellipse cx="22" cy="12" rx="13" ry="8"/>',
      diamond: '<path d="M22 2L36 12L22 22L8 12Z"/>',
      triangle: '<path d="M22 3L36 21H8Z"/>',
      parallelogram: '<path d="M15 4H37L29 20H7Z"/>',
      hexagon: '<path d="M14 4H30L37 12L30 20H14L7 12Z"/>',
    }[value];
  }
  return art
    ? `<svg class="select-symbol" viewBox="0 0 44 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`
    : "";
}
