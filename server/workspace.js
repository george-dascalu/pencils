import { initialStatus } from "../public/workflow-model.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { Problem } from "./problem.js";
import { schema, progress } from "./model.js";

export function installWorkspace(Store) {
  Object.assign(Store.prototype, {
    async validateDependencies(project, id, dependencies = []) {
      if (!dependencies?.length) return;
      const { items } = await this.children(project, "tasks"),
        map = new Map(items.map((t) => [t.id, t]));
      map.set(id, { dependencies });
      const visiting = new Set(),
        visited = new Set();
      function visit(key) {
        if (visiting.has(key))
          throw new Problem(400, "Dependencies cannot contain a cycle.");
        if (visited.has(key)) return;
        if (!map.has(key))
          throw new Problem(400, "Dependency does not exist in this project.");
        visiting.add(key);
        for (const dep of map.get(key).dependencies || []) visit(dep);
        visiting.delete(key);
        visited.add(key);
      }
      visit(id);
    },
    async overview(allowed = () => true) {
      const { projects, warnings } = await this.list();
      const tasks = [],
        summaries = [];
      for (const project of projects.filter(allowed)) {
        const snapshot = await this.snapshot(project.id),
          config = schema(project.schema),
          map = new Map(snapshot.tasks.map((t) => [t.id, t]));
        const active = snapshot.tasks.filter((t) => !t.archived);
        const blocked = (t) =>
          (t.dependencies || []).some(
            (id) => !map.has(id) || !config.done.includes(map.get(id).status),
          );
        summaries.push({
          ...project,
          progress: progress(active, config),
          blocked: active.filter(
            (t) => !config.done.includes(t.status) && blocked(t),
          ).length,
          overdue: active.filter(
            (t) =>
              !config.done.includes(t.status) &&
              t.due &&
              t.due < new Date().toISOString().slice(0, 10),
          ).length,
        });
        for (const task of snapshot.tasks)
          tasks.push({
            ...task,
            organisation: project.organisation,
            project_title: project.title,
            completed: config.done.includes(task.status),
            blocked: blocked(task),
          });
        warnings.push(
          ...snapshot.warnings.map((w) => `${project.title}: ${w}`),
        );
      }
      return { projects: summaries, tasks, warnings };
    },
    async importNotes(project, input) {
      if (
        !Array.isArray(input.notes) ||
        !input.notes.length ||
        input.notes.length > 200
      )
        throw new Problem(400, "Import between 1 and 200 Markdown notes.");
      const config = schema(
          (await this.read(this.file(project, "project"))).data.schema,
        ),
        prepared = [];
      for (const note of input.notes) {
        if (
          typeof note.name !== "string" ||
          !note.name.endsWith(".md") ||
          typeof note.content !== "string" ||
          note.content.length > 200000
        )
          throw new Problem(
            400,
            "Import Markdown files up to 200,000 characters each.",
          );
        const match = note.content.match(
          /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/,
        );
        let properties = {},
          body = note.content;
        if (match) {
          try {
            properties = YAML.parseDocument(match[1]).toJS({
              maxAliasCount: 50,
            });
          } catch {
            throw new Problem(400, `Invalid frontmatter in ${note.name}.`);
          }
          if (
            !properties ||
            typeof properties !== "object" ||
            Array.isArray(properties)
          )
            throw new Problem(400, "Frontmatter must be a mapping.");
          body = match[2];
        }
        const title =
          properties.title ||
          body.match(/^#\s+(.+)$/m)?.[1] ||
          path.basename(note.name, ".md");
        const data = {
          title,
          body,
          type: config.types.includes(properties.type)
            ? properties.type
            : config.types.includes("task")
              ? "task"
              : config.types[0],
          status: config.statuses.includes(properties.status)
            ? properties.status
            : initialStatus(config),
          priority: ["none", "low", "medium", "high", "urgent"].includes(
            properties.priority,
          )
            ? properties.priority
            : "none",
          due: properties.due || null,
          tags: Array.isArray(properties.tags) ? properties.tags : [],
        };
        this.validateTask({ ...data, id: "t-import" }, config);
        prepared.push({ data, properties, name: note.name });
      }
      const imported = [];
      for (const { data, properties, name } of prepared) {
        const task = await this.createTask(project, data),
          file = this.file(project, "tasks", task.id),
          record = await this.read(file);
        // Preserve foreign properties under their original keys unless reserved by Pencils.
        const combined = {
          ...properties,
          ...record.data,
          aliases: [
            ...new Set([
              task.title,
              path.basename(name, ".md"),
              ...(Array.isArray(properties.aliases)
                ? properties.aliases.filter((a) => typeof a === "string")
                : []),
            ]),
          ],
          imported_from: name,
        };
        imported.push(await this.write(file, combined, record.body, record));
      }
      return { tasks: imported };
    },
    async attach(project, input) {
      await this.read(this.file(project, "project"));
      if (
        typeof input.name !== "string" ||
        input.name.length > 200 ||
        typeof input.data !== "string" ||
        input.data.length > 14000000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)
      )
        throw new Problem(400, "Upload a file up to 10 MB.");
      const bytes = Buffer.from(input.data, "base64");
      const ext = path.extname(input.name).toLowerCase();
      const allowed = [
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".pdf",
        ".txt",
        ".md",
        ".csv",
        ".zip",
      ];
      if (!allowed.includes(ext) || bytes.length > 10_000_000)
        throw new Problem(
          400,
          "Supported attachments: images, PDF, text, Markdown, CSV and ZIP, up to 10 MB.",
        );
      const name = `a-${randomUUID()}${ext}`,
        file = path.join(this.projectDir(project), "attachments", name);
      await this.safe(file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes, { flag: "wx" });
      this.changed();
      return {
        name: input.name,
        path: `attachments/${name}`,
        url: `/api/projects/${project}/attachments/${name}`,
      };
    },
    async attachment(project, name) {
      await this.read(this.file(project, "project"));
      if (
        !/^a-[a-f0-9-]+\.(png|jpg|jpeg|gif|webp|pdf|txt|md|csv|zip)$/.test(name)
      )
        throw new Problem(400, "Invalid attachment.");
      const file = path.join(this.projectDir(project), "attachments", name);
      await this.safe(file);
      try {
        return { bytes: await fs.readFile(file), ext: path.extname(name) };
      } catch (error) {
        if (error.code === "ENOENT")
          throw new Problem(404, "Attachment not found.");
        throw error;
      }
    },
  });
}
