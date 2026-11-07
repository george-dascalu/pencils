// @ts-check
/** @typedef {import("./model-types.js").ProjectConfig} ProjectConfig */
/** @param {ProjectConfig} config @returns {import("./model-types.js").Hierarchy} */
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
/** @param {ProjectConfig} config @param {string} childType @param {string | null} [parentType] */
export function canParent(config, childType, parentType = null) {
  const rules = hierarchyRules(config);
  // Without the Parent field (T23, T38) cards can't be placed, so the rules wait until it's back.
  if (config.off?.includes("parent")) return true;
  return (
    rules.mode !== "enforced" ||
    (parentType === null
      ? rules.roots
      : rules.children[parentType] || []
    ).includes(childType)
  );
}
/** @param {ProjectConfig} config @param {{ type: string, title: string }} task @param {{ type: string } | null} [parent] */
export function hierarchyError(config, task, parent) {
  if (canParent(config, task.type, parent?.type ?? null)) return "";
  return parent
    ? `Cards Hierarchies: ${parent.type} cannot parent ${task.type} (${task.title}).`
    : `Cards Hierarchies: ${task.type} requires an allowed parent (${task.title}).`;
}

// A new child takes the usual new-card type when its parent may hold it, else the first type it may.
/** @param {ProjectConfig} config @param {string | null} parentType */
export function childType(config, parentType) {
  const usual = config.types.includes("task") ? "task" : config.types[0];
  return [usual, ...config.types].find((type) => canParent(config, type, parentType)) ?? null;
}
