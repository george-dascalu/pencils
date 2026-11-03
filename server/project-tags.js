// Project tags (F0.21-73): renaming or deleting a tag changes every card that has it, then the
// project's list, in one change (so each card's edit enters the audit log with the actor).
import { Problem } from "./problem.js";
import { schema } from "./model.js";
import { tagName } from "./values.js";

export async function editTag(store, project, input) {
  const edit = input.tag_edit;
  if (!edit || typeof edit.from !== "string" || !edit.from) throw new Problem(400, "Choose a tag to change.");
  const from = edit.from, to = edit.to == null ? null : tagName(edit.to);
  const file = store.file(project, "project"), current = await store.read(file);
  store.checkRevision(current, input.revision);
  const { items, warnings } = await store.children(project, "tasks");
  if (warnings.length) throw new Problem(409, "Repair unreadable cards before changing tags.");
  let count = 0;
  for (const task of items.filter((t) => (t.tags || []).includes(from))) {
    const tags = [...new Set(task.tags.flatMap((t) => (t === from ? (to ? [to] : []) : [t])))];
    // One card that can't save stops the whole change, which mutate() then rolls back.
    try { await store.updateTask(project, task.id, { revision: task.revision, tags }); }
    catch (error) { throw new Problem(error.status || 400, `“${task.title}”: ${error.message}`); }
    count++;
  }
  // A rename onto a tag already listed merges into it; otherwise the entry keeps its colour.
  const listed = current.data.schema?.tags || [], merged = to !== null && listed.some((t) => t.name === to);
  const tags = listed.flatMap((t) => (t.name !== from ? [t] : to === null || merged ? [] : [{ ...t, name: to }]));
  if (to !== null && !tags.some((t) => t.name === to)) tags.push({ name: to });
  const saved = await store.write(file, { ...current.data, schema: schema({ ...current.data.schema, tags }), updated: new Date().toISOString() }, current.body, current);
  return { project: saved, count };
}
