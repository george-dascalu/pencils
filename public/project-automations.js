import { priorityOptions, priorityLabel, defaultPriority } from "./task-priority.js";
import { randomUUID } from "./uuid.js";
import { projectPeople } from "./teams.js";
import { statusLabel } from "./workflow-model.js";
export function projectAutomations(ctx) {
  const {
    api,
    route,
    esc,
    showDialog: modal,
    dialogHead,
    toast,
    state,
    refresh,
  } = ctx;
  const showDialog = (html, kind) =>
    ctx.settingsCurrent?.() && ["automations", "automation-edit"].includes(kind)
      ? ctx.presentSettings(html, kind)
      : modal(html, kind);
  let rules = [],
    project;
  const button = (action, title, id = "") =>
    `<button type="button" class="button small" data-automation="${action}" data-id="${esc(id)}">${title}</button>`;
  async function open(detail = "", valid = () => true) {
    project = state.project.id;
    const data = await api(route("automations"));
    if (!valid()) return;
    rules = data.rules;
    if (detail) {
      if (detail !== "new" && !rules.some((r) => r.id === detail))
        throw new Error("This rule no longer exists.");
      add(detail === "new" ? undefined : detail);
      return;
    }
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Project automation")}<div class="dialog-body"><p>Rules run once per trigger. Actions do not trigger more rules. Source-owned fields are skipped. Due-date rules use the server's UTC date and run each minute; matching tasks are changed only when the requested value differs.</p>${rules.map((r) => `<article class="source-card"><h3>${esc(r.name)}</h3><p>${esc(r.trigger)} → ${esc(r.field)} = ${esc(r.value)} · ${r.enabled ? "Enabled" : "Disabled"}</p>${button("edit", "Edit rule", r.id)}${button("preview", "Preview run", r.id)}${button("toggle", r.enabled ? "Disable" : "Enable", r.id)}${button("remove", "Remove", r.id)}</article>`).join("") || "<p>No automation rules.</p>"}${button("add", "Add rule")}<details><summary>Run history (${data.logs.length})</summary>${data.logs.map((l) => `<p>${esc(l.name)} · ${esc(l.at)} · ${l.changed} changes · ${l.errors.length} errors</p>${l.errors.map((e) => `<p>${esc(e.task)}: ${esc(e.error)}</p>`).join("")}`).join("")}</details></div></dialog>`,
      "automations",
    );
  }
  function add(id) {
    const existing = rules.find((r) => r.id === id);
    showDialog(
      `<dialog class="dialog"><form id="automation-form">${dialogHead(existing ? "Edit automation" : "Add automation")}<div class="dialog-body"><label class="field">Name<input name="name" required maxlength="100"></label><label class="field">Trigger<select name="trigger"><option value="manual">Manual</option><option value="status">Status changes</option><option value="due">Due today or overdue</option></select></label><label class="field">From status<select name="from"><option value="">Any</option>${state.config.statuses.map((s) => `<option value="${esc(s)}">${esc(statusLabel(state.config, s))}</option>`).join("")}</select></label><label class="field">To status<select name="to"><option value="">Any</option>${state.config.statuses.map((s) => `<option value="${esc(s)}">${esc(statusLabel(state.config, s))}</option>`).join("")}</select></label><label class="field">Action<select name="field"><option value="priority">Set priority</option><option value="status">Set status</option><option value="assignee">Assign person</option><option value="tag">Add tag</option></select></label><label class="field" data-automation-value>Value<input name="value" required maxlength="100"></label><p>New and edited rules are saved disabled. Preview the affected tasks before enabling a rule.</p><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="submit" class="button primary">Save disabled rule</button></div></form></dialog>`,
      "automation-edit",
    );
    const form = document.querySelector("#automation-form");
    if (existing)
      for (const key of ["name", "trigger", "from", "to", "field"])
        if (form.elements[key]) form.elements[key].value = existing[key] || "";
    function controls(value = "") {
      for (const key of ["from", "to"]) {
        const input = form.elements[key];
        input.closest("label").hidden =
          form.elements.trigger.value !== "status";
        input.disabled = form.elements.trigger.value !== "status";
      }
      const field = form.elements.field.value;
      const choices =
        field === "priority"
          ? priorityOptions.map((v) => [
              v,
              priorityLabel(v),
            ])
          : field === "status"
            ? state.config.statuses.map((v) => [
                v,
                statusLabel(state.config, v),
              ])
            : field === "assignee"
              ? [
                  ["", "Unassigned"],
                  ...projectPeople(state).map((p) => [p.name, p.name]),
                ]
              : null;
      form.querySelector("[data-automation-value]").innerHTML =
        `${field === "priority" ? "Priority" : field === "status" ? "Status" : field === "assignee" ? "Assignee" : "Tag"}${choices ? `<select name="value">${choices.map(([v, label]) => `<option value="${esc(v)}" ${v === (value || (field === "priority" ? defaultPriority : "")) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>` : `<input name="value" value="${esc(value)}" required maxlength="100">`}`;
    }
    controls(existing?.value || "");
    form.elements.trigger.addEventListener("change", () =>
      controls(form.elements.value.value),
    );
    form.elements.field.addEventListener("change", () => controls());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const submit = form.querySelector(
        '[type="submit"], .dialog-foot button:last-child',
      );
      if (submit.disabled) return;
      submit.disabled = true;
      state.settingsSaving = !!ctx.settingsCurrent?.();
      try {
        const r = {
          ...Object.fromEntries(new FormData(form)),
          id: existing?.id || randomUUID(),
          enabled: false,
        };
        await api(`/projects/${project}/automations`, {
          method: "POST",
          body: {
            rules: existing
              ? rules.map((rule) => (rule.id === existing.id ? r : rule))
              : [...rules, r],
          },
        });
        ctx.settingsSaved?.();
        if (ctx.settingsCurrent?.()) ctx.openSettings("", { force: true });
        else await open();
      } catch (error) {
        form.querySelector(".form-error").textContent = error.message;
      } finally {
        state.settingsSaving = false;
        submit.disabled = false;
      }
    });
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-automation]");
    if (!b) return;
    e.preventDefault();
    try {
      if (b.dataset.automation === "open")
        return ctx.openSettings ? ctx.openSettings() : await open();
      if (["add", "edit"].includes(b.dataset.automation))
        return ctx.openSettings
          ? ctx.openSettings(b.dataset.id || "new")
          : add(b.dataset.id);
      const r = rules.find((r) => r.id === b.dataset.id);
      if (!r) return;
      b.disabled = true;
      state.settingsSaving = !!ctx.settingsCurrent?.();
      if (["toggle", "remove"].includes(b.dataset.automation)) {
        await api(`/projects/${project}/automations`, {
          method: "POST",
          body: {
            rules:
              b.dataset.automation === "remove"
                ? rules.filter((x) => x !== r)
                : rules.map((x) =>
                    x === r ? { ...x, enabled: !x.enabled } : x,
                  ),
          },
        });
        return await open();
      }
      if (b.dataset.automation === "preview") {
        const data = await api(`/projects/${project}/automations/${r.id}`, {
          method: "POST",
          body: { preview: true },
        });
        showDialog(
          `<dialog class="dialog">${dialogHead("Automation preview")}<div class="dialog-body"><p>${data.changes.length} matching changes. ${r.trigger === "status" ? "Status-trigger rules wait for a task status change." : ""}</p>${data.changes.map((c) => `<p>${esc(c.key)} · ${esc(c.title)}: ${esc(JSON.stringify(c.before))} → ${esc(JSON.stringify(c.patch))}${c.sourceOwned ? " · Skipped: source-owned" : ""}</p>`).join("")}<button type="button" class="button primary" id="automation-apply" ${!r.enabled || !data.changes.length ? "disabled" : ""}>Apply ${data.changes.length} changes</button><p class="form-error" role="alert"></p></div></dialog>`,
          "automation-preview",
        );
        document.querySelector("#automation-apply").onclick = async () => {
          try {
            await api(`/projects/${project}/automations/${r.id}`, {
              method: "POST",
              body: {
                preview: false,
                revisions: Object.fromEntries(
                  data.changes.map((c) => [c.id, c.revision]),
                ),
              },
            });
            await refresh(false);
            await open();
          } catch (error) {
            document.querySelector(".form-error").textContent = error.message;
          }
        };
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.settingsSaving = false;
      b.disabled = false;
    }
  });
  return { open, renderPage: open };
}
