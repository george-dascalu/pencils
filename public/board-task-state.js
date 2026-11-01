// Missing files are not necessarily deleted: only the server's trash evidence
// earns a Deleted badge. Archived tasks remain available to open and unarchive.
export function boardTaskState(node, task, availability = {}) {
  if (node.type !== "task") return null;
  if (task)
    return task.archived
      ? { status: "archived", title: task.title, key: task.key }
      : null;
  return Object.hasOwn(availability, node.task)
    ? availability[node.task]
    : { status: "unavailable" };
}
export function taskStateBadge(value, { esc, icon }) {
  if (!value) return "";
  const label = {
    archived: "Archived",
    deleted: "Deleted card",
    unavailable: "Card unavailable",
  }[value.status];
  return `<span class="board-task-availability ${value.status}" role="status">${icon(value.status === "archived" ? "folder" : value.status === "deleted" ? "trash" : "help")}${esc(label)}</span>`;
}
export function unavailableTaskHTML(node, value, ctx) {
  const { esc } = ctx;
  return `<div class="unavailable-task-content">${taskStateBadge(value, ctx)}<strong class="task-title">${esc(value.title || "Card unavailable")}</strong><small class="canvas-task-key">${esc(value.key || node.task)}</small><p>${value.status === "deleted" ? "This card was deleted. Its place on the board has been kept." : "The linked card cannot be found or read. Its place on the board has been kept."}</p>${value.status === "deleted" ? `<button type="button" class="button small" data-pro="task-restore" data-task="${esc(node.task)}">${ctx.icon("refresh")}Restore card</button>` : ""}<button type="button" class="button small" data-pro="task-detach" data-id="${esc(node.id)}">Detach as note</button></div>`;
}
