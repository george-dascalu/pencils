import { bottomBarTop, tabBarQuery, positionPopover } from "./popover-position.js";
// Phones and touch screens such as iPad: a tray above the bottom bar, opened by tapping the open
// tab again, holds Tasks and Planning layouts or the Documents list and document views.
// project-layout.js toggles it and closes it on a choice, a tap elsewhere or Escape.
// Matches the bottom bar's media query in project-layout.css.
export const tabBar = matchMedia(tabBarQuery);
// How much of the bottom of `el`, which runs under the floating bottom bar, the bar covers.
export function bottomBarCover(el, ignore) {
  return Math.max(0, el.getBoundingClientRect().bottom - bottomBarTop(ignore));
}
// The lowest point, in the board's own coordinates, clear of the bottom bar and the phone dock.
export function boardFloor(canvas, ignore) {
  const dock = canvas.querySelector(".phone-board-dock");
  return Math.min(canvas.clientHeight - bottomBarCover(canvas, ignore), dock?.offsetParent ? dock.offsetTop - 8 : Infinity);
}
export function mountLayoutTray(content, open) {
  removeLayoutTray();
  const tab = document.querySelector(".tabs .tab.active");
  if (!tab) return;
  const tray = document.createElement("div");
  tray.className = "layout-tray";
  tray.id = "layout-tray";
  tray.toggleAttribute("data-open", open);
  tray.append(content);
  // After the bar's scroller, not in it: iOS Safari draws a tray inside it behind the page.
  tab.closest(".tabs-scroll").after(tray);
  tab.setAttribute("aria-controls", tray.id);
  tab.setAttribute("aria-expanded", String(open));
  positionLayoutTray();
}
export function positionLayoutTray() {
  if (tabBar.matches) return;
  const tray = document.querySelector('.layout-tray[data-open]'), tab = document.querySelector('.tabs [aria-controls="layout-tray"]');
  if (!tray || !tab) return;
  const r = tab.getBoundingClientRect(), bar = tab.closest(".topbar").getBoundingClientRect();
  positionPopover(tray, { ...r.toJSON(), bottom: bar.bottom }, { width: 420, maxHeight: 400, gap: 6 });
}
export function removeLayoutTray() {
  document.querySelector(".layout-tray")?.remove();
  const tab = document.querySelector('.tabs .tab[aria-controls="layout-tray"]');
  tab?.removeAttribute("aria-controls");
  tab?.removeAttribute("aria-expanded");
}
