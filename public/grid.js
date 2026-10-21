import { priorityOptions, priorityLabels, priorityLabel } from "./task-priority.js";
import {sourceFields,sourceLabel} from "./source-model.js";
import { tableResult, activeTableFilter } from "./table-model.js";
import { tableTools } from "./table-tools.js";
import { tableColumnDrag } from "./table-column-drag.js";
import { taskReorderHandle } from "./task-reorder.js";
import {
  nextStatuses,
  canTransition,
  transitionError,
} from "./workflow-model.js";
import { preparePaste } from "./table-paste.js";
import { assigneeOptions, projectPeople } from "./teams.js";
import { taskColorAttributes, refreshTaskControlColors } from "./task-colors.js";
import { taskAttachmentContent } from "./task-attachment-model.js";
export function grid(ctx) {
  const {
    state,
    esc,
    $,
    $$,
    options,
    label,
    task,
    patchTask,
    renderView,
    showDialog,
    closeDialog,
    dialogHead,
    toast,
  } = ctx;
  const tools = tableTools(ctx);
  const standard = [
    "key",
    "title",
    "body",
    "type",
    "status",
    "priority",
    "parent",
    "assignee",
    "start",
    "due",
    "estimate",
    "tags",
  ];
  let cells = [],
    anchor = null,
    focus = null,
    rowIds = [],
    columns = [];
  const selected = new Set();
  let matchingRows = [];
  const bulkIds=()=> $("#bulk-scope")?.value === "matching" ? matchingRows.map(t=>t.id) : $("#bulk-scope")?.value === "page" ? [...rowIds] : [...selected];
  const scopeName=()=> $("#bulk-scope")?.selectedOptions[0]?.textContent || "Selected rows";
  const bulkAllowed=ids=>{if(ids.length>500) {toast("Narrow the filters to 500 tasks or fewer before a bulk update.",true);return false;}return ids.length>0;};
  const fieldValue = (t, key) =>
    key.startsWith("fields.") ? t.fields?.[key.slice(7)] : t[key];
  const fields = () => [
    ...standard,
    ...(state.config?.fields || []).map((f) => `fields.${f.id}`),
  ];
  const fieldName = (key) =>
    !key
      ? "Unmapped"
      : key === "key"
        ? "ID"
        : key === "body"
          ? "Description"
          : key.startsWith("fields.")
            ? state.config.fields.find((f) => `fields.${f.id}` === key)?.name
            : label(key);
  const selectValue = (key, value, text) =>
    key === "type"
      ? `<span class="task-type ${esc(value)}">${ctx.icon(value)}</span>`
      : key === "assignee"
        ? ctx.assigneeHTML({ assignee: value })
        : esc(text);
  function refreshSelect(select) {
    const wrapper = select.closest(".table-cell-select");
    if (!wrapper || !select.matches("select")) return;
    const text = select.selectedOptions[0]?.label || "";
    wrapper.title = text;
    wrapper.querySelector(".table-cell-value").innerHTML = selectValue(
      select.dataset.taskField, select.value, text,
    );
    refreshTaskControlColors(wrapper, state);
  }
  document.addEventListener("change", (event) => {
    if (event.target.matches(".table-cell-select > select")) refreshSelect(event.target);
  });
  tableColumnDrag(ctx, fieldName);
  const columnWidth = key => ["title", "body"].includes(key) ? 300 : 160;
  function config() {
    const saved =
      state.tableColumns ||
      fields().map((key) => ({
        key,
        width: columnWidth(key),
        visible: true,
      }));
    const valid = saved.filter((c) => fields().includes(c.key));
    for (const key of fields()) {
      if (!valid.some((c) => c.key === key)) {
        const column = { key, width: columnWidth(key), visible: true };
        if (key === "body")
          valid.splice(valid.findIndex(c => c.key === "title") + 1, 0, column);
        else valid.push(column);
      }
    }
    return valid;
  }
  function descriptionText(body) {
    const source = taskAttachmentContent(body, state.project.id).description;
    if (!source.trim()) return "";
    const template = document.createElement("template");
    template.innerHTML = ctx.markdown(source);
    template.content.querySelectorAll("p,li,br,div,pre,blockquote,h1,h2,h3,h4,h5,h6,tr,td,th")
      .forEach(el => el.append(" "));
    template.content.querySelectorAll("img").forEach(el => el.replaceWith(el.alt || ""));
    return template.content.textContent.replace(/\s+/g, " ").trim();
  }
  const tableWidth = () =>
    `calc(var(--table-selection-width, 94px) + ${columns.reduce((sum, column) => sum + (column.width || 160), 0)}px)`;
  function columnsMenu() {
    return `<details class="board-menu table-columns-menu" data-board-menu="table-columns" ${state.headerMenu === "table-columns" ? "open" : ""}><summary>Columns<span aria-hidden="true">⌄</span></summary><div class="board-menu-panel table-columns-panel" data-menu-keep-open><header><strong>Table columns</strong><button type="button" class="icon-button" data-feature="columns-close" aria-label="Close table columns">${ctx.icon("close")}</button></header><div id="column-list">${state.tableColumns.map((c, i) => `<div class="column-setting" data-column-setting="${esc(c.key)}"><label><input type="checkbox" data-column-visible="${esc(c.key)}" ${c.visible !== false ? "checked" : ""}><span>${esc(fieldName(c.key))}</span></label><button type="button" class="icon-button" data-feature="column-up" data-index="${i}" aria-label="Move ${esc(fieldName(c.key))} up" title="Move up" ${i === 0 ? "disabled" : ""}>${ctx.icon("priority-high")}</button><button type="button" class="icon-button" data-feature="column-down" data-index="${i}" aria-label="Move ${esc(fieldName(c.key))} down" title="Move down" ${i === state.tableColumns.length - 1 ? "disabled" : ""}>${ctx.icon("down")}</button></div>`).join("")}</div><small>Changes apply immediately. Save a view to keep this layout. Drag headers to reorder, or their edges to resize. Alt + ← / → moves a focused header.</small></div></details>`;
  }
  function redrawColumns(key, action) {
    const top = $("#column-list")?.scrollTop || 0;
    const scroll = $(".table-scroll")?.scrollLeft || 0;
    state.headerMenu = "table-columns";
    renderView(true);
    $("#column-list").scrollTop = top;
    $(".table-scroll").scrollLeft = scroll;
    const row = $(`[data-column-setting="${CSS.escape(key)}"]`);
    const target = action && row.querySelector(`[data-feature="${action}"]:not(:disabled)`);
    (target || row.querySelector("input")).focus({ preventScroll: true });
  }
  function render(input) {
    const preferences = tools.preferences();
    const parents=new Map(state.tasks.map(t=>[t.id,t]));
    const result = tableResult(input, preferences, state.config, state.tasks, {
      me: state.session?.user?.username || "",
    });
    matchingRows = result.tasks;
    state.tableGroupPaths = [...result.counts.keys()];
    const total = result.tasks.length;
    const pages = Math.max(1, Math.ceil(total / 100));
    state.page = Math.min(state.page || 0, pages - 1);
    const tasks = result.tasks.slice(state.page * 100, (state.page + 1) * 100);
    state.tableColumns = config();
    columns = state.tableColumns.filter((c) => c.visible !== false);
    let pinOffset = 0;
    for (const col of columns) {
      col.pinOffset = pinOffset;
      if (["key", "title"].includes(col.key)) pinOffset += col.width || 160;
    }
    rowIds = [];
    cells = [];
    anchor = null;
    focus = null;
    const custom = (key) =>
      state.config.fields.find((f) => `fields.${f.id}` === key);
    const cell = (t, key) => {
      const field = custom(key),
        value = fieldValue(t, key),
        attrs = `tabindex="-1" data-task-field="${esc(key)}" data-id="${esc(t.id)}" aria-label="${esc(fieldName(key))} for ${esc(t.title)}"`;
      const select = (choices, text) => `<span class="table-cell-select" ${taskColorAttributes(state, key, value)} title="${esc(text)}"><select ${attrs} ${taskColorAttributes(state, key, value)}>${choices}</select><span class="table-cell-value" aria-hidden="true">${selectValue(key, value, text)}</span><span class="table-cell-chevron" aria-hidden="true">${ctx.icon("chevron")}</span></span>`;
      const values =
        key === "type"
          ? state.config.types
          : key === "status"
            ? nextStatuses(state.config, t.status)
            : key === "priority"
              ? priorityOptions
              : field?.type === "select"
                ? field.options
                : null;
      if(t.source && sourceFields.includes(key)) {
        if (["type", "assignee"].includes(key)) {
          const text = key === "assignee" ? value || "Unassigned" : label(value);
          return `<span class="table-cell-readonly" role="img" aria-label="${esc(fieldName(key))}: ${esc(text)}. Managed by the connected source." title="${esc(text)} · Managed by the connected source">${selectValue(key, value, text)}</span>`;
        }
        return `<span class="${["priority", "status"].includes(key) ? "task-color-badge" : ""}" ${taskColorAttributes(state, key, value)} title="Source-owned field">${esc(key === "priority" ? priorityLabel(value) : value)}${key==="title"?`<small class="source-badge">${esc(sourceLabel(t))}</small>`:""}</span>`;
      }
      if (key === "key")
        return `<span class="task-id">${esc(t.key || "")}</span>`;
      if (key === "body") {
        const preview = descriptionText(value);
        return `<button type="button" class="table-description ${preview ? "" : "is-empty"}" tabindex="-1" data-action="task-open" data-id="${esc(t.id)}" aria-label="Edit description for ${esc(t.title)}" title="${esc(preview || "Add a description…")}">${esc(preview.slice(0, 500) || "Add a description…")}</button>`;
      }
      if (key === "assignee")
        return select(assigneeOptions(state, value, esc), value || "Unassigned");
      if (key === "type")
        return select(values.map(type => `<option value="${esc(type)}" data-icon="${esc(type)}" ${type === value ? "selected" : ""}>${esc(label(type))}</option>`).join(""), label(value));
      if (values)
        return select(options(values, value, key === "status" ? ctx.statusNames : key === "priority" ? priorityLabels : undefined), key === "status" ? ctx.statusNames[value] || label(value) : key === "priority" ? priorityLabel(value) : label(value || values[0] || ""));
      if (key === "parent")
        return select(`<option value="">No parent</option>${state.tasks
          .filter((x) => x.id !== t.id)
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === value ? "selected" : ""}>${esc(x.title)}</option>`,
          )
          .join("")}`, parents.get(value)?.title || "No parent");
      if (field?.type === "checkbox")
        return select(options(["false", "true"], String(value || false)), label(String(value || false)));
      return `<input ${attrs} type="${["start", "due"].includes(key) || field?.type === "date" ? "date" : key === "estimate" || field?.type === "number" ? "number" : "text"}" value="${esc(Array.isArray(value) ? value.join(", ") : (value ?? ""))}" ${key === "title" ? 'maxlength="300" required' : ""}>`;
    };
    let previous = [],
      body = "";
    for (const t of tasks) {
      const path = result.groupPath(t);
      let hidden = false;
      for (let level = 0; level < path.length; level++) {
        const group = JSON.stringify(path.slice(0, level + 1));
        if (
          !hidden &&
          (previous.length === 0 ||
            path.slice(0, level + 1).some((v, i) => v !== previous[i]))
        ) {
          const collapsed = state.tableCollapsed?.has(group),
            key = preferences.groups[level];
          body += `<tr class="table-group-row"><td colspan="${columns.length + 1}"><button type="button" data-table-action="group-toggle" data-group="${esc(group)}" aria-expanded="${!collapsed}" style="padding-left:${12 + level * 20}px">${ctx.icon("chevron")}<span class="table-group-field">${esc(fieldName(key))}</span><strong>${esc(tools.display(key, path[level]))}</strong><span class="count">${result.counts.get(group)} tasks</span><span class="table-group-summary">${result.summaries.get(group).estimate} h · ${result.summaries.get(group).done}/${result.counts.get(group)} complete${result.summaries.get(group).unestimated ? ` · ${result.summaries.get(group).unestimated} unestimated` : ""}</span></button></td></tr>`;
        }
        if (state.tableCollapsed?.has(group)) hidden = true;
      }
      previous = path;
      if (hidden) continue;
      const r = rowIds.length;
      rowIds.push(t.id);
      body += `<tr data-table-task="${esc(t.id)}" data-task-order-row="${esc(t.id)}" data-task-order-group="${esc(JSON.stringify(path))}"><td class="task-row-controls"><div class="task-row-actions">${taskReorderHandle(t, esc)}<label class="task-checkbox"><input type="checkbox" data-row-select="${t.id}" ${selected.has(t.id) ? "checked" : ""} aria-label="Select ${esc(t.title)}"></label><button class="table-open" data-action="task-open" data-id="${t.id}" aria-label="Open ${esc(t.title)}">↗</button></div></td>${columns.map((c, k) => `<td role="gridcell" tabindex="${r === 0 && k === 0 ? 0 : -1}" data-cell="${r},${k}" data-column-key="${esc(c.key)}" style="--pin-offset:${c.pinOffset}px">${preferences.outline && c.key === "title" && t.parent ? `<small class="table-parent-context" style="padding-left:${Math.min(12,result.depths.get(t.id)||0)*12}px">↳ ${esc(parents.get(t.parent)?.key || t.parent)}${!result.depths.get(t.id)?" · parent outside this group or filter":""}</small>`:""}${cell(t, c.key)}</td>`).join("")}</tr>`;
    }
    // Bulk actions and clipboard ranges must never target filtered or collapsed rows.
    for (const id of selected) if (!rowIds.includes(id)) selected.delete(id);
    return `${tools.html()}<div class="grid-tools">${columnsMenu()}<span id="grid-selection-count" class="sr-only" role="status">${selected.size} selected on this page</span><span id="grid-bulk" ${selected.size ? "" : "hidden"}><label>Apply to <select id="bulk-scope"><option value="selected">Selected rows</option><option value="page">Visible rows on this page (${rowIds.length})</option><option value="matching">All matching tasks (${matchingRows.length})</option></select></label><label>Bulk status <select id="bulk-status"><option value="">Choose…</option>${options(state.config.statuses, "")}</select></label><button class="button small" data-feature="bulk-archive">Archive tasks</button></span><button class="button small" data-feature="table-export">Export matching CSV</button></div><div class="table-scroll"><table class="task-table spreadsheet" style="width:${tableWidth()}" role="grid" aria-label="Tasks spreadsheet"><colgroup><col style="width:var(--table-selection-width)">${columns.map((c) => `<col style="width:${c.width || 160}px">`).join("")}</colgroup><thead><tr><th><label class="task-checkbox"><input type="checkbox" id="grid-all" aria-label="Select all visible rows" ${rowIds.length && rowIds.every((id) => selected.has(id)) ? "checked" : ""}></label></th>${columns
      .map((c) => {
        const sort = preferences.sorts.findIndex((s) => s.field === c.key),
          active = preferences.filters.some(
            (f) => f.field === c.key && activeTableFilter(f),
          );
        return `<th data-column-key="${esc(c.key)}" style="--pin-offset:${c.pinOffset}px" aria-sort="${sort === 0 ? (preferences.sorts[sort].dir === 1 ? "ascending" : "descending") : sort > 0 ? "other" : "none"}"><div class="table-column-heading ${(c.width || 160) <= 128 ? "table-column-compact" : ""}"><button type="button" class="table-column-grip" data-column-drag="${esc(c.key)}" aria-label="Move ${esc(fieldName(c.key))} column" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" title="Drag to move ${esc(fieldName(c.key))}. Alt + Left/Right moves this column."><span aria-hidden="true">⠿</span></button><button type="button" data-table-sort-column="${esc(c.key)}" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" title="Sort ${esc(fieldName(c.key))}: ascending, descending, then clear. Shift-click to add a sort." aria-label="Sort by ${esc(fieldName(c.key))}"><span class="table-column-name">${esc(fieldName(c.key))}</span>${sort >= 0 ? `<span class="table-sort-indicator">${preferences.sorts[sort].dir === 1 ? "↑" : "↓"}${preferences.sorts.length > 1 ? sort + 1 : ""}</span>` : ""}</button><details class="board-menu table-header-menu ${active ? "has-active-filter" : ""}"><summary aria-label="${esc(fieldName(c.key))} column actions${active ? ", filter active" : ""}">⋯</summary><div class="board-menu-panel"><header><strong>${esc(fieldName(c.key))}</strong><small>${esc(c.key.startsWith("fields.") ? custom(c.key)?.type || "text" : ["due", "start"].includes(c.key) ? "Date" : c.key === "estimate" ? "Number of hours" : "Task field")}</small></header>${[
          ["asc", "Sort ascending", "priority-high"],
          ["desc", "Sort descending", "down"],
          ["filter", "Filter column", "filter"],
          ["group", "Group by column", "group"],
          ["hide", "Hide column", "hide"],
        ]
          .map(
            ([action, title, glyph]) => {
              const applied = action === "group" ? preferences.groups.includes(c.key)
                : ["asc", "desc"].includes(action) && sort >= 0 && preferences.sorts[sort].dir === (action === "asc" ? 1 : -1);
              return `<button type="button" data-table-column-action="${action}" data-column="${esc(c.key)}" ${applied ? 'data-applied="true" aria-description="Currently applied"' : ""}>${ctx.icon(glyph)}<span>${title}</span>${applied ? `<span class="column-action-check">${ctx.icon("check")}</span>` : ""}</button>`;
            },
          )
          .join(
            "",
          )}</div></details></div><span class="column-resizer" data-resize-column="${esc(c.key)}" role="separator" aria-orientation="vertical" aria-valuemin="90" aria-valuemax="900" aria-valuenow="${c.width || 160}" aria-valuetext="${c.width || 160} pixels" aria-label="Resize ${esc(fieldName(c.key))}" tabindex="0"></span></th>`;
      })
      .join(
        "",
      )}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length + 1}"><div class="table-no-results">No tasks match these filters. <button class="button small" data-table-action="clear-filters">Clear column filters</button><button class="button small" data-action="filters-reset">Clear all filters</button></div></td></tr>`}</tbody></table></div><span class="sr-only" data-table-reorder-status role="status" aria-live="polite"></span>${pages > 1 ? `<div class="pagination"><button class="button small" data-feature="page-prev" ${!state.page ? "disabled" : ""}>← Previous</button><span>Page ${state.page + 1} of ${pages}</span><button class="button small" data-feature="page-next" ${state.page + 1 >= pages ? "disabled" : ""}>Next →</button></div>` : ""}<button class="add-row" data-action="task-new">+ New row</button>`;
  }
  function paint() {
    if (!anchor || !focus) return;
    cells = [];
    $$("[data-cell]").forEach((el) => {
      const [r, c] = el.dataset.cell.split(",").map(Number),
        yes =
          r >= Math.min(anchor[0], focus[0]) &&
          r <= Math.max(anchor[0], focus[0]) &&
          c >= Math.min(anchor[1], focus[1]) &&
          c <= Math.max(anchor[1], focus[1]);
      el.classList.toggle("range-selected", yes);
      if (yes) cells.push([r, c]);
    });
  }
  function value(key, text) {
    const field = state.config.fields.find((f) => `fields.${f.id}` === key);
    if (key === "tags")
      return text
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    if (key === "estimate" || field?.type === "number") {
      if (!text) return null;
      const number = Number(text);
      if (!Number.isFinite(number)) throw new Error("Enter a valid number.");
      return number;
    }
    if (field?.type === "checkbox") return text.toLowerCase() === "true";
    if (["start", "due", "parent"].includes(key) || field?.type === "date")
      return text || null;
    return text;
  }
  function patch(id, key, val) {
    return key.startsWith("fields.")
      ? { fields: { ...(task(id).fields || {}), [key.slice(7)]: val } }
      : { [key]: val };
  }
  document.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest("[data-cell]");
    if (!cell) return;
    const point = cell.dataset.cell.split(",").map(Number);
    if (!event.shiftKey || !anchor) anchor = point;
    focus = point;
    paint();
    if (event.shiftKey) event.preventDefault();
  });
  document.addEventListener("focusin", (event) => {
    const cell = event.target.closest("[data-cell]");
    if (!cell) return;
    focus = cell.dataset.cell.split(",").map(Number);
    if (!anchor) anchor = focus;
    if (event.target.matches("input,select"))
      event.target.dataset.editStart = event.target.value;
  });
  document.addEventListener("copy", (event) => {
    if (state.view !== "table" || !cells.length || state.dialog) return;
    if (
      cells.length === 1 &&
      document.activeElement?.selectionStart !==
        document.activeElement?.selectionEnd
    )
      return;
    const rows = [];
    for (
      let r = Math.min(anchor[0], focus[0]);
      r <= Math.max(anchor[0], focus[0]);
      r++
    ) {
      const values = [];
      for (
        let c = Math.min(anchor[1], focus[1]);
        c <= Math.max(anchor[1], focus[1]);
        c++
      ) {
        const val = fieldValue(task(rowIds[r]), columns[c].key);
        values.push(
          String(Array.isArray(val) ? val.join(", ") : (val ?? "")).replace(
            /[\t\n\r]/g,
            " ",
          ),
        );
      }
      rows.push(values.join("\t"));
    }
    event.clipboardData.setData("text/plain", rows.join("\n"));
    event.preventDefault();
  });
  document.addEventListener("paste", async (event) => {
    if (
      state.view !== "table" ||
      state.dialog ||
      !focus ||
      !event.target.closest(".spreadsheet")
    )
      return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return;
    event.preventDefault();
    const targets = rowIds.slice(focus[0]).map(task),
      map = columns.slice(focus[1]).map((c) => c.key);
    const count = Math.max(
      ...text
        .replace(/\r/g, "")
        .trimEnd()
        .split("\n")
        .map((row) => row.split("\t").length),
    );
    let plan;
    const build = () =>
      preparePaste(
        text,
        targets,
        map,
        state.config,
        state.tasks,
        (state.organisation?.teams || []).length
          ? projectPeople(state).map((p) => p.name)
          : null,
      );
    const preview = () => {
      plan = build();
      document.querySelector("#paste-preview").innerHTML =
        `<p>${plan.patches.size} existing tasks · ${plan.rows.length} clipboard rows. Columns are mapped in clipboard order. Changes are saved individually; server rejections remain in Recovery.</p><div class="paste-mapping">${Array.from(
          { length: count },
          (_, i) =>
            `<label>Clipboard column ${i + 1}<select data-paste-map="${i}"><option value="">Choose column</option>${columns
              .filter((c) => c.key !== "key")
              .map(
                (c) =>
                  `<option value="${esc(c.key)}" ${map[i] === c.key ? "selected" : ""}>${esc(fieldName(c.key))}</option>`,
              )
              .join("")}</select></label>`,
        ).join("")}</div>${
          plan.errors.length
            ? `<div role="alert"><strong>${plan.errors.length} problems — nothing will be saved</strong><ul>${plan.errors
                .slice(0, 50)
                .map((error) => `<li>${esc(error)}</li>`)
                .join("")}</ul></div>`
            : "<p>Values, date ranges, workflow moves and hierarchy checked. Review the mapped values below.</p>"
        }<div class="table-scroll"><table><thead><tr><th>Task</th>${map
          .slice(0, count)
          .map((key) => `<th>${esc(fieldName(key) || "Unmapped")}</th>`)
          .join(
            "",
          )}</tr></thead><tbody>${plan.rows.map((row, i) => `<tr><th>${esc(targets[i]?.key || targets[i]?.title || "Missing row")}</th>${row.map((value) => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      document.querySelector("#paste-apply").disabled = !!plan.errors.length;
    };
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Review pasted changes")}<div class="dialog-body" id="paste-preview"></div><div class="dialog-foot"><button class="button" id="paste-cancel">Cancel</button><button class="button primary" id="paste-apply">Apply changes</button></div></dialog>`,
      "paste",
    );
    preview();
    document
      .querySelector("#paste-preview")
      .addEventListener("change", (event) => {
        if (event.target.dataset.pasteMap != null) {
          map[+event.target.dataset.pasteMap] = event.target.value;
          preview();
        }
      });
    document.querySelector("#paste-cancel").onclick = () =>
      closeDialog(false, { confirmDirty: false });
    document.querySelector("#paste-apply").onclick = async (event) => {
      if (plan.errors.length) return;
      event.target.disabled = true;
      try {
        for (const [id, changes] of plan.patches)
          await patchTask(id, changes, false);
        closeDialog(true);
        renderView(true);
        toast(
          `Submitted changes for ${plan.patches.size} tasks. Rejected saves remain in Recovery.`,
        );
      } catch (error) {
        toast(error.message, true);
        event.target.disabled = false;
      }
    };
  });

  document.addEventListener("keydown", (event) => {
    if (
      state.view !== "table" ||
      state.dialog ||
      (event.key === "Tab" && (event.ctrlKey || event.metaKey || event.altKey)) ||
      !event.target.closest(".spreadsheet")
    )
      return;
    const resize = event.target.closest("[data-resize-column]");
    if (resize && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const cols = config();
      const key = resize.dataset.resizeColumn;
      const column = cols.find((c) => c.key === key);
      column.width = Math.max(
        90,
        Math.min(900, (column.width || 160) +
          (event.key === "ArrowRight" ? 20 : -20)),
      );
      state.tableColumns = cols;
      renderView(true);
      $(`[data-resize-column="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const currentCell = event.target.closest("[data-cell]");
    if (!currentCell) return;
    const point = currentCell.dataset.cell.split(",").map(Number);
    const editing = event.target !== currentCell;
    if (event.key === "Enter" && event.target.matches(".table-description")) return;
    const directions = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (event.key === "Escape" && editing) {
      event.preventDefault();
      event.target.value = event.target.dataset.editStart ?? event.target.value;
      refreshSelect(event.target);
      currentCell.focus();
      return;
    }
    if (event.key === "Enter" && !editing) {
      event.preventDefault();
      const control = currentCell.querySelector("input,select,button");
      if (control) {
        if (control.matches(".table-description")) {
          control.click();
          return;
        }
        control.dataset.editStart = control.value;
        control.focus();
        if (control.type === "text") control.select();
      }
      return;
    }
    const move = (!editing || event.altKey) && directions[event.key];
    if (!move && event.key !== "Tab" && !(editing && event.key === "Enter"))
      return;
    let next;
    if (event.key === "Tab") {
      const index =
        point[0] * columns.length + point[1] + (event.shiftKey ? -1 : 1);
      if (index < 0 || index >= rowIds.length * columns.length) return;
      next = [Math.floor(index / columns.length), index % columns.length];
    } else {
      const delta = move || [event.shiftKey ? -1 : 1, 0];
      next = [
        Math.max(0, Math.min(rowIds.length - 1, point[0] + delta[0])),
        Math.max(0, Math.min(columns.length - 1, point[1] + delta[1])),
      ];
    }
    event.preventDefault();
    if (editing)
      event.target.dispatchEvent(new Event("change", { bubbles: true }));
    if (!event.shiftKey || !anchor) anchor = point;
    focus = next;
    if (!event.shiftKey) anchor = next;
    paint();
    $$('[data-cell][tabindex="0"]').forEach((cell) => (cell.tabIndex = -1));
    const nextCell = $(`[data-cell="${next}"]`);
    if (nextCell) {
      nextCell.tabIndex = 0;
      nextCell.focus();
    }
  });
  let resize = null;
  document.addEventListener("pointerdown", (event) => {
    const el = event.target.closest("[data-resize-column]");
    if (!el) return;
    event.preventDefault();
    resize = {
      key: el.dataset.resizeColumn,
      x: event.clientX,
      width: el.closest("th").offsetWidth,
    };
    el.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", (event) => {
    if (!resize) return;
    const width = Math.max(
      90,
      Math.min(900, resize.width + event.clientX - resize.x),
    );
    const cols = config();
    cols.find((c) => c.key === resize.key).width = width;
    state.tableColumns = cols;
    const index = columns.findIndex((c) => c.key === resize.key);
    const col = $$(".spreadsheet col")[index + 1];
    if (col) col.style.width = `${width}px`;
    const table = $(".spreadsheet");
    if (table) table.style.width = tableWidth();
    const heading = $(`[data-resize-column="${CSS.escape(resize.key)}"]`)
      ?.closest("th").querySelector(".table-column-heading");
    heading?.classList.toggle("table-column-compact", width <= 128);
  });
  document.addEventListener("pointerup", () => {
    if (!resize) return;
    resize = null;
    renderView(true);
  });
  document.addEventListener("change", async (event) => {
    const el = event.target;
    if (el.dataset.rowSelect) {
      el.checked
        ? selected.add(el.dataset.rowSelect)
        : selected.delete(el.dataset.rowSelect);
    }
    if (el.dataset.rowSelect) {
      $("#grid-selection-count").textContent =
        `${selected.size} selected on this page`;
      $("#grid-bulk").hidden = !selected.size;
    }
    if (el.id === "grid-all") {
      for (const id of rowIds)
        el.checked ? selected.add(id) : selected.delete(id);
      renderView(true);
    }
    if (el.id === "bulk-status" && el.value) {
      const ids=bulkIds();if(!bulkAllowed(ids)) {el.value="";return;}
      const blocked = ids
        .map(task)
        .find((t) => t && !canTransition(state.config, t.status, el.value));
      if (blocked) {
        toast(transitionError(state.config, blocked.status, el.value), true);
        el.value = "";
        return;
      }
      if (
        !confirm(
          `Change status to ${ctx.statusNames[el.value] || el.value} for ${ids.length} tasks (${scopeName()})?`,
        )
      ) {
        el.value = "";
        return;
      }
      for (const id of ids.filter((id) => task(id)))
        await patchTask(id, { status: el.value }, false);
      renderView(true);
    }
  });
  async function click(action, el) {
    if (action === "table-export") {
      const csv = (value) => {
        let text = String(
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
        );
        if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
      };
      const data = [
        columns.map((c) => csv(fieldName(c.key))).join(","),
        ...matchingRows.map((t) =>
          columns.map((c) => csv(fieldValue(t, c.key))).join(","),
        ),
      ].join("\r\n");
      const url = URL.createObjectURL(
        new Blob(["\ufeff", data], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "matching-tasks.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Exported ${matchingRows.length} matching tasks across all pages.`);
      return true;
    }
    if (action === "column-up" || action === "column-down") {
      const i = Number(el.dataset.index),
        j = i + (action === "column-up" ? -1 : 1);
      if (j < 0 || j >= state.tableColumns.length) return true;
      const key = state.tableColumns[i].key;
      [state.tableColumns[i], state.tableColumns[j]] = [
        state.tableColumns[j],
        state.tableColumns[i],
      ];
      redrawColumns(key, action);
      return true;
    }
    if (action === "columns-close") {
      state.headerMenu = null;
      const menu = $(".table-columns-menu");
      menu.open = false;
      menu.querySelector("summary").focus({ preventScroll: true });
      return true;
    }
    if (action === "bulk-archive") {
      const ids=bulkIds();
      if(!bulkAllowed(ids)) return true;
      if(confirm(`Archive ${ids.length} tasks (${scopeName()})? They remain recoverable with Include archived.`)) {
        for(const id of ids) if(task(id)) await patchTask(id,{archived:true},false);
        selected.clear();renderView(true);
      }
      return true;
    }
    return false;
  }
  document.addEventListener("change", (event) => {
    if (event.target.dataset.columnVisible) {
      state.tableColumns.find(
        (c) => c.key === event.target.dataset.columnVisible,
      ).visible = event.target.checked;
      redrawColumns(event.target.dataset.columnVisible);
    }
  });
  return {
    render,
    click,
    value,
    patch,
    preferences: tools.preferences,
    persist: tools.persist,
  };
}
