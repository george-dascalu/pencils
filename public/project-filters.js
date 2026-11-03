import { fieldOn } from './card-fields.js';
import { localDate } from './task-visibility.js';

// Prefix new exact choices so older saved free-text assignee filters retain their meaning.
export const assigneeFilterValue = name => name == null ? '@unassigned' : `@person:${name}`;
export function matchesProjectFilters(task, filters = {}, {config = {}, today = localDate(), taskById = () => null} = {}) {
  const on = field => fieldOn(config, field), done = (config.done || ['done']).includes(task.status);
  if (task.archived && !filters.archived) return false;
  if (on('status') && filters.completion && (filters.completion === 'done' ? !done : done)) return false;
  if (on('assignee') && filters.assignee) {
    const choice = filters.assignee, value = task.assignee || '';
    if (choice === '@unassigned' ? !!value : choice.startsWith('@person:') ? value !== choice.slice(8) : !value.toLocaleLowerCase().includes(choice.toLocaleLowerCase())) return false;
  }
  if (on('priority') && filters.priority && task.priority !== filters.priority) return false;
  if (on('tags')) {
    const tags = (task.tags || []).map(tag => tag.toLocaleLowerCase());
    const selected = Array.isArray(filters.tags) ? filters.tags : [];
    if (selected.length && !selected.some(tag => tags.includes(tag.toLocaleLowerCase()))) return false;
    if (!selected.length && filters.tag && !tags.some(tag => tag.includes(filters.tag.toLocaleLowerCase()))) return false;
  }
  if (on('due') && filters.due) {
    const soon = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
    if (!(filters.due === 'overdue' && task.due && task.due < today && !done || filters.due === 'week' && task.due && task.due >= today && task.due <= soon && !done || filters.due === 'none' && !task.due)) return false;
  }
  if (filters.blocked && !(task.dependencies || []).some(id => !(config.done || ['done']).includes(taskById(id)?.status))) return false;
  for (const field of config.fields || []) {
    const choice = filters.fields?.[field.id];
    if (choice == null || choice === '') continue;
    const value = task.fields?.[field.id];
    if (value == null) return false;
    if (field.type === 'number') {
      if (value === '' || !Number.isFinite(Number(choice)) || Number(value) !== Number(choice)) return false;
    } else if (field.type === 'text') {
      if (!String(value).toLocaleLowerCase().includes(String(choice).toLocaleLowerCase())) return false;
    } else if (String(value) !== String(choice)) return false;
  }
  return true;
}
