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
const supported = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
const painted = new Map(); // code element -> [{ group, range }]
let frame = 0;
function publish() {
  frame = 0;
  const byGroup = new Map(groups.map(([group]) => [group, []]));
  for (const [code, ranges] of painted) {
    if (!code.isConnected) { painted.delete(code); continue; }
    for (const { group, range } of ranges) byGroup.get(group).push(range);
  }
  for (const [group, ranges] of byGroup) CSS.highlights.set(`document-code-${group}`, new Highlight(...ranges));
}
const schedule = () => { frame ||= requestAnimationFrame(publish); };

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
    for (let i = nodes.length - 1; i >= 0; i--)
      if (position >= nodes[i].start) return { node: nodes[i].node, offset: Math.min(position - nodes[i].start, nodes[i].node.data.length) };
    return null;
  };
  return (from, to) => {
    const start = at(from), end = at(to);
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  };
}

export async function highlightCode(code, lang = codeLanguageOf(code)) {
  if (!supported) return;
  const run = (code.documentHighlightRun || 0) + 1;
  code.documentHighlightRun = run;
  const description = codeLanguageName(lang) && LanguageDescription.matchLanguageName(languages, codeLanguageName(lang), true);
  let support = description?.support;
  if (description && !support) support = await description.load().catch(() => null);
  if (code.documentHighlightRun !== run) return;
  if (!support) { painted.delete(code); schedule(); return; }
  const text = code.textContent;
  const tree = support.language.parser.parse(text);
  const range = rangeFinder(code), ranges = [];
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    const group = groups.find(([, pattern]) => pattern.test(classes))?.[0];
    const r = group && range(from, to);
    if (r) ranges.push({ group, range: r });
  });
  painted.set(code, ranges);
  schedule();
}

export function highlightCodeBlocks(root) {
  for (const code of root.querySelectorAll("pre > code")) void highlightCode(code);
}
