import { canTransition, transitionError } from "./workflow-model.js";
import { hierarchyError } from "./hierarchy-model.js";
const dateValid = (value) =>
  !value ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value);

// The server remains authoritative; this checks the entire range before enqueueing anything.
export function preparePaste(
  text,
  targets,
  mapping,
  config,
  allTasks,
  allowedPeople = null,
) {
  const rows = text
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
  const patches = new Map(),
    errors = [];
  if (rows.length > 100)
    return { rows, patches, errors: ["Paste up to 100 rows at a time."] };
  const fieldError = (row, key, message) =>
    errors.push(`Row ${row + 1}, ${key}: ${message}`);
  for (let r = 0; r < rows.length; r++) {
    const task = targets[r];
    if (!task) {
      errors.push(`Row ${r + 1}: add enough task rows before pasting.`);
      continue;
    }
    const patch = {};
    for (let c = 0; c < rows[r].length; c++) {
      const key = mapping[c],
        text = rows[r][c],
        field = config.fields.find((f) => `fields.${f.id}` === key);
      if (key === "body") {
        fieldError(r, "Description", "Open the task editor to edit its description.");
        continue;
      }
      if (!key || ["key", "created", "updated"].includes(key)) {
        fieldError(r, key || `column ${c + 1}`, "choose an editable column.");
        continue;
      }
      if (mapping.indexOf(key) !== c) {
        fieldError(r, key, "a column may only be mapped once.");
        continue;
      }
      let value = text;
      const choices =
        key === "status"
          ? config.statuses
          : key === "type"
            ? config.types
            : key === "priority"
              ? ["none", "low", "medium", "high", "urgent"]
              : field?.type === "select"
                ? field.options
                : null;
      if (choices && !choices.includes(value))
        fieldError(r, key, `choose ${choices.join(", ")}.`);
      if (key === "title" && (!text.trim() || text.length > 300))
        fieldError(r, key, "use 1–300 characters.");
      if (
        key === "assignee" &&
        (text.length > 100 ||
          (text &&
            allowedPeople &&
            !allowedPeople.includes(text) &&
            text !== task.assignee))
      )
        fieldError(r, key, "choose a member of a project team.");
      if (key === "estimate" || field?.type === "number") {
        value = text.trim() === "" ? null : Number(text);
        if (
          value != null &&
          (!Number.isFinite(value) ||
            (key === "estimate" && (value < 0 || value > 1e8)))
        )
          fieldError(
            r,
            key,
            "enter a valid number (estimates must be non-negative).",
          );
      }
      if (["start", "due"].includes(key) || field?.type === "date") {
        value = text || null;
        if (!dateValid(text))
          fieldError(r, key, "use a real date in YYYY-MM-DD format.");
      }
      if (field?.type === "checkbox") {
        if (!["true", "false", ""].includes(text.toLowerCase()))
          fieldError(r, key, "use true or false.");
        value = text.toLowerCase() === "true";
      }
      if (key === "tags")
        value = text
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      if (key === "parent") value = text || null;
      if (key.startsWith("fields."))
        patch.fields = {
          ...(patch.fields || task.fields),
          [key.slice(7)]: value,
        };
      else patch[key] = value;
    }
    const next = { ...task, ...patch };
    if (next.start && next.due && next.start > next.due)
      fieldError(r, "due", "must be on or after the start date.");
    if (patch.status && !canTransition(config, task.status, patch.status))
      fieldError(
        r,
        "status",
        transitionError(config, task.status, patch.status),
      );
    patches.set(task.id, patch);
  }
  const projected = new Map(
    allTasks.map((t) => [t.id, { ...t, ...patches.get(t.id) }]),
  );
  for (const [id] of patches) {
    const task = projected.get(id);
    if (!task) continue;
    const seen = new Set([id]);
    let parent = task.parent;
    while (parent) {
      if (seen.has(parent)) {
        errors.push(
          `${task.key || task.title}: the parent would create a cycle.`,
        );
        break;
      }
      seen.add(parent);
      const ancestor = projected.get(parent);
      if (!ancestor) {
        errors.push(
          `${task.key || task.title}: parent must be a task ID in this project.`,
        );
        break;
      }
      parent = ancestor.parent;
    }
  }
  for (const task of projected.values()) {
    if (!patches.has(task.id) && !patches.has(task.parent)) continue;
    const error = hierarchyError(config, task, projected.get(task.parent));
    if (error) errors.push(error);
  }
  return { rows, patches, errors };
}
