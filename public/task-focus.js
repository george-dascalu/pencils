// Keep a task opener usable even when autosave replaces its row.
export function taskFocus(opener, taskId) {
  const node = opener?.closest?.("[data-node]")?.dataset.node;
  const attributes = ["data-action", "data-id", "data-task", "data-pro"];
  const identityClass = ["row-open", "task-id", "task-type", "task-title", "table-open"].find(name => opener?.classList?.contains(name));
  const peers = () => [...document.querySelectorAll(".row-open, .table-open, .kanban-card .task-title")];
  const index = peers().findIndex(el => el.dataset.id === taskId);
  const selector = opener?.matches?.("button,a,input,select")
    ? (identityClass ? `.${identityClass}` : "") + attributes.filter((key) => opener.hasAttribute(key))
      .map((key) => `[${key}="${CSS.escape(opener.getAttribute(key))}"]`).join("")
    : "";
  return () => {
    const scope = node ? document.querySelector(`[data-node="${CSS.escape(node)}"]`) : document;
    const replacement = selector && scope?.querySelector(selector);
    const target = opener?.isConnected ? opener : replacement ||
      (taskId && document.querySelector(`[data-action="task-open"][data-id="${CSS.escape(taskId)}"],[data-task="${CSS.escape(taskId)}"]`)) ||
      scope?.matches?.("[data-node]") && scope ||
      (index >= 0 && peers()[Math.min(index, peers().length - 1)]) ||
      document.querySelector('[data-action="task-new"]');
    target?.focus({ preventScroll: true });
  };
}
