import { validQuery, compileQuery } from "./query-model.js";
// Shared table rules: no task mutations, stable ordering, and empty values last.
export const tableFieldKeys =
  /^(key|created|updated|title|type|status|priority|parent|assignee|start|due|estimate|tags|fields\.[a-zA-Z][a-zA-Z0-9_-]*)$/;
export function tableFields(config) {
  return [
    ["key", "ID", "text"],
    ["title", "Title", "text"],
    ["type", "Type", "options"],
    ["status", "Status", "options"],
    ["priority", "Priority", "options"],
    ["assignee", "Assignee", "options"],
    ["parent", "Parent task", "options"],
    ["start", "Start date", "date"],
    ["due", "Due date", "date"],
    ["estimate", "Estimate", "number"],
    ["tags", "Tags", "options"],
    ["created", "Created", "date"],
    ["updated", "Updated", "date"],
    ...(config.fields || []).map((f) => [
      `fields.${f.id}`,
      f.name,
      ["select", "checkbox"].includes(f.type) ? "options" : f.type,
    ]),
  ].map(([key, name, type]) => ({ key, name, type }));
}
export const tableValue = (t, key) =>
  key.startsWith("fields.") ? t.fields?.[key.slice(7)] : t[key];
export const emptyValue = (v) =>
  v == null || v === "" || (Array.isArray(v) && !v.length);
export const valueKey = (v) =>
  emptyValue(v) ? "" : Array.isArray(v) ? [...v].sort().join(", ") : String(v);
