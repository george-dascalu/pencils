import { compileQuery, validQuery } from "./query-model.js";
import { localDate } from "./task-visibility.js";
import { priorityOptions, priorityLabel } from "./task-priority.js";
import { statusLabel } from "./workflow-model.js";
import { tableFields } from "./table-model.js";

// "```tasks" blocks in documents: one instruction per line, a subset of the Obsidian Tasks
// plugin's query syntax, run against the project's cards. Lines starting with # are notes.
const sortKeys = ["due", "start", "priority", "status", "title", "created", "updated", "key"];
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function day(word, today) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return word;
  const offset = { yesterday: -1, today: 0, tomorrow: 1 }[word];
  if (offset == null) return null;
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDate(date);
}

export function parseTaskQuery(text, { today = localDate() } = {}) {
  const rules = [], sort = [], errors = [];
  let done = null, limit = 50;
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/\s+/g, " "), lower = line.toLowerCase();
    if (!line || line.startsWith("#")) continue;
    let m;
    if (lower === "done" || lower === "not done") done = lower === "done";
    else if (lower === "overdue") rules.push({ field: "due", op: "overdue" });
    else if (lower === "has due date" || lower === "no due date") rules.push({ field: "due", op: lower === "has due date" ? "not-empty" : "empty" });
    else if ((m = /^(due|starts?) (today|before|after|on)(?: (\S+))?$/.exec(lower))) {
      const field = m[1] === "due" ? "due" : "start", date = m[2] === "today" ? today : day(m[3] || "", today);
      if (!date || (m[2] === "today" && m[3])) errors.push(line);
      else rules.push(m[2] === "today" ? { field, op: "today" } : { field, op: { before: "before", after: "after", on: "eq" }[m[2]], value: date });
    } else if (lower === "no assignee") rules.push({ field: "assignee", op: "empty" });
    else if ((m = /^assignee is (.+)$/i.exec(line))) rules.push(m[1].toLowerCase() === "me" ? { field: "assignee", op: "me" } : { field: "assignee", op: "eq", value: m[1] });
    else if ((m = /^(status|priority|type) is (.+)$/i.exec(line))) rules.push({ field: m[1].toLowerCase(), op: "eq", value: m[2] });
    else if ((m = /^tags? includes? #?(\S+)$/i.exec(line))) rules.push({ field: "tags", op: "eq", value: m[1] });
    else if ((m = /^(title|description) includes (.+)$/i.exec(line))) rules.push({ field: m[1].toLowerCase() === "title" ? "title" : "body", op: "contains", value: m[2] });
    else if ((m = /^sort by (\w+)( reverse)?$/.exec(lower)) && sortKeys.includes(m[1])) sort.push({ key: m[1], reverse: !!m[2] });
    else if ((m = /^limit (\d{1,3})$/.exec(lower)) && Number(m[1]) >= 1 && Number(m[1]) <= 200) limit = Number(m[1]);
    else errors.push(line);
  }
  // The query model accepts 40 nodes: the group and 39 rules, each value up to 500 characters.
  if (rules.length > 39) errors.push(`only the first 39 filters are used (${rules.length} given)`);
  const kept = rules.slice(0, 39).filter((rule) => {
    if (validQuery({ match: "all", rules: [rule] })) return true;
    errors.push(`${rule.field} value is too long`);
    return false;
  });
  return { rules: kept, done, sort, limit, errors };
}

// Matching cards in order, at most `limit` of them, and how many matched in all.
export function runTaskQuery(tasks, query, { config, me = "", today = localDate() }) {
  const doneStatuses = config.done || [];
  // A status or priority may be named by its label ("In progress", "Lowest") as well as its key.
  const named = (keys, label, value) => keys.find((key) => [key, label(key)].some((name) => name.toLowerCase() === value.toLowerCase())) || value;
  const rules = query.rules.map((rule) => rule.field === "status" ? { ...rule, value: named(config.statuses, (s) => statusLabel(config, s), rule.value) }
    : rule.field === "priority" ? { ...rule, value: named(priorityOptions, priorityLabel, rule.value) } : rule);
  const match = rules.length ? compileQuery({ match: "all", rules }, tableFields(config), { today, me, done: doneStatuses }) : () => true;
  const found = tasks.filter((t) => !t.archived && match(t) && (query.done == null || doneStatuses.includes(t.status) === query.done));
  const rank = { priority: (t) => priorityOptions.indexOf(t.priority || "none"), status: (t) => config.statuses.indexOf(t.status) };
  const compare = (a, b) => {
    for (const { key, reverse } of query.sort) {
      const x = rank[key] ? rank[key](a) : a[key] || "", y = rank[key] ? rank[key](b) : b[key] || "";
      // Empty dates and titles sort last whichever way round.
      const order = x === y ? 0 : x === "" ? 1 : y === "" ? -1 : typeof x === "number" ? x - y : collator.compare(String(x), String(y));
      if (order) return reverse && x !== "" && y !== "" ? -order : order;
    }
    return 0;
  };
  return { tasks: [...found].sort(compare).slice(0, query.limit), total: found.length };
}
