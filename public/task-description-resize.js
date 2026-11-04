// A grip at the bottom of the card editor's description: drag it (mouse, pen, touch) or press
// Arrow Up/Down to change its height; the height is kept in this browser (F0.21-99).
const KEY = "pencils:description-height", MIN = 80, MAX = 1200, STEP = 24;
const read = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const write = (value) => { try { localStorage.setItem(KEY, String(value)); } catch { /* kept for this card only */ } };

export function installDescriptionResize(section) {
  if (!section) return;
  const grip = document.createElement("div");
  grip.className = "description-resize";
  grip.tabIndex = 0;
  grip.setAttribute("role", "separator");
  grip.setAttribute("aria-orientation", "horizontal");
  grip.setAttribute("aria-label", "Resize description");
  grip.setAttribute("aria-valuemin", MIN);
  grip.setAttribute("aria-valuemax", MAX);
  grip.innerHTML = "<span></span>";
  section.append(grip);
  const visible = () => section.querySelector(":is(.inline-rich, .inline-preview, .markdown-source):not(.hidden)");
  const current = () => Math.round(visible()?.getBoundingClientRect().height || 0);
  const set = (value) => {
    const height = Math.round(Math.min(MAX, Math.max(MIN, value)));
    section.style.setProperty("--description-height", `${height}px`);
    section.dataset.resized = "";
    grip.setAttribute("aria-valuenow", height);
    return height;
  };
  const saved = read();
  if (saved) set(saved);
  const sync = () => grip.setAttribute("aria-valuenow", current());
  sync();
  grip.addEventListener("focus", sync);
  let drag = null;
  grip.addEventListener("pointerdown", (event) => {
    if (event.button) return;
    sync();
    drag = { y: event.clientY, height: current() };
    grip.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  grip.addEventListener("pointermove", (event) => { if (drag) set(drag.height + event.clientY - drag.y); });
  const end = () => { if (drag) { drag = null; write(current()); } };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
  grip.addEventListener("keydown", (event) => {
    const dir = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!dir) return;
    event.preventDefault();
    event.stopPropagation();
    sync();
    write(set(current() + dir * STEP * (event.shiftKey ? 4 : 1)));
  });
}
