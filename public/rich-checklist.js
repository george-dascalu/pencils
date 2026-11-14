// WebKit may wrap inserted controls in an inline span. A nested item's checkbox
// belongs only to that item, never to its parent bullet.
export const richCheckboxIn = item => item && [...item.querySelectorAll('input[type="checkbox"]')].find(box => box.closest('li') === item);
const element = node => node?.nodeType === 1 ? node : node?.parentElement;
const itemAt = node => element(node)?.closest('li');
const splitting = new WeakSet();
// GFM's default rule misses loose lists (the checkbox is inside a paragraph)
// and doubles the existing space after a rendered checkbox.
export const richCheckboxRule = {
  filter: node => node.nodeName === 'INPUT' && node.type === 'checkbox' && !!node.closest('li'),
  replacement: (_content, node) => {
    // Turndown works on a clone. Consume the separator here so native editing's
    // non-breaking spaces cannot turn a task marker into ordinary Markdown.
    const next = node.nextSibling;
    if (next?.nodeType === 3) next.data = next.data.replace(/^[ \t\u00a0]+/, '');
    return (node.checked ? '[x]' : '[ ]') + ' ';
  },
};
function currentRange(root) {
  const selection = getSelection();
  return selection?.rangeCount && root.contains(selection.anchorNode) && root.contains(selection.focusNode) ? selection.getRangeAt(0) : null;
}
function select(range) {
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
}
function rememberRange(root, wholeRoot = false) {
  const range = currentRange(root);
  if (!range) return () => {};
  const point = (node, offset) => {
    const scope = !wholeRoot && itemAt(node) || root, prefix = document.createRange();
    prefix.selectNodeContents(scope); prefix.setEnd(node, offset);
    const fragment = prefix.cloneContents(), walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    let length = 0;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) if (!formattingSpace(text, fragment)) length += text.length;
    return { scope, offset: length, forward: offset === 0 };
  };
  const start = point(range.startContainer, range.startOffset), end = point(range.endContainer, range.endOffset);
  return () => {
    if (!root.contains(start.scope) || !root.contains(end.scope)) return;
    const locate = ({ scope, offset, forward }) => {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (formattingSpace(node, scope)) continue;
        if (offset < node.length || offset === node.length && !forward) return [node, offset];
        offset -= node.length;
      }
      const box = richCheckboxIn(scope);
      return box ? [box.parentNode, [...box.parentNode.childNodes].indexOf(box) + 1] : [scope, scope.childNodes.length];
    };
    const restored = document.createRange();
    restored.setStart(...locate(start)); restored.setEnd(...locate(end)); select(restored);
  };
}
const formattingSpace = (node, scope) => /^[\r\n\t ]*$/.test(node.data) &&
  (node.parentNode === scope || node.parentElement?.matches('ul,ol'));

export function prepareRichCheckboxes(root) {
  const owners = new Set();
  for (const box of root.querySelectorAll('li input[type="checkbox"]')) {
    owners.add(box.closest('li'));
    if (box.closest('[data-md-source],[data-document-source],.document-transclusion')) continue;
    box.disabled = false;
    // Set this after native insertion: WebKit drops it from inserted HTML, and
    // Chromium can move a control out of its paragraph when it is in that HTML.
    box.contentEditable = 'false';
    if (!box.hasAttribute('aria-label')) box.setAttribute('aria-label', 'Checklist item');
  }
  for (const item of root.querySelectorAll('li')) item.classList.toggle('rich-checklist-item', owners.has(item));
}

// Native editing commands keep checkbox changes in the same Undo history as typing.
function setBox(root, item, checked, remove = false) {
  const restore = rememberRange(root), box = richCheckboxIn(item);
  const container = item.firstElementChild?.tagName === 'P' ? item.firstElementChild : item;
  const range = document.createRange();
  if (box) range.selectNode(box);
  else { range.selectNodeContents(container); range.collapse(true); }
  select(range);
  if (remove) document.execCommand('delete');
  else document.execCommand('insertHTML', false, `<input type="checkbox" aria-label="Checklist item"${checked ? ' checked' : ''}>`);
  restore();
}

export function toggleRichCheckbox(root, formatOnly = false) {
  let range = currentRange(root);
  if (!range) return false;
  const protectedNode = element(range.startContainer)?.closest('pre,[contenteditable="false"]');
  if (protectedNode && root.contains(protectedNode)) return false;
  if (!itemAt(range.startContainer) || !itemAt(range.endContainer)) {
    const restore = rememberRange(root, true), collapsed = range.collapsed;
    document.execCommand('insertUnorderedList');
    // An empty new item has no text offset to restore. Keep the native caret
    // inside it instead of mapping it to the next paragraph or outside the list.
    const nativeItem = itemAt(currentRange(root)?.startContainer);
    const emptyItem = collapsed && !root.textContent.trim() && (nativeItem || root.querySelector('li'));
    if (emptyItem) {
      const caret = document.createRange(); caret.selectNodeContents(emptyItem); caret.collapse(true); select(caret);
    } else if (!(collapsed && nativeItem && !nativeItem.textContent.trim())) restore();
    range = currentRange(root);
  }
  if (!range) return false;
  const first = itemAt(range.startContainer), last = itemAt(range.endContainer);
  const items = range.collapsed ? [first] : [...root.querySelectorAll('li')].filter(item => range.intersectsNode(item) &&
    (item === first || item === last || !(item.contains(first) && item.contains(last))));
  const selected = items.filter(item => item && root.contains(item));
  const remove = formatOnly && selected.every(item => richCheckboxIn(item));
  for (const item of selected) {
    const box = richCheckboxIn(item);
    if (!formatOnly || remove || !box) setBox(root, item, box ? !box.checked : false, remove);
  }
  return selected.length > 0;
}

export function continueRichChecklist(root, event) {
  if (splitting.has(root) || event.inputType !== 'insertParagraph' || event.isComposing || !event.cancelable) return false;
  const range = currentRange(root), item = range && itemAt(range.startContainer), box = richCheckboxIn(item);
  if (!item || !root.contains(item) || !box) return false;
  event.preventDefault();
  splitting.add(root);
  try {
    if (!item.textContent.trim() && !item.querySelector('ul,ol,img')) {
      const empty = document.createRange(); empty.selectNodeContents(item); select(empty);
      document.execCommand('delete');
      document.execCommand('insertParagraph');
    } else {
      const checked = box.checked;
      document.execCommand('insertParagraph');
      const next = itemAt(currentRange(root)?.startContainer);
      if (next && root.contains(next) && next !== item) {
        setBox(root, next, false);
        if (item.isConnected && !richCheckboxIn(item)) setBox(root, item, checked);
      }
    }
  } finally { splitting.delete(root); }
  return true;
}
