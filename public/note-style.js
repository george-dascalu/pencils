import { isTaskNote, nodeFill } from "./node-layout.js";

export const noteStyles = [
  ["classic", "Classic"],
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["fold-top", "Top fold"],
  ["fold-bottom", "Bottom fold"],
];
export const isNote = (n) => n.type === "sticky" || isTaskNote(n);
export function noteStyleSVG(n, esc) {
  const { w, h } = n;
  const style = n.noteStyle || "classic";
  const fold = Math.min(28, w * 0.16, h * 0.16);
  const stroke = `stroke="${esc(n.borderColor || "#82937d")}" stroke-width="${n.borderWidth ?? 0}"${n.borderStyle === "dashed" ? ' stroke-dasharray="10 6"' : n.borderStyle === "dotted" ? ' stroke-dasharray="2 5"' : ""}`;
  const attrs = `fill="${esc(nodeFill(n))}" ${stroke}`;
  if (style === "fold-top" || style === "fold-bottom") {
    const top = style === "fold-top";
    const outline = top
      ? `M0 0H${w - fold}L${w} ${fold}V${h}H0Z`
      : `M0 0H${w}V${h - fold}L${w - fold} ${h}H0Z`;
    const corner = top
      ? `M${w - fold} 0V${fold}H${w}Z`
      : `M${w} ${h - fold}H${w - fold}V${h}Z`;
    return `<path d="${outline}" ${attrs}/><path d="${corner}" fill="${esc(nodeFill(n))}"/><path d="${corner}" fill="#000000" fill-opacity=".14"/>`;
  }
  return `<rect width="${w}" height="${h}" rx="${style === "rounded" ? Math.min(20, w * 0.2, h * 0.2) : style === "classic" ? 2 : 0}" ${attrs}/>`;
}
export function noteStyleControls(n, { esc }) {
  if (!isNote(n)) return "";
  return `<div class="note-style-picker geometry-wide" role="group" aria-label="Note style">${noteStyles.map(([value, label]) => `<button type="button" data-note-style="${value}" aria-label="${label} note" title="${label}" aria-pressed="${(n.noteStyle || "classic") === value}" ${n.locked ? "disabled" : ""}><svg viewBox="-2 -2 52 52" aria-hidden="true">${noteStyleSVG({ w: 48, h: 48, color: nodeFill(n), noteStyle: value, borderWidth: 1 }, esc)}</svg><span>${label}</span></button>`).join("")}</div>`;
}
export function paintNoteStyle(el, n, esc) {
  el.querySelector(":scope > .note-style-art")?.remove();
  const styled = isNote(n) && n.noteStyle && n.noteStyle !== "classic";
  el.classList.toggle("styled-note", !!styled);
  if (!styled) return;
  el.insertAdjacentHTML(
    "afterbegin",
    `<svg class="note-style-art" viewBox="0 0 ${n.w} ${n.h}" preserveAspectRatio="none" aria-hidden="true">${noteStyleSVG(n, esc)}</svg>`,
  );
}
