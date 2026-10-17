import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { Problem } from "./problem.js";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
});
function xml(bytes) {
  const text = Buffer.from(bytes || []).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Problem(400, "Workbook XML entities are not supported.");
  return parser.parse(text);
}
const decode = (s) =>
  String(s ?? "")
    .replace(
      /&(?:amp|lt|gt|quot|apos);/g,
      (x) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        })[x],
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : +n;
      return code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    });
const rich = (s) =>
  typeof s === "object"
    ? list(s.r)
        .map((x) => decode(x.t?.["#text"] ?? x.t))
        .join("") || decode(s.t?.["#text"] ?? s.t)
    : decode(s);
function column(ref) {
  let n = 0;
  for (const c of ref.match(/^[A-Z]+/)[0]) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
export function readWorkbook(bytes, tableName, idColumn) {
  if (bytes.length > 20_000_000)
    throw new Problem(413, "Workbook limit is 20 MB.");
  let size = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      size += file.originalSize;
      count++;
      if (size > 100_000_000 || count > 5000)
        throw new Problem(413, "Workbook expands beyond its safe limit.");
      return true;
    },
  });
  const tableFile = Object.keys(files).find(
    (name) =>
      /^xl\/tables\/[^/]+\.xml$/.test(name) &&
      [
        xml(files[name]).table?.["@name"],
        xml(files[name]).table?.["@displayName"],
      ].includes(tableName),
  );
  if (!tableFile)
    throw new Problem(400, "Named table was not found in the workbook.");
  const table = xml(files[tableFile]).table,
    columns = list(table.tableColumns?.tableColumn).map((c) =>
      decode(c["@name"]),
    );
  if (new Set(columns).size !== columns.length || !columns.includes(idColumn))
    throw new Problem(
      400,
      "Choose a unique, stable ID column in the named table.",
    );
  let sheet;
  for (const relFile of Object.keys(files).filter((n) =>
    /^xl\/worksheets\/_rels\/[^/]+\.xml\.rels$/.test(n),
  )) {
    const target = list(xml(files[relFile]).Relationships?.Relationship).find(
      (r) =>
        r["@TargetMode"] !== "External" &&
        path.posix.normalize(
          path.posix.join("xl/worksheets", r["@Target"] || ""),
        ) === tableFile,
    );
    if (target) {
      sheet = `xl/worksheets/${path.posix.basename(relFile, ".rels")}`;
      break;
    }
  }
  if (!sheet || !files[sheet])
    throw new Problem(400, "The named table's worksheet could not be found.");
  const strings = list(xml(files["xl/sharedStrings.xml"]).sst?.si).map(rich);
  const [start, end] = String(table["@ref"]).split(":"),
    first = +start.match(/\d+$/)[0],
    last = +(end || start).match(/\d+$/)[0],
    offset = column(start);
  if (last - first > 10000)
    throw new Problem(413, "Choose a table of at most 10,000 rows.");
  const ids = new Set(),
    records = [];
  for (const row of list(xml(files[sheet]).worksheet?.sheetData?.row)) {
    const number = +row["@r"];
    if (number <= first || number > last - (+table["@totalsRowCount"] || 0))
      continue;
    const fields = {};
    for (const cell of list(row.c)) {
      const index = column(cell["@r"]) - offset;
      if (index < 0 || index >= columns.length) continue;
      if (columns[index] === idColumn && cell.f !== undefined)
        throw new Problem(400, "Stable row IDs must be values, not formulas.");
      fields[columns[index]] =
        cell["@t"] === "s"
          ? strings[+cell.v]
          : cell["@t"] === "inlineStr"
            ? rich(cell.is)
            : decode(cell.v);
    }
    if (Object.values(fields).every((v) => !v)) continue;
    const id = String(fields[idColumn] || "").trim();
    if (!id || ids.has(id))
      throw new Problem(
        400,
        `Row ${number}: stable IDs must be present and unique.`,
      );
    ids.add(id);
    records.push({
      id,
      key: id,
      fields,
      version: digest(JSON.stringify(fields)),
      raw: fields,
    });
  }
  return records;
}
export async function readObsidian(
  root,
  folder,
  { checklists = false, idField = "id", vault = path.basename(root) } = {},
) {
  const selected = path.resolve(root, folder || ".");
  if (
    !selected.startsWith(path.resolve(root) + path.sep) &&
    selected !== path.resolve(root)
  )
    throw new Problem(
      400,
      "Select a folder within the configured Obsidian root.",
    );
  let count = 0,
    total = 0;
  const records = [],
    ids = new Set();
  async function walk(dir) {
    const real = await fs.realpath(dir);
    if (
      real !== path.resolve(root) &&
      !real.startsWith(path.resolve(root) + path.sep)
    )
      throw new Problem(
        403,
        "Symlinks outside the Obsidian root are not allowed.",
      );
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const stat = await fs.stat(file);
      total += stat.size;
      if (++count > 10000 || total > 50_000_000 || stat.size > 2_000_000)
        throw new Problem(
          413,
          "Obsidian folder exceeds the 10,000-file / 50 MB import limit.",
        );
      const text = await fs.readFile(file, "utf8"),
        fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      const doc = fm ? YAML.parseDocument(fm[1]) : null;
      if (doc?.errors.length)
        throw new Problem(400, `Invalid YAML in ${entry.name}.`);
      const props = doc ? doc.toJS({ maxAliasCount: 20 }) : {},
        body = fm ? text.slice(fm[0].length) : text;
      const relative = path.relative(root, file).split(path.sep).join("/");
      const add = (id, fields, block) => {
        if (ids.has(id)) throw new Problem(400, `Duplicate Obsidian ID: ${id}`);
        ids.add(id);
        records.push({
          id,
          key: block || relative,
          url: `obsidian://open?${new URLSearchParams({ vault, file: relative + (block ? `#^${block}` : "") })}`,
          fields,
          version: digest(text),
          raw: { file: relative, block, frontmatter: props },
          description: block ? "" : body,
        });
      };
      if (props?.[idField])
        add(String(props[idField]), {
          ...props,
          title:
            props.title ||
            body.match(/^# (.+)$/m)?.[1] ||
            entry.name.slice(0, -3),
        });
      if (checklists && props?.[idField])
        for (const match of body.matchAll(
          /^\s*[-*] \[([ xX])\] (.*?)\s+\^([\w-]+)\s*$/gm,
        ))
          add(
            `${props?.[idField] || relative}#${match[3]}`,
            { title: match[2], status: match[1] === " " ? "todo" : "done" },
            match[3],
          );
    }
  }
  await walk(selected);
  return records;
}
export function jiraRecord(issue, site) {
  const f = issue.fields || {};
  const text = (node) =>
    typeof node?.text === "string"
      ? node.text
      : list(node?.content)
          .map(text)
          .join(node?.type === "doc" ? "\n" : "");
  return {
    id: String(issue.id),
    key: issue.key,
    url: `${site}/browse/${encodeURIComponent(issue.key)}`,
    version: f.updated,
    description: text(f.description),
    raw: issue,
    fields: {
      title: f.summary,
      status: f.status?.name,
      type: f.issuetype?.name,
      priority: f.priority?.name,
      assignee: f.assignee?.displayName || "",
      due: f.duedate,
    },
  };
}
export async function writeObsidian(root, record, mapping, input) {
  const file = path.resolve(root, record.raw.file),
    realRoot = await fs.realpath(root),
    real = await fs.realpath(file);
  if (!real.startsWith(realRoot + path.sep))
    throw new Problem(403, "The note is outside the configured root.");
  const original = await fs.readFile(real, "utf8");
  if (digest(original) !== record.version)
    throw new Problem(
      409,
      "The note changed. Sync and review before publishing.",
    );
  let text = original;
  if (record.raw.block) {
    const id = record.raw.block.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      pattern = new RegExp(
        `^(\\s*[-*] \\[)([ xX])(\\] )(.*?)(\\s+\\^${id}\\s*)$`,
        "m",
      );
    if (!pattern.test(text))
      throw new Problem(409, "The checklist block is no longer present.");
    if (input.action === "edit") {
      if (!input.title?.trim() || /[\r\n]/.test(input.title))
        throw new Problem(400, "Enter a single-line checklist title.");
      text = text.replace(
        pattern,
        (_, a, b, c, d, e) => a + b + c + input.title.trim() + e,
      );
    } else if (input.action === "transition") {
      if (!["todo", "done"].includes(input.transitionId))
        throw new Problem(400, "Checklist transitions are todo or done.");
      text = text.replace(
        pattern,
        (_, a, b, c, d, e) =>
          a + (input.transitionId === "done" ? "x" : " ") + c + d + e,
      );
    } else
      throw new Problem(
        400,
        "Checklist blocks support title and completion changes only.",
      );
  } else {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) throw new Problem(409, "The note frontmatter is missing.");
    const doc = YAML.parseDocument(match[1]);
    if (doc.errors.length)
      throw new Problem(400, "Repair the note's YAML before publishing.");
    const field =
        input.action === "edit"
          ? "title"
          : input.action === "assign"
            ? "assignee"
            : "status",
      value =
        input.action === "edit"
          ? input.title
          : input.action === "assign"
            ? input.accountId
            : input.transitionId;
    if (
      typeof value !== "string" ||
      value.length > 300 ||
      (field !== "assignee" && !value.trim())
    )
      throw new Problem(400, "Enter a valid field value.");
    doc.set(mapping?.[field] || field, value);
    text = `---\n${doc.toString({ lineWidth: 0 })}---\n${original.slice(match[0].length)}`;
  }
  return { file: real, original, text, version: record.version };
}
