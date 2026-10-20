import { localDate } from "./task-visibility.js";
const ops = new Set([
  "contains",
  "eq",
  "empty",
  "not-empty",
  "before",
  "after",
  "today",
  "next7",
  "overdue",
  "me",
]);
export function validQuery(root) {
  let count = 0;
  function check(node, depth) {
    if (
      !node ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      ++count > 40 ||
      depth > 4
    )
      return false;
    if ("rules" in node)
      return (
        ["all", "any"].includes(node.match) &&
        Array.isArray(node.rules) &&
        node.rules.every((child) => check(child, depth + 1))
      );
    return (
      typeof node.field === "string" &&
      /^(key|created|updated|title|body|type|status|priority|parent|assignee|start|due|estimate|tags|fields\.[a-zA-Z][a-zA-Z0-9_-]*)$/.test(
        node.field,
      ) &&
      ops.has(node.op) &&
      (node.value == null ||
        (typeof node.value === "string" && node.value.length <= 500))
    );
  }
  return check(root, 0);
}
export function compileQuery(
  query,
  fields,
  { today = localDate(), me = "", done = [] } = {},
) {
  if (!query) return () => true;
  if (!validQuery(query)) return () => false;
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  function match(node,task) {
    if (node.rules)
      return (
        !node.rules.length ||
        (node.match === "all"
          ? node.rules.every(child=>match(child,task))
          : node.rules.some(child=>match(child,task)))
      );
    const field = fieldMap.get(node.field);
    if (!field) return false;
    const raw = node.field.startsWith("fields.")
      ? task.fields?.[node.field.slice(7)]
      : task[node.field];
    const empty =
      raw == null || raw === "" || (Array.isArray(raw) && !raw.length);
    if (node.op === "empty") return empty;
    if (node.op === "not-empty") return !empty;
    if (empty) return false;
    const value = String(raw).toLocaleLowerCase(),
      expected = (node.value || "").toLocaleLowerCase();
    if (node.op === "contains") return value.includes(expected);
    if (node.op === "eq")
      return field.type === "number"
        ? Number.isFinite(Number(node.value)) &&
            node.value != null && node.value.trim() !== "" &&
            Number(raw) === Number(node.value)
        : (Array.isArray(raw) ? raw : [raw]).some(
            (v) => String(v).toLocaleLowerCase() === expected,
          );
    if (node.op === "me")
      return (
        node.field === "assignee" && !!me && value === me.toLocaleLowerCase()
      );
    if (field.type !== "date") return false;
    const date = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    if (node.op === "before") return date < (node.value || "");
    if (node.op === "after") return date > (node.value || "9999");
    if (node.op === "today") return date === today;
    if (node.op === "overdue")
      return date < today && !done.includes(task.status);
    if (node.op === "next7") {
      const end = new Date(`${today}T12:00:00`);
      end.setDate(end.getDate() + 7);
      return date >= today && date <= localDate(end);
    }
    return false;
  }
  return task => match(query,task);
}

export function matchesQuery(task,query,fields,context) { return compileQuery(query,fields,context)(task); }
