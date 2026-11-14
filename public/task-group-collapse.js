// List groups keep their disclosure choice separately for every project and grouping field.
const key = (project, field) => `list-group-collapsed:${project}:${field}`;
function collapsedGroups(storage, project, field) {
  const saved = storage.get(key(project, field), []);
  return new Set(Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : []);
}
const label = (name, expanded) => `${expanded ? 'Collapse' : 'Expand'} ${name} group`;

export function listGroupToggle({ state, storage, esc, icon }, field, value, name) {
  const expanded = !collapsedGroups(storage, state.project.id, field).has(value);
  const id = `list-group-toggle-${encodeURIComponent(field)}-${encodeURIComponent(value)}`;
  return `<button type="button" id="${esc(id)}" class="icon-button list-group-toggle" data-list-group-toggle data-group-name="${esc(name)}" aria-expanded="${expanded}" aria-label="${esc(label(name, expanded))}" title="${esc(label(name, expanded))}">${icon('chevron')}</button>`;
}

export function installListGroupCollapse({ state, storage }) {
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-list-group-toggle]');
    const section = button?.closest('#view-content section[data-task-drop-field]');
    if (!section || state.view !== 'list' || !state.project || state.taskReordering) return;
    const field = section.dataset.taskDropField, value = section.dataset.taskDropValue;
    const collapsed = collapsedGroups(storage, state.project.id, field);
    const expanded = button.getAttribute('aria-expanded') === 'false';
    if (expanded) collapsed.delete(value); else collapsed.add(value);
    storage.set(key(state.project.id, field), [...collapsed]);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', label(button.dataset.groupName, expanded));
    button.title = label(button.dataset.groupName, expanded);
  });
}
