// Phones: a tray above the bottom bar, opened by tapping the open tab again, holds Tasks and
// Planning layouts or the Documents list and document views. project-layout.js toggles it and
// closes it on a choice, a tap elsewhere or Escape.
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
