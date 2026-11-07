// @ts-check
/** @typedef {import("./model-types.js").ProjectConfig} ProjectConfig */
/** @typedef {import("./model-types.js").SourcedCard} SourcedCard */
/** @typedef {import("./model-types.js").SourceRecord} SourceRecord */
// Source-owned fields and local annotations are deliberately separate.
export const sourceFields = [
  "title",
  "type",
  "status",
  "priority",
  "assignee",
  "due",
];
// Planning edits belong to Pencils; only explicit publication writes to a provider.
export const localSourceFields = ["assignee", "status", "priority", "due"];
/** @param {SourcedCard | null | undefined} task @param {string} field */
export const sourceReadOnly = (task, field) => !!task?.source && sourceFields.includes(field) && !localSourceFields.includes(field);
export const sourceCapabilities = {
  obsidian: {
    read: true,
    edit: true,
    create: false,
    assign: true,
    transition: true,
    comment: false,
  },
  jira: {
    read: true,
    edit: true,
    create: true,
    assign: true,
    transition: true,
    comment: true,
  },
  excel: {
    read: true,
    edit: false,
    create: false,
    assign: false,
    transition: false,
    comment: false,
  },
};
/** @param {SourcedCard | null | undefined} base @param {SourcedCard | null | undefined} local @param {SourcedCard | null | undefined} remote */
export function mergeSource(base, local, remote) {
  /** @type {Record<string, unknown>} */
  const values = {},
    /** @type {{ field: string, base: unknown, local: unknown, remote: unknown }[]} */
    conflicts = [];
  for (const field of sourceFields) {
    const b = base?.[field] ?? null,
      l = local?.[field] ?? null,
      r = remote?.[field] ?? null;
    if (localSourceFields.includes(field) && local?.source?.local_fields?.includes(field)) {
      values[field] = l;
    } else if (l !== b && r !== b && l !== r) {
      conflicts.push({ field, base: b, local: l, remote: r });
      values[field] = l;
    } else values[field] = l !== b ? l : r;
  }
  return { values, conflicts };
}
/** @param {SourceRecord} record @param {any} mapping the project's field mapping, from its settings @param {ProjectConfig} config */
export function mapSource(record, mapping, config) {
  /** @param {string} key */
  const from = (key) => record.fields?.[mapping?.[key] || key];
  /** @param {string} key @param {string[]} allowed @param {string} fallback @returns {string} */
  const choice = (key, allowed, fallback) => {
    const value = String(from(key) ?? "");
    return (
      mapping?.values?.[key]?.[value] ||
      (allowed.includes(value) ? value : fallback)
    );
  };
  const title = String(from("title") ?? "").trim();
  if (!title || title.length > 300)
    throw Error(
      `Record ${record.id}: title is required and must fit 300 characters.`,
    );
  const due = from("due");
  if (
    due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(String(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due)
  )
    throw Error(`Record ${record.id}: use an ISO due date (YYYY-MM-DD).`);
  const values = {
    title,
    type: choice(
      "type",
      config.types,
      config.types.includes("task") ? "task" : config.types[0],
    ),
    status: choice(
      "status",
      config.statuses,
      config.initial_status || config.statuses[0],
    ),
    priority: choice(
      "priority",
      ["none", "low", "medium", "high", "urgent"],
      "none",
    ),
    assignee: String(from("assignee") || "").slice(0, 100),
    due: due || null,
  };
  if (
    !config.types.includes(values.type) ||
    !config.statuses.includes(values.status) ||
    !["none", "low", "medium", "high", "urgent"].includes(values.priority)
  )
    throw Error(
      `Record ${record.id}: mapping points to a missing type/status.`,
    );
  return values;
}
/** @param {SourcedCard} task */
export const sourceLabel = (task) =>
  task.source
    ? `${task.source.provider === "jira" ? "Jira" : task.source.provider === "excel" ? "Excel" : "Obsidian"} · ${task.source.key || task.source.external_id}`
    : "Local";
