import { schema } from "./model.js";
import { canTransition, transitionError } from "../public/workflow-model.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { zip, unzip } from "fflate";
import { Problem } from "./problem.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const pack = (files) =>
  new Promise((resolve, reject) =>
    zip(files, { level: 6 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
const unpack = (data) =>
  new Promise((resolve, reject) => {
    let size = 0,
      count = 0;
    unzip(
      data,
      {
        filter: (file) => {
          size += file.originalSize;
          count++;
          if (size > 200_000_000 || count > 30000) return false;
          return true;
        },
      },
      (error, files) =>
        error
          ? reject(new Problem(400, "Invalid ZIP archive."))
          : size > 200_000_000 || count > 30000
            ? reject(
                new Problem(
                  413,
                  "Backup exceeds the 200 MB / 30,000 file restore limit.",
                ),
              )
            : resolve(files),
    );
  });
export async function collect(root, prefix = "", result = {}) {
  for (const entry of await fs.readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await collect(root, relative, result);
    else if (entry.isFile() && !entry.name.endsWith(".tmp"))
      result[relative] = new Uint8Array(
        await fs.readFile(path.join(root, relative)),
      );
  }
  return result;
}
export function installRecovery(Store) {
  Object.assign(Store.prototype, {
    resolveFile(relative) {
      if (
        typeof relative !== "string" ||
        relative.includes("\\") ||
        relative.includes("\0") ||
        relative.split("/").some((p) => p === ".." || p.startsWith(".")) ||
        !/^(Projects|Organisations)\//.test(relative)
      )
        throw new Problem(400, "Invalid vault path.");
      const file = path.resolve(this.root, relative);
      if (!file.startsWith(this.root + path.sep))
        throw new Problem(400, "Invalid vault path.");
      return file;
    },
    async recordHistory(file, record) {
      const relative = path.relative(this.root, file).split(path.sep).join("/");
      const folder = path.join(this.root, ".history", digest(relative));
      await this.safe(folder);
      await fs.mkdir(folder, { recursive: true });
      const target = path.join(folder, `${record.revision}.md`);
      try {
        await fs.writeFile(target, record.raw, { flag: "wx" });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      await fs.writeFile(
        path.join(folder, "file.json"),
        JSON.stringify({ file: relative }),
      );
    },
    async history(relative) {
      this.resolveFile(relative);
      const folder = path.join(this.root, ".history", digest(relative));
      await this.safe(folder);
      let entries;
      try {
        entries = await fs.readdir(folder);
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const versions = await Promise.all(
        entries
          .filter((v) => /^[a-f0-9]{64}\.md$/.test(v))
          .map(async (name) => {
            const file = path.join(folder, name),
              record = await this.read(file);
            return {
              revision: record.revision,
              updated: record.data.updated,
              title: record.data.title,
              body: record.body,
              data: record.data,
            };
          }),
      );
      return versions.sort((a, b) =>
        String(b.updated).localeCompare(String(a.updated)),
      );
    },
    async restoreVersion(relative, version, revision) {
      const file = this.resolveFile(relative),
        current = await this.read(file);
      this.checkRevision(current, revision);
      if (!/^[a-f0-9]{64}$/.test(version))
        throw new Problem(400, "Invalid version.");
      const old = await this.read(
        path.join(this.root, ".history", digest(relative), `${version}.md`),
      );
      if (
        (!old.plain && old.data.id !== current.data.id) ||
        old.data.kind !== current.data.kind
      )
        throw new Problem(400, "Version belongs to another record.");
      if (current.data.kind === "task") {
        const config = schema(
          (await this.read(this.file(current.data.project, "project"))).data
            .schema,
        );
        this.validateTask(old.data, config);
        await this.validateParent(
          current.data.project,
          old.data.id,
          old.data.parent,
        );
        await this.validateHierarchy(current.data.project, old.data, config);
        if (!canTransition(config, current.data.status, old.data.status))
          throw new Problem(
            400,
            transitionError(config, current.data.status, old.data.status),
          );
      }
      // Use the old document as the template so removed properties are restored exactly.
      return this.write(
        file,
        { ...old.data, updated: new Date().toISOString() },
        old.body,
        { ...current, doc: old.doc, data: old.data, plain: old.plain },
      );
    },
    async createBackup(reason = "manual") {
      await this.init();
      const folder = path.join(this.root, ".backups");
      await this.safe(folder);
      await fs.mkdir(folder, { recursive: true });
      const files = await collect(this.root, "Projects");
      await collect(this.root, "Organisations", files);
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
      const bytes = await pack(files);
      await fs.writeFile(path.join(folder, `${id}.zip`), bytes, { flag: "wx" });
      await fs.writeFile(
        path.join(folder, `${id}.json`),
        JSON.stringify({
          id,
          created: new Date().toISOString(),
          reason,
          files: Object.keys(files).length,
          size: bytes.length,
        }),
      );
      this.lastBackupDay = new Date().toISOString().slice(0, 10);
      return { id, size: bytes.length, files: Object.keys(files).length };
    },
    async importBackup(input) {
      if (
        typeof input.data !== "string" ||
        input.data.length > 14_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)
      )
        throw new Problem(400, "Upload a backup ZIP up to 10 MB.");
      const bytes = Buffer.from(input.data, "base64");
      if (bytes.length > 10_000_000)
        throw new Problem(413, "Upload a backup ZIP up to 10 MB.");
      const files = await unpack(bytes);
      for (const name of Object.keys(files)) this.resolveFile(name);
      if (
        !Object.keys(files).some((name) =>
          /^Organisations\/[^/]+\.md$/.test(name),
        )
      )
        throw new Problem(400, "This is not a Pencils vault backup.");
      const folder = path.join(this.root, ".backups");
      await this.safe(folder);
      await fs.mkdir(folder, { recursive: true });
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
      const metadata = {
        id,
        created: new Date().toISOString(),
        reason: "uploaded backup",
        files: Object.keys(files).length,
        size: bytes.length,
      };
      await fs.writeFile(path.join(folder, `${id}.zip`), bytes, { flag: "wx" });
      await fs.writeFile(
        path.join(folder, `${id}.json`),
        JSON.stringify(metadata),
      );
      return metadata;
    },
    async autoBackup() {
      const today = new Date().toISOString().slice(0, 10);
      if (this.lastBackupDay === today) return;
      const backups = await this.backups();
      if (backups.some((b) => b.created.startsWith(today))) {
        this.lastBackupDay = today;
        return;
      }
      await this.createBackup("automatic before first edit of the day");
    },
    async backups() {
      const folder = path.join(this.root, ".backups");
      await this.safe(folder);
      let entries;
      try {
        entries = await fs.readdir(folder);
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const result = [];
      for (const entry of entries.filter((e) => e.endsWith(".json"))) {
        try {
          result.push(
            JSON.parse(await fs.readFile(path.join(folder, entry), "utf8")),
          );
        } catch {
          /* A partial backup is not restorable. */
        }
      }
      return result.sort((a, b) => b.created.localeCompare(a.created));
    },
    async backupBytes(id) {
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{10,100}$/.test(id))
        throw new Problem(400, "Invalid backup.");
      const file = path.join(this.root, ".backups", `${id}.zip`);
      await this.safe(file);
      try {
        return await fs.readFile(file);
      } catch (error) {
        if (error.code === "ENOENT")
          throw new Problem(404, "Backup not found.");
        throw error;
      }
    },
    async restoreBackup(id) {
      const entries = await unpack(await this.backupBytes(id));
      if (
        !Object.keys(entries).some((name) =>
          /^Organisations\/[^/]+\.md$/.test(name),
        )
      )
        throw new Problem(400, "Backup has no organisations.");
      for (const name of Object.keys(entries)) this.resolveFile(name);
      const backup = await this.createBackup("before restore");
      const staging = path.join(this.root, `.restore-${randomUUID()}`),
        old = path.join(staging, "old");
      await fs.mkdir(old, { recursive: true });
      for (const [name, bytes] of Object.entries(entries)) {
        if (name.endsWith("/")) continue;
        const file = path.join(staging, "new", name);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes);
      }
      const moved = [],
        installed = [];
      try {
        for (const name of ["Projects", "Organisations"]) {
          await this.safe(path.join(this.root, name));
          await fs.mkdir(path.join(staging, "new", name), { recursive: true });
          await fs.rename(path.join(this.root, name), path.join(old, name));
          moved.push(name);
          await fs.rename(
            path.join(staging, "new", name),
            path.join(this.root, name),
          );
          installed.push(name);
        }
      } catch (error) {
        for (const name of installed)
          await fs.rm(path.join(this.root, name), {
            recursive: true,
            force: true,
          });
        for (const name of moved)
          await fs.rename(path.join(old, name), path.join(this.root, name));
        throw error;
      } finally {
        await fs.rm(staging, { recursive: true, force: true });
      }
      this.cache.clear();
      this.changed();
      return { ok: true, backup: backup.id };
    },
    async trash() {
      const dir = path.join(this.root, ".trash");
      await this.safe(dir);
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const result = [];
      for (const entry of entries) {
        try {
          if (entry.isFile() && /\.(md|canvas)$/.test(entry.name)) {
            const record = await this.read(path.join(dir, entry.name));
            result.push({
              key: entry.name,
              title: record.data.title,
              kind: record.data.kind,
              project: record.data.project,
              organisation: record.data.organisation,
              id: record.data.id,
              deleted: Number(entry.name.split("-")[0]),
            });
          } else if (entry.isDirectory()) {
            const file = path.join(dir, entry.name, "project.md"),
              record = await this.read(file);
            result.push({
              key: entry.name,
              title: record.data.title,
              kind: "project",
              id: record.data.id,
              organisation: record.data.organisation,
              deleted: Number(entry.name.split("-")[0]),
            });
          }
        } catch {
          /* Keep damaged trash untouched. */
        }
      }
      return result.sort((a, b) => b.deleted - a.deleted);
    },
    async removeRecord(project, kind, id, revision) {
      const file = this.file(project, kind, id),
        current = await this.read(file);
      this.checkRevision(current, revision);
      const folder = path.join(this.root, ".trash");
      await this.safe(folder);
      await fs.mkdir(folder, { recursive: true });
      const source = kind === "project" ? this.projectDir(project) : file;
      const target = path.join(
        folder,
        `${Date.now()}-${kind === "project" ? project : id}${kind === "project" ? "" : path.extname(file)}`,
      );
      await fs.rename(source, target);
      this.changed();
      return { ok: true };
    },
    async restoreTrash(key) {
      const item = (await this.trash()).find((t) => t.key === key);
      if (!item) throw new Problem(404, "Trash item not found.");
      let target;
      if (item.kind === "project") {
        await this.getOrganisation(item.organisation);
        target = this.projectDir(item.id);
      } else {
        await this.read(this.file(item.project, "project"));
        target = this.file(
          item.project,
          item.kind === "board" ? "boards" : "tasks",
          item.id,
        );
      }
      await this.safe(target);
      try {
        await fs.access(target);
        throw new Problem(409, "A record with this identifier already exists.");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(path.join(this.root, ".trash", key), target);
      this.changed();
      return { ok: true };
    },
  });
}
