import { ruleDiagram } from "./rule-diagram.js";
import { hierarchyRules } from "./hierarchy-model.js";
import { initialStatus, statusLabel } from "./workflow-model.js";
export function workflowEditor(form, config, tasks, { esc, icon }) {
  let model = structuredClone(config);
  model.initial_status = initialStatus(model);
  model.status_labels ||= {};
  const diagramUI = { workflow: {}, hierarchy: {} };
  const used = new Set(tasks.map((t) => t.status));
  const host = document.createElement("fieldset");
  host.className = "workflow-editor";
  form.querySelector(".dialog-body").append(host);
  function sync() {
    form.elements.workflowSchema.value = JSON.stringify(model);
  }
  const names = () => model.statuses.map((id) => esc(statusLabel(model, id)));
  function diagrams() {
    const shared = { esc, icon };
    ruleDiagram(host.querySelector("[data-workflow-diagram]"), {
      ...shared,
      id: "workflow",
      title: "Visual workflow",
      ui: diagramUI.workflow,
      nodes: model.statuses.map((id) => ({
        id,
        label: statusLabel(model, id),
        icon: model.done.includes(id) ? "check" : "status",
        done: model.done.includes(id),
        initial: model.initial_status === id,
      })),
      links: model.transitions
        ? model.statuses.flatMap((from) =>
            (model.transitions[from] || []).map((to) => ({ from, to })),
          )
        : [],
      editable: !!model.transitions,
      hint: model.transitions
        ? "Arrows show allowed status changes."
        : "All statuses can reach each other. Enable Restrict status changes to draw specific rules.",
      toggle(from, to) {
        if (!model.transitions || from === to) return;
        const targets = model.transitions[from] || [];
        model.transitions[from] = targets.includes(to)
          ? targets.filter((id) => id !== to)
          : [...targets, to];
        paint();
        changed();
      },
    });
    const h = hierarchyRules(model);
    ruleDiagram(host.querySelector("[data-hierarchy-diagram]"), {
      ...shared,
      id: "hierarchy",
      title: "Visual card hierarchy",
      ui: diagramUI.hierarchy,
      nodes: [
        { id: "@root", label: "No parent", icon: "folder" },
        ...model.types.map((id) => ({ id, label: id, icon: id })),
      ],
      links: [
        ...h.roots.map((to) => ({ from: "@root", to })),
        ...model.types.flatMap((from) =>
          (h.children[from] || []).map((to) => ({ from, to })),
        ),
      ],
      editable: true,
      hint:
        h.mode === "enforced"
          ? "Arrows run from parent type to allowed child type. No parent defines top-level cards."
          : "Freeflow: all relationships are allowed. These saved rules apply when you choose Enforce rules.",
      toggle(from, to) {
        if (to === "@root") return;
        model.hierarchy = structuredClone(hierarchyRules(model));
        const targets =
          from === "@root"
            ? model.hierarchy.roots
            : model.hierarchy.children[from];
        const next = targets.includes(to)
          ? targets.filter((id) => id !== to)
          : [...targets, to];
        if (from === "@root") model.hierarchy.roots = next;
        else model.hierarchy.children[from] = next;
        paint();
        changed();
      },
    });
  }
  let detailsOpen = false;
  function paint() {
    detailsOpen =
      host.querySelector("[data-status-details]")?.open ?? detailsOpen;
    host.innerHTML = `<legend>Statuses & workflow</legend><input type="hidden" name="workflowSchema"><p class="field-hint">Set the column order and names for this project. A completed status counts towards progress. Names can change without changing task data.</p><div class="workflow-mode"><label><input type="checkbox" data-workflow-rules ${model.transitions ? "checked" : ""}> Restrict status changes</label><span class="field-hint">${model.transitions ? "Tasks can only follow the allowed moves below." : "Tasks can move freely between any statuses."}</span></div><div data-workflow-diagram></div><details data-status-details ${detailsOpen ? "open" : ""}><summary>Status names, order &amp; defaults</summary><div class="workflow-statuses">${model.statuses
      .map(
        (id, i) =>
          `<section class="workflow-status" data-workflow-status="${esc(id)}"><div class="workflow-status-main"><label class="field">Status name<input data-status-name value="${esc(statusLabel(model, id))}" maxlength="100" required></label><label class="workflow-completed"><input type="checkbox" data-status-completed ${model.done.includes(id) ? "checked" : ""}> Completed</label><label><input type="radio" name="workflow-initial" value="${esc(id)}" data-status-initial ${model.initial_status === id ? "checked" : ""}> Default</label><div class="workflow-row-actions"><button type="button" class="icon-button" data-status-up aria-label="Move ${esc(statusLabel(model, id))} up" ${i === 0 ? "disabled" : ""}>${icon("priority-high")}</button><button type="button" class="icon-button" data-status-down aria-label="Move ${esc(statusLabel(model, id))} down" ${i === model.statuses.length - 1 ? "disabled" : ""}>${icon("down")}</button><button type="button" class="icon-button" data-status-remove aria-label="Remove ${esc(statusLabel(model, id))}" ${used.has(id) || model.statuses.length === 1 ? "disabled" : ""}>${icon("trash")}</button></div></div><small class="field-hint">${esc(id)}${used.has(id) ? " · In use: move its tasks before removing this status." : ""}</small>${
            model.transitions
              ? `<details class="workflow-moves"><summary>Allowed moves · ${(model.transitions[id] || []).length}</summary><div class="workflow-destinations">${model.statuses
                  .filter((to) => to !== id)
                  .map(
                    (to) =>
                      `<label><input type="checkbox" data-status-target="${esc(to)}" ${(model.transitions[id] || []).includes(to) ? "checked" : ""}><span data-destination-label="${esc(to)}">${esc(statusLabel(model, to))}</span></label>`,
                  )
                  .join(
                    "",
                  )}</div><small class="field-hint">${(model.transitions[id] || []).length ? "Only checked destinations are allowed." : "No outgoing moves. Tasks stay here until the workflow changes."}</small></details>`
              : ""
          }</section>`,
      )
      .join(
        "",
      )}</div><div class="workflow-add"><input data-new-status placeholder="New status name…" aria-label="New status name" maxlength="100"><button type="button" class="button small" data-status-add>${icon("plus")}Add status</button></div><p class="field-hint">Default is used for new tasks unless a status is chosen explicitly. Order alone does not restrict moves. Existing tasks and archived tasks keep their status.</p><p class="form-error" data-workflow-error hidden></p></details>`;
    const h = hierarchyRules(model);
    host.insertAdjacentHTML(
      "beforeend",
      `<section class="hierarchy-editor" aria-label="Cards Hierarchies"><h3>Cards Hierarchies</h3><label class="field">Hierarchy mode<select data-hierarchy-mode><option value="free" ${h.mode === "free" ? "selected" : ""}>Freeflow</option><option value="enforced" ${h.mode === "enforced" ? "selected" : ""}>Enforce rules</option></select></label><p class="field-hint">${h.mode === "free" ? "Any card type can parent any other type. Your rules below are kept for later." : "Only connected relationships are allowed. Existing tasks must match before these rules can be saved."} Cycles are never allowed.</p><div data-hierarchy-diagram></div><details class="hierarchy-matrix"><summary>Edit rules as a table</summary><div class="hierarchy-table-wrap"><table class="hierarchy-table"><caption>Rows are parents; columns are allowed child types.</caption><thead><tr><th>Parent / child</th>${model.types.map((t) => `<th>${icon(t)} ${esc(t)}</th>`).join("")}</tr></thead><tbody>${[null, ...model.types].map((parent) => `<tr><th>${parent === null ? "No parent (top level)" : esc(parent)}</th>${model.types.map((child) => `<td><input type="checkbox" data-hierarchy-parent="${parent ?? ""}" data-hierarchy-child="${esc(child)}" aria-label="${esc(parent ?? "No parent")} allows ${esc(child)}" ${(parent === null ? h.roots : h.children[parent] || []).includes(child) ? "checked" : ""}></td>`).join("")}</tr>`).join("")}</tbody></table></div></details><p class="field-hint">Uncheck a type in “No parent” to require a parent. Uncheck an entire parent row to prevent that type having children.</p></section>`,
    );
    diagrams();
    sync();
  }
  function changed() {
    sync();
    form.elements.workflowSchema.dispatchEvent(
      new Event("input", { bubbles: true }),
    );
  }
  host.addEventListener("input", (e) => {
    if (!e.target.hasAttribute("data-status-name")) return;
    const id = e.target.closest("[data-workflow-status]").dataset
      .workflowStatus;
    model.status_labels[id] = e.target.value;
    for (const el of host.querySelectorAll("[data-destination-label]"))
      if (el.dataset.destinationLabel === id) el.textContent = e.target.value;
    for (const el of host.querySelectorAll("[data-flow-status]"))
      if (el.dataset.flowStatus === id)
        el.textContent = e.target.value + (model.done.includes(id) ? " ✓" : "");
    diagrams();
    sync();
  });
  host.addEventListener("change", (e) => {
    const el = e.target,
      id = el.closest("[data-workflow-status]")?.dataset.workflowStatus;
    if (
      el.hasAttribute("data-hierarchy-mode") ||
      el.hasAttribute("data-hierarchy-child")
    ) {
      model.hierarchy = structuredClone(hierarchyRules(model));
      if (el.hasAttribute("data-hierarchy-mode"))
        model.hierarchy.mode = el.value;
      else {
        const parent = el.dataset.hierarchyParent,
          child = el.dataset.hierarchyChild;
        const targets = parent
          ? model.hierarchy.children[parent]
          : model.hierarchy.roots;
        if (el.checked) targets.push(child);
        else targets.splice(targets.indexOf(child), 1);
      }
      changed();
      if (el.hasAttribute("data-hierarchy-mode")) paint();
      else diagrams();
      return;
    }
    if (el.hasAttribute("data-status-name")) {
      changed();
      return;
    }
    if (el.hasAttribute("data-workflow-rules"))
      model.transitions = el.checked
        ? Object.fromEntries(
            model.statuses.map((s) => [
              s,
              model.statuses.filter((to) => to !== s),
            ]),
          )
        : null;
    else if (el.hasAttribute("data-status-completed"))
      model.done = el.checked
        ? [...new Set([...model.done, id])]
        : model.done.filter((s) => s !== id);
    else if (el.hasAttribute("data-status-initial")) model.initial_status = id;
    else if (el.dataset.statusTarget) {
      const to = el.dataset.statusTarget;
      model.transitions[id] = el.checked
        ? [...new Set([...model.transitions[id], to])]
        : model.transitions[id].filter((s) => s !== to);
      sync();
      const summary = el.closest("details").querySelector("summary");
      summary.textContent = `Allowed moves · ${model.transitions[id].length}`;
      el.closest("details").querySelector(".field-hint").textContent = model
        .transitions[id].length
        ? "Only checked destinations are allowed."
        : "No outgoing moves. Tasks stay here until the workflow changes.";
      changed();
      diagrams();
      return;
    } else return;
    paint();
    changed();
  });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.closest("[data-workflow-status]")?.dataset.workflowStatus,
      i = model.statuses.indexOf(id);
    if (b.hasAttribute("data-status-add")) {
      const name = host.querySelector("[data-new-status]").value.trim();
      if (!name) return;
      if (model.statuses.length >= 40) {
        const error = host.querySelector("[data-workflow-error]");
        error.hidden = false;
        error.textContent = "A project supports up to 40 statuses.";
        return;
      }
      const stem =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "status";
      let key = stem,
        n = 2;
      while (model.statuses.includes(key)) key = `${stem}-${n++}`;
      model.statuses.push(key);
      model.status_labels[key] = name;
      if (model.transitions) model.transitions[key] = [];
    } else if (b.hasAttribute("data-status-remove")) {
      if (used.has(id) || model.statuses.length === 1) return;
      model.statuses.splice(i, 1);
      model.done = model.done.filter((s) => s !== id);
      delete model.status_labels[id];
      if (model.initial_status === id) model.initial_status = model.statuses[0];
      if (model.transitions) {
        delete model.transitions[id];
        for (const s of model.statuses)
          model.transitions[s] = model.transitions[s].filter((to) => to !== id);
      }
    } else if (
      b.hasAttribute("data-status-up") ||
      b.hasAttribute("data-status-down")
    ) {
      const j = i + (b.hasAttribute("data-status-up") ? -1 : 1);
      if (j < 0 || j >= model.statuses.length) return;
      [model.statuses[i], model.statuses[j]] = [
        model.statuses[j],
        model.statuses[i],
      ];
    } else return;
    paint();
    changed();
    if (b.hasAttribute("data-status-add"))
      host.querySelector("[data-new-status]").focus();
  });
  host.addEventListener("keydown", (e) => {
    if (e.target.hasAttribute("data-new-status") && e.key === "Enter") {
      e.preventDefault();
      host.querySelector("[data-status-add]").click();
    }
  });
  form.elements.types?.addEventListener("change", () => {
    const types = [
      ...new Set(
        form.elements.types.value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
    if (!types.length) return;
    const h = hierarchyRules(model),
      oldTypes = model.types;
    model.hierarchy = {
      mode: h.mode,
      roots: [
        ...h.roots.filter((t) => types.includes(t)),
        ...types.filter((t) => !oldTypes.includes(t)),
      ],
      children: Object.fromEntries(
        types.map((t) => [
          t,
          oldTypes.includes(t)
            ? (h.children[t] || []).filter((c) => types.includes(c))
            : [...types],
        ]),
      ),
    };
    model.types = types;
    paint();
    changed();
  });
  paint();
  return () => {
    model = JSON.parse(form.elements.workflowSchema.value);
    paint();
  };
}
