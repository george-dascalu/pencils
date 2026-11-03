// Syntax colours for code blocks in documents (live preview and reading).
// CodeMirror's language parsers find the tokens; the CSS Custom Highlight API
// paints them, so code stays plain text and remains editable in place.
// Browsers without the API show uncoloured code.
import { LanguageDescription, languages, highlightTree, classHighlighter } from "/vendor/editor/deps.js";

// The language menu: [fence name, label]. Any other name typed in Markdown
// still colours when CodeMirror knows it.
export const codeLanguages = [
  ["", "Plain text"], ["js", "JavaScript"], ["ts", "TypeScript"], ["jsx", "JSX"], ["tsx", "TSX"],
  ["python", "Python"], ["json", "JSON"], ["html", "HTML"], ["css", "CSS"], ["markdown", "Markdown"],
  ["bash", "Shell"], ["sql", "SQL"], ["yaml", "YAML"], ["xml", "XML"], ["java", "Java"], ["c", "C"],
  ["cpp", "C++"], ["csharp", "C#"], ["go", "Go"], ["rust", "Rust"], ["php", "PHP"], ["ruby", "Ruby"],
  ["swift", "Swift"], ["kotlin", "Kotlin"],
];
export const codeLanguageName = (lang) => String(lang || "").trim().split(/\s/)[0];
// The menu entry for a fence name, matching aliases ("javascript" is JavaScript).
export function codeLanguageEntry(lang) {
  const name = codeLanguageName(lang);
  const exact = codeLanguages.find(([value]) => value === name);
  if (exact || !name) return exact || codeLanguages[0];
  const description = LanguageDescription.matchLanguageName(languages, name, true);
  return description && codeLanguages.find(([value]) => value && LanguageDescription.matchLanguageName(languages, value, true) === description) || null;
}
export const codeLanguageOf = (code) => /(?:^|\s)language-(\S+)/.exec(code.className)?.[1] || "";

// Token classes from classHighlighter, grouped into a small palette. The
// first matching group wins, so definitions beat plain variable names.
const groups = [
  ["comment", /\btok-(comment|meta)\b/],
  ["string", /\btok-(string2?|literal|url)\b/],
  ["number", /\btok-(number|bool|atom)\b/],
  ["keyword", /\btok-keyword\b/],
  ["definition", /\btok-definition\b/],
  ["type", /\btok-(typeName|className|namespace|macroName|labelName)\b/],
  ["property", /\btok-propertyName\b/],
];
const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function" && typeof StaticRange === "function";
const painted = new Map(); // connected code element -> cached syntax and immutable visible ranges
const BLOCK_BUDGET = 512, TOTAL_BUDGET = 2048;
let frame = 0, refreshFrame = 0, watching = false, removed;
function publish() {
  frame = 0;
  const byGroup = new Map(groups.map(([group]) => [group, []]));
  let left = TOTAL_BUDGET;
  for (const [code, record] of painted) {
    if (!code.isConnected) { painted.delete(code); continue; }
    for (const { group, range } of record.ranges) { if (!left--) break; byGroup.get(group).push(range); }
    if (left <= 0) break;
  }
  for (const [group, ranges] of byGroup) {
    if (ranges.length) CSS.highlights.set(`document-code-${group}`, new Highlight(...ranges));
    else CSS.highlights.delete(`document-code-${group}`);
  }
}
const schedule = () => { frame ||= requestAnimationFrame(publish); };

function refresh() {
  refreshFrame = 0;
  for (const [code, record] of painted) {
    if (!code.isConnected) { painted.delete(code); continue; }
    void paint(code, record);
  }
  schedule();
}
const scheduleRefresh = () => { refreshFrame ||= requestAnimationFrame(refresh); };
function watch() {
  if (watching) return;
  watching = true;
  document.addEventListener('scroll', scheduleRefresh, { capture: true, passive: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });
  removed = new MutationObserver(entries => {
    if (entries.some(entry => entry.removedNodes.length) && [...painted.keys()].some(code => !code.isConnected)) scheduleRefresh();
  });
  removed.observe(document.body, { childList: true, subtree: true });
}

