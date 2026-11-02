import { hotkeyChord, hotkeyIssue, hotkeyTarget } from './hotkey-model.js';

export function installHotkeys({ state, api, esc, icon, toast, bookmarks, commands, run, viewLabel }) {
  let items = [], choices = [], ready = false, loading = null, recording = '', busy = false, message = '', loadRevision = 0;
  const key = hotkeyTarget;
  const title = item => {
    if (item.type === 'command') return commands(true).find(c => c.id === item.id)?.title || (item.id.startsWith('view-') ? `Open ${viewLabel(item.id.slice(5))} view` : item.id === 'new-task' ? 'New card' : item.id);
    return item.kind === 'view' ? `${viewLabel(item.id)} · ${item.project_title}` : `${item.title} · ${item.project_title}`;
  };
  const chordLabel = chord => chord.replace('Mod', /Mac|iPad|iPhone/.test(navigator.platform) ? '⌘' : 'Ctrl').split('+').join(' + ');
  function targets() {
    const all = new Map(commands(true).map(c => [`command:${c.id}`, { type: 'command', id: c.id }]));
    // Keep assigned commands editable even when this project has their view turned off.
    for (const item of [...choices, ...items]) if (item.type !== 'command' || !all.has(key(item))) all.set(key(item), item);
    return [...all.values()];
  }
  function html() {
    return `<div class="hotkeys-settings"><p class="field-hint">Choose an action, then press Ctrl/Cmd with a letter or number. Add Alt or Shift to avoid conflicts. Shortcuts are saved for you across devices and pause while typing.</p><div class="hotkey-tools"><label class="field">Find an action<input type="search" data-hotkey-search placeholder="Command or bookmark…" autocomplete="off"></label><button type="button" class="icon-button" data-hotkey-reset title="Reset hotkeys" aria-label="Reset hotkeys">${icon('refresh')}</button></div><p data-hotkey-message role="status" aria-live="polite"></p><div class="hotkey-list"></div></div>`;
  }
  function paint() {
    const host = document.querySelector('.hotkeys-settings');
    if (!host) return;
    const query = host.querySelector('[data-hotkey-search]').value.trim().toLocaleLowerCase();
    const row = item => {
      const id = key(item), name = title(item), bound = items.find(b => key(b) === id), active = recording === id;
      return `<div class="hotkey-row"><span>${esc(name)}</span><button type="button" class="button small hotkey-binding" data-hotkey-record="${esc(id)}" aria-label="Shortcut for ${esc(name)}" aria-description="${esc(active ? "Press a shortcut, or Escape to cancel" : bound ? chordLabel(bound.chord) : "Not assigned")}" aria-pressed="${active}" ${busy ? 'disabled' : ''}>${active ? 'Press keys…' : bound ? `<kbd>${esc(chordLabel(bound.chord))}</kbd>` : 'Set hotkey'}</button><button type="button" class="icon-button" data-hotkey-remove="${esc(id)}" title="Clear shortcut" aria-label="Clear shortcut for ${esc(name)}" ${busy || !bound ? 'disabled' : ''}>${icon('close')}</button></div>`;
    };
    const shown = targets().filter(item => title(item).toLocaleLowerCase().includes(query));
    host.querySelector('.hotkey-list').innerHTML = ready ? ['command', 'item'].map((type, i) => `<section aria-label="${i ? 'Bookmarks' : 'Commands'}"><h3>${i ? 'Bookmarks' : 'Commands'}</h3>${shown.filter(item => item.type === type).map(row).join('') || '<p class="field-hint">No matching actions.</p>'}</section>`).join('') : '<p>Loading hotkeys…</p>';
    host.querySelector('[data-hotkey-message]').textContent = message;
    host.querySelector('[data-hotkey-reset]').disabled = busy || !items.length;
  }
  async function load() {
    if (loading) return loading;
    const revision = loadRevision;
    loading = api('/hotkeys').then(data => { if (revision !== loadRevision) return; items = data.items; ready = true; paint(); }).finally(() => { loading = null; });
    return loading;
  }
  async function mount() {
    recording = ''; message = ''; paint();
    try { const [list] = await Promise.all([bookmarks.list(), load()]); choices = list.map(b => ({ ...b, type: 'item' })); paint(); }
    catch (error) { message = error.message; paint(); toast(error.message, true); }
  }
  const focus = id => [...document.querySelectorAll('[data-hotkey-record]')].find(el => el.dataset.hotkeyRecord === id)?.focus({ preventScroll: true });
  async function save(next, id) {
    if (busy) return;
    busy = true; loadRevision++; recording = ''; message = 'Saving…'; paint();
    try {
      const body = { items: next.map(({ type, id, kind, project, chord }) => type === 'command' ? { type, id, chord } : { type, kind, project, id, chord }) };
      await api('/hotkeys', { method: 'PATCH', body }); items = next; message = '';
    } catch (error) { message = error.message; toast(error.message, true); }
    finally { busy = false; paint(); if (id) focus(id); }
  }
  document.addEventListener('input', event => { if (event.target.matches('[data-hotkey-search]')) { recording = ''; paint(); } });
  document.addEventListener('click', event => {
    const record = event.target.closest?.('[data-hotkey-record]'), remove = event.target.closest?.('[data-hotkey-remove]');
    if (record && !busy) { recording = recording === record.dataset.hotkeyRecord ? '' : record.dataset.hotkeyRecord; message = recording ? 'Press your shortcut. Escape cancels.' : ''; paint(); focus(record.dataset.hotkeyRecord); }
    else if (remove && !busy) void save(items.filter(b => key(b) !== remove.dataset.hotkeyRemove), remove.dataset.hotkeyRemove);
    else if (event.target.closest?.('[data-hotkey-reset]') && !busy) void save([]);
    else if (recording) { recording = ''; message = ''; paint(); }
  });
  window.addEventListener('keydown', event => {
    const capture = event.target.closest?.('[data-hotkey-record]');
    if (recording && capture?.dataset.hotkeyRecord === recording) {
      if (event.key === 'Tab') {
        const bound = items.find(b => key(b) === recording);
        recording = ''; message = ''; capture.textContent = bound ? chordLabel(bound.chord) : 'Set hotkey';
        capture.setAttribute('aria-pressed', 'false');
        document.querySelector('[data-hotkey-message]').textContent = '';
        return;
      }
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') { const id = recording; recording = ''; message = ''; paint(); focus(id); return; }
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key) || event.repeat || event.isComposing) return;
      const chord = hotkeyChord(event), conflict = items.find(b => b.chord === chord && key(b) !== recording);
      message = hotkeyIssue(chord) || (conflict ? `Already used by ${title(conflict)}. Clear that shortcut first.` : '');
      if (message) { paint(); focus(recording); return; }
      const target = targets().find(b => key(b) === recording);
      if (target) void save([...items.filter(b => key(b) !== recording), { ...target, chord }], recording);
      return;
    }
    if (!ready || event.defaultPrevented || event.repeat || event.isComposing || state.dialog || state.boardTaskEditor || state.canvasEditing || state.menu || event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, dialog[open]')) return;
    const binding = items.find(b => b.chord === hotkeyChord(event));
    if (!binding) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (binding.type === 'command' && !commands().some(c => c.id === binding.id)) { toast('Open a project where this command is available.'); return; }
    Promise.resolve(run(binding)).catch(error => toast(error.message, true));
  }, true);
  return { html, mount, load };
}
