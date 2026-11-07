// The card number register (identity.md) holds a line per card a project ever had, so reading it with
// the YAML parser on every new card made creating cards slower as projects grew (F0.22-51). These read
// and write its usual form directly, producing exactly the text the YAML library writes; anything else
// (hand edits, comments, unusual ids) returns null and goes through YAML as before.

// Keys and values YAML writes plain and reads back as the same string.
const plain = /^[A-Za-z][A-Za-z0-9_-]*$/;
const special = /^(?:true|false|null|y|yes|n|no|on|off)$/i;
const safe = (text) => typeof text === "string" && plain.test(text) && !special.test(text);
const count = (value) => Number.isSafeInteger(value) && value > 0;
const number = /^[1-9][0-9]{0,14}$/;

/** @param {any} data @returns {string | null} the frontmatter, ending in a newline */
export function ledgerFrontmatter(data) {
  if (!data || typeof data !== "object") return null;
  const keys = Object.keys(data);
  if (keys.join() !== "kind,project,next,tasks" || data.kind !== "task-identities" || !safe(data.project) || !count(data.next)) return null;
  const tasks = data.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) return null;
  const lines = [`kind: task-identities`, `project: ${data.project}`, `next: ${data.next}`];
  const entries = Object.entries(tasks);
  if (!entries.length) lines.push("tasks: {}");
  else {
    lines.push("tasks:");
    for (const [id, n] of entries) {
      if (!safe(id) || !count(n)) return null;
      lines.push(`  ${id}: ${n}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** @param {string} text the frontmatter without its fences @returns {Record<string, any> | null} */
export function parseLedger(text) {
  const lines = text.split("\n");
  const value = (line, key) => (line?.startsWith(`${key}: `) ? line.slice(key.length + 2) : null);
  const project = value(lines[1], "project"), next = value(lines[2], "next");
  if (lines[0] !== "kind: task-identities" || !safe(project) || !number.test(next ?? "")) return null;
  const tasks = {};
  if (lines[3] === "tasks: {}" && lines.length === 4) return { kind: "task-identities", project, next: Number(next), tasks };
  if (lines[3] !== "tasks:" || lines.length < 5) return null;
  for (let i = 4; i < lines.length; i++) {
    const line = lines[i], colon = line.indexOf(": ");
    if (!line.startsWith("  ") || colon < 0) return null;
    const id = line.slice(2, colon), n = line.slice(colon + 2);
    // A repeated key is a YAML error; leave it to the parser to report.
    if (!safe(id) || !number.test(n) || Object.hasOwn(tasks, id)) return null;
    tasks[id] = Number(n);
  }
  return { kind: "task-identities", project, next: Number(next), tasks };
}
