export function hierarchyRules(config) {
  return (
    config.hierarchy || {
      mode: "free",
      roots: [...config.types],
      children: Object.fromEntries(
        config.types.map((type) => [type, [...config.types]]),
      ),
    }
  );
}
export function canParent(config, childType, parentType = null) {
  const rules = hierarchyRules(config);
  return (
    rules.mode !== "enforced" ||
    (parentType === null
      ? rules.roots
      : rules.children[parentType] || []
    ).includes(childType)
  );
}
export function hierarchyError(config, task, parent) {
  if (canParent(config, task.type, parent?.type ?? null)) return "";
  return parent
    ? `Cards Hierarchies: ${parent.type} cannot parent ${task.type} (${task.title}).`
    : `Cards Hierarchies: ${task.type} requires an allowed parent (${task.title}).`;
}
