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
