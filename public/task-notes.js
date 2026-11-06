import {canvasRichText, richToolbar} from './canvas-rich-text.js';
import {taskAttachments} from './task-attachments.js';
import {taskAttachmentContent, retainTaskAttachments} from './task-attachment-model.js';
import {TASK_NOTE_LIMIT, TASK_NOTE_CHARACTERS} from './task-note-model.js';
import {confirmAction} from './confirm-popover.js';
import {randomUUID} from './uuid.js';

// Only the current note owns an editor. Paging never rebuilds the rest of the card.
export function taskNotes(ctx, form) {
  const {esc, icon, markdown, state} = ctx, source = form.elements.notes;
  const project = state.project.id, dialog = form.closest('dialog');
  const host = document.createElement('section');
  host.className = 'task-notes'; host.setAttribute('aria-label', 'Notes');
  const action = (name, glyph, label, extra = '') => `<button type="button" class="icon-button ${extra}" data-note-action="${name}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;
  // New sits in the middle of the bar, like the top bar's New; Attach files follows Edit (F0.22-28).
  host.innerHTML = `<header class="task-notes-heading"><h3>Notes</h3><button type="button" class="button primary task-note-new" data-note-action="add" aria-label="New note" title="New note">${icon('plus')}New</button><div role="group" aria-label="Note actions">${action('edit', 'pencil', 'Edit note')}${action('attach', 'paperclip', 'Attach files to note')}${action('delete', 'trash', 'Delete note', 'danger')}</div></header><div class="task-note-slot"></div><nav class="task-notes-navigation" aria-label="Browse notes">${action('previous', 'chevron-left', 'Previous note')}<output aria-live="polite" aria-atomic="true"></output>${action('next', 'chevron-right', 'Next note')}</nav>`;
  form.querySelector('.task-description').after(host);
  const slot = host.querySelector('.task-note-slot'), nav = host.querySelector('nav'), count = host.querySelector('output');
  let notes = JSON.parse(source.value || '[]') || [], index = 0, editing = false, editor = null, files = null, disposed = false, swiping = null;
  const button = name => host.querySelector(`[data-note-action="${name}"]`);
  function controls(pending = files?.pending || 0) {
    const exists = !!notes.length;
    count.textContent = exists ? `${index + 1} / ${notes.length}` : '';
    nav.hidden = !exists;
    for (const name of ['edit', 'attach', 'delete']) button(name).hidden = !exists;
    button('add').disabled = !!pending || notes.length >= TASK_NOTE_LIMIT;
    button('edit').disabled = button('attach').disabled = button('delete').disabled = !!pending;
    button('previous').disabled = !!pending || index === 0;
    button('next').disabled = !!pending || index >= notes.length - 1;
    button('edit').setAttribute('aria-pressed', String(editing));
    button('edit').setAttribute('aria-label', editing ? 'Finish editing note' : 'Edit note');
    button('edit').title = editing ? 'Finish editing note' : 'Edit note';
    host.setAttribute('aria-busy', String(!!pending));
  }
  function write(type = 'input') {
    source.value = JSON.stringify(notes);
    source.dispatchEvent(new Event(type, {bubbles: true}));
  }
  function flush() { editor?.flush(); }
  function release() {
    files?.destroy(); files = null;
    editor?.destroy(); editor = null;
  }
  function mount() {
    release();
    if (!notes.length) {
      editing = false; slot.innerHTML = '<p class="field-hint">No notes yet.</p>'; controls(); return;
    }
    const note = notes[index];
    slot.innerHTML = `<article class="task-note-card" data-attachment-scope data-editing="${editing}" aria-label="Note ${index + 1} of ${notes.length}"><div class="task-rich-tools" role="toolbar" aria-label="Format note">${richToolbar(icon, {alignment: null, idPrefix: 'task-note', previewAction: 'data-rich-preview'})}</div><div class="inline-rich canvas-markdown document-prose" role="textbox" aria-label="Note text" aria-multiline="true" contenteditable="true" data-placeholder="Write a note…" spellcheck="true"></div><textarea class="markdown-source hidden" name="note-body" aria-label="Note in Markdown" maxlength="${TASK_NOTE_CHARACTERS}">${esc(note.body)}</textarea><div class="inline-preview canvas-markdown document-prose" tabindex="0" role="group" aria-label="Note text"></div></article>`;
    const article = slot.firstElementChild, text = article.querySelector('textarea');
    text.addEventListener('input', () => {
      if (disposed || notes[index]?.id !== note.id) return;
      note.body = text.value; write();
    });
    editor = canvasRichText(article, markdown, {
      controls: article.querySelector('.task-rich-tools'), sourceName: 'note-body', focusOnMount: false,
      readSource: value => taskAttachmentContent(value, project).description,
      writeSource: (value, original) => retainTaskAttachments(value, original, project),
    });
    article.querySelector('[data-rich-preview]').closest('.selection-group').hidden = true;
    if (!editing) editor.preview();
    article.querySelector('.task-rich-tools').hidden = !editing;
    files = taskAttachments(ctx, form, editor, {section: article, sourceName: 'note-body', dropTarget: article,
      heading: 'Note attachments', addButton: false, previewId: 'task-note-attachment-preview', onPending: controls, emptyFocus: () => button('attach')});
    controls();
  }
  function move(to) {
    if (files?.pending || to < 0 || to >= notes.length || to === index) return;
    // Paging keeps editing or reading as it was (F0.22-27).
    flush(); index = to; mount();
  }
  host.addEventListener('click', async event => {
    const target = event.target.closest('[data-note-action]');
    if (!target || target.disabled) return;
    const name = target.dataset.noteAction;
    if (name === 'previous' || name === 'next') { move(index + (name === 'next' ? 1 : -1)); return; }
    flush();
    if (name === 'add') {
      notes.push({id: `n-${randomUUID()}`, body: ''}); index = notes.length - 1; editing = true; write('change'); mount();
    } else if (name === 'attach') {
      files?.pick();
    } else if (name === 'edit') {
      editing = !editing; editor.preview();
      slot.firstElementChild.dataset.editing = String(editing);
      slot.querySelector('.task-rich-tools').hidden = !editing; controls();
    } else if (name === 'delete') {
      const id = notes[index].id;
      if (!(await confirmAction({anchor: target, title: 'Delete note?', message: 'Remove this note and its attachment links.', confirmLabel: 'Delete note', danger: true})) || disposed) return;
      flush(); notes = notes.filter(note => note.id !== id); index = Math.max(0, Math.min(index, notes.length - 1)); editing = false; write('change'); mount();
      (notes.length ? button('edit') : button('add')).focus({preventScroll: true});
    }
  });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editor?.escape()) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,[contenteditable="true"]')) return;
    const to = event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowRight' ? index + 1 : null;
    if (to !== null) { event.preventDefault(); event.stopPropagation(); move(to); }
  });
  host.addEventListener('pointerdown', event => {
    if (!editing && !files?.pending && event.pointerType === 'touch' && event.target.closest('.inline-preview') && !event.target.closest('a,button,input'))
      swiping = {id: event.pointerId, x: event.clientX, y: event.clientY};
  });
  host.addEventListener('pointerup', event => {
    if (!swiping || swiping.id !== event.pointerId) return;
    const dx = event.clientX - swiping.x, dy = event.clientY - swiping.y; swiping = null;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(index + (dx < 0 ? 1 : -1));
  });
  host.addEventListener('pointercancel', () => { swiping = null; });
  mount();
  return {
    flush, get busy() { return !!files?.pending; }, settled: () => files?.settled() || Promise.resolve(),
    reload() { notes = JSON.parse(source.value || '[]') || []; index = Math.max(0, Math.min(index, notes.length - 1)); mount(); },
    destroy() { disposed = true; release(); host.remove(); },
  };
}
