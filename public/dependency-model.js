// A -> B means B has A among its prerequisites.
export function dependencyCycle(tasks, target, prerequisite) {
  const map = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set();
  function reaches(id) {
    if (id === target) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return (map.get(id)?.dependencies || []).some(reaches);
  }
  return reaches(prerequisite);
}
export function edgeDependency(board, edge, tasks, nodes = null) {
  const from = nodes
    ? nodes.get(edge.from)
    : board?.nodes.find((node) => node.id === edge.from);
  const to = nodes
    ? nodes.get(edge.to)
    : board?.nodes.find((node) => node.id === edge.to);
  const getTask = (id) =>
    tasks instanceof Map ? tasks.get(id) : tasks.find((task) => task.id === id);
  const source = from?.type === "task" && getTask(from.task);
  const target = to?.type === "task" && getTask(to.task);
  const valid =
    edge.planRelation !== "parent" &&
    !!source &&
    !!target &&
    source.id !== target.id;
  return {
    source,
    target,
    valid,
    active:
      edge.planRelation !== "parent" &&
      valid &&
      (target.dependencies || []).includes(source.id),
  };
}
