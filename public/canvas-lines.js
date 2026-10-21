// Preserve SVG text nodes during camera updates. Replacing the complete SVG on
// every zoom frame makes browsers repeatedly lay out and rasterise its labels.
function patchElement(current, next) {
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name))
      current.removeAttribute(attribute.name);
  }
  for (const attribute of next.attributes) {
    if (current.getAttribute(attribute.name) !== attribute.value)
      current.setAttribute(attribute.name, attribute.value);
  }
  const oldChildren = [...current.childNodes],
    newChildren = [...next.childNodes];
  newChildren.forEach((child, index) => {
    const old = oldChildren[index];
    if (!old) current.append(child);
    else if (old.nodeType !== child.nodeType || old.nodeName !== child.nodeName)
      old.replaceWith(child);
    else if (child.nodeType === Node.ELEMENT_NODE) patchElement(old, child);
    else if (old.nodeValue !== child.nodeValue) old.nodeValue = child.nodeValue;
  });
  for (const child of oldChildren.slice(newChildren.length)) child.remove();
}
const key = (el) =>
  [
    el.tagName,
    el.dataset.edge,
    el.dataset.edgeEnd ?? "",
    el.dataset.bend ?? "",
  ].join(":");
// Selected connectors share one non-interactive highlight. Keeping it outside
// the connector groups avoids a separate overlay (and alpha overdraw) per edge.
export function renderConnectorSelection(svg, zoom = 1) {
  if (!svg) return;
  const paths = [...svg.querySelectorAll(".canvas-edge.selected")];
  let halo = svg.querySelector(":scope > .connector-selection");
  if (!paths.length) { halo?.remove(); return; }
  if (!halo) {
    halo = document.createElementNS("http://www.w3.org/2000/svg", "path");
    halo.setAttribute("class", "connector-selection");
    halo.setAttribute("fill", "none");
    halo.setAttribute("aria-hidden", "true");
    halo.setAttribute("vector-effect", "non-scaling-stroke");
    svg.prepend(halo);
  }
  const d = paths.map(path => path.getAttribute("d")).join(" ");
  const width = String(8 + Math.max(...paths.map(path => parseFloat(path.style.strokeWidth) || 2)) * zoom);
  if (halo.getAttribute("d") !== d) halo.setAttribute("d", d);
  if (halo.getAttribute("stroke-width") !== width) halo.setAttribute("stroke-width", width);
}
export function renderCanvasEdges(svg, markup, zoom = 1) {
  if (svg._cameraMarkup === markup) return;
  const next = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  next.innerHTML = markup;
  const existing = new Map(
    [...svg.children]
      .filter((el) => el.hasAttribute("data-edge"))
      .map((el) => [key(el), el]),
  );
  for (const child of [...next.children]) {
    const id = key(child),
      current = existing.get(id);
    if (current) {
      patchElement(current, child);
      existing.delete(id);
    } else svg.append(child);
  }
  for (const child of existing.values()) child.remove();
  renderConnectorSelection(svg, zoom);
  svg._cameraMarkup = markup;
}
