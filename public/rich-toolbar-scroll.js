import { positionPopover } from "./popover-position.js";

// One formatting toolbar everywhere: the groups scroll sideways as a single
// line, snap to whole controls, and show a chevron at an edge with more tools.
export function installToolbarScroll(shell) {
  const scroller = shell?.querySelector(".rich-toolbar");
  if (!scroller) return { update() {}, destroy() {} };
  const edges = {
    start: shell.querySelector('[data-rich-scroll="start"]'),
    end: shell.querySelector('[data-rich-scroll="end"]'),
  };
  function update() {
    const max = scroller.scrollWidth - scroller.clientWidth;
    const start = max > 1 && scroller.scrollLeft > 1;
    const end = max > 1 && scroller.scrollLeft < max - 1;
    shell.classList.toggle("can-scroll-start", start);
    shell.classList.toggle("can-scroll-end", end);
    if (edges.start) edges.start.hidden = !start;
    if (edges.end) edges.end.hidden = !end;
  }
  const step = (direction) =>
    scroller.scrollBy({ left: direction * Math.max(96, scroller.clientWidth * 0.7), behavior: "smooth" });
  edges.start?.addEventListener("click", () => step(-1));
  edges.end?.addEventListener("click", () => step(1));
  scroller.addEventListener("scroll", update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(scroller);
  for (const group of scroller.children) observer.observe(group);
  update();
  return {
    update,
    destroy() {
      observer.disconnect();
    },
  };
}

// Menus inside the scroller open in the top layer so the scroll clip cannot cut them.
export function floatMenuPanel(menu, { width = 200, maxHeight = 320 } = {}) {
  const panel = menu?.querySelector(":scope > .selection-popover");
  if (!panel) return;
  if (!panel.hasAttribute("popover")) panel.setAttribute("popover", "manual");
  if (menu.open) {
    if (!panel.matches(":popover-open")) panel.showPopover();
    positionPopover(panel, menu.getBoundingClientRect(), { width, maxHeight });
  } else if (panel.matches(":popover-open")) panel.hidePopover();
}
