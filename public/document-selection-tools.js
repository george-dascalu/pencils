import { richToolbar } from './canvas-rich-text.js';
import { installToolbarScroll } from './rich-toolbar-scroll.js';
import { positionPopover } from './popover-position.js';
import { allowsTextAutofocus } from './open-focus.js';
import { textColor } from './document-text-color.js';

// The existing formatting controls and colour picker, beside the selected letters (also in Focus).
export function documentSelectionTools({ view, icon, colorPicker, selected, format }) {
  const life = new AbortController(), signal = life.signal;
  const root = document.createElement('div');
  root.className = 'document-selection-toolbar'; root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'toolbar'); root.setAttribute('aria-label', 'Format selection');
  const css = getComputedStyle(document.documentElement);
  const palette = [['--red','Red','#b42318'],['--green','Green','#067647'],['--blue','Blue','#175cd3'],['--purple','Purple','#6941c6'],['--orange','Orange','#b54708'],['--ink','Text','#33463b']]
    .map(([token, name, fallback]) => [textColor(css.getPropertyValue(token)) || fallback, name]);
  root.innerHTML = richToolbar(icon, { adapter: 'document', inlineOnly: true, modes: false, alignment: null,
    extra: colorPicker({ name: 'document-text-color', label: 'Text colour', value: palette.at(-1)[0], palette }) });
  document.body.append(root);
  const scroll = installToolbarScroll(root.querySelector('.rich-toolbar-shell'));
  let frame, dragging = false, dismissed = false, highlight = null, visible = false;
  const clearHighlight = () => {
    if (highlight && globalThis.CSS?.highlights?.get('document-selected-text') === highlight) CSS.highlights.delete('document-selected-text');
    highlight = null;
  };
  function hide() {
    visible = false; clearHighlight();
    for (const menu of root.querySelectorAll('details[open]')) menu.open = false;
    if (root.matches(':popover-open')) root.hidePopover();
  }
  function paint() {
    const active = document.activeElement;
    const native = window.getSelection();
    const inside = view.dom.contains(active) || root.contains(active) || view.dom.contains(native?.anchorNode);
    if (dragging || dismissed || !inside || !view.dom.getBoundingClientRect().height || view.dom.querySelector('.cm-search')) return hide();
    const info = selected();
    if (!info || info.plain) return hide();
    const rect = info.rect, bounds = view.scrollDOM.getBoundingClientRect();
    if (!rect || rect.bottom < bounds.top || rect.top > bounds.bottom) return hide();
    for (const button of root.querySelectorAll('[data-document-format]')) {
      button.setAttribute('aria-pressed', String(!!info.formats?.[button.dataset.documentFormat]));
      button.disabled = !!info.formats?.code && button.dataset.documentFormat !== 'code';
    }
    const picker = root.querySelector('.color-picker');
    picker.querySelector('summary').setAttribute('aria-disabled', String(!!info.formats?.code));
    if (!picker.open) {
      const color = info.color || textColor(getComputedStyle(view.contentDOM).color) || palette.at(-1)[0];
      picker.querySelector('[data-color-value]').value = color;
      picker.querySelector('summary .selection-swatch').style.setProperty('--swatch', color);
    }
    if (!visible) { root.showPopover(); visible = true; }
    const height = parseFloat(getComputedStyle(root).getPropertyValue('--control-height')) + 10;
    root.style.width = 'max-content';
    const width = Math.min(360, root.getBoundingClientRect().width);
    positionPopover(root, rect, { width, maxHeight: height, gap: 6 });
    const top = window.visualViewport?.offsetTop || 0;
    if (rect.top - root.offsetHeight - 6 >= Math.max(top + 8, bounds.top)) root.style.top = `${rect.top - root.offsetHeight - 6}px`;
    scroll.update();
    clearHighlight();
    if (info.range && globalThis.Highlight && globalThis.CSS?.highlights) {
      highlight = new Highlight(info.range); CSS.highlights.set('document-selected-text', highlight);
    }
  }
  function update({ selectionChanged = false } = {}) { if (selectionChanged) dismissed = false; cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); }
  document.addEventListener('selectionchange', update, { signal });
  document.addEventListener('pointerdown', event => {
    if (root.contains(event.target)) return;
    if (view.dom.contains(event.target)) { dismissed = false; dragging = true; hide(); }
    else { dismissed = true; hide(); }
  }, { capture: true, signal });
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => { dragging = false; update(); }, { signal });
  view.dom.addEventListener('focusin', () => { dismissed = false; update(); }, { signal });
  view.dom.addEventListener('keyup', event => { if (event.key !== 'Escape') { dismissed = false; update(); } }, { signal });
  document.addEventListener('scroll', update, { capture: true, passive: true, signal });
  window.addEventListener('resize', update, { signal });
  window.visualViewport?.addEventListener('resize', update, { signal });
  window.visualViewport?.addEventListener('scroll', update, { signal });
  const resize = new ResizeObserver(update); resize.observe(view.dom);
  // Formatting controls preserve the editor selection. Explicit colour text fields still accept focus.
  root.addEventListener('mousedown', event => { if (event.target.closest('button,summary')) event.preventDefault(); }, { signal });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-document-format]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    format(button.dataset.documentFormat, undefined, { focus: allowsTextAutofocus() || view.dom.contains(document.activeElement) }); update();
  }, { signal });
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-color-value]')) return;
    event.stopPropagation();
    format('color', event.target.value, { focus: allowsTextAutofocus() || view.dom.contains(document.activeElement) }); update();
  }, { signal });
  function escape() {
    if (!visible || view.dom.querySelector('.cm-search')) return false;
    const menu = root.querySelector('details[open]');
    if (menu) { menu.open = false; menu.querySelector('summary').focus({ preventScroll: true }); return true; }
    hide();
    if (allowsTextAutofocus()) view.focus();
    dismissed = true;
    return true;
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !escape()) return;
    event.preventDefault(); event.stopPropagation();
  }, { signal });
  return { update, escape, destroy() { cancelAnimationFrame(frame); hide(); resize.disconnect(); scroll.destroy(); life.abort(); root.remove(); } };
}
