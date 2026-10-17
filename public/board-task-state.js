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
    deleted: "Deleted task",
    unavailable: "Task unavailable",
  }[value.status];
  return `<span class="board-task-availability ${value.status}" role="status">${icon(value.status === "archived" ? "folder" : value.status === "deleted" ? "trash" : "help")}${esc(label)}</span>`;
}
export function unavailableTaskHTML(node, value, ctx) {
  const { esc } = ctx;
  return `<div class="unavailable-task-content">${taskStateBadge(value, ctx)}<strong class="task-title">${esc(value.title || "Task unavailable")}</strong><small class="canvas-task-key">${esc(value.key || node.task)}</small><p>${value.status === "deleted" ? "This task was deleted. Its board card has been kept in place." : "The linked task cannot be found or read. Its board card has been kept in place."}</p>${value.status === "deleted" ? `<button type="button" class="button small" data-pro="task-restore" data-task="${esc(node.task)}">${ctx.icon("refresh")}Restore task</button>` : ""}<button type="button" class="button small" data-pro="task-detach" data-id="${esc(node.id)}">Detach as note</button></div>`;
}
