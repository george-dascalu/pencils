export function projectAutomations(ctx) {
  const { api, route, esc, showDialog, dialogHead, toast, state, refresh } =
    ctx;
  let rules = [],
    project;
  const button = (action, title, id = "") =>
    `<button type="button" class="button small" data-automation="${action}" data-id="${esc(id)}">${title}</button>`;
  async function open() {
    project = state.project.id;
    const data = await api(route("automations"));
    rules = data.rules;
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Project automation")}<div class="dialog-body"><p>Rules run once per trigger. Actions do not trigger more rules. Source-owned fields are skipped. Due-date rules use the server's UTC date and run each minute; matching tasks are changed only when the requested value differs.</p>${rules.map((r) => `<article class="source-card"><h3>${esc(r.name)}</h3><p>${esc(r.trigger)} → ${esc(r.field)} = ${esc(r.value)} · ${r.enabled ? "Enabled" : "Disabled"}</p>${button("preview", "Preview run", r.id)}${button("toggle", r.enabled ? "Disable" : "Enable", r.id)}${button("remove", "Remove", r.id)}</article>`).join("") || "<p>No automation rules.</p>"}${button("add", "Add rule")}<details><summary>Run history (${data.logs.length})</summary>${data.logs.map((l) => `<p>${esc(l.name)} · ${esc(l.at)} · ${l.changed} changes · ${l.errors.length} errors</p>${l.errors.map((e) => `<p>${esc(e.task)}: ${esc(e.error)}</p>`).join("")}`).join("")}</details></div></dialog>`,
      "automations",
    );
  }
  function add() {
    showDialog(
      `<dialog class="dialog"><form id="automation-form">${dialogHead("Add automation")}<div class="dialog-body"><label class="field">Name<input name="name" required maxlength="100"></label><label class="field">Trigger<select name="trigger"><option value="manual">Manual</option><option value="status">Status changes</option><option value="due">Due today or overdue</option></select></label><label class="field">From status (blank = any)<select name="from"><option value="">Any</option>${state.config.statuses.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label><label class="field">To status (blank = any)<select name="to"><option value="">Any</option>${state.config.statuses.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label><label class="field">Action<select name="field"><option value="priority">Set priority</option><option value="status">Set status</option><option value="assignee">Assign person</option><option value="tag">Add tag</option></select></label><label class="field">Value<input name="value" required maxlength="100"></label><p>Rules start disabled. Preview before enabling. Status IDs and assignee names must match this project.</p><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button class="button primary">Save disabled rule</button></div></form></dialog>`,
      "automation-edit",
    );
    const form = document.querySelector("#automation-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        const r = {
          ...Object.fromEntries(new FormData(form)),
          id: crypto.randomUUID(),
          enabled: false,
        };
        await api(`/projects/${project}/automations`, {
          method: "POST",
          body: { rules: [...rules, r] },
        });
        await open();
      } catch (error) {
        form.querySelector(".form-error").textContent = error.message;
      }
    });
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-automation]");
    if (!b) return;
    e.preventDefault();
    try {
      if (b.dataset.automation === "open") return await open();
      if (b.dataset.automation === "add") return add();
      const r = rules.find((r) => r.id === b.dataset.id);
      if (!r) return;
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
    }
  });
  return { open };
}
