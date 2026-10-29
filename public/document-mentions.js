import { resolveCard, resolveDocument } from "./document-model.js";

// Plain-text mentions (Obsidian's "Unlinked mentions"): where a document title or card key
// appears as whole words in a body, outside code, math, comments, HTML, links and URLs.
const code = [
  /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[`~]*[ \t]*$|(?![\s\S]))/gm, // fences close with as many marks
  /(`+)(?!`)[^\n]*?[^`\n]\1(?!`)|`[^`\n]`/g,
  /\$\$[\s\S]*?\$\$|\$(?!\s|\$)(?:\\.|[^$\n])+?\$/g,
  /<!--[\s\S]*?-->|%%[\s\S]*?%%|<\/?[A-Za-z][^>\n]*>/g,
];
const links = [/!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)/g, /[A-Za-z][\w+.-]*:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+/g];
const blank = (text, patterns) => patterns.reduce((value, pattern) => value.replace(pattern, (match) => match.replace(/[^\n]/g, " ")), text);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function plainMentions(body, name) {
  const value = name.trim();
  if (value.length < 3) return [];
  // Not part of a word, a path, an address or a #tag.
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}/@#.:-])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "giu");
  return [...blank(blank(body, code), links).matchAll(pattern)].map((match) => ({ index: match.index, length: match[0].length }));
}

// The body with each mention turned into a link that keeps its wording as the label. A label
// that would break the link's syntax is left out; the link then shows the target's name.
export function linkMentions(body, mentions, reference) {
  return [...mentions].sort((a, b) => b.index - a.index).reduce((text, { index, length }) => {
    const label = text.slice(index, index + length);
    const alias = label === reference || /[[\]|#^]/.test(label) ? "" : `|${label}`;
    return `${text.slice(0, index)}[[${reference}${alias}]]${text.slice(index + length)}`;
  }, body);
}

// Other documents that name `name` without linking it.
export function unlinkedMentions(documents, name, selfId) {
  return documents
    .filter((d) => d.id !== selfId)
    .map((d) => ({ document: d, mentions: plainMentions(d.body || "", name) }))
    .filter((entry) => entry.mentions.length);
}

// Documents that link a card or name its key in plain text. A link that names a document
// (by title, say) belongs to that document, as in the editor; links in code do not count.
export function cardMentions(task, documents) {
  return documents.flatMap((d) => {
    const body = d.body || "";
    const linked = [...blank(body, code).matchAll(/!?\[\[([^\]\n]+)\]\]/g)].some((m) => !resolveDocument(m[1], documents) && resolveCard(m[1], [task]));
    return linked || plainMentions(body, task.key || task.id).length ? [{ document: d, linked }] : [];
  });
}
