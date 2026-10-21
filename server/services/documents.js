import { documentFolder } from "../document-folders.js";
import { randomUUID } from "node:crypto";
import { Problem } from "../problem.js";
import { now, validId, title, body } from "../values.js";

export const documentsMethods = {
  validateDocument(data) {
    validId(data.id);
    validId(data.project);
    if (data.kind !== "document")
      throw new Problem(422, "Expected a document.");
    title(data.title);
  },
  async getDocument(project, id) {
    const file = this.file(project, "documents", id);
    const record = await this.read(file);
    this.validateDocument(record.data);
    if (record.data.id !== id || record.data.project !== project)
      throw new Problem(422, "Document identity does not match its file.");
    return this.public(record, file);
  },
  async createDocument(project, input) {
    const parent = await this.read(this.file(project, "project"));
    const id = `d-${randomUUID()}`;
    return this.write(
      this.file(project, "documents", id),
      {
        id,
        kind: "document",
        project,
        title: title(input.title ?? "Untitled document"),
        version: 1,
        folder: documentFolder(input.folder, parent.data.document_folders),
        created: now(),
        updated: now(),
      },
      body(input.body ?? ""),
    );
  },
  async updateDocument(project, id, input) {
    await this.getDocument(project, id);
    const file = this.file(project, "documents", id);
    const current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    if ("title" in input) data.title = title(input.title);
    if ("folder" in input) {
      const parent = await this.read(this.file(project, "project"));
      data.folder = documentFolder(input.folder, parent.data.document_folders);
    }
    const markdown = "body" in input ? body(input.body) : current.body;
    if (
      data.title === current.data.title &&
      markdown === current.body &&
      (data.folder || null) === (current.data.folder || null)
    )
      return this.public(current, file);
    data.version =
      (Number.isSafeInteger(current.data.version) && current.data.version > 0
        ? current.data.version
        : 1) + 1;
    return this.write(file, data, markdown, current);
  },
};
