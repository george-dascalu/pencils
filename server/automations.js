import path from "node:path";
import { randomUUID } from "node:crypto";
import { Problem } from "./problem.js";
const date = () => new Date().toISOString().slice(0, 10);
export class Automations {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
    this.running = false;
    this.polling = false;
    this.timer = setInterval(() => this.due().catch(() => {}), 60000);
    this.timer.unref();
  }
  file(project) {
    return path.join(this.store.projectDir(project), "automations.md");
  }
  async read(project) {
    try {
      return await this.store.read(this.file(project));
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  async list(project) {
    const data = (await this.read(project))?.data;
    return {
      rules: Array.isArray(data?.rules) ? data.rules : [],
      logs: Array.isArray(data?.logs) ? data.logs : [],
    };
  }
  async configure(project, rules, user) {
    if (!Array.isArray(rules) || rules.length > 20)
      throw new Problem(400, "Use at most 20 automation rules.");
    const ids = new Set(),
      config = (await this.store.snapshot(project)).project.schema;
    rules = rules.map((input) => {
      const rule = {
        ...input,
        id: input.id || randomUUID(),
        owner: user.username,
      };
      if (
        typeof rule.name !== "string" ||
        !rule.name.trim() ||
        rule.name.length > 100 ||
        !["manual", "status", "due"].includes(rule.trigger) ||
        !["status", "priority", "assignee", "tag"].includes(rule.field) ||
        typeof rule.value !== "string" ||
        rule.value.length > 100 ||
        typeof rule.enabled !== "boolean" ||
        !/^[\w-]{1,100}$/.test(rule.id) ||
        ids.has(rule.id)
      )
        throw new Problem(400, "Invalid or duplicate automation rule.");
      for (const key of ["from", "to"])
        if (rule[key] && !config.statuses.includes(rule[key]))
          throw new Problem(400, "Choose a valid trigger status.");
      if (rule.field === "status" && !config.statuses.includes(rule.value))
        throw new Problem(400, "Choose a valid action status.");
      if (
        rule.field === "priority" &&
        !["none", "low", "medium", "high", "urgent"].includes(rule.value)
      )
        throw new Problem(400, "Choose a valid priority.");
      if (rule.field === "tag" && !rule.value.trim())
        throw new Problem(400, "Enter a tag.");
      ids.add(rule.id);
      return rule;
    });
    const current = await this.read(project);
    return this.store.write(
      this.file(project),
      {
        id: "automations",
        kind: "automations",
        project,
        rules,
        logs: current?.data.logs || [],
      },
      "",
      current,
    );
  }
  plan(rule, tasks, trigger = {}, done = []) {
    return tasks
      .filter(
        (t) =>
          !t.archived &&
          (!trigger.task || t.id === trigger.task) &&
          (rule.trigger !== "status" ||
            (!!trigger.task &&
              (!rule.from || trigger.from === rule.from) &&
              (!rule.to || t.status === rule.to))) &&
          (rule.trigger !== "due" ||
            (t.due && t.due <= date() && !done.includes(t.status))),
      )
      .map((t) => ({
        id: t.id,
        key: t.key,
        title: t.title,
        revision: t.revision,
        before: t[rule.field === "tag" ? "tags" : rule.field],
        patch:
          rule.field === "tag"
            ? { tags: [...new Set([...(t.tags || []), rule.value])] }
            : { [rule.field]: rule.value },
        sourceOwned: !!t.source && rule.field !== "tag",
      }))
      .filter(
        (t) =>
          JSON.stringify(t.before) !==
          JSON.stringify(Object.values(t.patch)[0]),
      );
  }
  async run(
    project,
    id,
    { preview = true, revisions, trigger = {}, automatic = false } = {},
  ) {
    const current = await this.read(project),
      rule = current?.data.rules.find((r) => r.id === id);
    if (!rule) throw new Problem(404, "Automation rule not found.");
    const snapshot = await this.store.snapshot(project),
      plan = this.plan(
        rule,
        snapshot.tasks,
        trigger,
        snapshot.project.schema.done,
      ),
      attempt = JSON.stringify([
        date(),
        rule,
        plan.map((t) => [t.id, t.revision]),
      ]);
    if (plan.length > 200)
      throw new Problem(413, "Narrow this automation to 200 tasks or fewer.");
    if (preview) return { rule, changes: plan };
    if (!rule.enabled)
      throw new Problem(400, "Enable this rule before running it.");
    if (
      revisions &&
      (plan.length !== Object.keys(revisions).length ||
        plan.some((t) => revisions[t.id] !== t.revision))
    )
      throw new Problem(
        409,
        "Tasks changed since the preview. Review the automation again.",
      );
    // A rejected automatic action is retried only after input changes or on another day.
    if (
      !plan.length ||
      (automatic && current.data.logs.some((l) => l.attempt === attempt))
    )
      return { changed: 0, errors: [], skipped: true };
    const log = {
      id: randomUUID(),
      rule: id,
      name: rule.name,
      at: new Date().toISOString(),
      changed: 0,
      errors: [],
      attempt,
    };
    this.running = true;
    try {
      for (const item of plan) {
        if (item.sourceOwned) {
          log.errors.push({
            task: item.id,
            error: "Source-owned field; no remote action was sent.",
          });
          continue;
        }
        try {
          await this.store.updateTask(project, item.id, {
            revision: item.revision,
            ...item.patch,
          });
          log.changed++;
        } catch (e) {
          log.errors.push({
            task: item.id,
            error: e.status ? e.message : "Save failed; inspect Recovery.",
          });
        }
      }
    } finally {
      this.running = false;
    }
    const fresh = await this.read(project);
    await this.store.write(
      this.file(project),
      { ...fresh.data, logs: [log, ...fresh.data.logs].slice(0, 100) },
      "",
      fresh,
    );
    return log;
  }
  async onStatus(project, previous, next) {
    if (this.running || previous.status === next.status) return;
    const { rules } = await this.list(project);
    for (const rule of rules)
      if (
        rule.enabled &&
        rule.trigger === "status" &&
        (await this.allowed(rule, project))
      )
        await this.run(project, rule.id, {
          preview: false,
          trigger: { task: next.id, from: previous.status },
          automatic: true,
        });
  }
  async allowed(rule, project) {
    if (!this.auth.enabled) return true;
    const owner = (await this.auth.accounts()).find(
        (u) => u.username === rule.owner,
      ),
      p = (await this.store.read(this.store.file(project, "project"))).data;
    return (
      this.auth.allow(owner, p.organisation, true) &&
      (!p.source_owner || owner?.admin || owner?.username === p.source_owner)
    );
  }
  async due() {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const project of (await this.store.list()).projects) {
        const { rules } = await this.list(project.id);
        for (const rule of rules)
          if (
            rule.enabled &&
            rule.trigger === "due" &&
            (await this.allowed(rule, project.id))
          )
            await this.store.mutate(() =>
              this.run(project.id, rule.id, {
                preview: false,
                automatic: true,
              }),
            );
      }
    } finally {
      this.polling = false;
    }
  }
  close() {
    clearInterval(this.timer);
  }
}
