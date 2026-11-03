import { canTransition, transitionError } from './workflow-model.js';
import { hierarchyError } from './hierarchy-model.js';
import { sourceReadOnly } from './source-model.js';
import { fieldOn } from './card-fields.js';
import { priorityOptions } from './task-priority.js';

// A List group represents a field value; changing groups never edits other fields.
export function groupedTaskPatch(config, tasks, id, field, value) {
  const card = tasks.find(task => task.id === id);
  if (!card) throw new Error('Card no longer exists.');
  if (!['status', 'assignee', 'priority', 'type'].includes(field) || typeof value !== 'string')
    throw new Error('Invalid group value.');
  if (!fieldOn(config, field)) throw new Error('This grouping field is turned off.');
  if (sourceReadOnly(card, field)) throw new Error('Card type is managed by the connected source.');
  if (field === 'status' && !canTransition(config, card.status, value)) throw new Error(transitionError(config, card.status, value));
  if (field === 'priority' && !priorityOptions.includes(value)) throw new Error('Invalid priority group.');
  if (field === 'type') {
    if (!config.types.includes(value)) throw new Error('Invalid card type group.');
    const updated = { ...card, type: value };
    const errors = [hierarchyError(config, updated, tasks.find(task => task.id === card.parent)),
      ...tasks.filter(task => task.parent === id).map(child => hierarchyError(config, child, updated))];
    const error = errors.find(Boolean);
    if (error) throw new Error(error);
  }
  return (card[field] || '') === value ? {} : { [field]: value };
}

// Manual order is a local task property, including on imported tasks.
export const compareTaskOrder = (a, b) =>
  (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id);

export function reorderTasks(tasks, visibleIds, id, target, after = false) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const visible = [...new Set(visibleIds)].filter(key => byId.has(key));
  if (id === target || !visible.includes(id) || !visible.includes(target)) return [];
  const moved = visible.filter(key => key !== id);
  moved.splice(moved.indexOf(target) + Number(after), 0, id);
  if (moved.every((key, i) => key === visible[i])) return [];

  // Replace only the participating slots. Filtered, archived and other branches'
  // tasks retain their positions relative to each other.
  const base = [...tasks].sort(compareTaskOrder);
  const participating = new Set(visible);
  let index = 0;
  const result = base.map(t => participating.has(t.id) ? byId.get(moved[index++]) : t);
  let first = result.findIndex((t, i) => t !== base[i]);
  if (first < 0) return [];
  let last = result.length - 1;
  while (result[last] === base[last]) last--;
  const count = last - first + 1;
  let low = first ? (base[first - 1].order || 0) : null;
  let high = last + 1 < base.length ? (base[last + 1].order || 0) : null;
  if (low == null) low = (high ?? 0) - 1024 * (count + 1);
  if (high == null) high = low + 1024 * (count + 1);
  let step = (high - low) / (count + 1);
  // Old projects can have tied/missing ranks. Rebalance once when no numeric
  // space remains, keeping the exact same relative order of hidden records.
  if (!Number.isFinite(step) || step <= 1e-6 || low + step === low || high - step === high) {
    first = 0;
    last = result.length - 1;
    low = 0;
    step = 1024;
  }
  return result.slice(first, last + 1).flatMap((t, i) => {
    const order = low + step * (i + 1);
    return t.order === order ? [] : [{ id: t.id, order }];
  });
}
