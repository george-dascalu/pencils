import {sourceLabel} from "./source-model.js";
import { dependencyCycle } from "./dependency-model.js";
import { statusLabel } from "./workflow-model.js";

export function taskDependencies(ctx, form, current) {
  const { state, esc, icon } = ctx;
  const host = document.createElement("section");
  host.className = "task-dependencies";
  host.setAttribute("aria-label", "Task dependencies");
  host.innerHTML = `<h3>Dependencies</h3><button type="button" class="button small" data-feature="schedule-preview">Review schedule</button><p class="field-hint">Blocked by — these tasks must finish first.</p><select name="dependencies" multiple hidden aria-label="Prerequisite tasks">${state.tasks
    .filter((task) => task.id !== current.id)
    .map(
      (task) =>
        `<option value="${esc(task.id)}" ${(current.dependencies || []).includes(task.id) ? "selected" : ""}>${esc(task.title)}</option>`,
    )
    .join(
      "",
    )}</select><div data-prerequisites></div><details class="dependency-picker"><summary>Add prerequisite</summary><input type="search" aria-label="Search prerequisites" placeholder="Search by task ID or title…"><div data-dependency-options></div></details><div data-dependants></div>`;
  form.querySelector(".task-parent-field").after(host);
  const select = host.querySelector("select");
  const search = host.querySelector("input");
  const selected = () =>
    new Set([...select.selectedOptions].map((option) => option.value));
  const detail = (task) =>
    `${icon(task.type)}<span class="dependency-task-name"><small>${esc(task.key || task.id)}</small><span>${esc(task.title)}</span></span><small class="dependency-status">${esc(statusLabel(state.config, task.status))} · ${esc(sourceLabel(task))}</small>`;
  function paint() {
    const ids = selected();
    host.querySelector("[data-prerequisites]").innerHTML =
      state.tasks
        .filter((task) => ids.has(task.id))
        .map(
          (task) =>
            `<div class="dependency-row">${detail(task)}<button type="button" class="icon-button" data-dependency-remove="${esc(task.id)}" aria-label="Remove prerequisite ${esc(task.key || task.title)}" title="Remove prerequisite">${icon("close")}</button></div>`,
        )
        .join("") || '<p class="field-hint">No prerequisites.</p>';
    const query = search.value.trim().toLowerCase();
    const options = state.tasks.filter(
      (task) =>
        task.id !== current.id &&
        !task.archived &&
        !ids.has(task.id) &&
        `${task.key || ""} ${task.title}`.toLowerCase().includes(query),
    );
    host.querySelector("[data-dependency-options]").innerHTML =
      options
        .slice(0, 50)
        .map((task) => {
          const cycle =
            current.id && dependencyCycle(state.tasks, current.id, task.id);
          return `<button type="button" class="dependency-row" data-dependency-add="${esc(task.id)}" ${cycle ? 'disabled title="Would create a dependency cycle"' : ""}>${detail(task)}${icon("plus")}${cycle ? "<small>Would create a cycle</small>" : ""}</button>`;
        })
        .join("") || '<p class="field-hint">No matching tasks.</p>';
    if (options.length > 50)
      host
        .querySelector("[data-dependency-options]")
        .insertAdjacentHTML(
          "beforeend",
          '<p class="field-hint">Search to narrow the results.</p>',
        );
    const dependants = state.tasks.filter((task) =>
      (task.dependencies || []).includes(current.id),
    );
    host.querySelector("[data-dependants]").innerHTML = dependants.length
      ? `<p class="field-hint">Blocks — these tasks are waiting for this task.</p>${dependants.map((task) => `<div class="dependency-row">${detail(task)}</div>`).join("")}`
      : "";
  }
  search.addEventListener("input", (event) => {
    event.stopPropagation();
    paint();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  host.addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-dependency-add],[data-dependency-remove]",
    );
    if (!button || button.disabled) return;
    const id = button.dataset.dependencyAdd || button.dataset.dependencyRemove;
    const option = [...select.options].find((option) => option.value === id);
    if (!option) return;
    option.selected = !!button.dataset.dependencyAdd;
    paint();
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (button.dataset.dependencyAdd) search.focus();
    else host.querySelector("summary").focus();
  });
  paint();
  return { refresh: paint };
}
