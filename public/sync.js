import { boardDifference, applyBoardDelta } from "./board-delta.js";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

// Three-way merge: combine independent edits; ask only when both writers changed the same value.
export function merge(base, local, remote, path = "", conflicts = []) {
  if (equal(local, base)) return { value: clone(remote), conflicts };
  if (equal(remote, base) || equal(local, remote))
    return { value: clone(local), conflicts };
  if (
    Array.isArray(local) &&
    Array.isArray(remote) &&
    Array.isArray(base) &&
    [...base, ...local, ...remote].every((v) => v && typeof v.id === "string")
  ) {
    const maps = [base, local, remote].map(
      (a) => new Map(a.map((v) => [v.id, v])),
    );
    const common = new Set(
      base.map((v) => v.id).filter((id) => maps[1].has(id) && maps[2].has(id)),
    );
    const order = (list) =>
      list.map((v) => v.id).filter((id) => common.has(id));
    const originalOrder = order(base),
      localOrder = order(local),
      remoteOrder = order(remote);
    const localReordered = !equal(originalOrder, localOrder),
      remoteReordered = !equal(originalOrder, remoteOrder);
    if (localReordered && remoteReordered && !equal(localOrder, remoteOrder))
      conflicts.push({
        path: `${path}.$order`,
        base: originalOrder,
        local: localOrder,
        remote: remoteOrder,
      });
    const preferred =
      !localReordered && remoteReordered
        ? [...remote, ...local]
        : [...local, ...remote];
    const ids = new Set(preferred.map((v) => v.id)),
      value = [];
    for (const id of ids) {
      const result = merge(
        ...maps.map((m) => m.get(id)),
        `${path}[${id}]`,
        conflicts,
      ).value;
      if (result !== undefined) value.push(result);
    }
    return { value, conflicts };
  }
  if (
    [base, local, remote].every(
      (v) => v && typeof v === "object" && !Array.isArray(v),
    )
  ) {
    const value = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      if (["revision", "updated", "file"].includes(key)) {
        value[key] = remote[key];
        continue;
      }
      const result = merge(
        base[key],
        local[key],
        remote[key],
        path ? `${path}.${key}` : key,
        conflicts,
      ).value;
      if (result !== undefined) value[key] = result;
    }
    return { value, conflicts };
  }
  conflicts.push({ path, base, local, remote });
  return { value: clone(local), conflicts };
}

