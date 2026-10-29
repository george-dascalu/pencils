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
  if (value.startsWith("^")) {
    const id = value.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(^|\\n)([^\\n]*(?:\\n[^\\n]+)*?)\\s+\\^${id}(?=\\s*(?:\\n|$))`).exec(text);
    return match ? match[2].trim() : "";
  }
  const headings = documentHeadings(text);
  const at = headings.findIndex(h => h.title.toLocaleLowerCase() === value.toLocaleLowerCase());
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
  return { words: text.trim() ? text.trim().split(/\s+/u).length : 0, characters: [...text].length };
}
