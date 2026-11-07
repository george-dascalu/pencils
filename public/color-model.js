export const validColor = (value) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
export const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export function hexToHSV(hex) {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let h = 0;
  if (delta) {
    h =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}
export function hsvToHex({ h, s, v }) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s);
  v = clamp(v);
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const rgb =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    rgb
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function recentColors(values, next) {
  return [
    ...new Set(
      [next, ...(Array.isArray(values) ? values : [])]
        .filter(validColor)
        .map((v) => v.toLowerCase()),
    ),
  ].slice(0, 6);
}
const luminance = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// The colour matching `hex` in the other theme (F0.22-72): its hue and saturation, lighter for dark
// mode and darker for light mode, and at least 3:1 against that theme's surface (appearance.css).
export function themeMatch(hex, dark) {
  const { h, s, v } = hexToHSV(hex),
    l = v * (1 - s / 2),
    sl = l > 0 && l < 1 ? (v - l) / Math.min(l, 1 - l) : 0;
  const at = (to) => {
    const tv = to + sl * Math.min(to, 1 - to);
    return hsvToHex({ h, s: tv ? 2 * (1 - to / tv) : 0, v: tv });
  };
  let to = clamp(l + (dark ? 0.2 : -0.2), 0.05, 0.95);
  while (contrast(at(to), dark ? "#202c25" : "#ffffff") < 3 && to > 0.05 && to < 0.95) to += dark ? 0.02 : -0.02;
  return at(clamp(to, 0, 1));
}
