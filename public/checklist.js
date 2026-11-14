// Minimal Markdown edits preserve list markers, indentation and the surrounding text.
export function checkboxLineChange(line) {
  const prefix = /^([ \t]*(?:>[ \t]*)*)((?:[-*+]|\d+[.)])[ \t]+)?/.exec(line);
  const at = prefix[0].length, box = /^\[([ xX])\](?=[ \t]|$)/.exec(line.slice(at));
  if (prefix[2] && box) return { from: at + 1, to: at + 2, insert: box[1] === ' ' ? 'x' : ' ' };
  return { from: at, to: at, insert: prefix[2] ? '[ ] ' : '- [ ] ' };
}

export function checkboxChanges(text, from, to = from) {
  const changes = [];
  for (let start = 0; start <= text.length;) {
    const end = text.indexOf('\n', start), stop = end < 0 ? text.length : end;
    if (stop >= from && (start < to || from === to && start <= from)) {
      const change = checkboxLineChange(text.slice(start, stop));
      changes.push({ ...change, from: start + change.from, to: start + change.to });
    }
    if (end < 0 || stop >= to) break;
    start = end + 1;
  }
  return changes;
}

// Marked only recognises a nonempty task with ASCII spaces. Contenteditable
// uses NBSP at boundaries, and an empty task must survive saving too. Work on
// parsed list items, so escaped examples, links and code remain literal.
export const checklistMarkdown = {
  walkTokens(item) {
    if (item.type !== 'list_item' || item.task) return;
    const block = item.tokens[0], text = block?.tokens?.[0];
    if (!['text', 'paragraph'].includes(block?.type) || text?.type !== 'text') return;
    const marker = /^\[([ xX\u00a0])\](?:[ \t\u00a0]+|$)/.exec(text.raw);
    if (!marker) return;
    item.task = true; item.checked = /[xX]/.test(marker[1]);
    const length = marker[0].length;
    item.text = item.text.slice(length);
    block.raw = block.raw.slice(length); block.text = block.text.slice(length);
    text.raw = text.raw.slice(length); text.text = text.text.slice(length);
    if (!text.raw) block.tokens.shift();
    block.tokens.unshift({ type: 'checkbox', raw: item.checked ? '[x] ' : '[ ] ', checked: item.checked });
  },
};
