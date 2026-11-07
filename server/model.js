export { nextDate } from "../public/recurrence-model.js";
import { validTablePreferences } from "../public/table-model.js";
import { Problem } from "./problem.js";
import { DEFAULT_TASK_TYPES, TYPE_ICONS } from "../public/task-types.js";
import { PRIORITIES } from "./values.js";
import { CARD_FIELDS, VIEW_GROUPS } from "../public/card-fields.js";
import {validTaskBoards} from './task-board-links.js';
import {validTaskNotes} from '../public/task-note-model.js';

export const DEFAULT_SCHEMA = {
  statuses: ["backlog", "todo", "in-progress", "review", "done"],
  types: [...DEFAULT_TASK_TYPES],
  types_version: 1,
  done: ["done"],
  fields: [],
};

// Upgrade the original built-in list once. Custom lists remain project-owned,
// and removing Activity after this upgrade must survive future restarts.
export function upgradeDefaultTaskTypes(config) {
  if (!config || config.types_version != null) return config;
  const previous = DEFAULT_TASK_TYPES.filter((type) => type !== "activity");
  if (!Array.isArray(config.types) || config.types.length !== previous.length ||
      !previous.every((type) => config.types.includes(type))) return config;
  // Leave invalid external edits untouched so the usual vault warnings can
  // report them without preventing the workspace from starting.
  try { schema(config); } catch { return config; }
  const next = structuredClone(config);
  next.types.splice(next.types.indexOf("task") + 1, 0, "activity");
  next.types_version = 1;
  if (next.hierarchy) {
    // Activity starts with Task's placement rules without loosening rules for
    // any existing type. The project hierarchy editor can adjust it later.
    const extend = (types) => types.includes("task") ? [...types, "activity"] : [...types];
    const rules = next.hierarchy;
    rules.roots = extend(rules.roots);
    rules.children.activity = [...rules.children.task];
    for (const type of next.types) rules.children[type] = extend(rules.children[type]);
  }
  return next;
}
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
  // The person the project's new cards start assigned to (F0.22-25), by id.
  if (result.default_assignee != null && (typeof result.default_assignee !== "string" || !/^[\w-]{1,100}$/.test(result.default_assignee)))
    fail("Choose a person to auto-assign new cards to.");
  // The project's tags (F0.21-73), in order, each with an optional colour.
  if (result.tags != null) {
    const names = Array.isArray(result.tags) ? result.tags.map((t) => t?.name) : null;
    if (
      !names || result.tags.length > 500 || new Set(names).size !== names.length ||
      result.tags.some((t) => typeof t !== "object" || Object.keys(t).some((key) => !["name", "color"].includes(key)) ||
        typeof t.name !== "string" || !t.name || t.name !== t.name.trim() || t.name.length > 80 || t.name.includes(",") ||
        (t.color != null && (typeof t.color !== "string" || !/^#[0-9a-f]{6}$/i.test(t.color))))
    )
      fail("Tags need unique names of 1–80 characters without commas, and #rrggbb colours.");
  }
  if (result.priority_colors != null) {
    const colors = result.priority_colors;
    if (
      typeof colors !== "object" ||
      Array.isArray(colors) ||
      Object.entries(colors).some(([priority, color]) => !PRIORITIES.includes(priority) || typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
    )
      fail("Priority colours must be #rrggbb colours for known priorities.");
  }
  // Each card type's colour and icon (F0.22-67); a type taken out of the project leaves its own behind.
  for (const [key, valid, name] of [
    ["type_colors", (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v), "Card type colours must be #rrggbb colours."],
    ["type_icons", (v) => TYPE_ICONS.includes(v), "Card type icons must be ones the app offers."],
  ]) {
    if (result[key] == null) continue;
    if (typeof result[key] !== "object" || Array.isArray(result[key]) || Object.values(result[key]).some((v) => !valid(v))) fail(name);
    const kept = Object.entries(result[key]).filter(([type]) => result.types.includes(type));
    result[key] = kept.length ? Object.fromEntries(kept) : undefined;
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
  if (
    result.off != null &&
    (!Array.isArray(result.off) ||
      result.off.some((f) => !CARD_FIELDS.some(([key]) => key === f)) ||
      new Set(result.off).size !== result.off.length)
  )
    fail("Only built-in card fields can be turned off, each once.");
  const views = VIEW_GROUPS.flatMap(([, , list]) => list);
  if (
    result.views_off != null &&
    (!Array.isArray(result.views_off) ||
      result.views_off.some((v) => !views.includes(v)) ||
      new Set(result.views_off).size !== result.views_off.length)
  )
    fail("Only the project's views can be turned off, each once; Overview stays.");
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
  if (data.start_time != null && data.start_time !== "" || data.due_time != null && data.due_time !== "") {
    const time = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!data.start || !data.due || !validDate(data.due) || !time(data.start_time) || !time(data.due_time))
      fail("Timed cards need start and due dates and times in HH:mm format.");
    if (`${data.start}T${data.start_time}` >= `${data.due}T${data.due_time}`)
      fail("End time must be after the start time.");
  }
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
  // A place on the Week board's Unscheduled board (F0.22-54): x and y in pixels and a layer, or a
  // column and a row from the grid 0.22.53 kept.
  const backlog = data.backlog, keys = backlog && typeof backlog === "object" ? Object.keys(backlog).sort().join() : "";
  const within = (value, most) => Number.isInteger(value) && value >= 0 && value <= most;
  if (backlog != null && (Array.isArray(backlog) || !(
    (keys === "col,row" && within(backlog.col, 999) && within(backlog.row, 999)) ||
    (["x,y", "x,y,z"].includes(keys) && within(backlog.x, 100_000) && within(backlog.y, 100_000) && (backlog.z === undefined || within(backlog.z, 1e9))))))
    fail("An Unscheduled place is x and y from 0 to 100,000 with a layer, or a column and a row.");
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
    fail("Dependencies must be card identifiers.");
  if (
    data.related_records != null &&
    (!Array.isArray(data.related_records) ||
      data.related_records.length > 200 ||
      data.related_records.some(
        (v) => typeof v !== "string" || !/^t-[a-zA-Z0-9_-]+$/.test(v),
      ))
  )
    fail("Related records must be card identifiers.");
  if (
    data.documents != null &&
    (!Array.isArray(data.documents) ||
      data.documents.length > 200 ||
      data.documents.some(
        (v) => typeof v !== "string" || !/^d-[a-zA-Z0-9_-]+$/.test(v),
      ))
  )
    fail("Linked documents must be document identifiers.");
  if (!validTaskBoards(data.boards))
    fail("Linked boards must be up to 200 unique board identifiers.");
  if (!validTaskNotes(data.notes))
    fail('Notes must be up to 200 unique notes, each with a note ID and Markdown text up to 200,000 characters (1,000,000 total).');
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
        "board", "drawing",
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
    if (view.kanbanGroupBy != null && !["none", "assignee", "priority", "type"].includes(view.kanbanGroupBy))
      fail("Invalid Kanban swimlanes.");
    if (view.table != null && !validTablePreferences(view.table))
      fail("Invalid saved table view.");
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
          !/^(key|title|body|type|status|priority|parent|assignee|start|due|estimate|tags|fields\.[a-zA-Z][a-zA-Z0-9_-]*)$/.test(
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
