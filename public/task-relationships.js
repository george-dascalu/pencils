import {
  relationshipTypes,
  taskRelationships,
  relationshipChanges,
  compareRelationshipTasks,
} from "./task-relationship-model.js";
import { sourceReadOnly } from "./source-model.js";
import { assigneeOptions } from "./teams.js";
import { priorityOptions } from "./task-priority.js";
import { nextStatuses } from "./workflow-model.js";
import { priorityLabel } from "./task-priority.js";
import { taskColorAttributes, fieldBoxStyle } from "./task-colors.js";
import { statusLabel } from "./workflow-model.js";
import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from "./open-focus.js";
import { fieldOn } from "./card-fields.js";
import { childType } from "./hierarchy-model.js";
import { randomUUID } from "./uuid.js";

export function taskRelationshipsEditor(ctx, form, { flush, changed }) {
  const { state, esc, icon, sync, patchTask, taskDialog, api } = ctx;
  // Without the Parent field (T23) a card has no parent or children to show.
  const kinds = () => relationshipTypes.filter(([kind]) => fieldOn(state.config, "parent") || !["parent", "child"].includes(kind));
  // A new card has no id yet: its own fields are written into the form and
  // changes to other cards wait in `staged` until the card is created.
  const draft = !form.dataset.id;
  const id = form.dataset.id || "t-new-card",
    project = state.project.id;
  const staged = new Map();
  const preferenceKey = `relationship-sort:${project}`;
  const preference = ctx.storage.get(preferenceKey, {});
  let sortField = ["assignee", "priority", "status"].includes(preference.field) ? preference.field : "";
  let sortDirection = preference.direction === -1 ? -1 : 1;
  const host = document.createElement("section");
  host.className = "task-relationships";
  host.setAttribute("aria-label", "Relationships");
  host.innerHTML = `<div class="task-relationships-heading"><h3>Relationships</h3><details class="selection-menu task-relationship-sort"><summary class="icon-button" aria-label="Sort relationships" title="Sort relationships">${icon("sort")}</summary><div class="selection-popover task-picker-popover"><h3 class="popover-title">Sort by</h3><div role="listbox" aria-label="Sort relationships by">${[["", "Relationship order"], ["assignee", "Assignee"], ["status", "Status"], ["priority", "Priority"]].map(([value, label]) => `<button type="button" role="option" data-relationship-sort="${value}" aria-selected="false"><span>${label}</span>${icon("check")}</button>`).join("")}</div><button type="button" class="button" data-relationship-sort-direction aria-label="Reverse relationship sort">${icon("sort")}Reverse order</button></div></details><button type="button" class="icon-button" data-relationship-toggle aria-expanded="false" aria-label="Add relationship" title="Add relationship">${icon("plus")}</button></div>
    <div data-relationship-list></div>
    <div class="selection-popover task-relationship-picker" id="task-relationship-picker" data-relationship-picker popover="manual" role="dialog" aria-label="Add relationship" aria-modal="false" hidden>
      <div class="task-relationship-controls"><select aria-label="Relationship type">${kinds().map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select><input type="search" aria-label="Find a card to link" placeholder="Find by ID or title…"><button type="button" class="icon-button" data-relationship-close aria-label="Close relationship picker">${icon("close")}</button></div>
      <div class="task-relationship-options" data-relationship-options></div>
    </div><p class="field-hint" data-relationship-status role="status" hidden></p>`;
  form.querySelector(".task-description").after(host);
  const picker = host.querySelector("[data-relationship-picker]");
  const type = picker.querySelector("select"),
    search = picker.querySelector("input");
  const toggle = host.querySelector("[data-relationship-toggle]");
  toggle.setAttribute("aria-controls", picker.id);
  toggle.setAttribute("aria-haspopup", "dialog");
  // The sort options show as soon as the menu opens; choosing one keeps it open for Reverse order.
  const sortOptions = host.querySelectorAll("[data-relationship-sort]");
  const direction = host.querySelector("[data-relationship-sort-direction]");
  const sortMenu = host.querySelector(".task-relationship-sort");
  const positionSort = () => {
    if (sortMenu.open) positionPopover(sortMenu.lastElementChild, sortMenu.firstElementChild.getBoundingClientRect(), { width: 230, bounds: form.closest("dialog").getBoundingClientRect() });
  };
  sortMenu.addEventListener("toggle", () => { if (sortMenu.open) { close(); positionSort(); } });
  // The + that opened the picker: the heading's, or a group's own (F0.22-26).
  let anchorKind = null;
  const anchor = () => (anchorKind && host.querySelector(`[data-relationship-group-add="${anchorKind}"]`)) || toggle;
  const positionPicker = () => {
    if (!picker.hidden) positionPopover(picker, anchor().getBoundingClientRect(), {
      width: 520, maxHeight: 420, bounds: form.closest("dialog").getBoundingClientRect(), gap: 8,
    });
  };
  const positionPanels = () => { positionSort(); positionPicker(); };
  window.addEventListener("resize", positionPanels);
  window.visualViewport?.addEventListener("resize", positionPanels);
  window.visualViewport?.addEventListener("scroll", positionPanels);
  form.closest("dialog").addEventListener("scroll", positionPanels, true);
  const status = host.querySelector("[data-relationship-status]");
  const related = document.createElement("select");
  related.name = "related_records";
  related.multiple = true;
  related.hidden = true;
  for (const input of form.querySelectorAll('input[name="related_records"]')) {
    related.add(new Option(input.value, input.value, true, true));
    input.remove();
  }
  for (const task of state.tasks) {
    if (
      task.id !== id &&
      ![...related.options].some((option) => option.value === task.id)
    )
      related.add(new Option(task.id, task.id));
  }
  form.append(related);
  let disposed = false,
    busy = false,
    creation = null;
  const pending = new Set();
  const rendered = new WeakMap();
  const paint = (element, html) => {
    if (rendered.get(element) === html) return;
    element.innerHTML = html;
    rendered.set(element, html);
  };
  const active = () =>
    !disposed && form.isConnected && state.project?.id === project;
  const url = (taskId) => `/projects/${project}/tasks/${taskId}`;
  const own = () => ({
    type: new FormData(form).get("type"),
    parent: form.elements.parent.value || null,
    dependencies: [...form.elements.dependencies.selectedOptions].map(
      (option) => option.value,
    ),
    related_records: [...related.selectedOptions].map(
      (option) => option.value,
    ),
  });
  const tasks = () => {
    const list = state.tasks.map((task) =>
      task.id === id
        ? { ...task, ...own() }
        : staged.has(task.id)
          ? { ...task, ...staged.get(task.id) }
          : task,
    );
    if (draft)
      list.push({
        id,
        key: "New",
        title: form.elements.title?.value || "New card",
        status: form.elements.status?.value,
        priority: form.elements.priority?.value,
        assignee: form.elements.assignee?.value || "",
        ...own(),
      });
    return list;
  };
  function say(message = "", error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("form-error", error);
  }
  function problem(kind, target, remove = false) {
    try {
      relationshipChanges(tasks(), state.config, id, kind, target, remove);
      return "";
    } catch (error) {
      return error.message;
    }
  }
  const detail = (task) =>
    `${icon(task.type || "task")}<span class="task-relationship-key">${esc(task.key || task.id)}</span><span class="task-relationship-title">${esc(task.title || "Unavailable card")}</span>${task.title ? `<span class="task-relationship-metadata field-box" ${fieldBoxStyle(state, task.priority)}><span class="task-relationship-assignee" role="img" aria-label="Assignee: ${esc(task.assignee || "Unassigned")}" title="${esc(task.assignee || "Unassigned")}">${ctx.assigneeHTML(task)}</span><span class="field-chip field-chip-status task-relationship-status" ${taskColorAttributes(state, "status", task.status)} title="${esc(statusLabel(state.config, task.status))}" aria-label="Status: ${esc(statusLabel(state.config, task.status))}">${esc(statusLabel(state.config, task.status))}</span><span class="field-chip field-chip-priority task-relationship-priority" role="img" ${taskColorAttributes(state, "priority", task.priority)} title="${esc(priorityLabel(task.priority))}" aria-label="Priority: ${esc(priorityLabel(task.priority))}">${icon(`priority-${task.priority || "none"}`)}</span>${ctx.dueHTML(task) || `<span class="due no-date">${icon("calendar")}</span>`}</span>` : ""}`;
  const identity = task => `${icon(task.type || "task")}<span class="task-relationship-key">${esc(task.key || task.id)}</span><span class="task-relationship-title">${esc(task.title || "Unavailable card")}</span>`;
  function editableMetadata(task) {
    if (!task?.title) return "";
    const select = (field, options) => `<select data-relationship-field="${field}" data-relationship-target="${esc(task.id)}" aria-label="${field[0].toUpperCase() + field.slice(1)} for ${esc(task.title)}" ${busy || task.archived || sourceReadOnly(task, field) ? "disabled" : ""}>${options}</select>`;
    const option = (field, value, label) => `<option value="${esc(value)}" ${task[field] === value ? "selected" : ""}>${esc(label)}</option>`;
    return `<span class="task-relationship-metadata field-box" ${fieldBoxStyle(state, task.priority)}>
      <label class="task-relationship-assignee relationship-field-choice" title="${esc(task.assignee || "Unassigned")}">${ctx.assigneeHTML(task)}${select("assignee", assigneeOptions(state, task.assignee, esc))}</label>
      <label class="task-relationship-status relationship-field-choice" ${taskColorAttributes(state, "status", task.status)} title="${esc(statusLabel(state.config, task.status))}"><span class="field-chip field-chip-status">${esc(statusLabel(state.config, task.status))}</span>${select("status", nextStatuses(state.config, task.status).map(value => option("status", value, statusLabel(state.config, value))).join(""))}</label>
      <label class="task-relationship-priority relationship-field-choice" ${taskColorAttributes(state, "priority", task.priority)} title="${esc(priorityLabel(task.priority))}"><span class="field-chip field-chip-priority">${icon(`priority-${task.priority || "none"}`)}</span>${select("priority", priorityOptions.map(value => option("priority", value, priorityLabel(value))).join(""))}</label>
      ${ctx.dueHTML(task) || `<span class="due no-date">${icon("calendar")}</span>`}</span>`;
  }
  function refresh() {
    if (!active()) return;
    toggle.disabled = busy;
    type.disabled = busy;
    search.disabled = busy;
    for (const option of sortOptions) option.setAttribute("aria-selected", String(option.dataset.relationshipSort === sortField));
    direction.disabled = !sortField;
    direction.setAttribute("aria-pressed", String(sortDirection === -1));
    direction.title = sortDirection === -1 ? "Reverse order · click for default order" : "Default order · click to reverse";
    const list = tasks(),
      rows = taskRelationships(list, id);
    paint(
      host.querySelector("[data-relationship-list]"),
      kinds()
        .map(([kind, label]) => {
          const name = kind === "child" ? "Children" : label;
          const group = rows.filter((row) => row.kind === kind).sort((a, b) =>
            compareRelationshipTasks(list.find(t => t.id === a.target), list.find(t => t.id === b.target), sortField, sortDirection, state.config));
          return group.length
            ? `<div class="task-relationship-group"><div class="task-relationship-group-heading"><h4>${name}</h4>${kind === "parent" ? "" : `<button type="button" class="icon-button" data-relationship-group-add="${kind}" aria-label="Add to ${name}" title="Add to ${name}" aria-haspopup="dialog" aria-controls="${picker.id}" aria-expanded="${!picker.hidden && anchorKind === kind}" ${busy ? "disabled" : ""}>${icon("plus")}</button>`}</div>${group
                .map((row) => {
                  const task = list.find((task) => task.id === row.target);
                  const error = problem(kind, row.target, true);
                  return `<div class="task-relationship-row"><div class="task-relationship-link"><button type="button" class="task-relationship-identity" data-relationship-open="${esc(row.target)}" aria-label="Open ${esc(task?.key || row.target)}: ${esc(task?.title || "Unavailable card")}" title="${esc(task?.title || "Unavailable card")}" ${!task || busy ? "disabled" : ""}>${identity(task || { id: row.target })}</button>${editableMetadata(task)}</div><button type="button" class="icon-button" data-relationship-remove="${esc(row.target)}" data-relationship-kind="${kind}" aria-label="Remove ${label.toLowerCase()} ${esc(task?.key || row.target)}" title="${esc(error || "Remove relationship")}" ${error || busy ? "disabled" : ""}>${icon("close")}</button></div>`;
                })
                .join("")}</div>`
            : "";
        })
        .join("") || '<p class="field-hint">No relationships yet.</p>',
    );
    if (!picker.hidden) {
      const query = search.value.trim().toLowerCase();
      const selected = new Set(
        rows.filter((row) => row.kind === type.value).map((row) => row.target),
      );
      const matches = list.filter(
        (task) =>
          task.id !== id &&
          !task.archived &&
          !selected.has(task.id) &&
          `${task.key || ""} ${task.title}`.toLowerCase().includes(query),
      );
      const options =
        matches.sort((a, b) => compareRelationshipTasks(a, b, sortField, sortDirection, state.config))
          .slice(0, 40)
          .map((task) => {
            const error = problem(type.value, task.id);
            const priorParent =
              type.value === "child" &&
              list.find((parent) => parent.id === task.parent);
            const hint =
              error ||
              (priorParent
                ? `Move from ${priorParent.key || priorParent.title}`
                : "");
            return `<button type="button" class="task-relationship-option" data-relationship-add="${esc(task.id)}" ${error || busy ? "disabled" : ""}><span class="task-relationship-link">${detail(task)}${icon("plus")}</span>${hint ? `<small>${esc(hint)}</small>` : ""}</button>`;
          })
          .join("") || '<p class="field-hint">No matching cards.</p>';
      // With Child chosen, the typed title can also be a new card under this one (F0.22-23).
      const kidType = childType(state.config, own().type);
      const createHint = draft ? "Save this card first." : kidType ? "" : `Cards Hierarchies: ${own().type} cannot parent a card.`;
      const create = type.value === "child" && search.value.trim()
        ? `<button type="button" class="task-relationship-option" data-relationship-create ${createHint || busy ? "disabled" : ""}><span class="task-relationship-link">${icon(kidType || "task")}<span class="task-relationship-title">Create child “${esc(search.value.trim())}”</span>${icon("plus")}</span>${createHint ? `<small>${esc(createHint)}</small>` : ""}</button>`
        : "";
      paint(
        host.querySelector("[data-relationship-options]"),
        create + (create && !matches.length ? "" : options) +
          (matches.length > 40
            ? '<p class="field-hint">Keep typing to narrow the results.</p>'
            : ""),
      );
      positionPicker();
    }
    if (pending.size) {
      const entries = [...pending]
        .map((endpoint) => sync.entries.get(endpoint))
        .filter(Boolean);
      if (entries.length)
        say(
          entries.find((entry) => entry.error)?.error ||
            "Saving relationships…",
          entries.some((entry) => entry.error || entry.conflict),
        );
      else if (!busy) {
        pending.clear();
        say("Relationship saved.");
      }
    }
  }
  function open(kind = null) {
    anchorKind = kind;
    if (kind) type.value = kind;
    sortMenu.open = false;
    toggle.setAttribute("aria-expanded", String(!kind));
    picker.hidden = false;
    if (!picker.matches(":popover-open")) picker.showPopover();
    search.value = "";
    refresh();
    focusOnOpen(search, picker.querySelector("[data-relationship-close]"));
  }
  function close(focus = false) {
    const wasOpen = !picker.hidden;
    if (picker.matches(":popover-open")) picker.hidePopover();
    picker.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    // Repaint the groups' + so none still reads as open; outside clicks often find it closed already.
    if (wasOpen) refresh();
    if (focus) anchor().focus();
  }
  function writeFields(changes) {
    for (const [name, value] of Object.entries(changes)) {
      const input = form.elements[name];
      if (input.multiple) {
        const values = new Set(value);
        for (const item of values)
          if (![...input.options].some((option) => option.value === item))
            input.add(new Option(item, item));
        for (const option of input.options)
          option.selected = values.has(option.value);
      } else input.value = value || "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  host.addEventListener("change", async event => {
    const input = event.target.closest("[data-relationship-field]");
    if (!input) return;
    event.stopPropagation();
    const target = input.dataset.relationshipTarget, field = input.dataset.relationshipField;
    if (!active() || busy || input.disabled || !["assignee", "status", "priority"].includes(field)) return;
    const value = input.value, restore = document.activeElement === input;
    busy = true; input.disabled = true;
    try {
      await patchTask(target, { [field]: value }, false);
      const entry = sync.entries.get(url(target));
      if (entry?.error || entry?.conflict) say(entry.error || "Edit retained. Review this pending save in Recovery.", true);
      else say("");
      if (active()) changed(target);
    } catch (error) { if (active()) say(error.message, true); }
    finally {
      busy = false; refresh();
      if (active() && restore) {
        const next = host.querySelector(`[data-relationship-field="${field}"][data-relationship-target="${CSS.escape(target)}"]`);
        focusOnOpen(next, next?.closest("label"));
      }
    }
  });
  host.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    // Sorting only reorders the list, so it works while a link is being saved.
    if (button?.dataset.relationshipSort !== undefined) {
      if (button.dataset.relationshipSort === sortField) return;
      sortField = button.dataset.relationshipSort;
      sortDirection = 1;
      ctx.storage.set(preferenceKey, { field: sortField, direction: sortDirection });
      refresh();
      return;
    }
    if (!button || button.disabled || busy) return;
    if (button === direction) {
      sortDirection *= -1;
      ctx.storage.set(preferenceKey, { field: sortField, direction: sortDirection });
      refresh();
      return;
    }
    if (button === toggle || button.dataset.relationshipGroupAdd) {
      const kind = button.dataset.relationshipGroupAdd || null;
      if (!picker.hidden && anchorKind === kind) return close(true);
      return open(kind);
    }
    if (button.hasAttribute("data-relationship-close")) return close(true);
    const target =
      button.dataset.relationshipAdd || button.dataset.relationshipRemove;
    const remove = !!button.dataset.relationshipRemove;
    const kind = remove ? button.dataset.relationshipKind : type.value;
    // Focus returns to the removed row's group +, or the heading's when that group goes.
    if (remove) anchorKind = kind;
    busy = true;
    refresh();
    try {
      if (!(await flush()))
        throw Error(
          "Save the card's current changes before changing relationships.",
        );
      if (!active()) return;
      if (button.dataset.relationshipOpen) {
        taskDialog(button.dataset.relationshipOpen, {}, "follow");
        return;
      }
      if (button.hasAttribute("data-relationship-create")) {
        say("Creating child card…");
        // One request id per title, so a retry after a lost answer doesn't add a second card.
        const title = search.value.trim();
        if (creation?.title !== title) creation = { title, id: randomUUID() };
        const created = await api(`/projects/${project}/tasks`, {
          method: "POST",
          body: { title, type: childType(state.config, own().type), parent: id, creation_request: creation.id },
        });
        creation = null;
        if (!state.tasks.some((task) => task.id === created.id)) state.tasks.push(created);
        if (!active()) return;
        changed(created.id);
        say("Child card created.");
        close(true);
        return;
      }
      const patches = relationshipChanges(
        tasks(),
        state.config,
        id,
        kind,
        target,
        remove,
      );
      say("Saving relationship…");
      for (const patch of patches) {
        if (!active()) return;
        if (patch.id === id) {
          if (!draft) pending.add(url(patch.id));
          writeFields(patch.changes);
          if (!(await flush())) break;
        } else if (draft) {
          if (remove) staged.delete(patch.id);
          else staged.set(patch.id, { ...(staged.get(patch.id) || {}), ...patch.changes });
        } else {
          pending.add(url(patch.id));
          await patchTask(patch.id, patch.changes, false);
          if (active()) changed(patch.id);
          if (sync.entries.has(url(patch.id))) break;
        }
      }
      if (draft && active()) say(remove ? "" : "Saved with the card.");
      if (active()) {
        if (!remove) close(true);
        else anchor().focus();
        refresh();
      }
    } catch (error) {
      if (active()) say(error.message, true);
    } finally {
      busy = false;
      refresh();
      if (active())
        focusOnOpen(picker.hidden ? anchor() : search, picker.querySelector("[data-relationship-close]"));
    }
  });
  picker.addEventListener("input", (event) => {
    event.stopPropagation();
    if (event.target === search) refresh();
  });
  picker.addEventListener("change", (event) => {
    event.stopPropagation();
    if (event.target === type) refresh();
  });
  const keydown = (event) => {
    if (event.key === "Escape" && sortMenu.open) {
      event.preventDefault(); event.stopPropagation(); sortMenu.open = false; sortMenu.firstElementChild.focus(); return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && event.target.matches("[data-relationship-sort]")) {
      event.preventDefault();
      const options = [...sortOptions], index = options.indexOf(event.target);
      options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length].focus();
      return;
    }
    if (picker.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Enter" && event.target === search) {
      event.preventDefault();
      // Enter creates only a title no card has yet; Create child still makes a namesake.
      const typed = search.value.trim().toLowerCase();
      if (!event.isComposing && !tasks().some((task) => task.id !== id && task.title?.trim().toLowerCase() === typed))
        host.querySelector("[data-relationship-create]:not(:disabled)")?.click();
    }
  };
  host.addEventListener("keydown", keydown);
  const outside = (event) => {
    if (!picker.contains(event.target) && !event.target.closest?.("[data-relationship-toggle], [data-relationship-group-add]")) close();
    if (!sortMenu.contains(event.target)) sortMenu.open = false;
  };
  document.addEventListener("pointerdown", outside, true);
  form.addEventListener("change", refresh);
  refresh();
  return {
    refresh,
    // Apply the relationships staged on a new card once it has an id.
    async commit(createdId) {
      const swap = (value) => (value === id ? createdId : value);
      for (const [taskId, changes] of staged) {
        const mapped = Object.fromEntries(
          Object.entries(changes).map(([key, value]) => [key, Array.isArray(value) ? value.map(swap) : swap(value)]),
        );
        await patchTask(taskId, mapped, false);
        changed(taskId);
      }
      staged.clear();
    },
    destroy() {
      disposed = true;
      close();
      document.removeEventListener("pointerdown", outside, true);
      form.removeEventListener("change", refresh);
      window.removeEventListener("resize", positionPanels);
      window.visualViewport?.removeEventListener("resize", positionPanels);
      window.visualViewport?.removeEventListener("scroll", positionPanels);
      form.closest("dialog")?.removeEventListener("scroll", positionPanels, true);
    },
  };
}
