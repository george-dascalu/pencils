import { Problem } from "./problem.js";

export const DEFAULT_SCHEMA = {
  statuses: ["backlog", "todo", "in-progress", "review", "done"],
  types: ["epic", "milestone", "story", "task", "bug"],
  done: ["done"],
  fields: [],
};
const fail = (message) => {
  throw new Problem(400, message);
};
const short = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 100;
export function schema(value = DEFAULT_SCHEMA) {
  const result = { ...DEFAULT_SCHEMA, ...value };
  if (Array.isArray(result.done) && !result.done.length)
    fail("Choose at least one completed status.");
  for (const key of ["statuses", "types", "done"]) {
    if (
      !Array.isArray(result[key]) ||
      !result[key].length ||
      result[key].length > 40 ||
      result[key].some((v) => !short(v) || !/^[a-zA-Z0-9_-]+$/.test(v)) ||
      new Set(result[key]).size !== result[key].length
    )
      fail(`Use unique short identifiers for ${key}.`);
  }
  if (result.done.some((v) => !result.statuses.includes(v)))
    fail("Completed statuses must be in the workflow.");
  if (
    result.initial_status != null &&
    !result.statuses.includes(result.initial_status)
  )
    fail("Default status must be in the workflow.");
  if (result.status_labels != null) {
    if (
      typeof result.status_labels !== "object" ||
      Array.isArray(result.status_labels) ||
      Object.entries(result.status_labels).some(
        ([id, name]) => !result.statuses.includes(id) || !short(name),
      )
    )
      fail(
        "Status names must belong to the workflow and contain 1–100 characters.",
      );
  }
  if (result.transitions != null) {
    if (
      typeof result.transitions !== "object" ||
      Array.isArray(result.transitions) ||
      Object.keys(result.transitions).some(
        (id) => !result.statuses.includes(id),
      )
    )
      fail("Workflow rules must reference existing statuses.");
    for (const id of result.statuses) {
      const targets = result.transitions[id];
      if (
        !Array.isArray(targets) ||
        targets.length > 40 ||
        new Set(targets).size !== targets.length ||
        targets.some((to) => !result.statuses.includes(to) || to === id)
      )
        fail(
          "Each status needs a list of unique allowed destinations; use an empty list for no outgoing moves.",
        );
    }
  }
  if (result.hierarchy != null) {
    const h = result.hierarchy;
    const types = (a) =>
      Array.isArray(a) &&
      new Set(a).size === a.length &&
      a.every((t) => result.types.includes(t));
    if (
      !h ||
      !["free", "enforced"].includes(h.mode) ||
      !types(h.roots) ||
      !h.children ||
      Array.isArray(h.children) ||
      typeof h.children !== "object" ||
      Object.keys(h.children).some((t) => !result.types.includes(t)) ||
      result.types.some((t) => !types(h.children[t]))
    )
      fail(
        "Card hierarchy rules must list existing parent and child types, and types allowed without a parent.",
      );
  }
  if (!Array.isArray(result.fields) || result.fields.length > 40)
    fail("A project supports up to 40 custom fields.");
  const ids = new Set();
  for (const field of result.fields) {
    if (
      !short(field.id) ||
      !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(field.id) ||
      ids.has(field.id) ||
      !short(field.name) ||
      !["text", "number", "date", "select", "checkbox"].includes(field.type)
    )
      fail(
        "Each custom field needs a unique identifier, name and supported type.",
      );
    ids.add(field.id);
    if (
      field.type === "select" &&
      (!Array.isArray(field.options) ||
        field.options.length > 100 ||
        field.options.some((v) => !short(v)))
    )
      fail("Select fields need a list of options.");
  }
  return result;
}
export function validDate(value) {
  return (
    value == null ||
    value === "" ||
    (typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value)
  );
}
export function validateExtras(data, config) {
  if (!validDate(data.start)) fail("Start must be a valid date.");
  if (data.start && data.due && data.start > data.due)
    fail("Start must be on or before the due date.");
  if (
    data.estimate != null &&
    (!Number.isFinite(data.estimate) ||
      data.estimate < 0 ||
      data.estimate > 1e8)
  )
    fail("Estimate must be a non-negative number.");
  if (data.order != null && !Number.isFinite(data.order))
    fail("Order must be a number.");
  if (data.archived != null && typeof data.archived !== "boolean")
    fail("Archived must be true or false.");
  if (
    data.dependencies != null &&
    (!Array.isArray(data.dependencies) ||
      data.dependencies.length > 200 ||
      data.dependencies.some(
        (v) => typeof v !== "string" || !/^t-[a-zA-Z0-9_-]+$/.test(v),
      ))
  )
    fail("Dependencies must be task identifiers.");
  if (
    data.recurrence != null &&
    (!["day", "week", "month"].includes(data.recurrence.unit) ||
      !Number.isInteger(data.recurrence.interval) ||
      data.recurrence.interval < 1 ||
      data.recurrence.interval > 365)
  )
    fail("Recurrence needs a day, week or month interval between 1 and 365.");
  const fields = data.fields ?? {};
  if (
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields) ||
    JSON.stringify(fields).length > 50_000
  )
    fail("Custom values must be a mapping.");
  for (const field of config.fields) {
    const value = fields[field.id];
    if (value == null || value === "") continue;
    if (
      (field.type === "text" &&
        (typeof value !== "string" || value.length > 10000)) ||
      (field.type === "number" && !Number.isFinite(value)) ||
      (field.type === "checkbox" && typeof value !== "boolean") ||
      (field.type === "date" && !validDate(value)) ||
      (field.type === "select" && !field.options.includes(value))
    )
      fail(`Invalid value for ${field.name}.`);
  }
  if (
    data.comments != null &&
    (!Array.isArray(data.comments) ||
      data.comments.length > 500 ||
      data.comments.some(
        (c) =>
          !short(c.id) ||
          typeof c.text !== "string" ||
          c.text.length > 20000 ||
          typeof c.author !== "string" ||
          c.author.length > 100,
      ))
  )
    fail("Invalid comments.");
}
export function validateViews(views) {
  if (!Array.isArray(views) || views.length > 100)
    fail("A project supports up to 100 saved views.");
  const ids = new Set();
  for (const view of views) {
    if (
      !short(view.id) ||
      ids.has(view.id) ||
      !short(view.name) ||
      ![
        "overview",
        "list",
        "tree",
        "table",
        "kanban",
        "board",
        "calendar",
        "timeline",
        "capacity",
      ].includes(view.view) ||
      JSON.stringify(view).length > 50000
    )
      fail("Invalid saved view.");
    for (const key of ["search", "status", "type", "sort", "groupBy"]) {
      if (
        view[key] != null &&
        (typeof view[key] !== "string" || view[key].length > 300)
      )
        fail("Invalid saved view filter.");
    }
    if (view.sortDir != null && ![1, -1].includes(view.sortDir))
      fail("Invalid saved view sort direction.");
    if (view.filters != null) {
      if (typeof view.filters !== "object" || Array.isArray(view.filters))
        fail("Invalid saved view filters.");
      for (const key of ["assignee", "tag", "due"]) {
        if (view.filters[key] != null && typeof view.filters[key] !== "string")
          fail("Invalid saved view filter.");
      }
    }
    if (view.columns != null) {
      if (!Array.isArray(view.columns) || view.columns.length > 60)
        fail("Invalid saved view columns.");
      const keys = new Set();
      for (const column of view.columns) {
        if (
          !column ||
          typeof column.key !== "string" ||
          !/^(title|type|status|priority|parent|assignee|start|due|estimate|tags|fields\.[a-zA-Z][a-zA-Z0-9_-]*)$/.test(
            column.key,
          ) ||
          keys.has(column.key) ||
          (column.width != null &&
            (!Number.isFinite(column.width) ||
              column.width < 90 ||
              column.width > 900)) ||
          (column.visible != null && typeof column.visible !== "boolean")
        )
          fail("Invalid saved view column.");
        keys.add(column.key);
      }
    }
    ids.add(view.id);
  }
  return views;
}
export function progress(tasks, config = DEFAULT_SCHEMA) {
  const active = tasks.filter((t) => !t.archived);
  const parents = new Set(active.map((t) => t.parent).filter(Boolean));
  const leaves = active.filter((t) => !parents.has(t.id));
  const total = leaves.reduce(
    (sum, t) => sum + (t.estimate > 0 ? t.estimate : 1),
    0,
  );
  const completed = leaves
    .filter((t) => config.done.includes(t.status))
    .reduce((sum, t) => sum + (t.estimate > 0 ? t.estimate : 1), 0);
  return {
    total: leaves.length,
    done: leaves.filter((t) => config.done.includes(t.status)).length,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}
export function nextDate(value, rule) {
  const date = new Date(
    `${value || new Date().toISOString().slice(0, 10)}T12:00:00Z`,
  );
  if (rule.unit === "month") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + rule.interval);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else
    date.setUTCDate(
      date.getUTCDate() + rule.interval * (rule.unit === "week" ? 7 : 1),
    );
  return date.toISOString().slice(0, 10);
}
