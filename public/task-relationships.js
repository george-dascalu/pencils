import {
  relationshipTypes,
  taskRelationships,
  relationshipChanges,
  compareRelationshipTasks,
} from "./task-relationship-model.js";
import { priorityLabel } from "./task-priority.js";
import { taskColorAttributes } from "./task-colors.js";
import { statusLabel } from "./workflow-model.js";

export function taskRelationshipsEditor(ctx, form, { flush, changed }) {
  const { state, esc, icon, sync, patchTask, taskDialog } = ctx;
  const id = form.dataset.id,
    project = state.project.id;
  const preferenceKey = `relationship-sort:${project}`;
  const preference = ctx.storage.get(preferenceKey, {});
  let sortField = ["assignee", "priority", "status"].includes(preference.field) ? preference.field : "";
  let sortDirection = preference.direction === -1 ? -1 : 1;
  const host = document.createElement("section");
  host.className = "task-relationships";
  host.setAttribute("aria-label", "Relationships");
  host.innerHTML = `<div class="task-relationships-heading"><h3>Relationships</h3><div class="task-relationship-sort"><select aria-label="Sort relationships" data-relationship-sort><option value="">Relationship order</option><option value="assignee">Assignee</option><option value="priority">Priority</option><option value="status">Status</option></select><button type="button" class="icon-button" data-relationship-sort-direction aria-label="Reverse relationship sort">${icon("sort")}</button></div><button type="button" class="button small" data-relationship-toggle aria-expanded="false">${icon("plus")}Add relationship</button></div>
    <div data-relationship-list></div>
    <div class="task-relationship-picker" data-relationship-picker hidden>
      <div class="task-relationship-controls"><label class="field">Relationship<select aria-label="Relationship type">${relationshipTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><button type="button" class="icon-button" data-relationship-close aria-label="Close relationship picker">${icon("close")}</button></div>
      <input type="search" aria-label="Find a task to link" placeholder="Find a task by ID or title…">
      <div class="task-relationship-options" data-relationship-options></div>
    </div><p class="field-hint" data-relationship-status role="status" hidden></p>`;
  form.querySelector(".task-description").after(host);
  const picker = host.querySelector("[data-relationship-picker]");
  const type = picker.querySelector("select"),
    search = picker.querySelector("input");
  const toggle = host.querySelector("[data-relationship-toggle]");
  const sort = host.querySelector("[data-relationship-sort]");
  sort.value = sortField;
  const direction = host.querySelector("[data-relationship-sort-direction]");
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
    busy = false;
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
  const tasks = () =>
    state.tasks.map((task) =>
      task.id !== id
        ? task
        : {
            ...task,
            type: new FormData(form).get("type"),
            parent: form.elements.parent.value || null,
            dependencies: [...form.elements.dependencies.selectedOptions].map(
              (option) => option.value,
            ),
            related_records: [...related.selectedOptions].map(
              (option) => option.value,
            ),
          },
    );
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
    `${icon(task.type || "task")}<span class="task-relationship-key">${esc(task.key || task.id)}</span><span class="task-relationship-title">${esc(task.title || "Unavailable task")}</span>${task.title ? `<span class="task-relationship-metadata"><span class="task-relationship-assignee" title="${esc(task.assignee || "Unassigned")}">${ctx.assigneeHTML(task)}<span>${esc(task.assignee || "Unassigned")}</span></span><span class="task-color-badge task-relationship-priority" role="img" ${taskColorAttributes(state, "priority", task.priority)} title="${esc(priorityLabel(task.priority))}" aria-label="Priority: ${esc(priorityLabel(task.priority))}">${icon(`priority-${task.priority || "none"}`)}</span><span class="task-color-badge task-relationship-status" ${taskColorAttributes(state, "status", task.status)} title="${esc(statusLabel(state.config, task.status))}" aria-label="Status: ${esc(statusLabel(state.config, task.status))}">${esc(statusLabel(state.config, task.status))}</span></span>` : ""}`;
  function refresh() {
    if (!active()) return;
    toggle.disabled = busy;
    type.disabled = busy;
    search.disabled = busy;
    direction.disabled = !sortField;
    direction.setAttribute("aria-pressed", String(sortDirection === -1));
    direction.title = sortDirection === -1 ? "Reverse order · click for default order" : "Default order · click to reverse";
    const list = tasks(),
      rows = taskRelationships(list, id);
    paint(
      host.querySelector("[data-relationship-list]"),
      relationshipTypes
        .map(([kind, label]) => {
          const group = rows.filter((row) => row.kind === kind).sort((a, b) =>
            compareRelationshipTasks(list.find(t => t.id === a.target), list.find(t => t.id === b.target), sortField, sortDirection, state.config));
          return group.length
            ? `<div class="task-relationship-group"><h4>${kind === "child" ? "Children" : label}</h4>${group
                .map((row) => {
                  const task = list.find((task) => task.id === row.target);
                  const error = problem(kind, row.target, true);
                  return `<div class="task-relationship-row"><button type="button" class="task-relationship-link" data-relationship-open="${esc(row.target)}" ${!task || busy ? "disabled" : ""}>${detail(task || { id: row.target })}</button><button type="button" class="icon-button" data-relationship-remove="${esc(row.target)}" data-relationship-kind="${kind}" aria-label="Remove ${label.toLowerCase()} ${esc(task?.key || row.target)}" title="${esc(error || "Remove relationship")}" ${error || busy ? "disabled" : ""}>${icon("close")}</button></div>`;
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
          .join("") || '<p class="field-hint">No matching tasks.</p>';
      paint(
        host.querySelector("[data-relationship-options]"),
        options +
          (matches.length > 40
            ? '<p class="field-hint">Keep typing to narrow the results.</p>'
            : ""),
      );
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
  function close(focus = false) {
    picker.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (focus) toggle.focus();
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
  host.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || busy) return;
    if (button === direction) {
      sortDirection *= -1;
      ctx.storage.set(preferenceKey, { field: sortField, direction: sortDirection });
      refresh();
      return;
    }
    if (button === toggle) {
      if (!picker.hidden) return close(true);
      picker.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      search.value = "";
      refresh();
      search.focus();
      return;
    }
    if (button.hasAttribute("data-relationship-close")) return close(true);
    const target =
      button.dataset.relationshipAdd || button.dataset.relationshipRemove;
    const remove = !!button.dataset.relationshipRemove;
    const kind = remove ? button.dataset.relationshipKind : type.value;
    busy = true;
    refresh();
    try {
      if (!(await flush()))
        throw Error(
          "Save the task's current changes before changing relationships.",
        );
      if (!active()) return;
      if (button.dataset.relationshipOpen) {
        taskDialog(button.dataset.relationshipOpen);
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
        pending.add(url(patch.id));
        if (patch.id === id) {
          writeFields(patch.changes);
          if (!(await flush())) break;
        } else {
          await patchTask(patch.id, patch.changes, false);
          if (active()) changed(patch.id);
          if (sync.entries.has(url(patch.id))) break;
        }
      }
      if (active()) {
        if (!remove) close(true);
        else toggle.focus();
        refresh();
      }
    } catch (error) {
      if (active()) say(error.message, true);
    } finally {
      busy = false;
      refresh();
      if (active())
        (picker.hidden ? toggle : search).focus({ preventScroll: true });
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
  sort.addEventListener("change", event => {
    event.stopPropagation();
    sortField = sort.value;
    sortDirection = 1;
    ctx.storage.set(preferenceKey, { field: sortField, direction: sortDirection });
    refresh();
  });
  const keydown = (event) => {
    if (picker.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Enter" && event.target === search)
      event.preventDefault();
  };
  host.addEventListener("keydown", keydown);
  const outside = (event) => {
    if (!host.contains(event.target)) close();
  };
  document.addEventListener("pointerdown", outside, true);
  form.addEventListener("change", refresh);
  refresh();
  return {
    refresh,
    destroy() {
      disposed = true;
      document.removeEventListener("pointerdown", outside, true);
      form.removeEventListener("change", refresh);
    },
  };
}
