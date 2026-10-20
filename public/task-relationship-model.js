import { dependencyCycle } from "./dependency-model.js";
import { hierarchyError } from "./hierarchy-model.js";
import { priorityOptions } from "./task-priority.js";

export function compareRelationshipTasks(a, b, field, direction, config) {
  if (!field) return 0;
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const av = a[field], bv = b[field];
  if (!av || !bv) return !av === !bv ? 0 : !av ? 1 : -1;
  const order = field === "priority" ? priorityOptions : field === "status" ? (config?.statuses || []) : null;
  const compare = order
    ? (order.includes(av) ? order.indexOf(av) : order.length) - (order.includes(bv) ? order.indexOf(bv) : order.length)
    : av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true });
  return direction * compare || (a.title || "").localeCompare(b.title || "", undefined, { numeric: true });
}

export const relationshipTypes = [
  ["parent", "Parent"],
  ["child", "Child"],
  ["blocked-by", "Blocked by"],
  ["blocks", "Blocks"],
  ["related", "Related to"],
];

// Reverse relationships use the same parent/dependency fields as Tree and Board.
export function taskRelationships(tasks, id) {
  const current = tasks.find((task) => task.id === id);
  if (!current) return [];
  const rows = [];
  const add = (kind, target) => rows.push({ kind, target });
  if (current.parent) add("parent", current.parent);
  tasks
    .filter((task) => task.parent === id)
    .forEach((task) => add("child", task.id));
  (current.dependencies || []).forEach((target) => add("blocked-by", target));
  tasks
    .filter((task) => task.dependencies?.includes(id))
    .forEach((task) => add("blocks", task.id));
  const related = new Set([
    ...(current.related_records || []),
    ...tasks
      .filter((task) => task.related_records?.includes(id))
      .map((task) => task.id),
  ]);
  related.forEach((target) => add("related", target));
  return rows;
}

export function relationshipChanges(
  tasks,
  config,
  id,
  kind,
  targetId,
  remove = false,
) {
  const current = tasks.find((task) => task.id === id);
  const target = tasks.find((task) => task.id === targetId);
  if (!current || (!target && !remove))
    throw Error("This task is no longer available.");
  if (id === targetId && !remove)
    throw Error("A task cannot be related to itself.");
  const listChange = (owner, field, value) => ({
    id: owner.id,
    changes: {
      [field]: remove
        ? (owner[field] || []).filter((item) => item !== value)
        : [...new Set([...(owner[field] || []), value])],
    },
  });
  if (kind === "parent" || kind === "child") {
    const child = kind === "parent" ? current : target;
    const parent = remove ? null : kind === "parent" ? target : current;
    if (!child) throw Error("This task is no longer available.");
    const error = hierarchyError(config, child, parent);
    if (error) throw Error(error);
    const seen = new Set([child.id]);
    let ancestor = parent;
    while (ancestor) {
      if (seen.has(ancestor.id))
        throw Error("This would create a parent/child cycle.");
      seen.add(ancestor.id);
      ancestor = tasks.find((task) => task.id === ancestor.parent);
    }
    return [{ id: child.id, changes: { parent: parent?.id || null } }];
  }
  if (kind === "blocks" || kind === "blocked-by") {
    const dependant = kind === "blocks" ? target : current;
    const prerequisite = kind === "blocks" ? id : targetId;
    if (!dependant) throw Error("This task is no longer available.");
    if (!remove && dependencyCycle(tasks, dependant.id, prerequisite))
      throw Error("This would create a blocking cycle.");
    return [listChange(dependant, "dependencies", prerequisite)];
  }
  if (kind === "related") {
    if (!remove) return [listChange(current, "related_records", targetId)];
    // Older records may store the same link on either or both tasks.
    return [
      ...(current.related_records?.includes(targetId)
        ? [listChange(current, "related_records", targetId)]
        : []),
      ...(target?.related_records?.includes(id)
        ? [listChange(target, "related_records", id)]
        : []),
    ];
  }
  throw Error("Choose a relationship type.");
}
