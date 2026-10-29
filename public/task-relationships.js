import {
  relationshipTypes,
  taskRelationships,
  relationshipChanges,
  compareRelationshipTasks,
} from "./task-relationship-model.js";
import { priorityLabel } from "./task-priority.js";
import { taskColorAttributes, fieldBoxStyle } from "./task-colors.js";
import { statusLabel } from "./workflow-model.js";
import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from "./open-focus.js";

export function taskRelationshipsEditor(ctx, form, { flush, changed }) {
  const { state, esc, icon, sync, patchTask, taskDialog } = ctx;
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
      <div class="task-relationship-controls"><select aria-label="Relationship type">${relationshipTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select><input type="search" aria-label="Find a task to link" placeholder="Find by ID or title…"><button type="button" class="icon-button" data-relationship-close aria-label="Close relationship picker">${icon("close")}</button></div>
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
  const positionPicker = () => {
    if (!picker.hidden) positionPopover(picker, toggle.getBoundingClientRect(), {
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
    `${icon(task.type || "task")}<span class="task-relationship-key">${esc(task.key || task.id)}</span><span class="task-relationship-title">${esc(task.title || "Unavailable task")}</span>${task.title ? `<span class="task-relationship-metadata field-box" ${fieldBoxStyle(state, task.priority)}><span class="task-relationship-assignee" role="img" aria-label="Assignee: ${esc(task.assignee || "Unassigned")}" title="${esc(task.assignee || "Unassigned")}">${ctx.assigneeHTML(task)}</span><span class="field-chip field-chip-status task-relationship-status" ${taskColorAttributes(state, "status", task.status)} title="${esc(statusLabel(state.config, task.status))}" aria-label="Status: ${esc(statusLabel(state.config, task.status))}">${esc(statusLabel(state.config, task.status))}</span><span class="field-chip field-chip-priority task-relationship-priority" role="img" ${taskColorAttributes(state, "priority", task.priority)} title="${esc(priorityLabel(task.priority))}" aria-label="Priority: ${esc(priorityLabel(task.priority))}">${icon(`priority-${task.priority || "none"}`)}</span></span>` : ""}`;
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
      relationshipTypes
        .map(([kind, label]) => {
          const group = rows.filter((row) => row.kind === kind).sort((a, b) =>
            compareRelationshipTasks(list.find(t => t.id === a.target), list.find(t => t.id === b.target), sortField, sortDirection, state.config));
          return group.length
            ? `<div class="task-relationship-group"><h4>${kind === "child" ? "Children" : label}</h4>${group
                .map((row) => {
                  const task = list.find((task) => task.id === row.target);
                  const error = problem(kind, row.target, true);
                  return `<div class="task-relationship-row"><button type="button" class="task-relationship-link" data-relationship-open="${esc(row.target)}" title="${esc(task?.title || "Unavailable task")}" ${!task || busy ? "disabled" : ""}>${detail(task || { id: row.target })}</button><button type="button" class="icon-button" data-relationship-remove="${esc(row.target)}" data-relationship-kind="${kind}" aria-label="Remove ${label.toLowerCase()} ${esc(task?.key || row.target)}" title="${esc(error || "Remove relationship")}" ${error || busy ? "disabled" : ""}>${icon("close")}</button></div>`;
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
  function close(focus = false) {
    if (picker.matches(":popover-open")) picker.hidePopover();
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
    if (button === toggle) {
      if (!picker.hidden) return close(true);
      sortMenu.open = false;
      picker.hidden = false;
      picker.showPopover();
      toggle.setAttribute("aria-expanded", "true");
      search.value = "";
      refresh();
      focusOnOpen(search, picker.querySelector("[data-relationship-close]"));
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
        else toggle.focus();
        refresh();
      }
    } catch (error) {
      if (active()) say(error.message, true);
    } finally {
      busy = false;
      refresh();
      if (active())
        focusOnOpen(picker.hidden ? toggle : search, picker.querySelector("[data-relationship-close]"));
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
    } else if (event.key === "Enter" && event.target === search)
      event.preventDefault();
  };
  host.addEventListener("keydown", keydown);
  const outside = (event) => {
    if (!picker.contains(event.target) && !toggle.contains(event.target)) close();
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
