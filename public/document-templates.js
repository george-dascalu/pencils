// Document templates, as in Obsidian's core Templates plugin: {{title}}, {{date}}, {{time}},
// {{date:FORMAT}} and {{time:FORMAT}}, plus {{project}}, {{cursor}} (where the caret starts)
// and {{prompt:Label}} (asked for before the document is created). Nothing runs as code.
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n) => String(n).padStart(2, "0");

// Moment-style tokens (YYYY MM DD HH mm…); text in [brackets] stays as written.
export function formatDate(date, format) {
  const parts = {
    YYYY: date.getFullYear(), YY: pad(date.getFullYear() % 100), MMMM: months[date.getMonth()], MMM: months[date.getMonth()].slice(0, 3),
    MM: pad(date.getMonth() + 1), M: date.getMonth() + 1, DD: pad(date.getDate()), D: date.getDate(),
    dddd: days[date.getDay()], ddd: days[date.getDay()].slice(0, 3), HH: pad(date.getHours()), H: date.getHours(), mm: pad(date.getMinutes()), ss: pad(date.getSeconds()),
  };
  return format.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|mm|ss/g, (token, literal) => literal ?? String(parts[token]));
}

// The labels a template asks for, in order, without repeats.
export function templatePrompts(body) {
  return [...new Set([...body.matchAll(/\{\{prompt:([^}\n]+)\}\}/g)].map((m) => m[1].trim()))];
}

// The template's text with its variables filled in, and where the caret starts: the first
// {{cursor}} in the template itself (later ones are dropped; titles and answers stay as typed).
export function expandTemplate(body, { title = "", project = "", now = new Date(), answers = {} } = {}) {
  const fill = (text) => text.replace(/\{\{(\w+)(?::([^}\n]*))?\}\}/g, (match, name, value = "") => {
    if (name === "title") return title;
    if (name === "project") return project;
    if (name === "date") return formatDate(now, value.trim() || "YYYY-MM-DD");
    if (name === "time") return formatDate(now, value.trim() || "HH:mm");
    if (name === "prompt") return answers[value.trim()] ?? "";
    if (name === "cursor") return "";
    return match;
  });
  const at = body.indexOf("{{cursor}}");
  if (at < 0) return { body: fill(body), cursor: null };
  const before = fill(body.slice(0, at));
  return { body: before + fill(body.slice(at + "{{cursor}}".length)), cursor: before.length };
}

// Whether a folder is named "Templates" or sits inside one.
export function inTemplatesFolder(id, folders) {
  const parent = new Map(folders.map((f) => [f.id, f]));
  for (let folder = parent.get(id), seen = new Set(); folder && !seen.has(folder.id); folder = parent.get(folder.parent)) {
    if (folder.title.trim().toLowerCase() === "templates") return true;
    seen.add(folder.id);
  }
  return false;
}

// Documents kept in a folder named "Templates" (or a folder inside one).
export function templateDocuments(documents, folders) {
  return documents.filter((d) => d.folder && inTemplatesFolder(d.folder, folders));
}
