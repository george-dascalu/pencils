import { nextStatuses } from "./workflow-model.js";
import { positionPopover } from "./popover-position.js";
import { taskColorAttributes, refreshTaskControlColors } from "./task-colors.js";
export function taskPickerHTML(
  { name, title, value, choices, iconOnly },
  { esc, icon, state },
) {
  const chosen = choices.find((c) => c.value === value) || choices[0];
  return `<div class="task-picker ${iconOnly ? "icon-only" : ""}" data-task-picker="${name}" ${taskColorAttributes(state, name, value)}>
    <select name="${name}" aria-label="${title}" hidden>${choices.map((c) => `<option value="${esc(c.value)}" data-icon="${esc(c.icon)}" ${c.value === value ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>
    <button type="button" class="task-picker-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${title}: ${esc(chosen.label)}" title="${title}: ${esc(chosen.label)}"><span data-picker-symbol>${icon(chosen.icon)}</span>${iconOnly ? "" : `<span data-picker-label>${esc(chosen.label)}</span>`}${icon("chevron")}</button>
    <div class="task-picker-popover selection-popover" hidden>${name === "parent" ? '<input type="search" placeholder="Find a parent task…" aria-label="Find a parent task">' : ""}<div role="listbox" aria-label="${title}">${choices.map((c) => `<button type="button" role="option" aria-selected="${c.value === chosen.value}" data-picker-value="${esc(c.value)}" ${taskColorAttributes(state, name, c.value)}>${icon(c.icon)}<span>${esc(c.label)}</span>${icon("check")}</button>`).join("")}</div></div>
  </div>`;
}

export function taskModalControls(ctx, form, restoreVersion) {
  const {
    state,
    esc,
    icon,
    api,
    task,
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
    refreshTaskControlColors(form, state);
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
