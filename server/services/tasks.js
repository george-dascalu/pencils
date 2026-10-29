import { defaultPriority } from "../../public/task-priority.js";
import { hierarchyError } from "../../public/hierarchy-model.js";
import {
  canTransition,
  initialStatus,
  transitionError,
} from "../../public/workflow-model.js";
import { membersForProject } from "../teams.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Problem } from "../problem.js";
import { schema, validateExtras, nextDate } from "../model.js";
import {
  PRIORITIES,
  idPattern,
  now,
  validId,
  title,
  body,
  choice,
  date,
  tags,
} from "../values.js";

export const tasksMethods = {
  validateTask(data, config = schema()) {
    validId(data.id);
    title(data.title);
    choice(data.status, config.statuses, "status");
    choice(data.type, config.types, "type");
    validateExtras(data, config);
    choice(data.priority, PRIORITIES, "priority");
    date(data.due ?? null);
    tags(data.tags ?? []);
    if (
      data.related_records !== undefined &&
      (!Array.isArray(data.related_records) ||
        data.related_records.length > 200 ||
        data.related_records.some(
          (id) => typeof id !== "string" || !idPattern.test(id),
        ))
    )
      throw new Problem(400, "Related records must be up to 200 task IDs.");
    if (data.parent) validId(data.parent);
    if (data.milestone != null && typeof data.milestone !== "boolean")
      throw new Problem(400, "Invalid milestone.");
    if (
      data.assignee != null &&
      (typeof data.assignee !== "string" || data.assignee.length > 100)
    )
      throw new Problem(400, "Assignee must be text, up to 100 characters.");
  },
  async validateParent(project, taskId, parent) {
    if (!parent) return;
    validId(parent);
    const { items } = await this.children(project, "tasks");
    const map = new Map(items.map((t) => [t.id, t]));
    const seen = new Set([taskId]);
    let current = parent;
    while (current) {
      if (seen.has(current))
        throw new Problem(400, "A task cannot be its own ancestor.");
      if (!map.has(current))
        throw new Problem(
          400,
          "The parent task does not exist in this project.",
        );
      seen.add(current);
      current = map.get(current).parent;
    }
  },
  async assignPerson(projectId, data, input, current = null) {
    const project = (await this.read(this.file(projectId, "project"))).data;
    const organisation = await this.getOrganisation(project.organisation);
    const people = membersForProject(project, organisation);
    const requestedId = input.assignee_id || null;
    if (
      current &&
      !current.assignee_id &&
      !requestedId &&
      input.assignee === current.assignee
    ) {
      data.assignee_id = null;
      return;
    }
    if (
      current &&
      !Object.hasOwn(input, "assignee_id") &&
      (!Object.hasOwn(input, "assignee") || input.assignee === current.assignee)
    )
      return;
    if (
      !data.assignee &&
      (!requestedId || requestedId === current?.assignee_id)
    ) {
      data.assignee_id = null;
      return;
    }
    const changedName =
      current &&
      Object.hasOwn(input, "assignee") &&
      input.assignee !== current.assignee &&
      requestedId === current.assignee_id;
    const person = people.find((p) =>
      requestedId && !changedName
        ? p.id === requestedId
        : p.name === data.assignee,
    );
    if (person) {
      data.assignee_id = person.id;
      data.assignee = person.name;
      return;
    }
    // Preserve an unchanged former member while editing unrelated task fields.
    const priorName =
      (organisation.people || []).find((p) => p.id === current?.assignee_id)
        ?.name || current?.assignee;
    if (
      current?.assignee_id &&
      requestedId === current.assignee_id &&
      (!Object.hasOwn(input, "assignee") ||
        [current.assignee, priorName].includes(input.assignee))
    ) {
      data.assignee = priorName;
      return;
    }
    if (requestedId || (organisation.teams || []).length)
      throw new Problem(
        400,
        "Choose an assignee from a team assigned to this project.",
      );
    data.assignee_id = null;
  },
  async validateHierarchy(project, data, config, parentTask) {
    const { items } = await this.children(project, "tasks");
    const error = hierarchyError(
      config,
      data,
      parentTask || items.find((t) => t.id === data.parent),
    );
    if (error) throw new Problem(400, error);
    for (const child of items.filter((t) => t.parent === data.id)) {
      const error = hierarchyError(config, child, data);
      if (error) throw new Problem(400, error);
    }
  },
  async createTaskBundle(project, input) {
    if (!Array.isArray(input.subtasks) || input.subtasks.length > 100)
      throw new Problem(400, "Add up to 100 subtasks at a time.");
    const parent = await this.createTask(
      project,
      { ...input, subtasks: undefined },
      { prepare: true },
    );
    const children = [];
    for (const child of input.subtasks) {
      if (!child || typeof child !== "object" || Array.isArray(child))
        throw new Problem(400, "Invalid subtask.");
      children.push(
        await this.createTask(
          project,
          {
            title: child.title,
            type: child.type,
            body: child.body,
            parent: parent.data.id,
          },
          { prepare: true, parentTask: parent.data },
        ),
      );
    }
    const written = [];
    try {
      for (const prepared of [parent, ...children]) {
        const data = prepared.data;
        Object.assign(data, await this.ensureTaskIdentities(project, data.id));
        data.aliases.unshift(data.key);
        written.push(
          await this.write(
            this.file(project, "tasks", data.id),
            data,
            prepared.body,
          ),
        );
      }
      return written[0];
    } catch (error) {
      // Validation happens before writing. Undo this bundle if an I/O failure interrupts it.
      for (const task of written)
        await fs.rm(this.file(project, "tasks", task.id), { force: true });
      this.changed();
      throw error;
    }
  },
  async createTask(project, input, internal = {}) {
    if (!internal.prepare && input.creation_request) {
      if (
        typeof input.creation_request !== "string" ||
        !/^[\w-]{1,100}$/.test(input.creation_request)
      )
        throw new Problem(400, "Invalid creation request.");
      const existing = (await this.children(project, "tasks")).items.find(
        (t) => t.creation_request === input.creation_request,
      );
      if (existing) return existing;
    }
    if (input.canvas_source) {
      if (
        typeof input.canvas_source !== "string" ||
        !/^canvas:[\w-]+:[\w-]+$/.test(input.canvas_source) ||
        input.canvas_source.length > 200
      )
        throw new Problem(400, "Invalid canvas source.");
      const existing = (await this.children(project, "tasks")).items.find(
        (t) => t.canvas_source === input.canvas_source,
      );
      if (existing) return existing;
    }
    if (!internal.prepare && input.subtasks !== undefined)
      return this.createTaskBundle(project, input);
    const config = schema(
      (await this.read(this.file(project, "project"))).data.schema,
    );
    const id = `t-${randomUUID().slice(0, 8)}`;
    const data = {
      id,
      kind: "task",
      ...(input.creation_request
        ? { creation_request: input.creation_request }
        : {}),
      ...(input.canvas_source ? { canvas_source: input.canvas_source } : {}),
      project,
      title: title(input.title),
      type:
        input.type ??
        (config.types.includes("task") ? "task" : config.types[0]),
      status: input.status ?? initialStatus(config),
      priority: input.priority ?? defaultPriority,
      parent: input.parent || null,
      assignee: input.assignee ?? "",
      due: input.due || null,
      tags: input.tags ?? [],
      created: now(),
      updated: now(),
    };
    for (const key of [
      "start",
      "milestone",
      "estimate",
      "dependencies",
      "related_records",
      "documents",
      "recurrence",
      "fields",
      "comments",
      "order",
      "archived",
    ])
      if (key in input) data[key] = input[key];
    data.aliases = [data.title];
    if (internal.recurrenceSource)
      data.recurrence_source = internal.recurrenceSource;
    await this.assignPerson(project, data, input);
    this.validateTask(data, config);
    if (!internal.parentTask)
      await this.validateParent(project, id, data.parent);
    await this.validateHierarchy(project, data, config, internal.parentTask);
    await this.validateDependencies(project, id, data.dependencies);
    const taskBody = body(input.body ?? "");
    if (internal.prepare) return { data, body: taskBody };
    Object.assign(data, await this.ensureTaskIdentities(project, id));
    data.aliases.unshift(data.key);
    return this.write(this.file(project, "tasks", id), data, taskBody);
  },
  async updateTask(project, id, input) {
    const file = this.file(project, "tasks", id),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    if (current.data.source) {
      for (const key of [
        "title",
        "type",
        "status",
        "priority",
        "assignee",
        "due",
      ])
        if (
          key in input &&
          JSON.stringify(input[key] || null) !==
            JSON.stringify(current.data[key] || null)
        )
          throw new Problem(
            403,
            "This field belongs to a data source. Use Publish to source or edit it in the source, then sync.",
          );
    }
    const data = { ...current.data, updated: now() };
    for (const key of [
      "title",
      "type",
      "status",
      "priority",
      "parent",
      "assignee",
      "due",
      "tags",
      "start",
      "milestone",
      "estimate",
      "dependencies",
      "related_records",
      "documents",
      "recurrence",
      "fields",
      "comments",
      "order",
      "archived",
    ])
      if (key in input) data[key] = input[key];
    data.title = title(data.title);
    data.parent ||= null;
    data.due ||= null;
    const config = schema(
      (await this.read(this.file(project, "project"))).data.schema,
    );
    if (!canTransition(config, current.data.status, data.status))
      throw new Problem(
        400,
        transitionError(config, current.data.status, data.status),
      );
    await this.assignPerson(project, data, input, current.data);
    this.validateTask(data, config);
    // Notes, dates, status and assignee edits cannot change the task graph.
    // Avoid reading every sibling three times for these common saves.
    if (
      data.parent !== current.data.parent ||
      data.type !== current.data.type
    ) {
      await this.validateParent(project, id, data.parent);
      await this.validateHierarchy(project, data, config);
    }
    if (
      JSON.stringify(data.dependencies || []) !==
      JSON.stringify(current.data.dependencies || [])
    )
      await this.validateDependencies(project, id, data.dependencies);
    if (data.title !== current.data.title)
      data.aliases = [
        ...new Set([
          data.title,
          ...(Array.isArray(data.aliases) ? data.aliases : []),
        ]),
      ].slice(0, 20);
    // Completing a recurring task creates exactly one successor for this task ID.
    if (
      data.recurrence &&
      config.done.includes(data.status) &&
      !config.done.includes(current.data.status) &&
      !data.recurrence_next
    ) {
      const { items } = await this.children(project, "tasks");
      let successor = items.find((t) => t.recurrence_source === id);
      if (!successor) {
        const next = {
          ...data,
          status:
            config.initial_status ||
            config.statuses.find((s) => !config.done.includes(s)) ||
            config.statuses[0],
          due: nextDate(data.due, data.recurrence),
          start: data.start ? nextDate(data.start, data.recurrence) : null,
          comments: [],
          body: current.body,
        };
        successor = await this.createTask(project, next, {
          recurrenceSource: id,
        });
      }
      data.recurrence_next = successor.id;
    }
    const saved = await this.write(
      file,
      data,
      "body" in input ? body(input.body) : current.body,
      current,
    );
    if (this.automations && current.data.status !== saved.status) {
      await this.automations.onStatus(project, current.data, saved);
      return this.public(await this.read(file), file);
    }
    return saved;
  },
  async deleteTask(project, id, revision) {
    const file = this.file(project, "tasks", id),
      current = await this.read(file);
    this.checkRevision(current, revision);
    const { items, warnings } = await this.children(project, "tasks");
    if (warnings.length)
      throw new Problem(
        409,
        "Repair unreadable task files before removing tasks.",
      );
    if (items.some((t) => t.parent === id))
      throw new Problem(400, "Move or remove the subtasks first.");
    const trash = path.join(this.root, ".trash", `${Date.now()}-${id}.md`);
    await this.safe(trash);
    await fs.mkdir(path.dirname(trash), { recursive: true });
    if (items.some((t) => (t.dependencies || []).includes(id)))
      throw new Problem(400, "Remove references to this dependency first.");
    await this.journal.move(file, trash);
    this.changed(file);
    return { ok: true };
  },
};
