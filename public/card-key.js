// A card ID that would be cut short shows only its number (F0.21-80), wherever a key is drawn; the
// full ID stays in data-key-full and the tooltip.
export const cardKeyNumber = (key) => /^.+-(\d+)$/.exec(key)?.[1] ?? key;
export const fitCardKey = (full, width, measure) => (measure(full) <= width ? full : cardKeyNumber(full));

const SELECTOR = [
  ".task-row .task-id", ".phone-task-meta > span:not([class])", ".task-relationship-key", ".document-card-key",
  ".home-task-key", ".canvas-task-key", ".task-title-row .task-key", ".task-editor-header-row .task-key", ".kanban-card .task-id",
].join(", ");

export function installCardKeys() {
  const keys = new Set(), pen = document.createElement("canvas").getContext("2d");
  // Measure layout pixels from the observer's fractional content box (a board's zoom must not change
  // keys, and whole-pixel widths would cut a key that fits), reading every key before writing any.
  function update(entries) {
    const plan = [];
    for (const { target: el, contentRect } of entries) {
      if (!el.isConnected || contentRect.width <= 0) continue;
      // The kept ID counts only while the key still shows its number: a redraw may write a new key.
      const kept = el.dataset.keyFull, full = kept && el.textContent === cardKeyNumber(kept) ? kept : el.textContent;
      if (cardKeyNumber(full) === full) continue;
      const style = getComputedStyle(el), spacing = parseFloat(style.letterSpacing) || 0;
      pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      plan.push([el, full, fitCardKey(full, contentRect.width + 0.25, (text) => pen.measureText(text).width + Math.max(0, Array.from(text).length - 1) * spacing)]);
    }
    for (const [el, full, text] of plan) {
      if (text !== full) {
        el.dataset.keyFull = full;
        if (!el.title) { el.title = full; el.dataset.keyTitle = ""; }
      } else {
        delete el.dataset.keyFull;
        if ("keyTitle" in el.dataset) { if (el.title === full) el.removeAttribute("title"); delete el.dataset.keyTitle; }
      }
      if (el.textContent !== text) el.textContent = text;
    }
  }
  // Changing a key's text inside the observer's callback resizes keys sized by their text in the
  // same pass (WebKit reports a loop): note the sizes there and rewrite them in the next frame.
  const sizes = new Map();
  let pending = 0;
  const resize = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) sizes.set(target, contentRect);
    pending ||= requestAnimationFrame(() => {
      pending = 0;
      const batch = [...sizes].map(([target, contentRect]) => ({ target, contentRect }));
      sizes.clear();
      update(batch);
    });
  });
  const each = (node, action) => {
    if (!(node instanceof Element)) return;
    if (node.matches(SELECTOR)) action(node);
    node.querySelectorAll(SELECTOR).forEach(action);
  };
  const add = (el) => { if (!keys.has(el)) { keys.add(el); resize.observe(el); } };
  const remove = (el) => { if (!el.isConnected) { resize.unobserve(el); keys.delete(el); } };
  new MutationObserver((records) => {
    for (const record of records) {
      record.removedNodes.forEach((node) => each(node, remove));
      record.addedNodes.forEach((node) => each(node, add));
      // A key whose text was rewritten is measured again (observing again reports its size).
      if (keys.has(record.target)) { resize.unobserve(record.target); resize.observe(record.target); }
    }
  }).observe(document.body, { childList: true, subtree: true });
  each(document.body, add);
  // A shortened key sized by its text (with a max-width) keeps its short width when its room grows,
  // so a resize, theme or density change tries its full ID again, once a frame; observing again
  // reports its size. Keys showing in full follow their own size.
  // shortcut: a shortened key sized by its text stays short when only its container grows (a panel
  // resized), until the next window resize; observe parents if that shows up.
  let frame = 0;
  const refit = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const el of keys) if (el.dataset.keyFull) { el.textContent = el.dataset.keyFull; resize.unobserve(el); resize.observe(el); }
    });
  };
  addEventListener("resize", refit);
  new MutationObserver(refit).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-density", "data-fields-off"] });
  document.fonts.addEventListener("loadingdone", refit);
}
