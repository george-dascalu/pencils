let cleanup;

const columns = (board) => board.querySelectorAll(
  board.classList.contains("kanban-swimlanes")
    ? ".kanban-lanes-header > .column-header"
    : ":scope > .kanban-column",
);

// Drag auto-scroll needs continuous movement. Once it ends, return to the
// nearest whole column instead of the browser's previously snapped column.
export function snapKanbanColumns(board) {
  if (!board?.isConnected) return;
  const width = columns(board)[0]?.getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(board).getPropertyValue("--kanban-gap"));
  if (width) board.scrollTo({ left: Math.round(board.scrollLeft / (width + gap)) * (width + gap), behavior: "instant" });
}

export function observeKanbanLayout(board) {
  cleanup?.();
  cleanup = null;
  if (!board) return;
  const count = columns(board).length;
  if (!count) return;
  const style = getComputedStyle(board);
  const minimum = parseFloat(style.getPropertyValue("--kanban-min-column-width"));
  const gap = parseFloat(style.getPropertyValue("--kanban-gap"));
  let available = 0, pitch = 0, first = 0;
  function rememberColumn() {
    // A resize can clamp scrollLeft before ResizeObserver fires. Ignore that
    // adjustment so rotating keeps the column the user was actually viewing.
    if (pitch && board.clientWidth === available)
      first = Math.round(board.scrollLeft / pitch);
  }
  function resize() {
    if (!board.isConnected) return;
    // clientWidth excludes the swimlane scrollbar; ResizeObserver also runs
    // when that scrollbar appears, a sidebar opens, or the device rotates.
    const width = board.clientWidth;
    if (!width || width === available) return;
    const visible = Math.min(count, Math.max(1, Math.floor((width + gap) / (minimum + gap))));
    // Leave the edge of the next column visible so offscreen statuses are discoverable.
    const peek = visible < count ? 36 : 0;
    const columnWidth = (width - peek - (visible - 1) * gap) / visible;
    available = width;
    pitch = columnWidth + gap;
    first = Math.min(first, count - visible);
    board.style.setProperty("--kanban-column-width", `${columnWidth}px`);
    board.scrollTo({ left: first * pitch, behavior: "instant" });
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(board);
  board.addEventListener("scroll", rememberColumn, { passive: true });
  cleanup = () => {
    observer.disconnect();
    board.removeEventListener("scroll", rememberColumn);
  };
}
