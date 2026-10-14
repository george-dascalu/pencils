export function initialStatus(config) {
  return (
    config.initial_status ||
    (config.statuses.includes("todo") ? "todo" : config.statuses[0])
  );
}
export function canTransition(config, from, to) {
  return (
    config.statuses.includes(to) &&
    (from === to ||
      !config.transitions ||
      (config.transitions[from] || []).includes(to))
  );
}
export function nextStatuses(config, current) {
  return config.statuses.filter((to) => canTransition(config, current, to));
}
export function statusLabel(config, status) {
  return (
    config.status_labels?.[status] ||
    { todo: "To do", "in-progress": "In progress", review: "In review" }[
      status
    ] ||
    String(status)
      .replaceAll("-", " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
export function transitionError(config, from, to) {
  return `Workflow does not allow ${statusLabel(config, from)} → ${statusLabel(config, to)}. Allowed next statuses: ${
    nextStatuses(config, from)
      .filter((s) => s !== from)
      .map((s) => statusLabel(config, s))
      .join(", ") || "none"
  }.`;
}
