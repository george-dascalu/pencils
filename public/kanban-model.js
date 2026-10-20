import { hierarchyError } from "./hierarchy-model.js";
import { canTransition, transitionError } from "./workflow-model.js";

export const kanbanGroups = ["none", "assignee", "priority", "type"];
export const kanbanGroup = (value) =>
  kanbanGroups.includes(value) ? value : "none";
export const laneValue = (task, field) =>
  String(task[field] || (field === "priority" ? "none" : ""));
export const laneKey = (field, value) => JSON.stringify([field, value]);

export function kanbanLanes(tasks, field, config) {
  const groups = new Map();
  for (const task of tasks) {
    const value = laneValue(task, field);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(task);
  }
  if (!groups.size)
    groups.set(
      field === "priority"
        ? "none"
        : field === "type"
          ? config.types.includes("task")
            ? "task"
            : config.types[0]
          : "",
      [],
    );
  const order =
    field === "priority"
      ? ["urgent", "high", "medium", "low", "none"]
      : field === "type"
        ? config.types
        : null;
  return [...groups].sort(([a], [b]) =>
    order
      ? order.indexOf(a) - order.indexOf(b)
      : !a
        ? 1
        : !b
          ? -1
          : a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function kanbanDropChanges(task, status, field = "none", value = "") {
  const changes = {};
  if (task.status !== status) changes.status = status;
  if (kanbanGroup(field) !== "none" && laneValue(task, field) !== value)
    changes[field] = value;
  return changes;
}

export function kanbanDropError(config, task, changes, tasks) {
  if (!task) return "This task is no longer available.";
  if (task.source && Object.keys(changes).length)
    return "Change this task in its source, then sync.";
  if (changes.status && !canTransition(config, task.status, changes.status))
    return transitionError(config, task.status, changes.status);
  if (changes.type) {
    const next = { ...task, ...changes };
    return (
      hierarchyError(
        config,
        next,
        tasks.find((t) => t.id === next.parent),
      ) ||
      tasks
        .filter((t) => t.parent === task.id)
        .map((t) => hierarchyError(config, t, next))
        .find(Boolean) ||
      ""
    );
  }
  return "";
}
