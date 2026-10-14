const types = [
  ["edge", "Arrows", "connect"],
  ["task", "Tasks", "task"],
  ["sticky", "Notes", "sticky"],
  ["text", "Text", "text"],
  ["shape", "Shapes", "shape"],
  ["frame", "Frames", "frame"],
  ["grid", "Grids", "table"],
  ["image", "Images", "image"],
  ["draw", "Drawings", "pencil"],
  ["file", "Live notes", "file"],
  ["link", "Links", "link"],
  ["query", "Live task views", "table"],
];
export const selectionType = (n) =>
  n.type === "task" && n.displayAs === "note" ? "sticky" : n.type;

// A filter refines the current selection only; it never changes board contents.
export function selectionFilter(ctx, pick, replace) {
  const { state, board, $, icon } = ctx;
  let pool = new Set(),
    expected = "";
  const key = (ids) =>
    JSON.stringify([state.project?.id, board()?.id, [...ids].sort()]);
  const candidates = () =>
    [
      ...(board()?.nodes || []),
      ...(board()?.edges || []).map((e) => ({
        ...e,
        id: `edge:${e.id}`,
        type: "edge",
      })),
    ].filter((n) => pool.has(n.id));
  function sync() {
    const ids = pick().map((n) => n.id),
      next = key(ids);
    if (next !== expected) pool = new Set(ids);
    expected = next;
  }
  function active() {
    return candidates().length > pick().length;
  }
  function html(menu) {
    const nodes = candidates();
    if (nodes.length < 2) return "";
    const counts = new Map(),
      selectedTypes = new Set(pick().map(selectionType));
    for (const n of nodes)
      counts.set(selectionType(n), (counts.get(selectionType(n)) || 0) + 1);
    return menu(
      "filter",
      "Filter selection",
      `${icon("filter")}<span class="selection-filter-caption">Filter</span><span class="selection-filter-total ${active() ? "filtered" : ""}" title="${pick().length} of ${nodes.length} objects selected">${pick().length}</span>`,
      `<strong>Object types</strong><p class="selection-filter-hint">Keep one or more types from this selection.</p>${types
        .filter(([type]) => counts.has(type))
        .map(
          ([type, label, glyph]) =>
            `<div class="selection-filter-row"><label><input type="checkbox" data-selection-type="${type}" aria-label="${label} (${counts.get(type)})" ${selectedTypes.has(type) ? "checked" : ""}>${icon(glyph)}<span>${label}</span><span class="selection-filter-count">${counts.get(type)}</span></label><button type="button" data-selection-only="${type}" aria-label="Select only ${label.toLowerCase()}" title="Select only ${label.toLowerCase()}">Only</button></div>`,
        )
        .join(
          "",
        )}<div class="selection-filter-footer"><button type="button" class="button small" data-selection-restore>Restore all ${nodes.length}</button><button type="button" class="button small primary" data-selection-apply>Apply (${pick().length})</button></div>`,
    );
  }
  function apply(wanted) {
    const nodes = candidates().filter(
      (n) => !wanted || wanted.has(selectionType(n)),
    );
    if (!nodes.length) return;
    const ids = nodes.map((n) => n.id);
    expected = key(ids);
    replace(ids);
    // Keep keyboard users on the control after the toolbar is rebuilt.
    $('[data-selection-menu="filter"] > summary')?.focus({
      preventScroll: true,
    });
  }
  document.addEventListener("click", (event) => {
    if (
      !event.target.closest('#selection-tools [data-selection-menu="filter"]')
    )
      return;
    const only = event.target.closest("[data-selection-only]");
    if (only) apply(new Set([only.dataset.selectionOnly]));
    else if (event.target.closest("[data-selection-restore]")) apply(null);
    else if (event.target.closest("[data-selection-apply]"))
      apply(
        new Set(
          [...document.querySelectorAll("[data-selection-type]:checked")].map(
            (el) => el.dataset.selectionType,
          ),
        ),
      );
  });
  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-selection-type]")) return;
    const wanted = new Set(
      [...document.querySelectorAll("[data-selection-type]:checked")].map(
        (el) => el.dataset.selectionType,
      ),
    );
    const count = candidates().filter((n) =>
      wanted.has(selectionType(n)),
    ).length;
    const button = $("[data-selection-apply]");
    button.disabled = !count;
    button.textContent = `Apply (${count})`;
  });
  return { sync, html, active };
}
