// Portable inline HTML in the Markdown vault. Only a literal colour is accepted; other CSS stays forbidden.
export function textColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(color)) return color;
  if (/^#[\da-f]{3}$/.test(color)) return '#' + [...color.slice(1)].map(n => n + n).join('');
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color);
  return rgb && rgb.slice(1).every(n => +n <= 255) ? '#' + rgb.slice(1).map(n => (+n).toString(16).padStart(2, '0')).join('') : null;
}
const spanColor = tag => {
  const match = /^<span\s+style\s*=\s*(["'])\s*color\s*:\s*([^"';]+)\s*;?\s*\1\s*>$/i.exec(tag);
  return match ? textColor(match[2]) : null;
};
const opening = color => `<span style="color: ${color}">`;
export function textColorSpans(source) {
  const stack = [], spans = [];
  for (const match of source.matchAll(/<\/?span\b[^>]*>/gi)) {
    if (/^<\//.test(match[0])) {
      const start = stack.pop();
      if (start?.color) spans.push({ ...start, contentTo: match.index, to: match.index + match[0].length });
    } else stack.push({ from: match.index, contentFrom: match.index + match[0].length, color: spanColor(match[0]) });
  }
  return spans.sort((a, b) => a.from - b.from || b.to - a.to);
}
export const textColorExtension = {
  name: 'documentTextColor', level: 'inline', start: source => source.search(/<span\s+style\s*=/i),
  tokenizer(source) {
    const first = /^<span\b[^>]*>/i.exec(source), color = first && spanColor(first[0]);
    if (!color) return;
    let depth = 1;
    for (const match of source.slice(first[0].length).matchAll(/<\/?span\b[^>]*>/gi)) {
      depth += /^<\//.test(match[0]) ? -1 : 1;
      if (depth > 32) return;
      if (!depth) {
        const end = first[0].length + match.index;
        return { type: 'documentTextColor', raw: source.slice(0, end + match[0].length), color,
          tokens: this.lexer.inlineTokens(source.slice(first[0].length, end)) };
      }
    }
  },
  renderer(token) { return `<span data-document-color="${token.color}">${this.parser.parseInline(token.tokens)}</span>`; },
};
export function colorSelection(source, from, to, value, protectedRanges = []) {
  const color = textColor(value);
  if (!color) throw new Error('Choose a valid text colour.');
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > source.length || from > to) throw new Error('Select text to colour.');
  if (from === to) return null;
  const spans = textColorSpans(source), exact = spans.find(s => s.contentFrom === from && s.contentTo === to);
  if (exact && !protectedRanges.some(([a, b]) => a < to && b > from)) {
    const insert = opening(color), delta = insert.length - (exact.contentFrom - exact.from);
    return { from: exact.from, to: exact.contentFrom, insert, anchor: from + delta, head: to + delta };
  }
  // Split at existing colour tags so a new colour is always inside the old one, never outside it.
  // Blank lines and Markdown block prefixes remain structural Markdown.
  const separators = new Map();
  for (const span of spans) for (const [a, b] of [[span.from, span.contentFrom], [span.contentTo, span.to]])
    if (a >= from && b <= to) separators.set(a, b);
  for (const match of source.slice(from, to).matchAll(/\r?\n/g)) separators.set(from + match.index, from + match.index + match[0].length);
  for (const [a, b] of protectedRanges) if (a < to && b > from) separators.set(Math.max(from, a), Math.min(to, b));
  let cursor = from, insert = '', anchor = null, head = null;
  function append(end) {
    if (end <= cursor) return;
    const lineStart = source.lastIndexOf('\n', cursor - 1) + 1;
    const line = source.slice(lineStart, source.indexOf('\n', lineStart) < 0 ? source.length : source.indexOf('\n', lineStart));
    let prefix = /^[\t ]*(?:>[\t ]*)*(?:(?:#{1,6}|[-*+]|\d+[.)])[\t ]+(?:\[[ xX]\][\t ]+)?)?/.exec(line)[0].length;
    if (line.slice(0, prefix).includes('>')) prefix += /^\[![\w-]+\][+-]?[\t ]*/.exec(line.slice(prefix))?.[0].length || 0;
    const skip = Math.max(0, Math.min(end - cursor, lineStart + prefix - cursor));
    insert += source.slice(cursor, cursor + skip);
    const text = source.slice(cursor + skip, end);
    if (!text.trim()) { insert += text; return; }
    insert += opening(color); anchor ??= from + insert.length;
    insert += text; head = from + insert.length; insert += '</span>';
  }
  for (const [a, b] of [...separators].sort((a, b) => a[0] - b[0])) {
    if (a < cursor) continue;
    append(a); insert += source.slice(a, b); cursor = b;
  }
  append(to);
  return anchor === null ? null : { from, to, insert, anchor, head };
}
export function installTextColorRule(converter) {
  const color = node => textColor(node.style?.color || node.getAttribute?.('color') || node.dataset?.documentColor);
  converter.addRule('documentTextColor', {
    filter: node => /^(SPAN|FONT)$/.test(node.nodeName) && !!color(node),
    replacement: (content, node) => `${opening(color(node))}${content}</span>`,
  });
}
export function inlineWrapChange(source, from, to, before, after) {
  const selected = source.slice(from, to);
  const starts = value => before === '*' ? ((/^\*+/.exec(value)?.[0].length || 0) % 2 === 1) : value.startsWith(before);
  const ends = value => after === '*' ? ((/\*+$/.exec(value)?.[0].length || 0) % 2 === 1) : value.endsWith(after);
  if (starts(selected) && ends(selected) && selected.length >= before.length + after.length) {
    const insert = selected.slice(before.length, -after.length);
    return { from, to, insert, anchor: from, head: from + insert.length };
  }
  if (ends(source.slice(0, from)) && starts(source.slice(to)))
    return { from: from - before.length, to: to + after.length, insert: selected, anchor: from - before.length, head: from - before.length + selected.length };
  const inside = selected || 'text';
  return { from, to, insert: before + inside + after, anchor: from + before.length, head: from + before.length + inside.length };
}
