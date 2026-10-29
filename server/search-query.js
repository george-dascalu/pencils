// Search queries in the style of Obsidian's Omnisearch: words match as prefixes, "a phrase"
// matches exactly, -word excludes, #tag matches tags and in:cards|docs|boards limits the kinds.
// Terms are rebuilt from letters and digits only, so nothing typed can reach FTS5 syntax.
import { documentTags } from "../public/document-properties.js";
const words = (text) => String(text).match(/[\p{L}\p{N}]+/gu) || [];
const KINDS = { c: "card", d: "doc", b: "board" };

export function parseSearch(text) {
  const parsed = { words: [], phrases: [], exclude: [], tags: [], kinds: null };
  for (const [, minus, phrase, token] of String(text || "").slice(0, 500).matchAll(/(-)?"([^"]*)"?|(\S+)/g)) {
    if (phrase !== undefined) {
      const found = words(phrase).join(" ");
      if (found) (minus ? parsed.exclude : parsed.phrases).push(found);
      continue;
    }
    const kind = /^in:(cards?|docs?|documents?|boards?)$/i.exec(token);
    if (kind) (parsed.kinds ||= new Set()).add(KINDS[kind[1][0].toLowerCase()]);
    else if (token.startsWith("#")) { const tag = words(token).join(" "); if (tag) parsed.tags.push(tag); }
    else if (token.startsWith("-")) { const found = words(token).join(" "); if (found) parsed.exclude.push(found); }
    else parsed.words.push(...words(token));
  }
  parsed.words = parsed.words.slice(0, 20);
  return parsed;
}

// The FTS5 MATCH expression, or null when nothing positive is asked for.
export function searchMatch({ words, phrases, exclude, tags }) {
  const positive = [...words.map((w) => `"${w}"*`), ...phrases.map((p) => `"${p}"`), ...tags.map((t) => `tags : "${t}"`)];
  return positive.length ? [positive.join(" AND "), ...exclude.map((e) => `NOT "${e}"`)].join(" ") : null;
}

// Levenshtein distance, giving up (returning max + 1) once it can't stay within `max`.
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > max) return max + 1;
    previous = row;
  }
  return previous[b.length];
}

// bm25 scores are negative (lower is better). Titles starting with the query count half again;
// records changed this week a fifth more, this month a tenth.
export function rankResults(rows, parsed, now = Date.now()) {
  const first = (parsed.words[0] || parsed.phrases[0] || "").toLowerCase();
  const fold = (text) => String(text || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const day = 86_400_000;
  return rows.map((row) => {
    const age = now - Date.parse(row.updated || 0);
    const boost = (first && fold(row.title).startsWith(fold(first)) ? 1.5 : 1) * (age < 7 * day ? 1.2 : age < 30 * day ? 1.1 : 1);
    return { ...row, score: row.score * boost };
  }).sort((a, b) => a.score - b.score);
}

// What the search index holds for each kind of record: weighted columns (title, headings, tags,
// body) and the details a result shows.
export const cardEntry = (t) => ({
  id: t.id, info: { title: t.title, key: t.key, status: t.status, type: t.type, archived: !!t.archived, updated: t.updated },
  title: [...new Set([t.key, t.title, ...(t.aliases || [])].filter(Boolean))].join(" "), headings: "", tags: (t.tags || []).join(" "),
  body: [t.body, t.assignee, t.source?.key].filter(Boolean).join("\n"),
});
export const documentEntry = (d) => ({
  id: d.id, info: { title: d.title, updated: d.updated },
  title: d.title, headings: [...String(d.body || "").matchAll(/^#{1,6}[ \t]+(.+)$/gm)].map((m) => m[1]).join("\n"),
  tags: documentTags(d).join(" "), body: d.body || "",
});
export const boardEntry = (b) => ({
  id: b.id, info: { title: b.title, archived: !!b.archived, updated: b.updated },
  title: b.title, headings: "", tags: "",
  body: (b.nodes || []).map((n) => (typeof n.text === "string" ? n.text : "")).filter(Boolean).join("\n").slice(0, 200_000),
});
