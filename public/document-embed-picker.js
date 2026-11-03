import { documentHeadings } from './document-model.js';
import { embedReference, tableEmbedSpec } from './document-embed-model.js';

export function documentEmbedPicker({ button, panels, documents, currentId, esc, loadTable, insert }) {
  const records = documents().slice().sort((a, b) => a.title.localeCompare(b.title));
  const panel = panels.show(button, 'Embed document', `<form class="document-embed-picker"><label class="field">Document<select name="document" aria-label="Document">${records.map(d => `<option value="${esc(d.id)}">${esc(d.title)}${d.document_type === 'table' ? ' · Table' : ''}</option>`).join('')}</select></label><div data-embed-target></div><p class="form-error" role="alert" hidden></p><output class="document-embed-reference" aria-label="Embed reference"></output><div class="document-panel-actions"><button type="submit" class="button primary" ${records.length ? '' : 'disabled'}>Insert embed</button></div></form>`, 400);
  if (!panel) return;
  const form = panel.querySelector('form'), details = form.querySelector('[data-embed-target]'), error = form.querySelector('.form-error'), submit = form.querySelector('button[type=submit]');
  const other = records.find(d => d.id !== currentId); if (other) form.elements.document.value = other.id;
  let serial = 0, table = null;
  function reference() {
    const record = records.find(d => d.id === form.elements.document.value);
    if (!record) throw Error('Create another document to embed.');
    if (record.document_type !== 'table') return embedReference(record, form.elements.section.value ? form.elements.section.value.split('#').map(decodeURIComponent) : '');
    if (!table) throw Error('Wait for the worksheets to load.');
    const sid = form.elements.worksheet.value, range = form.elements.range.value.trim().toUpperCase();
    const fragment = sid || range ? `${table.workbook.sheets[sid || table.workbook.sheetOrder[0]].name}${range ? '!' + range : ''}` : '';
    tableEmbedSpec(table, fragment); return embedReference(record, fragment);
  }
  const preview = () => { try { form.querySelector('output').textContent = reference(); } catch { form.querySelector('output').textContent = ''; } };
  async function choose() {
    const generation = ++serial, record = records.find(d => d.id === form.elements.document.value); table = null; error.hidden = true;
    if (!record) { details.textContent = 'Create another document to embed.'; return; }
    submit.disabled = true;
    if (record.document_type === 'table') {
      details.innerHTML = '<p class="field-hint" role="status">Opening worksheets…</p>';
      try {
        const loaded = record.table || await loadTable(record); if (generation !== serial || !panel.isConnected) return; table = loaded;
        details.innerHTML = `<label class="field">Worksheet<select name="worksheet" aria-label="Worksheet"><option value="">All worksheets</option>${table.workbook.sheetOrder.map(id => `<option value="${esc(id)}">${esc(table.workbook.sheets[id].name)}</option>`).join('')}</select></label><label class="field">Cell range (optional)<input name="range" aria-label="Cell range (optional)" placeholder="A1:D12" maxlength="30" autocomplete="off" spellcheck="false"></label>`;
      } catch (failure) { if (generation !== serial || !panel.isConnected) return; details.textContent = ''; error.textContent = failure.message; error.hidden = false; return; }
    } else {
      const stack = [];
      details.innerHTML = `<label class="field">Section<select name="section" aria-label="Section"><option value="">Whole document</option>${documentHeadings(record.body || '').map(heading => {
        while (stack.length && stack.at(-1).level >= heading.level) stack.pop(); stack.push(heading);
        const path = stack.map(h => h.title);
        return `<option value="${esc(path.map(encodeURIComponent).join('#'))}">${esc(path.join(' › '))}</option>`;
      }).join('')}</select></label>`;
    }
    submit.disabled = false; preview();
  }
  form.elements.document.addEventListener('change', choose);
  form.addEventListener('input', preview); form.addEventListener('change', preview);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { const value = reference(); panels.close(); insert(value); }
    catch (failure) { error.textContent = failure.message; error.hidden = false; }
  });
  void choose();
}
