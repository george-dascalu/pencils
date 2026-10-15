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

// Consistent hues for built-in statuses and a stable palette for custom workflows.
export function statusColor(config, status) {
  if (config.done.includes(status)) return "#648b50";
  const known = {
    backlog: "#89928b",
    todo: "#7a8d79",
    "in-progress": "#bc9235",
    review: "#9a79b7",
  };
  if (known[status]) return known[status];
  const colors = ["#488caa", "#ac799d", "#b28a4e", "#6983af", "#629a92"];
  let hash = 0;
  for (const character of status)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
