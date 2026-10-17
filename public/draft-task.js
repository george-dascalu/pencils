// Drafts live in the canvas document. They become project tasks only on conversion.
export const draftTaskData = (node) => ({
  ...node.draft,
  body: node.text || "",
});
export function draftTaskFields(data) {
  return Object.fromEntries(
    [
      "title",
      "type",
      "status",
      "priority",
      "parent",
      "assignee",
      "start",
      "due",
      "dependencies",
      "subtasks",
    ]
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, structuredClone(data[key])]),
  );
}
export function validDraftTask(node) {
  const d = node.draft;
  return (
    !!d &&
    typeof d === "object" &&
    !Array.isArray(d) &&
    typeof d.title === "string" &&
    d.title.trim().length > 0 &&
    d.title.length <= 300 &&
    ["type", "status", "priority", "assignee", "parent", "start", "due"].every(
      (key) =>
        d[key] == null || (typeof d[key] === "string" && d[key].length <= 300),
    ) &&
    (d.dependencies == null ||
      (Array.isArray(d.dependencies) &&
        d.dependencies.length <= 200 &&
        d.dependencies.every(
          (id) => typeof id === "string" && id.length <= 300,
        ))) &&
    (d.subtasks == null ||
      (Array.isArray(d.subtasks) &&
        d.subtasks.length <= 100 &&
        d.subtasks.every(
          (child) =>
            child &&
            typeof child.title === "string" &&
            child.title.trim().length > 0 &&
            child.title.length <= 300 &&
            typeof child.type === "string" &&
            child.type.length <= 100,
        )))
  );
}
