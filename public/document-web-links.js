// Plain editor text has no anchor for the browser to follow. Keep URL detection
// independent of the DOM; rendered Markdown links still supply their own href.
export function webURL(value) {
  if (typeof value !== 'string' || !/^(?:https?:\/\/|www\.)/i.test(value)) return null;
  try {
    const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}
export function webURLAt(text, position) {
  for (const match of text.matchAll(/(?<![\w@])(?:https?:\/\/|www\.)[^\s<>"`|]+/gi)) {
    let value = match[0].replace(/[.,;:!?'"\u2019\u201d]+$/, '');
    // Markdown and surrounding prose may add a closing bracket; parentheses
    // which belong to the URL itself (e.g. Wikipedia titles) stay intact.
    let previous;
    do {
      previous = value;
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']])
        if (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
      value = value.replace(/[.,;:!?'"\u2019\u201d]+$/, '');
    } while (value !== previous);
    if (position >= match.index && position <= match.index + value.length) return webURL(value);
  }
  return null;
}
function editableURLAt(field, event) {
  const point = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  const caret = point ? { node: point.offsetNode, offset: point.offset }
    : (() => { const range = document.caretRangeFromPoint?.(event.clientX, event.clientY); return range && { node: range.startContainer, offset: range.startOffset }; })();
  if (!caret || !field.contains(caret.node)) return null;
  const before = document.createRange(); before.selectNodeContents(field); before.setEnd(caret.node, caret.offset);
  return webURLAt(field.textContent, before.toString().length);
}
export function installDocumentWebLinks(view, sourceLinkAt) {
  const life = new AbortController();
  const root = view.dom.closest('.document-writing') || view.dom;
  function urlAt(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.button !== 0) return null;
    const target = event.target;
    if (!target.closest?.('.cm-content,.document-reading') || target.closest('button,input,summary,img')) return null;
    const anchor = target.closest('a[href]');
    if (anchor) return webURL(anchor.getAttribute('href'));
    const field = target.closest('[data-component-field],.document-reading');
    if (field) return editableURLAt(field, event);
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position == null) return null;
    const link = sourceLinkAt(position);
    if (link) return link;
    const line = view.state.doc.lineAt(position);
    return webURLAt(line.text, position - line.from);
  }
  // Capture before CodeMirror changes the caret or swaps rendered links for
  // source text. Opening stays inside the click, so browser popup rules apply.
  for (const type of ['mousedown', 'click']) root.addEventListener(type, event => {
    const url = urlAt(event);
    if (!url) return;
    event.preventDefault(); event.stopPropagation();
    if (type === 'click') window.open(url, '_blank', 'noopener,noreferrer');
  }, { capture: true, signal: life.signal });
  return () => life.abort();
}
