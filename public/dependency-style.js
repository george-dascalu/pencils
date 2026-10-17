// Each board owns its dependency appearance; old project styles remain a fallback.
export const defaultDependencyStyle = Object.freeze({
  color: "#8863b2",
  lineStyle: "dashed",
  width: 3,
  toEnd: "triangle",
});
export function validDependencyStyle(style) {
  return (
    !!style &&
    typeof style === "object" &&
    !Array.isArray(style) &&
    /^#[0-9a-f]{6}$/i.test(style.color) &&
    ["solid", "dashed", "dotted"].includes(style.lineStyle) &&
    [1, 2, 3, 5].includes(style.width) &&
    ["arrow", "triangle"].includes(style.toEnd)
  );
}
export function dependencyStyle(board, project = null) {
  const value = board?.settings?.dependency_style ?? project?.dependency_style;
  return validDependencyStyle(value)
    ? { ...value, fromEnd: "none" }
    : { ...defaultDependencyStyle, fromEnd: "none" };
}
