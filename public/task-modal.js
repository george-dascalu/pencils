import { canParent } from "./hierarchy-model.js";
import { nextStatuses, initialStatus } from "./workflow-model.js";
import { positionPopover } from "./popover-position.js";
export function taskPickerHTML(
  { name, title, value, choices, iconOnly },
  { esc, icon },
) {
  const chosen = choices.find((c) => c.value === value) || choices[0];
  return `<div class="task-picker ${iconOnly ? "icon-only" : ""}" data-task-picker="${name}">
    <select name="${name}" aria-label="${title}" hidden>${choices.map((c) => `<option value="${esc(c.value)}" data-icon="${esc(c.icon)}" ${c.value === value ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>
    <button type="button" class="task-picker-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${title}: ${esc(chosen.label)}" title="${title}: ${esc(chosen.label)}"><span data-picker-symbol>${icon(chosen.icon)}</span>${iconOnly ? "" : `<span data-picker-label>${esc(chosen.label)}</span>`}${icon("chevron")}</button>
    <div class="task-picker-popover selection-popover" hidden>${name === "parent" ? '<input type="search" placeholder="Find a parent task…" aria-label="Find a parent task">' : ""}<div role="listbox" aria-label="${title}">${choices.map((c) => `<button type="button" role="option" aria-selected="${c.value === chosen.value}" data-picker-value="${esc(c.value)}">${icon(c.icon)}<span>${esc(c.label)}</span>${icon("check")}</button>`).join("")}</div></div>
  </div>`;
}

export function taskModalControls(ctx, form, restoreVersion) {
  const {
    state,
    esc,
    icon,
    api,
    route,
    task,
    patchTask,
    renderView,
    closeDialog,
    taskDialog,
  } = ctx;
  const dialog = form.closest("dialog");
  let openPicker = null,
    disposed = false;
  const titleOf = (picker) =>
    picker.querySelector("select").getAttribute("aria-label");
  function closePicker(focus = false) {
    if (!openPicker) return;
    const trigger = openPicker.querySelector(".task-picker-trigger");
    openPicker.querySelector(".task-picker-popover").hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    openPicker = null;
    if (focus) trigger.focus();
  }
  function paintPickers() {
    const parentPicker = form.querySelector('[data-task-picker="parent"]');
    for (const button of parentPicker.querySelectorAll("[data-picker-value]")) {
      const parent = state.tasks.find(
        (t) => t.id === button.dataset.pickerValue,
      );
      button.disabled = !canParent(
        state.config,
        form.elements.type.value,
        parent?.type ?? null,
      );
    }
    const childSelect = form.elements.subtaskType,
      current = childSelect.value;
    const allowed = state.config.types.filter((t) =>
      canParent(state.config, t, form.elements.type.value),
    );
    childSelect.innerHTML = allowed
      .map((t) => `<option value="${esc(t)}">${esc(ctx.label(t))}</option>`)
      .join("");
    childSelect.value = allowed.includes(current)
      ? current
      : allowed.includes("task")
        ? "task"
        : allowed[0] || "";
    form.querySelector('[data-task-modal="subtask-add"]').disabled =
      !allowed.length;
    form.querySelector("[data-subtask-hint]").textContent = !allowed.length
      ? "This card type cannot have subtasks under the project hierarchy rules."
      : !form.dataset.id
        ? form.dataset.draftNode
          ? "Subtasks are created when you finalise this draft."
          : "Subtasks are created when you create this task."
        : "";
    for (const picker of form.querySelectorAll("[data-task-picker]")) {
      const select = picker.querySelector("select"),
        option = select.selectedOptions[0];
      if (!option) continue;
      const trigger = picker.querySelector(".task-picker-trigger");
      trigger.setAttribute(
        "aria-label",
        `${titleOf(picker)}: ${option.textContent}`,
      );
      trigger.title = `${titleOf(picker)}: ${option.textContent}`;
      picker.querySelector("[data-picker-symbol]").innerHTML = icon(
        option.dataset.icon,
      );
      const label = picker.querySelector("[data-picker-label]");
      if (label) label.textContent = option.textContent;
      for (const button of picker.querySelectorAll("[data-picker-value]"))
        button.setAttribute(
          "aria-selected",
          String(button.dataset.pickerValue === select.value),
        );
    }
  }
  function positionPicker() {
    if (!openPicker) return;
    const r = openPicker
        .querySelector(".task-picker-trigger")
        .getBoundingClientRect(),
      panel = openPicker.querySelector(".task-picker-popover"),
      bounds = dialog.getBoundingClientRect();
    positionPopover(panel,r,{width:openPicker.dataset.taskPicker === "parent"?360:220,maxHeight:300,bounds});
  }
  function showPicker(picker) {
    if (openPicker === picker) {
      closePicker();
      return;
    }
    closePicker();
    openPicker = picker;
    picker.querySelector(".task-picker-popover").hidden = false;
    picker
      .querySelector(".task-picker-trigger")
      .setAttribute("aria-expanded", "true");
    const search = picker.querySelector("input[type=search]");
    if (search) {
      search.value = "";
      filterParents(search);
    }
    positionPicker();
    (search || picker.querySelector("[aria-selected=true]"))?.focus();
  }
  function filterParents(input) {
    const needle = input.value.trim().toLowerCase();
    input
      .closest("[data-task-picker]")
      .querySelectorAll("[data-picker-value]")
      .forEach((button) => {
        button.hidden = !button.textContent.toLowerCase().includes(needle);
      });
  }
  const outside = (event) => {
    if (openPicker && !openPicker.contains(event.target)) closePicker();
  };
  dialog.addEventListener("pointerdown", outside, true);
  form.addEventListener("change", (event) => {
    if (event.target.closest("[data-task-picker]")) paintPickers();
  });
  form.addEventListener("input", (event) => {
    if (event.target.matches(".task-picker-popover input")) {
      event.stopPropagation();
      filterParents(event.target);
    }
  });
  form.addEventListener("click", async (event) => {
    const picker = event.target.closest("[data-task-picker]");
    if (picker) {
      if (event.target.closest(".task-picker-trigger")) showPicker(picker);
      const choice = event.target.closest("[data-picker-value]");
      if (choice) {
        const select = picker.querySelector("select");
        select.value = choice.dataset.pickerValue;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closePicker(true);
      }
    }
    const button = event.target.closest("[data-task-modal]");
    if (!button) return;
    const action = button.dataset.taskModal;
    if (action === "history-close") {
      hideHistory();
      return;
    }
    if (action === "history-retry") {
      await history();
      return;
    }
    if (action === "subtask-remove-draft") {
      const drafts = JSON.parse(form.elements.pendingSubtasks.value);
      drafts.splice(Number(button.dataset.index), 1);
      form.elements.pendingSubtasks.value = JSON.stringify(drafts);
      form.elements.pendingSubtasks.dispatchEvent(
        new Event("input", { bubbles: true }),
      );
      subtasks();
      return;
    }
    if (action === "subtask-open") {
      closeDialog();
      if (!state.dialog) taskDialog(button.dataset.id);
      return;
    }
    if (action === "subtask-add") {
      await addSubtask();
      return;
    }
    if (action === "history-restore") {
      button.disabled = true;
      try {
        await restoreVersion(button.dataset.version);
      } catch (error) {
        if (!disposed)
          form.querySelector("[data-history-error]").textContent =
            error.message;
      } finally {
        button.disabled = false;
      }
    }
  });
  form.addEventListener("keydown", (event) => {
    if (event.target.name === "subtaskTitle" && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      addSubtask();
      return;
    }
    const picker = event.target.closest("[data-task-picker]");
    if (
      event.key === "Escape" &&
      (openPicker || !form.querySelector(".task-history-panel").hidden)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (openPicker) closePicker(true);
      else hideHistory();
      return;
    }
    if (!picker) return;
    if (event.key === "Tab") {
      closePicker();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (!openPicker) {
      event.preventDefault();
      showPicker(picker);
      return;
    }
    if (
      event.target.matches("input") &&
      !["ArrowDown", "ArrowUp"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const choices = [...picker.querySelectorAll("[data-picker-value]")].filter(
      (el) => !el.hidden && !el.disabled,
    );
    if (!choices.length) return;
    const index = choices.indexOf(document.activeElement);
    choices[
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? choices.length - 1
          : (index + (event.key === "ArrowUp" ? -1 : 1) + choices.length) %
            choices.length
    ].focus();
  });
  window.addEventListener("resize", positionPicker);
  dialog.addEventListener("scroll", positionPicker, true);

  function subtasks() {
    const drafts = JSON.parse(form.elements.pendingSubtasks.value || "[]");
    const children = state.tasks.filter(
      (t) => t.parent === form.dataset.id && !t.archived,
    );
    form.querySelector("[data-subtask-count]").textContent =
      `(${children.length + drafts.length})`;
    form.querySelector("[data-subtask-list]").innerHTML =
      children
        .map(
          (t) =>
            `<div class="task-subtask-row">${icon(t.type)}<button type="button" class="text-link subtask-title" data-task-modal="subtask-open" data-id="${esc(t.id)}"><small>${esc(t.key || t.id)}</small><span>${esc(t.title)}</span></button><select aria-label="Status for ${esc(t.title)}" data-subtask-status="${esc(t.id)}">${nextStatuses(
              state.config,
              t.status,
            )
              .map(
                (s) =>
                  `<option value="${esc(s)}" ${s === t.status ? "selected" : ""}>${esc(ctx.statusNames[s] || ctx.label(s))}</option>`,
              )
              .join("")}</select></div>`,
        )
        .join("") +
        drafts
          .map(
            (t, index) =>
              `<div class="task-subtask-row">${icon(t.type)}<span class="subtask-title"><small>${esc(t.type)} · Draft</small><span>${esc(t.title)}</span></span><button type="button" class="icon-button" aria-label="Remove draft ${esc(t.title)}" data-task-modal="subtask-remove-draft" data-index="${index}">${icon("trash")}</button></div>`,
          )
          .join("") || '<p class="field-hint">No subtasks yet.</p>';
  }
  async function addSubtask() {
    const input = form.elements.subtaskTitle,
      button = form.querySelector("[data-task-modal=subtask-add]");
    const title = input?.value.trim();
    if (!title || button.disabled) {
      input?.focus();
      return;
    }
    if (!form.dataset.id) {
      const drafts = JSON.parse(form.elements.pendingSubtasks.value || "[]");
      drafts.push({ title, type: form.elements.subtaskType.value });
      form.elements.pendingSubtasks.value = JSON.stringify(drafts);
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      subtasks();
      input.focus();
      return;
    }
    button.disabled = true;
    const errorBox = form.querySelector("[data-subtask-error]");
    errorBox.hidden = true;
    try {
      const child = await api(route("tasks"), {
        method: "POST",
        body: {
          title,
          parent: form.dataset.id,
          type: form.elements.subtaskType.value,
          status: initialStatus(state.config),
        },
      });
      if (!state.tasks.some((t) => t.id === child.id)) state.tasks.push(child);
      if (disposed) return;
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      subtasks();
      renderView();
      input.focus();
    } catch (error) {
      if (!disposed) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      }
    } finally {
      button.disabled = false;
    }
  }
  form.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-subtask-status]");
    if (!select) return;
    event.stopPropagation();
    select.disabled = true;
    try {
      await patchTask(
        select.dataset.subtaskStatus,
        { status: select.value },
        false,
      );
      subtasks();
      renderView();
    } catch (error) {
      ctx.toast(error.message, true);
      select.value = task(select.dataset.subtaskStatus)?.status || select.value;
    } finally {
      select.disabled = false;
    }
  });
  function hideHistory() {
    form.querySelector(".task-history-panel").hidden = true;
    dialog.classList.remove("with-task-history");
    const button = form.querySelector("[data-feature=task-history]");
    button?.setAttribute("aria-expanded", "false");
    button?.focus();
  }
  async function history() {
    const target = task(form.dataset.id);
    if (!target) return;
    const panel = form.querySelector(".task-history-panel");
    panel.hidden = false;
    dialog.classList.add("with-task-history");
    form
      .querySelector("[data-feature=task-history]")
      .setAttribute("aria-expanded", "true");
    panel.innerHTML = `<div class="task-history-head"><h3>Version history</h3><button type="button" class="icon-button" data-task-modal="history-close" aria-label="Close version history">${icon("close")}</button></div><div data-history-content aria-live="polite">Loading history…</div><p data-history-error class="form-error" role="alert"></p>`;
    panel.querySelector("[data-task-modal=history-close]").focus();
    try {
      const data = await api(
        `/history?file=${encodeURIComponent(target.file)}`,
      );
      if (disposed || !panel.isConnected) return;
      panel.querySelector("[data-history-content]").innerHTML =
        data.versions
          .map(
            (v) =>
              `<details class="recovery-item"><summary><strong>${esc(new Date(v.updated).toLocaleString())}</strong><span>${esc(v.title)}</span></summary><p class="field-hint">${esc(ctx.label(v.data?.type || "task"))} · ${esc(v.data?.status || "")}</p><pre>${esc(v.body)}</pre><button type="button" class="button small" data-task-modal="history-restore" data-version="${esc(v.revision)}">Restore this version</button></details>`,
          )
          .join("") || "<p>No earlier versions yet.</p>";
    } catch (error) {
      if (!disposed)
        panel.querySelector("[data-history-content]").innerHTML =
          `<p>${esc(error.message)}</p><button type="button" class="button small" data-task-modal="history-retry">Retry</button>`;
    }
  }
  paintPickers();
  subtasks();
  return {
    history,
    hideHistory,
    refreshStatuses() {
      const saved = task(form.dataset.id),
        select = form.elements.status;
      if (!saved || select.value !== saved.status) return;
      select.innerHTML = nextStatuses(state.config, saved.status)
        .map(
          (s) =>
            `<option value="${esc(s)}" ${s === saved.status ? "selected" : ""}>${esc(ctx.statusNames[s] || ctx.label(s))}</option>`,
        )
        .join("");
    },
    reload() {
      paintPickers();
      subtasks();
    },
    destroy() {
      disposed = true;
      closePicker();
      window.removeEventListener("resize", positionPicker);
      dialog.removeEventListener("scroll", positionPicker, true);
      dialog.removeEventListener("pointerdown", outside, true);
    },
  };
}
