import fs from "node:fs/promises";
import path from "node:path";
import { Problem } from "./problem.js";
export const validProjectKey = (value) =>
  typeof value === "string" && /^[A-Z][A-Z0-9]{1,11}$/.test(value);
export function installIdentity(Store) {
  Object.assign(Store.prototype, {
    identityLock(fn) {
      const next = (this.identityQueue || Promise.resolve()).then(fn);
      this.identityQueue = next.catch(() => {});
      return next;
    },
    async projectKey(input, title, exclude) {
      const used = new Map();
      for (const base of ["Projects", ".trash"]) {
        const dir = path.join(this.root, base);
        await this.safe(dir);
        const entries = await fs
          .readdir(dir, { withFileTypes: true })
          .catch((e) => {
            if (e.code === "ENOENT") return [];
            throw e;
          });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          try {
            const { data } = await this.read(
              path.join(dir, entry.name, "project.md"),
            );
            for (const key of [data.key, ...(data.previous_keys || [])])
              if (key) used.set(key, data.id);
          } catch (e) {
            if (e.status !== 404 && e.code !== "ENOENT") continue;
          }
        }
      }
      if (input) {
        const key = String(input).trim().toUpperCase();
        if (!validProjectKey(key))
          throw new Problem(
            400,
            "Project key must be 2–12 uppercase letters or digits, starting with a letter.",
          );
        if (used.has(key) && used.get(key) !== exclude)
          throw new Problem(
            409,
            "That project key is already in use or reserved by another project.",
          );
        return key;
      }
      let stem = String(title)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      if (!/^[A-Z]/.test(stem)) stem = "PRJ";
      if (stem.length < 2) stem += "P";
      let key = stem,
        n = 2;
      while (used.has(key) && used.get(key) !== exclude) key = stem + n++;
      return key;
    },
    async ensureTaskIdentities(project, reserveId) {
      return this.identityLock(async () => {
        const file = this.file(project, "project");
        let p = await this.read(file);
        if (!p.data.key) {
          await this.autoBackup();
          await this.write(
            file,
            {
              ...p.data,
              key: await this.projectKey(null, p.data.title, project),
            },
            p.body,
            p,
          );
          p = await this.read(file);
        }
        if (!validProjectKey(p.data.key))
          throw new Problem(422, "Repair the project key in project.md.");
        const ledgerFile = path.join(this.projectDir(project), "identity.md");
        let ledger;
        try {
          ledger = await this.read(ledgerFile);
        } catch (e) {
          if (e.status !== 404) throw e;
        }
        const data = structuredClone(
          ledger?.data || {
            kind: "task-identities",
            project,
            next: 1,
            tasks: {},
          },
        );
        if (
          !Number.isSafeInteger(data.next) ||
          data.next < 1 ||
          !data.tasks ||
          Array.isArray(data.tasks) ||
          typeof data.tasks !== "object" ||
          Object.values(data.tasks).some(
            (n) => !Number.isSafeInteger(n) || n < 1,
          ) ||
          new Set(Object.values(data.tasks)).size !==
            Object.keys(data.tasks).length
        )
          throw new Problem(
            422,
            "Task identity registry is invalid. Restore identity.md from history.",
          );
        const { items } = await this.children(project, "tasks");
        const records = [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(task => ({
          r: { data: task }, file: this.file(project, "tasks", task.id),
        }));
        // The ledger survives deletion and backup/restore, so numbers are never recycled.
        const used = new Set(Object.values(data.tasks));
        data.next = Math.max(data.next, ...[...used].map((n) => n + 1));
        for (const { r } of records) {
          if (data.tasks[r.data.id]) continue;
          let number = r.data.number;
          if (!Number.isSafeInteger(number) || number < 1 || used.has(number))
            number = data.next;
          data.tasks[r.data.id] = number;
          used.add(number);
          data.next = Math.max(data.next, number + 1);
        }
        if (reserveId && !data.tasks[reserveId])
          data.tasks[reserveId] = data.next++;
        if (!Number.isSafeInteger(data.next))
          throw new Problem(
            409,
            "This project has exhausted its task number range.",
          );
        if (!ledger || JSON.stringify(data) !== JSON.stringify(ledger.data)) {
          await this.autoBackup();
          await this.write(
            ledgerFile,
            data,
            "Task number registry. Keep this file with the project when moving or backing up the vault.\n",
            ledger,
          );
        }
        for (const { r, file: taskFile } of records) {
          const number = data.tasks[r.data.id],
            key = `${p.data.key}-${number}`;
          if (r.data.number === number && r.data.key === key) continue;
          const current = await this.read(taskFile);
          await this.write(
            taskFile,
            {
              ...current.data,
              number,
              key,
              aliases: [
                ...new Set([
                  key,
                  ...(Array.isArray(r.data.aliases) ? r.data.aliases : []),
                ]),
              ],
            },
            current.body,
            current,
          );
        }
        return reserveId
          ? {
              number: data.tasks[reserveId],
              key: `${p.data.key}-${data.tasks[reserveId]}`,
            }
          : null;
      });
    },
  });
}
