// Disclosure belongs to a board placement, not to the underlying task.
export function resizeTaskCard(board, node, collapsed, height) {
  const oldBottom = node.y + node.h;
  if (collapsed) node.taskExpandedHeight = node.h;
  node.taskCollapsed = collapsed;
  node.h = Math.min(100000, Math.max(96, Math.ceil(height)));
  const delta = node.y + node.h - oldBottom;
  const frame = board.nodes.find(n => n.id === node.projectFrameOwner);
  if (!frame || frame.locked) return;
  // Generated plans flow vertically. Keep the space between their rows when a
  // description opens; manually placed cards outside the plan stay untouched.
  for (const other of board.nodes) {
    if (other.id !== node.id && other.projectFrameOwner === frame.id &&
        other.y >= oldBottom && !other.locked) other.y += delta;
  }
  const cards = board.nodes.filter(n => n.projectFrameOwner === frame.id);
  frame.h = Math.max(360, ...cards.map(n => n.y + n.h - frame.y + 48));
}

export function taskCardHeight(element, collapsed) {
  const clone = element.cloneNode(true);
  clone.removeAttribute("data-node");
  clone.classList.remove("selected", "content-truncated", "inline-editing");
  clone.classList.toggle("task-card-expanded", !collapsed);
  Object.assign(clone.style, {
    position: "absolute", left: "0", top: "0", height: "auto",
    visibility: "hidden", pointerEvents: "none",
  });
  clone.querySelectorAll(".connection-port,.resize-handle").forEach(n => n.remove());
  const content = clone.querySelector(".board-node-content");
  content.style.height = "auto";
  for (const description of clone.querySelectorAll(".task-card-description")) {
    description.hidden = collapsed;
    Object.assign(description.style, { flexShrink: "0", maxHeight: "none", overflow: "visible" });
  }
  element.parentElement.append(clone);
  const height = clone.offsetHeight + 2;
  clone.remove();
  return height;
}
