import { documentCounts } from './document-performance.js';
export function documentReference(record) {
  return (record.file || record.id).replace(/\.md$/i, "");
}

export function resolveDocument(reference, documents) {
  const ref = reference.split("|")[0].split("#")[0].replace(/\.md$/i, "").replace(/^\.\//, "");
  if (!ref) return null;
  const exact = documents.find(d => documentReference(d) === ref || d.id === ref);
  if (exact) return exact;
  const name = ref.split("/").pop().toLocaleLowerCase();
  const matches = documents.filter(d => d.id.toLocaleLowerCase() === name ||
    d.title.toLocaleLowerCase() === name || (d.aliases || []).some(a => a.toLocaleLowerCase() === name));
  return matches.length === 1 ? matches[0] : null;
}

// A card named by its key, id or an alias: "[[WEB-12]]" in a document. Aliases hold older keys and
// titles, so "[[Card title]]" also names the card, as in Obsidian; callers check documents first.
export function resolveCard(reference, tasks) {
  const name = reference.split("|")[0].split("#")[0].split("/").pop().replace(/\.md$/i, "").trim().toLocaleLowerCase();
  if (!name) return null;
  return tasks.find(t => t.id.toLocaleLowerCase() === name || (t.key || "").toLocaleLowerCase() === name ||
    (t.aliases || []).some(a => a.toLocaleLowerCase() === name)) || null;
}

export function documentHeadings(text) {
  const headings = [];
  let position = 0, fence = null;
  for (const line of text.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    } else if (!fence) {
      const heading = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
      if (heading) headings.push({ level: heading[1].length, title: heading[2], from: position, to: position + line.length });
    }
    position += line.length + 1;
  }
  return headings;
}

export function documentOutline(text) {
  const roots = [], stack = [];
  for (const heading of documentHeadings(text)) {
    const entry = { ...heading, children: [] };
    while (stack.length && stack.at(-1).level >= entry.level) stack.pop();
    (stack.at(-1)?.children || roots).push(entry);
    stack.push(entry);
  }
  return roots;
}

export function documentSection(text, fragment) {
  if (!fragment) return text;
  const value = fragment.replace(/^#/, "");
  if (value.startsWith("^") || /^%5e/i.test(value)) {
    let id; try { id = decodeURIComponent(value).slice(1); } catch { return ''; }
    const lines = text.split('\n'); let fence = null;
    for (let n = 0; n < lines.length; n++) {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[n]);
      if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null; continue; }
      if (fence || !lines[n].trimEnd().endsWith('^' + id)) continue;
      const markerAt = lines[n].lastIndexOf('^' + id);
      if (markerAt && !/\s/.test(lines[n][markerAt - 1])) continue;
      if (!lines[n].slice(0, markerAt).trim()) {
        let end = n; while (end > 0 && !lines[end - 1].trim()) end--;
        if (!end) return '';
        let start = end - 1;
        while (start > 0 && lines[start - 1].trim() && !/^#{1,6}\s/.test(lines[start - 1])) start--;
        return lines.slice(start, end).join('\n').trim();
      }
      let start = n;
      while (start > 0 && lines[start - 1].trim() && !/^#{1,6}\s/.test(lines[start - 1])) start--;
      return [...lines.slice(start, n), lines[n].slice(0, markerAt)].join('\n').trim();
    }
    return '';
  }
  const headings = documentHeadings(text);
  const decode = part => { try { return decodeURIComponent(part).toLocaleLowerCase(); } catch { return part.toLocaleLowerCase(); } };
  const path = value.split('#').map(decode), stack = [];
  const at = headings.findIndex(h => {
    while (stack.length && stack.at(-1).level >= h.level) stack.pop();
    stack.push(h);
    return path.length <= stack.length && path.every((name, i) => stack[stack.length - path.length + i].title.toLocaleLowerCase() === name);
  });
  if (at < 0) return "";
  const end = headings.slice(at + 1).find(h => h.level <= headings[at].level)?.from ?? text.length;
  return text.slice(headings[at].from, end);
}

export function obsidianDocumentURI(record, { vault, folder = "" }) {
  if (!vault?.trim()) return "";
  const prefix = folder.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (prefix.split("/").includes("..")) throw Error("Use a folder inside your Obsidian vault.");
  const file = [prefix, record.file].filter(Boolean).join("/");
  if (!file || file.split("/").includes("..")) throw Error("This document has no valid vault path.");
  return `obsidian://open?${new URLSearchParams({ vault: vault.trim(), file })}`;
}

export function documentStats(text) {
  return documentCounts(text);
}
