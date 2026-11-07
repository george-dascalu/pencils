// @ts-check
// The cards List, Tree, Table and Kanban show: those matching the search, status, type and the
// project's filters, in the chosen sort (moved out of app.js, frontend analysis item 4).
import { priorityOptions } from "./task-priority.js";
import { fieldOn } from "./card-fields.js";
/** @typedef {Record<string, any>} Card */

// The Sort menu: Manual order, then the sorts grouped by what they compare.
/** @type {[string, string[]][]} */
export const sortGroups = [["", ["order"]], ["Card", ["key", "title", "parent", "assignee"]], ["Progress", ["status", "priority"]], ["Dates", ["due", "created"]]];
/** @type {Record<string, string>} */
export const sortNames = { order: "Manual order", key: "Card ID", title: "Title A–Z", parent: "Parent", assignee: "Assignee", status: "Status", priority: "Priority", due: "Due date", created: "Date created" };
// Text in natural order (PEN-9 before PEN-10), with empty values last.
/** @param {unknown} a @param {unknown} b */
export const byText = (a, b) => Number(!a) - Number(!b) || String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });

/**
 * @param {Card[]} tasks every card of the project
 * @param {{ search?: string, status?: string, type?: string, sort?: string, sortDir?: number, config?: any, statuses: string[], keep?: (card: Card) => boolean }} options
 */
export function filterTasks(tasks, { search = "", status = "all", type = "all", sort = "created", sortDir = 1, config, statuses, keep = () => true }) {
  const query = search.toLowerCase().trim();
  const list = tasks.filter((t) => keep(t) && (status === "all" || t.status === status) && (type === "all" || t.type === type) &&
    (!query || [t.title, t.body, fieldOn(config, "assignee") ? t.assignee : "", t.id, t.key, ...(t.aliases || []), ...(fieldOn(config, "tags") ? t.tags || [] : [])]
      .some((v) => String(v || "").toLowerCase().includes(query))));
  const parentKeys = sort === "parent" ? new Map(tasks.map((t) => [t.id, t.key])) : null;
  return list.sort((a, b) => {
    let result;
    if (sort === "order") result = (a.order || 0) - (b.order || 0);
    else if (parentKeys) result = byText(parentKeys.get(a.parent), parentKeys.get(b.parent));
    else if (sort === "key" || sort === "assignee") result = byText(a[sort], b[sort]);
    else if (sort === "priority") result = priorityOptions.indexOf(a.priority) - priorityOptions.indexOf(b.priority);
    else if (sort === "status") result = statuses.indexOf(a.status) - statuses.indexOf(b.status);
    else if (sort === "due") result = String(a.due || "9999").localeCompare(String(b.due || "9999"));
    else result = String(a[sort] || "").localeCompare(String(b[sort] || ""));
    return result * sortDir || a.id.localeCompare(b.id);
  });
}