function pack(entry) {
  if (entry.packedBoard || !entry.url.includes("/boards/")) {
    const { running, promise, ...value } = entry; return value;
  }
  const { url, generation, error, blocked } = entry;
  const changes = boardDifference(entry.base, entry.local);
  const ids = new Set([...changes, ...(entry.delivery?.changes || [])].filter(c => c.id).map(c => c.id));
  const originals = Object.fromEntries(["nodes", "edges"].map(kind => [kind, entry.base[kind].filter(n => ids.has(n.id))]));
  return { url, generation, error, blocked, ...(entry.conflict ? { conflict: { conflicts: entry.conflict.conflicts } } : {}), packedBoard: true, revision: entry.base.revision,
    changes, originals,
    delivery: entry.delivery && { generation: entry.delivery.generation,
      operationId: entry.delivery.operationId,
      changes: entry.delivery.changes || boardDifference(entry.delivery.base, entry.delivery.sent) } };
}
function compact(record, url) {
  if (url.includes("/boards/")) {
    const { operations, native, ...value } = record; return clone(value);
  }
  return clone(record);
}
export class SaveQueue {
  constructor({ api, changed, saved }) {
    this.api = api;
    this.changed = changed;
    this.saved = saved;
    this.entries = new Map();
    this.namespace = "shared";
    this.client =
      sessionStorage.getItem("pencils:client") ||
      `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("pencils:client", this.client);
    this.timer = setInterval(() => this.retry(), 4000);
    window.addEventListener("online", () => this.retry());
  }
  key() {
    return `pencils:pending:${this.namespace}:${this.client}`;
  }
  load(namespace) {
    this.namespace = namespace;
    try {
      for (const entry of JSON.parse(
        localStorage.getItem(this.key()) || "[]",
      )) {
        entry.running = false;
        this.entries.set(entry.url, entry);
      }
      // Never replace this tab's draft with an abandoned tab's draft for the same file.
      const prefix = `pencils:pending:${namespace}:`;
      for (const key of Object.keys(localStorage))
        if (
          (key.startsWith(prefix) || key === `pencils:pending:${namespace}`) &&
          key !== this.key() &&
          !key.endsWith(":lease")
        ) {
          if (
            Date.now() - Number(localStorage.getItem(`${key}:lease`) || 0) <
            12000
          )
            continue;
          const remaining = [];
          for (const entry of JSON.parse(localStorage.getItem(key) || "[]")) {
            if (this.entries.has(entry.url)) remaining.push(entry);
            else {
              entry.running = false;
              this.entries.set(entry.url, entry);
            }
          }
          if (remaining.length)
            localStorage.setItem(key, JSON.stringify(remaining));
          else localStorage.removeItem(key);
        }
      localStorage.setItem(`${this.key()}:lease`, Date.now());
      this.leaseTimer ||= setInterval(() => {
        try {
          localStorage.setItem(`${this.key()}:lease`, Date.now());
        } catch {}
      }, 4000);
    } catch {
      /* Storage failures leave the server files untouched. */
    }
    this.changed();
    this.retry();
  }
  persist() {
    try {
      localStorage.setItem(
        this.key(),
        JSON.stringify(
          [...this.entries.values()].map(
            (entry) => pack(entry),
          ),
        ),
      );
      this.storageError = false;
    } catch {
      this.storageError = true;
    }
    this.changed();
  }
  enqueue(url, base, changes, { snapshot = false } = {}) {
    const pending = this.entries.get(url);
    if (pending?.packedBoard) {
      // Hydrate against the displayed snapshot even if the server is offline.
      this.hydrate(pending, base);
    }
    let entry = this.entries.get(url);
    if (!entry) {
      entry = {
        url,
        base: compact(base, url),
        local: null,
        generation: 0,
      };
      entry.local = { ...entry.base };
      this.entries.set(url, entry);
    }
    Object.assign(entry.local, snapshot ? changes : clone(changes));
    entry.generation++;
    entry.error = null;
    entry.blocked = false;
    this.persist();
    return this.run(entry);
  }
  run(entry) {
    if (entry.running) return entry.promise;
    if (entry.conflict || !this.entries.has(entry.url)) return;
    entry.running = true;
    entry.promise = this.perform(entry);
    return entry.promise;
  }
  hydrate(entry, remote) {
    const source = { ...remote };
    for (const kind of ["nodes", "edges"]) {
      const items = new Map((remote[kind] || []).map(n => [n.id, n]));
      for (const n of entry.originals?.[kind] || []) if (!items.has(n.id)) items.set(n.id, n);
      source[kind] = [...items.values()];
    }
    entry.base = applyBoardDelta(source, entry.changes, { guard: false, reverse: true });
    entry.base.revision = entry.revision;
    entry.local = applyBoardDelta(entry.base, entry.changes, { guard: false });
    if (entry.delivery) {
      entry.delivery.base = entry.base;
      entry.delivery.sent = applyBoardDelta(entry.base, entry.delivery.changes, { guard: false });
    }
    if (entry.conflict) entry.conflict.remote = remote;
    delete entry.packedBoard; delete entry.changes; delete entry.originals;
  }
  async perform(entry) {
    if (entry.packedBoard) {
      try {
        const remote = compact(await this.api(entry.url), entry.url);
        if (entry.packedBoard) this.hydrate(entry, remote);
      } catch (error) { entry.error = error.message; entry.running = false; this.persist(); return; }
    }
    const isBoard = entry.url.includes("/boards/");
    // Retain the exact in-flight operation until its acknowledgement arrives.
    // New edits stay in local while a lost acknowledgement is retried idempotently.
    if (isBoard && !entry.delivery) {
      entry.delivery = {
        generation: entry.generation,
        sent: { ...entry.local },
        base: entry.base,
        operationId: `op-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
      entry.delivery.changes = boardDifference(entry.delivery.base, entry.delivery.sent);
      this.persist();
    }
    if (isBoard && !entry.delivery.changes) entry.delivery.changes = boardDifference(entry.delivery.base, entry.delivery.sent);
    const { generation, sent, base, operationId } = entry.delivery || {
      generation: entry.generation,
      sent: clone(entry.local),
      base: entry.base,
    };
    try {
      const result = await this.api(entry.url, {
        method: "PATCH",
        body: {
          ...(isBoard ? { changes: entry.delivery.changes, client: this.client, operationId } : sent),
          revision: base.revision,
        },
      });
      delete entry.delivery;
      if (generation === entry.generation) {
        this.entries.delete(entry.url);
        this.saved(entry.url, result);
      } else {
        const remote = compact(result, entry.url),
          merged = merge(sent, entry.local, remote);
        entry.local = merged.value;
        if (merged.conflicts.length) {
          entry.conflict = { remote, conflicts: merged.conflicts };
          entry.base = { ...sent, revision: remote.revision };
        } else entry.base = remote;
        delete entry.operationId;
        this.saved(entry.url, entry.local);
      }
      entry.error = null;
    } catch (error) {
      entry.error = error.message;
      if (error.status === 409) {
        delete entry.delivery;
        try {
          const remote = compact(await this.api(entry.url), entry.url),
            result = merge(entry.base, entry.local, remote);
          if (result.conflicts.length)
            entry.conflict = { remote, conflicts: result.conflicts };
          else {
            entry.base = remote;
            delete entry.operationId;
            entry.local = result.value;
            entry.error = null;
          }
        } catch (readError) {
          entry.error = readError.message;
        }
      } else if (error.status && error.status < 500 && error.status !== 429)
        entry.blocked = true;
    } finally {
      entry.running = false;
      this.persist();
    }
    if (
      this.entries.has(entry.url) &&
      !entry.error &&
      !entry.conflict &&
      !entry.blocked
    )
      return this.run(entry);
  }
  async resolve(url, choice) {
    const entry = this.entries.get(url);
    if (!entry?.conflict) return;
    if (entry.packedBoard) this.hydrate(entry, compact(await this.api(url), url));
    const remote = entry.conflict.remote;
    entry.local =
      choice === "local"
        ? merge(entry.base, entry.local, remote).value
        : merge(entry.base, remote, entry.local).value;
    entry.base = remote;
    delete entry.operationId;
    delete entry.delivery;
    entry.conflict = null;
    entry.error = null;
    entry.blocked = false;
    entry.generation++;
    this.persist();
    return this.run(entry);
  }
  discard(url) {
    this.entries.delete(url);
    this.persist();
  }
  retry() {
    for (const entry of this.entries.values())
      if (!entry.running && !entry.conflict && !entry.blocked) this.run(entry);
  }
}
