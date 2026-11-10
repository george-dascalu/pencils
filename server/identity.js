import fs from "node:fs/promises";
import path from "node:path";
import { Problem } from "./problem.js";
export const validProjectKey = (value) =>
  typeof value === "string" && /^[A-Z][A-Z0-9]{1,11}$/.test(value);
export const KEY_FORMAT = "Use 2–12 letters or digits, starting with a letter.";
// What a person is told about a taken key (F0.22-93): the project holding it, unless they can't open it.
export function keyTaken(key, owner, visible) {
  if (!visible) return `${key} is used by a project you can’t open.`;
  if (owner.previous) return `${key} was ${owner.title}’s earlier key, so its old card IDs still lead there.`;
  return `${key} is used by ${owner.title}${owner.trashed ? ", in Trash" : ""}.`;
}
export function installIdentity(Store) {
  Object.assign(Store.prototype, {
    identityLock(fn) {
      const next = (this.identityQueue || Promise.resolve()).then(fn);
      this.identityQueue = next.catch(() => {});
      return next;
    },
    // Every key a project holds, its own or an earlier one kept for old card IDs, in Trash too.
    async keyOwners() {
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
              if (key) used.set(key, { id: data.id, title: data.title, organisation: data.organisation, source_owner: data.source_owner, trashed: base === ".trash", previous: key !== data.key });
          } catch (e) {
            if (e.status !== 404 && e.code !== "ENOENT") continue;
          }
        }
      }
      return used;
    },
    async projectKey(input, title, exclude) {
      const used = await this.keyOwners();
      if (input) {
        const key = String(input).trim().toUpperCase();
        if (!validProjectKey(key)) throw new Problem(400, KEY_FORMAT);
        if (used.has(key) && used.get(key).id !== exclude)
          // The route names the project for the person asking (keyTaken).
          throw Object.assign(new Problem(409, "That project key is already in use or reserved by another project."), { key, owner: used.get(key) });
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
      while (used.has(key) && used.get(key).id !== exclude) key = stem + n++;
      return key;
    },
    // `sweep: false` only reserves a number for a new card while the register and key are the ones
    // this store last left and the watcher has seen nothing else change: reading every card to number
    // the ones missing from it made each new card slower in a big project (F0.22-51). Otherwise, and
    // when a project is opened (its snapshot), every card is numbered and repaired first.
    async ensureTaskIdentities(project, reserveId, { sweep = true } = {}) {
      return this.identityLock(async () => {
        const drift = this.drift;
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
            "Card identity registry is invalid. Restore identity.md from history.",
          );
        // An earlier restore gave the register an updated time, which keeps it off its quick form.
        if ("updated" in data) data.updated = undefined;
        const known = this.ledgers.get(project);
        const skip = !sweep && this.watcher && ledger && known?.revision === ledger.revision && known.key === p.data.key;
        const { items } = skip ? { items: [] } : await this.children(project, "tasks", { shared: true });
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
            "This project has exhausted its card number range.",
          );
        let revision = ledger?.revision;
        if (!ledger || JSON.stringify(data) !== JSON.stringify(ledger.data)) {
          await this.autoBackup();
          ({ revision } = await this.write(
            ledgerFile,
            data,
            "Task number registry. Keep this file with the project when moving or backing up the vault.\n",
            ledger,
          ));
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
        // Unless something else changed the cards while they were read.
        if (drift === this.drift) this.ledgers.set(project, { revision, key: p.data.key });
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
