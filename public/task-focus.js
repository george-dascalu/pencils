// Keep a task opener usable even when autosave replaces its row.
export function taskFocus(opener, taskId) {
  const node = opener?.closest?.("[data-node]")?.dataset.node;
  const attributes = ["data-action", "data-id", "data-task", "data-pro"];
  const identityClass = ["phone-task-open", "task-id", "task-type", "task-title", "table-open"].find(name => opener?.classList?.contains(name));
  const visible = el => el?.getClientRects().length && !el.closest("[inert]");
  const peers = () => [...document.querySelectorAll(".phone-task-open, .task-row > .task-id, .table-open, .kanban-card .task-title")].filter(visible);
  const index = peers().findIndex(el => el.dataset.id === taskId);
  const selector = opener?.matches?.("button,a,input,select")
    ? (identityClass ? `.${identityClass}` : "") + attributes.filter((key) => opener.hasAttribute(key))
      .map((key) => `[${key}="${CSS.escape(opener.getAttribute(key))}"]`).join("")
    : "";
  return () => {
    const scope = node ? document.querySelector(`[data-node="${CSS.escape(node)}"]`) : document;
    const replacement = selector && [...(scope?.querySelectorAll(selector) || [])].find(visible);
    const target = opener?.isConnected && visible(opener) ? opener : replacement ||
      (taskId && [...document.querySelectorAll(`[data-action="task-open"][data-id="${CSS.escape(taskId)}"],[data-task="${CSS.escape(taskId)}"]`)].find(visible)) ||
      scope?.matches?.("[data-node]") && scope ||
      (index >= 0 && peers()[Math.min(index, peers().length - 1)]) ||
      [...document.querySelectorAll('[data-action="task-new"]')].find(visible);
    target?.focus({ preventScroll: true });
  };
}
