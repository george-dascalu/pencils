// Phones and touch screens such as iPad: a tray above the bottom bar, opened by tapping the open
// tab again, holds Tasks and Planning layouts or the Documents list and document views.
// project-layout.js toggles it and closes it on a choice, a tap elsewhere or Escape.
// Matches the bottom bar's media query in project-layout.css.
export const tabBar = matchMedia("(max-width: 600px), (pointer: coarse)");
// How much of the bottom of `el`, which runs under the floating bottom bar, the bar covers: none on
// desktop, while typing (the bar steps aside) or when something, such as the expanded board, lies over it.
export function bottomBarCover(el) {
  const r = tabBar.matches && document.querySelector(".topbar .tabs")?.getBoundingClientRect();
  if (!r?.height || !document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(".topbar .tabs")) return 0;
  return Math.max(0, el.getBoundingClientRect().bottom - r.top);
}
// The lowest point, in the board's own coordinates, clear of the bottom bar and the phone dock.
export function boardFloor(canvas) {
  const dock = canvas.querySelector(".phone-board-dock");
  return Math.min(canvas.clientHeight - bottomBarCover(canvas), dock?.offsetParent ? dock.offsetTop - 8 : Infinity);
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
  tab.closest(".view-tab-group").after(tray);
  tab.setAttribute("aria-controls", tray.id);
  tab.setAttribute("aria-expanded", String(open));
}
export function removeLayoutTray() {
  document.querySelector(".layout-tray")?.remove();
  const tab = document.querySelector('.tabs .tab[aria-controls="layout-tray"]');
  tab?.removeAttribute("aria-controls");
  tab?.removeAttribute("aria-expanded");
}
