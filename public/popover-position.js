// Shared geometry for native-form menus, task pickers and colour fields.
// visualViewport keeps controls above the on-screen keyboard and within pinch zoom, and panels
// end above the floating bottom bar on phones and iPad.
export const tabBarQuery = "(max-width: 600px), (pointer: coarse)";
let tabBar;
// The floating bottom bar's top where it shows: not on desktop, while typing (the bar steps aside)
// or when something, such as the expanded board, lies over it. `ignore`, a panel being placed,
// doesn't count as lying over it.
export function bottomBarTop(ignore) {
  tabBar ||= matchMedia(tabBarQuery);
  const r = tabBar.matches && document.querySelector(".topbar .tabs")?.getBoundingClientRect();
  if (!r?.height) return Infinity;
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  let hit = document.elementFromPoint(x, y);
  if (hit && ignore?.contains(hit)) hit = document.elementsFromPoint(x, y).find((el) => !ignore.contains(el));
  return hit?.closest(".topbar .tabs") ? r.top : Infinity;
}

export function positionPopover(
  panel,
  anchor,
  { width = 220, maxHeight = 320, bounds, gap = 4 } = {},
) {
  const viewport = window.visualViewport;
  let left = viewport?.offsetLeft || 0,
    top = viewport?.offsetTop || 0;
  let right = left + (viewport?.width || innerWidth),
    bottom = Math.min(top + (viewport?.height || innerHeight), bottomBarTop(panel));
  if (bounds) {
    left = Math.max(left, bounds.left);
    top = Math.max(top, bounds.top);
    right = Math.min(right, bounds.right);
    bottom = Math.min(bottom, bounds.bottom);
  }
  const availableWidth = Math.max(1, right - left - 16),
    availableHeight = Math.max(1, bottom - top - 16);
  panel.style.width = `${Math.min(width, availableWidth)}px`;
  panel.style.maxWidth = `${availableWidth}px`;
  const below = Math.max(0, bottom - anchor.bottom - 8 - gap),
    above = Math.max(0, anchor.top - top - 8 - gap);
  const down = below >= Math.min(maxHeight, above);
  panel.style.maxHeight = `${Math.min(maxHeight, Math.max(1, down ? below : above), availableHeight)}px`;
  panel.style.left = `${Math.max(left + 8, Math.min(anchor.left, right - panel.offsetWidth - 8))}px`;
  panel.style.top = `${Math.max(top + 8, Math.min(down ? anchor.bottom + gap : anchor.top - panel.offsetHeight - gap, bottom - panel.offsetHeight - 8))}px`;
}
