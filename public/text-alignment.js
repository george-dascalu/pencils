export const textAlignments = ["left", "center", "right", "justify"];
export function textAlignment(node) {
  return textAlignments.includes(node.textAlign)
    ? node.textAlign
    : node.type === "shape"
      ? "center"
      : "left";
}
export function alignmentButtons(icon, current, disabled = false) {
  return `<div class="text-alignment-row" role="group" aria-label="Horizontal text alignment">${textAlignments
    .map((value) => {
      const label = {
        left: "Align text left",
        center: "Centre text",
        right: "Align text right",
        justify: "Justify text",
      }[value];
      return `<button type="button" class="selection-action" data-text-align="${value}" aria-label="${label}" title="${label}" aria-pressed="${current === value}" ${disabled ? "disabled" : ""}>${icon(`text-${value}`)}</button>`;
    })
    .join("")}</div>`;
}
