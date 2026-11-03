import { documentFolder } from "../document-folders.js";
import { randomUUID } from "node:crypto";
import { Problem } from "../problem.js";
import { now, validId, title, documentBody as body } from "../values.js";
import { checkProperties, checkTags, documentProperties } from "../../public/document-properties.js";
import { validComment } from "../../public/document-comments.js";
import { blankTable } from "../../public/document-sheet-model.js";
import { readDocumentTable, writeDocumentTable, tableDocumentBody } from "../document-sheets.js";

// Comments on the document's text (public/document-comments.js): the same limits as card comments,
// plus each thread's anchor.
function documentComments(comments) {
  if (!Array.isArray(comments) || comments.length > 500 || !comments.every(validComment))
    throw new Problem(400, "Invalid comments.");
  return comments.length ? comments : undefined;
}
// Property and tag problems are the caller's to fix.
const checked = (check, value) => {
  try {
    return check(value);
  } catch (error) {
    throw new Problem(400, error.message);
  }
};

export const documentsMethods = {
  validateDocument(data) {
    validId(data.id);
    validId(data.project);
    if (data.kind !== "document")
      throw new Problem(422, "Expected a document.");
    title(data.title);
    if (data.document_type !== undefined && !['markdown', 'table'].includes(data.document_type)) throw new Problem(422, 'Unknown document type.');
  },
  async getDocument(project, id, options = {}) {
    const file = this.file(project, "documents", id);
    const record = await this.read(file);
    this.validateDocument(record.data);
    if (record.data.id !== id || record.data.project !== project)
      throw new Problem(422, "Document identity does not match its file.");
    const value = this.public(record, file);
    return record.data.document_type === 'table' && options.table !== false ? { ...value, table: await readDocumentTable(this, record.data) } : value;
  },
  async createDocument(project, input) {
    const parent = await this.read(this.file(project, "project"));
    const id = `d-${randomUUID()}`;
    if (input.document_type !== undefined && !['markdown', 'table'].includes(input.document_type)) throw new Problem(400, 'Unknown document type.');
    const table = input.document_type === 'table' ? await writeDocumentTable(this, project, id, blankTable(id, title(input.title ?? 'Untitled table'))) : null;
    const saved = await this.write(
      this.file(project, "documents", id),
      {
        id,
        kind: "document",
        project,
        title: title(input.title ?? "Untitled document"),
        version: 1,
        ...(table ? { document_type: 'table', table_file: table.relative } : {}),
        folder: documentFolder(input.folder, parent.data.document_folders),
        created: now(),
        updated: now(),
      },
      body(table ? tableDocumentBody(table.table, table.relative, input.body ?? '') : input.body ?? ''),
    );
    return table ? { ...saved, table: table.table } : saved;
  },
  async updateDocument(project, id, input) {
    const before = await this.getDocument(project, id, { table: false });
    const file = this.file(project, "documents", id);
    const current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    if ('document_type' in input && input.document_type !== data.document_type) throw new Problem(400, 'Create a new document to change its type.');
    if ('table' in input && data.document_type !== 'table') throw new Problem(400, 'Spreadsheet data belongs to a Table document.');
    const table = 'table' in input ? await writeDocumentTable(this, project, id, input.table) : null;
    const tableChanged = table && table.relative !== data.table_file;
    if (table) data.table_file = table.relative;
    if ("title" in input) data.title = title(input.title);
    if ("folder" in input) {
      const parent = await this.read(this.file(project, "project"));
      data.folder = documentFolder(input.folder, parent.data.document_folders);
    }
    // `document_properties` ({ set, remove, tags }) changes only the properties it names, and the
    // tags when sent. It has a name of its own because saves of the text send the whole record
    // back, frontmatter included.
    if (input.document_properties) {
      const { set = {}, remove = [], tags } = input.document_properties;
      if (!set || typeof set !== "object" || Array.isArray(set) || !Array.isArray(remove) || remove.length > 30 || (tags !== undefined && !Array.isArray(tags)))
        throw new Problem(400, "Send properties to set, names to remove and a list of tags.");
      const next = checked(checkProperties, set);
      const editable = new Set(documentProperties(current.data).map(([name]) => name));
      for (const name of Object.keys(next)) {
        const other = Object.keys(current.data).find((key) => key !== name && key.toLowerCase() === name.toLowerCase());
        if (other) throw new Problem(409, `“${name}” already exists as “${other}”.`);
        if (Object.hasOwn(current.data, name) && !editable.has(name))
          throw new Problem(409, `“${name}” holds a value Pencils can't edit; change it in Obsidian.`);
      }
      for (const name of remove) if (editable.has(name)) data[name] = undefined;
      Object.assign(data, next);
      if (tags !== undefined) {
        const list = checked(checkTags, tags);
        data.tags = list.length ? list : undefined;
      }
    }
    // Every save of the record sends its comments back; only a changed list is checked and written.
    if ("comments" in input && JSON.stringify(input.comments) !== JSON.stringify(current.data.comments))
      data.comments = documentComments(input.comments);
    let markdown = "body" in input ? body(input.body) : current.body;
    if (table) markdown = body(tableDocumentBody(table.table, table.relative, markdown));
    const meta = (record) => JSON.stringify([documentProperties(record), record.tags ?? []]);
    const edited =
      data.title !== current.data.title ||
      markdown !== current.body ||
      (data.folder || null) !== (current.data.folder || null) ||
      meta(data) !== meta(current.data) || tableChanged;
    if (!edited && JSON.stringify(data.comments) === JSON.stringify(current.data.comments))
      return data.document_type === 'table' ? { ...before, table: table?.table || await readDocumentTable(this, data) } : before;
    // A comment isn't a new version of the page.
    if (edited)
      data.version =
        (Number.isSafeInteger(current.data.version) && current.data.version > 0
          ? current.data.version
          : 1) + 1;
    const saved = await this.write(file, data, markdown, current);
    return data.document_type === 'table' ? { ...saved, table: table?.table || await readDocumentTable(this, data) } : saved;
  },
};
