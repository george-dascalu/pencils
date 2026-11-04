// The cards, lanes and rows a drag's landing place pushes slide to their new places instead of
// jumping (F0.22-9): measure them, change the page, then slide each by what it moved, less what the
// nearest moving element around it moved (a lane slides as a whole, its cards by what they moved
// within it).
export function slideMoves(elements, change) {
  const tops = new Map(elements.map((el) => [el, el.getBoundingClientRect().top]));
  change();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moved = new Map(elements.map((el) => [el, tops.get(el) - el.getBoundingClientRect().top]));
  for (const [el, delta] of moved) {
    let around = el.parentElement;
    while (around && !moved.has(around)) around = around.parentElement;
    const own = delta - (moved.get(around) || 0);
    // Only what is on screen needs to slide; added to a slide still running, so nothing jumps.
    if (own && tops.get(el) < innerHeight && tops.get(el) > -el.offsetHeight)
      el.animate([{ transform: `translateY(${own}px)` }, { transform: "translateY(0)" }], { duration: 140, easing: "ease-out", composite: "add" });
  }
}
