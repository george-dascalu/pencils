// Document properties as Obsidian keeps them: top-level frontmatter keys beside Pencils' own.
// Text, number, date, checkbox and list values can be edited here; anything else stays as written.
const RESERVED = new Set(["id", "kind", "project", "title", "created", "updated", "folder", "version", "comments", "tags", "body", "revision", "file"]);
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u;
const TAG = /^[\p{L}\p{N}_/-]{1,60}$/u;

export function propertyType(value) {
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) ? "date" : "text";
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return "list";
  return null;
}

// Values this editor can change and save back unchanged (bigger ones stay as written).
const editable = (value) => {
  const type = propertyType(value);
  return type && !(type === "text" && value.length > 1000) && !(type === "list" && (value.length > 50 || value.some((item) => item.length > 200)));
};
// [name, value, type] for each property this editor can change, in the file's order.
export const documentProperties = (doc) =>
  Object.entries(doc).filter(([name, value]) => !RESERVED.has(name.toLowerCase()) && editable(value)).map(([name, value]) => [name, value, propertyType(value)]);

// The editable properties a save may write; throws with a message for the first problem.
export function checkProperties(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Properties must be a list of names and values.");
  const entries = Object.entries(input);
  if (entries.length > 30) throw new Error("A document can have up to 30 properties.");
  return Object.fromEntries(entries.map(([name, value]) => {
    if (!NAME.test(name)) throw new Error("Property names use letters, numbers, spaces, - and _, up to 60 characters.");
    if (RESERVED.has(name.toLowerCase())) throw new Error(`“${name}” is reserved for Pencils.`);
    const type = propertyType(value);
    if (!editable(value)) throw new Error(`“${name}” needs a text, number, date, checkbox or list value.`);
    return [name, type === "text" ? value.trim() : type === "list" ? value.map((item) => item.trim()).filter(Boolean) : value];
  }));
}

export function checkTags(input) {
  if (!Array.isArray(input) || input.length > 50) throw new Error("Tags must be a list of up to 50.");
  const seen = new Set();
  return input.map((tag) => String(tag).trim().replace(/^#/, "")).filter((tag) => {
    if (!TAG.test(tag)) throw new Error(`“${tag}” isn't a tag: use letters, numbers, -, _ and /.`);
    const key = tag.toLocaleLowerCase();
    return !seen.has(key) && seen.add(key);
  });
}

// The tags property, which Obsidian also writes as text ("plans, q4").
export const frontmatterTags = (doc) =>
  Array.isArray(doc.tags) ? doc.tags.filter((tag) => ["string", "number"].includes(typeof tag)).map(String)
    : typeof doc.tags === "string" ? doc.tags.split(/[,\s]+/).filter(Boolean) : [];

// Tags from the properties, then #tags written in the text, without repeats.
export function documentTags(doc) {
  const own = frontmatterTags(doc);
  const written = [...String(doc.body || "").matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1]);
  const seen = new Set();
  return [...own, ...written].filter((tag) => typeof tag === "string" && !seen.has(tag.toLocaleLowerCase()) && seen.add(tag.toLocaleLowerCase()));
}

// The document finder: #words match whole tags, other words the title or text.
export function matchesDocument(doc, query) {
  const tags = documentTags(doc).map((tag) => tag.toLocaleLowerCase());
  const text = `${doc.title}\n${doc.body || ""}`.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => word.length > 1 && word.startsWith("#") ? tags.includes(word.slice(1)) : text.includes(word));
}