export function validTablePreferences(p) {
  const field = (key) => typeof key === "string" && tableFieldKeys.test(key);
  const string = (v) => typeof v === "string" && v.length <= 500;
  return (
    !!p &&
    typeof p === "object" &&
    !Array.isArray(p) &&
    (p.query == null || validQuery(p.query)) &&
    (p.outline == null || typeof p.outline === "boolean") &&
    Array.isArray(p.groups) &&
    p.groups.length <= 2 &&
    p.groups.every(field) &&
    new Set(p.groups).size === p.groups.length &&
    Array.isArray(p.sorts) &&
    p.sorts.length <= 3 &&
    p.sorts.every((s) => s && field(s.field) && [1, -1].includes(s.dir)) &&
    new Set(p.sorts.map((s) => s.field)).size === p.sorts.length &&
    Array.isArray(p.filters) &&
    p.filters.length <= 30 &&
    p.filters.every(
      (f) =>
        f &&
        field(f.field) &&
        [
          "contains",
          "not-contains",
          "values",
          "range",
          "empty",
          "not-empty",
        ].includes(f.op) &&
        (f.value == null || string(f.value)) &&
        (f.min == null || string(f.min)) &&
        (f.max == null || string(f.max)) &&
        (f.values == null ||
          (Array.isArray(f.values) &&
            f.values.length <= 1000 &&
            f.values.every(string))),
    ) &&
    new Set(p.filters.map((f) => f.field)).size === p.filters.length
  );
}
export function tablePreferences(p, config) {
  if (!validTablePreferences(p)) return { groups: [], sorts: [], filters: [] };
  const keys = new Set(tableFields(config).map((f) => f.key));
  return {
    ...(p.query ? { query: structuredClone(p.query) } : {}),
    ...(p.outline ? {outline:true} : {}),
    groups: p.groups.filter((k) => keys.has(k)),
    sorts: p.sorts.filter((s) => keys.has(s.field)),
    filters: p.filters.filter((f) => keys.has(f.field)),
  };
}
export function activeTableFilter(f) {
  return (
    ["empty", "not-empty"].includes(f.op) ||
    (f.op === "values"
      ? !!f.values?.length
      : f.op === "range"
        ? !!(f.min || f.max)
        : !!f.value)
  );
}
export function matchesTableFilter(t, f, fields) {
  const raw = tableValue(t, f.field),
    type = fields.find((x) => x.key === f.field)?.type;
  if (f.op === "empty") return emptyValue(raw);
  if (f.op === "not-empty") return !emptyValue(raw);
  if (!activeTableFilter(f)) return true;
  if (f.op === "values")
    return (Array.isArray(raw) && raw.length ? raw : [raw]).some((v) =>
      f.values.includes(valueKey(v)),
    );
  if (f.op === "range") {
    if (emptyValue(raw)) return false;
    const v = type === "number" ? Number(raw) : String(raw).slice(0, 10);
    return (
      (!f.min || v >= (type === "number" ? Number(f.min) : f.min)) &&
      (!f.max || v <= (type === "number" ? Number(f.max) : f.max))
    );
  }
  const match = valueKey(raw)
    .toLocaleLowerCase()
    .includes((f.value || "").toLocaleLowerCase());
  return f.op === "not-contains" ? !match : match;
}
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
export function compareTableValues(a, b, key, dir, config, tasks) {
  if (emptyValue(a) || emptyValue(b))
    return emptyValue(a) === emptyValue(b) ? 0 : emptyValue(a) ? 1 : -1;
  const order =
    key === "status"
      ? config.statuses
      : key === "priority"
        ? ["none", "low", "medium", "high", "urgent"]
        : key === "type"
          ? config.types
          : null;
  const numeric =
    key === "estimate" ||
    config.fields?.some((f) => `fields.${f.id}` === key && f.type === "number");
  const display = (v) =>
    key === "parent"
      ? (tasks instanceof Map ? tasks.get(v) : tasks.find((t) => t.id === v))
          ?.title || v
      : valueKey(v);
  return (
    dir *
    (order && order.includes(a) && order.includes(b)
      ? order.indexOf(a) - order.indexOf(b)
      : numeric
        ? Number(a) - Number(b)
        : collator.compare(display(a), display(b)))
  );
}
export function tableResult(tasks, p, config, allTasks = tasks, context = {}) {
  const fields = tableFields(config);
  const query=compileQuery(p.query,fields,{...context,done:config.done || []});
  const lookup = new Map(allTasks.map((t) => [t.id, t]));
  const filtered = tasks.filter(
    (t) =>
      p.filters.every((f) => matchesTableFilter(t, f, fields)) &&
      query(t),
  );
  const ordered = [...filtered].sort((a, b) => {
    for (const key of p.groups) {
      const cmp = compareTableValues(
        tableValue(a, key),
        tableValue(b, key),
        key,
        1,
        config,
        lookup,
      );
      if (cmp) return cmp;
      const tie = valueKey(tableValue(a, key)).localeCompare(
        valueKey(tableValue(b, key)),
      );
      if (tie) return tie;
    }
    for (const s of p.sorts) {
      const cmp = compareTableValues(
        tableValue(a, s.field),
        tableValue(b, s.field),
        s.field,
        s.dir,
        config,
        lookup,
      );
      if (cmp) return cmp;
    }
    return 0;
  });
  const groupPath = (t) => p.groups.map((k) => valueKey(tableValue(t, k)));
  const counts = new Map(),
    summaries = new Map();
  for (const t of ordered)
    for (let i = 1; i <= p.groups.length; i++) {
      const key = JSON.stringify(groupPath(t).slice(0, i));
      counts.set(key, (counts.get(key) || 0) + 1);
      const summary = summaries.get(key) || {
        count: 0,
        done: 0,
        estimate: 0,
        unestimated: 0,
      };
      summary.count++;
      summary.done += config.done?.includes(t.status) ? 1 : 0;
      if (t.estimate == null) summary.unestimated++;
      else summary.estimate += Number(t.estimate) || 0;
      summaries.set(key, summary);
    }
  const depths = new Map();
  if (!p.outline) return { tasks: ordered, counts, summaries, groupPath, depths };
  const groups = new Map(), outlined=[];
  for(const task of ordered) {
    const key=JSON.stringify(groupPath(task));
    if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(task);
  }
  for(const tasks of groups.values()) {
    const ids=new Set(tasks.map(t=>t.id)),children=new Map(),seen=new Set();
    for(const t of tasks) {const parent=ids.has(t.parent)?t.parent:null;if(!children.has(parent)) children.set(parent,[]);children.get(parent).push(t);}
    const visit=root=>{
      const pending=[[root,0]];
      while(pending.length) {
        const [t,depth]=pending.pop();if(seen.has(t.id)) continue;seen.add(t.id);depths.set(t.id,depth);outlined.push(t);
        for(const child of (children.get(t.id)||[]).slice().reverse()) pending.push([child,depth+1]);
      }
    };
    for(const root of children.get(null)||[]) visit(root);
    for(const t of tasks) if(!seen.has(t.id)) visit(t);
  }
  return { tasks: outlined, counts, summaries, groupPath, depths };
}
