// WebKit may wrap inserted controls in an inline span. A nested item's checkbox
// belongs only to that item, never to its parent bullet.
export const richCheckboxIn = item => item && [...item.querySelectorAll('input[type="checkbox"]')].find(box => box.closest('li') === item);
const element = node => node?.nodeType === 1 ? node : node?.parentElement;
const itemAt = node => element(node)?.closest('li');
const splitting = new WeakSet();
const typing = new WeakSet();
// Native editing can put the separator in a span, or outside the checkbox's
// own span. Strip it across inline boundaries on Turndown's clone; leave the
// rest of the text and any nested lists or line breaks intact.
function trimCheckboxSeparator(box) {
  const trim = node => {
    if (node.nodeType === 3) {
      node.data = node.data.replace(/^[ \t\r\n\u00a0]+/, '');
      return !node.data;
    }
    if (node.nodeType !== 1) return true;
    if (/^(UL|OL|BR|IMG|INPUT)$/.test(node.nodeName)) return false;
    for (const child of node.childNodes) if (!trim(child)) return false;
    return true;
  };
  const item = box.closest('li');
  for (let node = box; node && node !== item; node = node.parentNode)
    for (let next = node.nextSibling; next; next = next.nextSibling) if (!trim(next)) return;
}
// GFM's default rule misses loose lists (the checkbox is inside a paragraph)
// and doubles the existing space after a rendered checkbox.
export const richCheckboxRule = {
  filter: node => node.nodeName === 'INPUT' && node.type === 'checkbox' && !!node.closest('li'),
  replacement: (_content, node) => {
    // Turndown works on a clone. Consume the separator here so native editing's
    // non-breaking spaces cannot turn a task marker into ordinary Markdown.
    trimCheckboxSeparator(node);
    return (node.checked ? '[x]' : '[ ]') + ' ';
  },
};
export function installRichCheckboxRules(converter) {
  converter.addRule('checklistItem', richCheckboxRule);
  const listItem = converter.options.rules.listItem;
  converter.addRule('checklistRow', {
    filter: node => node.nodeName === 'LI' && !!richCheckboxIn(node),
    replacement(content, node, options) {
      // Inline wrappers may trim the checkbox's separator after its own rule
      // runs. Canonicalise at the item boundary, then use Turndown's normal
      // list formatting for numbering, indentation and loose paragraphs.
      const marker = richCheckboxIn(node).checked ? '[x] ' : '[ ] ';
      content = content.replace(/^(\s*)\[[ xX]\][ \t\u00a0]*/, (_match, leading) => leading + marker);
      return listItem.replacement(content, node, options);
    },
  });
}
function currentRange(root) {
  const selection = getSelection();
  return selection?.rangeCount && root.contains(selection.anchorNode) && root.contains(selection.focusNode) ? selection.getRangeAt(0) : null;
}
function select(range) {
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
}
function rememberRange(root, wholeRoot = false, removedPrefix = null) {
  const range = currentRange(root);
  if (!range) return () => {};
  const point = (node, offset) => {
    const scope = !wholeRoot && itemAt(node) || root, prefix = document.createRange();
    prefix.selectNodeContents(scope); prefix.setEnd(node, offset);
    const fragment = prefix.cloneContents(), walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    let length = 0;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) if (!formattingSpace(text, fragment)) length += text.length;
    return { scope, offset: Math.max(0, length - (scope === removedPrefix?.scope ? removedPrefix.length : 0)), forward: offset === 0 };
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
  const box = richCheckboxIn(item);
  const container = item.firstElementChild?.tagName === 'P' ? item.firstElementChild : item;
  const range = document.createRange();
  if (box) range.selectNode(box);
  else {
    range.selectNodeContents(container); range.collapse(true);
    // Explicit Checklist/Ctrl+L also repairs a literal task marker from older
    // saves, instead of adding a second checkbox in front of "[ ]".
    const marker = /^\[([ xX\u00a0])\][ \t\u00a0]*/.exec(container.textContent);
    if (marker) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let left = marker[0].length;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (left <= text.length) { range.setEnd(text, left); break; }
        left -= text.length;
      }
      if (range.cloneContents().querySelector('code,pre,br,img,input,ul,ol,[contenteditable="false"]')) range.collapse(true);
      else checked = /[xX]/.test(marker[1]);
    }
  }
  const restore = rememberRange(root, false, !box && !range.collapsed ? { scope: item, length: range.toString().length } : null);
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

// Convert only a completed task marker followed by a typed space. The bullet
// may already be a native list ("- " converts first), or still be Markdown in
// a component field. Replacing the marker natively keeps it available to Undo.
export function typeRichCheckbox(root, event) {
  if (typing.has(root) || event.inputType !== 'insertText' || event.data !== ' ' || event.isComposing || !event.cancelable) return false;
  let range = currentRange(root);
  if (!range?.collapsed) return false;
  const at = element(range.startContainer), protectedNode = at?.closest('pre,code,[contenteditable="false"]');
  if (protectedNode && root.contains(protectedNode)) return false;
  let item = itemAt(range.startContainer), block = item || at;
  if (item && (!root.contains(item) || richCheckboxIn(item))) return false;
  while (block !== root && !block.matches('li,p,div,h1,h2,h3,h4,h5,h6,blockquote')) block = block.parentElement;
  let prefix = range.cloneRange(); prefix.setStart(block, 0);
  if (prefix.cloneContents().querySelector('br,img,input,[data-md-source],[data-document-source]')) return false;
  const text = prefix.toString().replaceAll('\u00a0', ' ');
  const match = (item ? /^\[([ xX])\]$/ : /^(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\]$/).exec(text);
  if (!match) return false;
  event.preventDefault();
  typing.add(root);
  try {
    if (!item) {
      const restore = rememberRange(root, true);
      document.execCommand(/^\d/.test(text) ? 'insertOrderedList' : 'insertUnorderedList');
      restore();
      range = currentRange(root); item = itemAt(range?.startContainer);
      if (!item || !root.contains(item)) return false;
      prefix = range.cloneRange(); prefix.setStart(item, 0);
    }
    select(prefix);
    document.execCommand('insertHTML', false, `<input type="checkbox" aria-label="Checklist item"${match[1] === ' ' ? '' : ' checked'}>`);
    prepareRichCheckboxes(root);
  } finally { typing.delete(root); }
  return true;
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
