import { DEFAULT_TASK_TYPES } from "./task-types.js";
import { typeFieldHTML, typeChipsHTML } from "./project-settings.js";
import { focusOnOpen } from "./open-focus.js";

export function projectCreateHTML({ state, esc, icon, colorPicker, dialogHead }) {
  return `<dialog class="dialog project-create-dialog"><form id="project-form" data-edit="false" data-step="1" novalidate>
    ${dialogHead("New project")}
    <nav class="project-steps" aria-label="Project setup"><ol>${["Details", "Card types", "Workflow"].map((name, i) => `<li><button type="button" class="button" data-project-goto="${i + 1}" ${i ? "disabled" : 'aria-current="step"'}><span>${i + 1}</span> ${name}</button></li>`).join("")}</ol></nav>
    <div class="dialog-body"><div class="form-error hidden" role="alert"></div>
      <section data-project-step="1" class="project-create-details" aria-labelledby="project-step-1"><h3 id="project-step-1" tabindex="-1">Project details</h3>
        <div class="field-row"><label class="field">Project name<input name="title" placeholder="What are we working on?" maxlength="300" required autofocus></label><label class="field">Project key<input name="key" placeholder="e.g. WEB" pattern="[A-Za-z][A-Za-z0-9]{1,11}" maxlength="12"><span class="field-hint">Leave blank to generate a key, such as WEB in WEB-1.</span></label></div>
        <label class="field">Organisation<select name="organisation" required>${state.organisations.map(o => `<option value="${esc(o.id)}" ${o.id === state.organisation.id ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></label>
        <label class="field">Description<textarea name="body" rows="3" placeholder="What is this project for?"></textarea></label>
        <div class="field">Project colour${colorPicker({ label: "Project colour", value: "#66856f" })}</div>
      </section>
      <section data-project-step="2" aria-labelledby="project-step-2" hidden><h3 id="project-step-2" tabindex="-1">Card types & hierarchy</h3>${typeFieldHTML(DEFAULT_TASK_TYPES, { esc, icon }, "Choose the kinds of cards this project uses. You can change these later in Settings.")}</section>
      <section data-project-step="3" aria-labelledby="project-step-3" hidden><h3 id="project-step-3" tabindex="-1">Statuses & workflow</h3></section>
    </div>
    <div class="dialog-foot"><button type="button" class="button" data-action="dialog-close">Cancel</button><button type="button" class="button" data-project-back hidden>Back</button><button type="submit" class="button primary">Next ${icon("arrow")}</button></div>
  </form></dialog>`;
}

export function projectCreateSteps(form, { icon }) {
  let step = 1, visited = 1;
  const body = form.querySelector(".dialog-body"), error = form.querySelector(".form-error"), submit = form.querySelector('[type="submit"]');
  const fieldStep = el => Number(el.closest("[data-project-step]")?.dataset.projectStep || (el.closest(".hierarchy-editor") ? 2 : 3));
  function show(next, focus = true) {
    step = next;
    visited = Math.max(visited, step);
    form.dataset.step = step;
    for (const panel of form.querySelectorAll("[data-project-step]")) panel.hidden = Number(panel.dataset.projectStep) !== step;
    form.querySelector("[data-project-back]").hidden = step === 1;
    for (const button of form.querySelectorAll("[data-project-goto]")) {
      button.disabled = Number(button.dataset.projectGoto) > visited;
      if (Number(button.dataset.projectGoto) === step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    submit.innerHTML = `${step === 3 ? "Create project" : "Next"} ${icon("arrow")}`;
    body.scrollTop = 0;
    if (focus) focusOnOpen(form.querySelector(`#project-step-${step}`));
  }
  function fail(at, message, field) {
    show(at);
    error.textContent = message;
    error.classList.remove("hidden");
    for (let parent = field?.parentElement; parent && parent !== form; parent = parent.parentElement)
      if (parent.tagName === "DETAILS") parent.open = true;
    if (field) focusOnOpen(field, form.querySelector(`#project-step-${step}`));
    return false;
  }
  function valid(at) {
    const invalid = [...form.elements].find(el => fieldStep(el) === at && el.willValidate && !el.checkValidity());
    if (invalid) return fail(at, invalid.validationMessage, invalid);
    if (at === 1 && !form.elements.title.value.trim()) return fail(at, "Enter a project name.", form.elements.title);
    if (at === 2) {
      const types = form.elements.types.value.split(",").map(t => t.trim()).filter(Boolean);
      if (!types.length) return fail(at, "Choose at least one card type.", form.querySelector("[data-type-input]"));
      if (types.length > 40 || types.some(t => !/^[a-zA-Z0-9_-]+$/.test(t))) return fail(at, "Use up to 40 card types with letters, numbers, hyphens or underscores.", form.querySelector("[data-type-input]"));
    }
    if (at === 3 && !JSON.parse(form.elements.workflowSchema.value).done.length)
      return fail(at, "Choose at least one completed status.", form.querySelector("[data-status-completed]"));
    return true;
  }
  form.addEventListener("invalid", event => event.preventDefault(), true);
  form.addEventListener("click", event => {
    const button = event.target.closest("[data-project-back], [data-project-goto]");
    if (!button) return;
    const next = button.hasAttribute("data-project-back") ? step - 1 : Number(button.dataset.projectGoto);
    for (let at = step; at < next; at++) if (!valid(at)) return;
    error.classList.add("hidden");
    show(next);
  });
  form.addEventListener("submit", event => {
    const last = step === 3;
    error.classList.add("hidden");
    const okay = (last ? [1, 2, 3] : [step]).every(valid);
    if (!last || !okay) {
      event.preventDefault();
      event.stopPropagation();
      if (okay) show(step + 1);
    }
  });
  show(1, false);
  return () => {
    const types = JSON.parse(form.elements.workflowSchema.value).types;
    form.elements.types.value = types.join(", ");
    form.querySelector("[data-type-chips]").outerHTML = typeChipsHTML(types);
    show(1);
  };
}
