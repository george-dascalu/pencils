import { priorityLabel } from './task-priority.js';
import { statusLabel } from './workflow-model.js';

const fields = {
  title: 'Title', type: 'Card type', assignee: 'Assignee', priority: 'Priority', status: 'Status',
  start: 'Start date', due: 'Due date', body: 'Description', parent: 'Parent task',
  dependencies: 'Blocked by', related_records: 'Related tasks', tags: 'Tags',
  estimate: 'Estimate', archived: 'Archived', recurrence: 'Recurrence',
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const record = value => value?.data ? { ...value.data, body: value.body } : value || {};

// Compare adjacent saved snapshots, not every historical version against today.
export function taskChanges(previous, next) {
  const before = record(previous), after = record(next), changes = [];
  for (const [key, label] of Object.entries(fields)) {
    if (same(before[key], after[key]) || (!before[key] && !after[key])) continue;
    if (Array.isArray(after[key]) && !after[key].length && !before[key]) continue;
    changes.push({ key, label, before: before[key], after: after[key] });
  }
  for (const key of new Set([...Object.keys(before.fields || {}), ...Object.keys(after.fields || {})]))
    if (!same(before.fields?.[key], after.fields?.[key])) changes.push({ key: `field:${key}`, label: key, before: before.fields?.[key], after: after.fields?.[key] });
  const oldComments = new Map((before.comments || []).map(c => [c.id, c]));
  const newComments = new Map((after.comments || []).map(c => [c.id, c]));
  for (const id of new Set([...oldComments.keys(), ...newComments.keys()])) {
    const old = oldComments.get(id), current = newComments.get(id), person = current?.author || old?.author || 'Workspace';
    const text = c => c ? c.deleted ? 'Deleted comment' : c.text : null;
    if (!same(text(old), text(current))) changes.push({ key: 'comment', label: `Comment · ${person}`, before: text(old), after: text(current) });
    const reactions = c => (c?.reactions || []).map(r => `${r.emoji} ${r.author || 'Workspace'}`).sort();
    if (!same(reactions(old), reactions(current))) changes.push({ key: 'reactions', label: `Reactions · ${person}`, before: reactions(old), after: reactions(current) });
  }
  return changes;
}

export function taskHistoryHTML(versions, current, { esc, icon, state, label, task }) {
  const rows = [{ ...current, current: true }, ...versions.filter(v => v.revision !== current.revision)];
  const format = (key, value) => {
    if (value == null || value === '' || Array.isArray(value) && !value.length) return 'Not set';
    if (key === 'priority') return priorityLabel(value);
    if (key === 'status') return statusLabel(state.config, value);
    if (key === 'type') return label(value);
    if (key === 'parent') return task(value)?.title || value;
    if (['dependencies', 'related_records'].includes(key)) return value.map(id => task(id)?.title || id).join('\n');
    if (Array.isArray(value)) return value.join('\n');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };
  const valueHTML = (value, other) => {
    if (value === 'Not set' || other === 'Not set') return esc(value);
    value = Array.from(value); other = Array.from(other);
    let prefix = 0, suffix = 0;
    while (prefix < Math.min(value.length, other.length) && value[prefix] === other[prefix]) prefix++;
    while (suffix < Math.min(value.length, other.length) - prefix && value[value.length - suffix - 1] === other[other.length - suffix - 1]) suffix++;
    return esc(value.slice(0, prefix).join('')) + `<mark>${esc(value.slice(prefix, value.length - suffix).join(''))}</mark>` + esc(suffix ? value.slice(-suffix).join('') : '');
  };
  return rows.map((version, index) => {
    const prior = rows[index + 1], changes = prior ? taskChanges(prior, version) : [];
    const summaries = changes.map(change => change.key.startsWith('field:') ? state.config.fields?.find(f => f.id === change.key.slice(6))?.name || change.label : change.label);
    const date = version.updated ? new Date(version.updated).toLocaleString() : 'Date unavailable';
    return `<details class="task-history-version recovery-item" ${index === 0 ? 'open' : ''}><summary><span class="task-history-date">${icon('clock')}<strong>${version.current ? 'Current version' : esc(date)}</strong>${version.current ? `<time>${esc(date)}</time>` : ''}</span><span class="task-history-summary">${changes.length ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} · ${esc(summaries.join(', '))}` : prior ? 'No field changes' : 'Earliest saved version'}</span></summary><div class="task-history-changes">${changes.map((change, i) => {
      const before = format(change.key, change.before), after = format(change.key, change.after);
      return `<section class="task-history-change"><h4>${esc(summaries[i])}</h4><div class="task-history-before"><strong><span aria-hidden="true">−</span> Before</strong><div>${valueHTML(before, after)}</div></div><div class="task-history-after"><strong><span aria-hidden="true">+</span> After</strong><div>${valueHTML(after, before)}</div></div></section>`;
    }).join('') || `<p class="field-hint">${prior ? 'Only file metadata changed.' : 'There is no earlier snapshot to compare.'}</p>`}</div>${!prior ? `<p>${esc(version.title || record(version).title || '')}</p>` : ''}${version.current ? '' : `<button type="button" class="button small" data-task-modal="history-restore" data-version="${esc(version.revision)}">Restore this version</button>`}</details>`;
  }).join('');
}