// Text offsets to DOM ranges across the code element's text nodes.
function rangeFinder(code) {
  const nodes = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: offset });
    offset += node.data.length;
  }
  const at = (position) => {
    let low = 0, high = nodes.length;
    while (low < high) { const mid = (low + high) >>> 1; if (nodes[mid].start <= position) low = mid + 1; else high = mid; }
    const entry = nodes[low - 1];
    return entry ? { node: entry.node, offset: Math.min(position - entry.start, entry.node.data.length) } : null;
  };
  return (from, to) => {
    const start = at(from), end = at(to);
    if (!start || !end) return null;
    return new StaticRange({ startContainer: start.node, startOffset: start.offset, endContainer: end.node, endOffset: end.offset });
  };
}

function visibleOffsets(code, text) {
  const box = code.getBoundingClientRect(), scroller = code.closest('.document-reading,.cm-scroller');
  const clip = scroller?.getBoundingClientRect();
  const top = Math.max(0, box.top, clip?.top || 0), bottom = Math.min(innerHeight, box.bottom, clip?.bottom ?? innerHeight);
  if (!box.width || bottom <= top) return null;
  if (text.length < 12000) return [0, text.length];
  // Large blocks remain fully editable. Colour only a small window around the
  // visible lines; scrolling refreshes the window without parsing the block again.
  const offset = y => {
    const x = Math.max(1, Math.min(innerWidth - 1, box.left + 8));
    const point = document.caretPositionFromPoint?.(x, y), range = !point && document.caretRangeFromPoint?.(x, y);
    const node = point?.offsetNode || range?.startContainer, at = point?.offset ?? range?.startOffset;
    if (node && code.contains(node)) {
      let before = 0;
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) { if (textNode === node) return before + at; before += textNode.length; }
    }
    return Math.round(text.length * Math.max(0, Math.min(1, (y - box.top) / Math.max(1, box.height))));
  };
  const from = Math.max(0, offset(top + 2) - 1000), to = Math.min(text.length, offset(bottom - 2) + 2000);
  return [Math.max(0, text.lastIndexOf('\n', from) + 1), Math.min(text.length, Math.max(from + 1, to), from + 24000)];
}

async function paint(code, record) {
  const run = ++record.run, text = code.textContent, offsets = visibleOffsets(code, text);
  if (!offsets) { if (record.ranges.length) { record.ranges = []; schedule(); } return; }
  const description = codeLanguageName(record.lang) && LanguageDescription.matchLanguageName(languages, codeLanguageName(record.lang), true);
  let support = description?.support;
  if (description && !support) support = await description.load().catch(() => null);
  if (record.run !== run || painted.get(code) !== record || !code.isConnected) return;
  if (!support) { record.ranges = []; schedule(); return; }
  if (record.text !== text || record.language !== support.language) {
    record.text = text; record.language = support.language; record.tree = support.language.parser.parse(text);
  }
  const range = rangeFinder(code), ranges = [];
  highlightTree(record.tree, classHighlighter, (from, to, classes) => {
    if (ranges.length >= BLOCK_BUDGET) return;
    const group = groups.find(([, pattern]) => pattern.test(classes))?.[0];
    const r = group && range(from, to);
    if (r) ranges.push({ group, range: r });
  }, offsets[0], offsets[1]);
  record.ranges = ranges;
  schedule();
}

export async function highlightCode(code, lang = codeLanguageOf(code)) {
  if (!supported()) return;
  let record = painted.get(code);
  if (!record) { record = { lang, ranges: [], run: 0 }; painted.set(code, record); watch(); }
  record.lang = lang;
  if (code.isConnected) await paint(code, record);
  else scheduleRefresh();
}

export function releaseCodeHighlights(root) {
  if (!supported()) return;
  let changed = false;
  for (const code of painted.keys()) if (root === code || root.contains(code) || !code.isConnected) { painted.delete(code); changed = true; }
  if (changed) schedule();
}

export function highlightCodeBlocks(root) {
  for (const code of root.querySelectorAll("pre > code")) void highlightCode(code);
}
