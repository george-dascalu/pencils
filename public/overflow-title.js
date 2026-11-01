// A title cut off with an ellipsis shows in full on hover. Text fields whose value can change while
// open (the card editor's title, Table title cells) have no fixed title attribute, so one is set from
// the current value when the pointer arrives or the value changes, and removed again once it fits.
// Other cut-off titles carry their own title attribute; a title the app set itself is left alone.
export function installOverflowTitles(target = document) {
  const refresh = (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.title && el.title !== el.dataset.overflowTitle) return;
    if (getComputedStyle(el).textOverflow !== "ellipsis") return;
    const text = el.value.trim();
    if (el.scrollWidth > el.clientWidth && text) el.title = el.dataset.overflowTitle = text;
    else if (el.dataset.overflowTitle !== undefined) {
      el.removeAttribute("title");
      delete el.dataset.overflowTitle;
    }
  };
  target.addEventListener("pointerover", refresh);
  target.addEventListener("input", refresh);
}
