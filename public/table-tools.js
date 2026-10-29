import { queryEditor } from "./query-editor.js";
import { priorityOptions, priorityLabel } from "./task-priority.js";
import {
  tableFields,
  tablePreferences,
  tableValue,
  valueKey,
  activeTableFilter,
} from "./table-model.js";
export function tableTools(ctx) {
  const { state, esc, icon, storage, renderView } = ctx;
  queryEditor(ctx, preferences, persist);
  let timer;
  const storageKey = () =>
    `table:${state.session?.user?.username || "shared"}:${state.project.id}`;
  function preferences() {
    state.tablePreferences = tablePreferences(
      state.tablePreferences ?? storage.get(storageKey(), null),
      state.config,
    );
    return state.tablePreferences;
  }
  function persist() {
    storage.set(storageKey(), preferences());
  }
  function display(key, v) {
    if (v === "")
      return key === "assignee"
        ? "Unassigned"
        : key === "parent"
          ? "No parent"
          : "Empty";
    if (key === "parent")
      return state.tasks.find((t) => t.id === v)?.title || v;
    if (key === "status") return ctx.statusNames[v] || v;
    if (key === "priority") return priorityLabel(v);
    if (key === "type") return ctx.label(v);
    const custom = state.config.fields.find((f) => `fields.${f.id}` === key);
    if (custom?.type === "checkbox") return v === "true" ? "Yes" : "No";
    return v;
  }
  function optionValues(key) {
    const values = new Set([""]);
    const field = state.config.fields.find((f) => `fields.${f.id}` === key);
    const configured =
      key === "status"
        ? state.config.statuses
        : key === "type"
          ? state.config.types
          : key === "priority"
            ? priorityOptions
            : field?.type === "select"
              ? field.options
              : field?.type === "checkbox"
                ? ["true", "false"]
                : [];
    configured.forEach((v) => values.add(v));
    for (const t of state.tasks) {
      const raw = tableValue(t, key);
      for (const v of Array.isArray(raw) ? raw : [raw]) values.add(valueKey(v));
    }
    preferences()
      .filters.find((f) => f.field === key)
      ?.values?.forEach((v) => values.add(v));
    if (key === "priority") return [...values].sort((a, b) => {
      const rank = value => priorityOptions.includes(value) ? priorityOptions.indexOf(value) : priorityOptions.length;
      return rank(a) - rank(b) || display(key, a).localeCompare(display(key, b));
    });
    return [...values].sort((a, b) =>
      display(key, a).localeCompare(display(key, b), undefined, {
        numeric: true,
      }),
    );
  }
  const fieldOptions = (value, exclude = []) =>
    tableFields(state.config)
      .filter((f) => !exclude.includes(f.key) || f.key === value)
      .map(
        (f) =>
          `<option value="${esc(f.key)}" ${value === f.key ? "selected" : ""}>${esc(f.name)}</option>`,
      )
      .join("");
  const button = (action, name, glyph, extra = "") =>
    `<button type="button" class="icon-button" data-table-action="${action}" aria-label="${esc(name)}" title="${esc(name)}" ${extra}>${icon(glyph)}</button>`;
  const menu = (key, name, body) =>
    `<details class="board-menu" data-board-menu="table-${key}" ${state.headerMenu === `table-${key}` ? "open" : ""}><summary>${icon(key === "groups" ? "group" : key === "sorts" ? "sort" : "filter")}${name}<svg class="icon menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></summary><div class="board-menu-panel table-menu-panel">${body}</div></details>`;
  function filterHTML(f, i) {
    const field = tableFields(state.config).find((x) => x.key === f.field);
    const ops =
      field.type === "options"
        ? [
            ["values", "Choose values"],
            ["empty", "Is empty"],
            ["not-empty", "Is not empty"],
          ]
        : field.type === "number" || field.type === "date"
          ? [
              ["range", "Between"],
              ["empty", "Is empty"],
              ["not-empty", "Is not empty"],
            ]
          : [
              ["contains", "Contains"],
              ["not-contains", "Does not contain"],
              ["empty", "Is empty"],
              ["not-empty", "Is not empty"],
            ];
    const attrs = `data-table-filter="${i}"`;
    const query = state.tableFilterSearch?.[f.field] || "";
    return `<fieldset class="table-filter-rule"><legend>${esc(field.name)}</legend><div class="table-rule"><select ${attrs} data-filter-part="op" aria-label="${esc(field.name)} filter condition">${ops.map(([v, l]) => `<option value="${v}" ${v === f.op ? "selected" : ""}>${l}</option>`).join("")}</select>${button("remove-filter", `Remove ${field.name} filter`, "close", `data-index="${i}"`)}</div>${
      f.op === "values"
        ? `<input type="search" data-option-search="${i}" aria-label="Search ${esc(field.name)} values" placeholder="Search values…" value="${esc(query)}"><div class="table-filter-values" data-filter-values="${esc(f.field)}">${optionValues(
            f.field,
          )
            .map(
              (v) =>
                `<label ${display(f.field, v).toLowerCase().includes(query.toLowerCase()) ? "" : "hidden"}><input type="checkbox" ${attrs} data-filter-part="values" value="${esc(v)}" ${f.values?.includes(v) ? "checked" : ""}>${esc(display(f.field, v))}</label>`,
            )
            .join(
              "",
            )}</div><small>Select one or more values. No selection shows all.</small>`
        : f.op === "range"
          ? `<div class="table-range">${["min", "max"].map((k) => `<label>${k === "min" ? "From" : "To"}<input type="${field.type === "date" ? "date" : "number"}" step="any" ${attrs} data-filter-part="${k}" aria-label="${esc(field.name)} ${k === "min" ? "from" : "to"}" value="${esc(f[k] || "")}"></label>`).join("")}</div>`
          : ["empty", "not-empty"].includes(f.op)
            ? ""
            : `<input type="text" ${attrs} data-filter-part="value" aria-label="${esc(field.name)} filter text" placeholder="Enter text…" maxlength="500" value="${esc(f.value || "")}">`
    }</fieldset>`;
  }
  function html() {
    const p = preferences(),
      fields = tableFields(state.config),
      count = p.filters.filter(activeTableFilter).length;
    const groups = `${[0, 1].map((i) => `<label class="field">${i ? "Then group by" : "Group by"}<select data-table-group="${i}" aria-label="${i ? "Then group by" : "Group table by"}" ${i && !p.groups[0] ? "disabled" : ""}><option value="">None</option>${fieldOptions(p.groups[i], p.groups)}</select></label>`).join("")}<div class="table-rule"><button class="button small" data-table-action="expand">Expand all</button><button class="button small" data-table-action="collapse">Collapse all</button></div><button type="button" class="button small" data-table-action="clear-groups" ${p.groups.length ? "" : "disabled"}>Reset grouping</button>`;
    const sorts = `${p.sorts
      .map(
        (s, i) =>
          `<div class="table-rule"><select data-table-sort="${i}" data-sort-part="field" aria-label="Sort field ${i + 1}">${fieldOptions(
            s.field,
            p.sorts.map((x) => x.field),
          )}</select><select data-table-sort="${i}" data-sort-part="dir" aria-label="Sort direction ${i + 1}"><option value="1" ${s.dir === 1 ? "selected" : ""}>Ascending</option><option value="-1" ${s.dir === -1 ? "selected" : ""}>Descending</option></select>${button("remove-sort", `Remove sort ${i + 1}`, "close", `data-index="${i}"`)}</div>`,
      )
      .join(
        "",
      )}<button class="button small" data-table-action="add-sort" ${p.sorts.length >= 3 ? "disabled" : ""}>${icon("plus")}Add sort</button>${p.sorts.length ? '<button class="button small" data-table-action="clear-sorts">Clear sorting</button>' : ""}`;
    const available = fields.filter(
      (f) => !p.filters.some((x) => x.field === f.key),
    );
    const filters = `${p.filters.map(filterHTML).join("")}<label class="field">Add column filter<select id="table-add-filter" aria-label="Add column filter"><option value="">Choose a column…</option>${available.map((f) => `<option value="${esc(f.key)}">${esc(f.name)}</option>`).join("")}</select></label>${p.filters.length ? '<button class="button small" data-table-action="clear-filters">Clear column filters</button>' : ""}`;
    return `<div class="table-view-tools">${menu("groups", `Group${p.groups.length ? ` (${p.groups.length})` : ""}`, groups)}${menu("sorts", `Sort${p.sorts.length ? ` (${p.sorts.length})` : ""}`, sorts)}${menu("filters", `Column filters${count ? ` (${count})` : ""}`, `${filters}<footer class="table-menu-footer"><button type="button" class="button small" data-query-open>Advanced filters${p.query ? " · Active" : ""}</button></footer>`)}${p.groups.length || p.sorts.length || p.filters.length || p.query ? '<button class="button small" data-table-action="reset">Reset table view</button>' : ""}</div>`;
  }
  function redraw() {
    const scroll = document.querySelector(".table-scroll")?.scrollLeft || 0;
    const panels = [
      ...document.querySelectorAll(".table-menu-panel, [data-filter-values]"),
    ].map((el) => ({
      key: el.dataset.filterValues,
      menu: el.closest("[data-board-menu]")?.dataset.boardMenu,
      top: el.scrollTop,
    }));
    renderView(true);
    const table = document.querySelector(".table-scroll");
    if (table) table.scrollLeft = scroll;
    for (const p of panels) {
      const el = document.querySelector(
        p.key
          ? `[data-filter-values="${CSS.escape(p.key)}"]`
          : `[data-board-menu="${p.menu}"] .table-menu-panel`,
      );
      if (el) el.scrollTop = p.top;
    }
  }
  function commit(menu, focus) {
    clearTimeout(timer);
    state.page = 0;
    if (menu) state.headerMenu = `table-${menu}`;
    persist();
    redraw();
    if (focus) {
      const el = document.querySelector(focus.selector);
      el?.focus({ preventScroll: true });
      if (focus.start != null && el?.type === "text")
        el.setSelectionRange(focus.start, focus.end);
    }
  }
  function addFilter(key) {
    const p = preferences(),
      field = tableFields(state.config).find((f) => f.key === key);
    if (!field) return;
    if (!p.filters.some((f) => f.field === key))
      p.filters.push({
        field: key,
        op:
          field.type === "options"
            ? "values"
            : ["date", "number"].includes(field.type)
              ? "range"
              : "contains",
      });
    commit("filters");
    const index = preferences().filters.findIndex((filter) => filter.field === key);
    document.querySelector(`[data-board-menu="table-filters"] [data-table-filter="${index}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }
  function change(el) {
    if (state.view !== "table") return;
    const p = preferences();
    if (el.dataset.tableGroup != null) {
      p.groups[Number(el.dataset.tableGroup)] = el.value;
      p.groups =
        el.dataset.tableGroup === "0" && !el.value
          ? []
          : p.groups.filter(Boolean);
      state.tableCollapsed = new Set();
      commit("groups", {
        selector: `[data-table-group="${el.dataset.tableGroup}"]`,
      });
    } else if (el.dataset.tableSort != null) {
      const s = p.sorts[+el.dataset.tableSort];
      if (!s) return;
      s[el.dataset.sortPart] =
        el.dataset.sortPart === "dir" ? +el.value : el.value;
      commit("sorts", {
        selector: `[data-table-sort="${el.dataset.tableSort}"][data-sort-part="${el.dataset.sortPart}"]`,
      });
    } else if (el.id === "table-add-filter") addFilter(el.value);
    else if (el.dataset.tableFilter != null) {
      const f = p.filters[+el.dataset.tableFilter];
      if (!f) return;
      const k = el.dataset.filterPart;
      if (k === "values") {
        const values = new Set(f.values || []);
        el.checked ? values.add(el.value) : values.delete(el.value);
        f.values = [...values];
      } else f[k] = el.value;
      const focus = {
        selector: `[data-table-filter="${el.dataset.tableFilter}"][data-filter-part="${k}"]${k === "values" ? `[value="${CSS.escape(el.value)}"]` : ""}`,
        start: el.selectionStart,
        end: el.selectionEnd,
      };
      commit("filters", focus);
    }
  }
  document.addEventListener("change", (e) => change(e.target));
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.optionSearch != null) {
      const filter = preferences().filters[+el.dataset.optionSearch];
      if (filter) {
        state.tableFilterSearch ||= {};
        state.tableFilterSearch[filter.field] = el.value;
      }
      for (const label of el.nextElementSibling.querySelectorAll("label"))
        label.hidden = !label.textContent
          .toLowerCase()
          .includes(el.value.toLowerCase());
    } else if (
      el.matches(
        '[data-table-filter][data-filter-part="value"], [data-table-filter][data-filter-part="min"], [data-table-filter][data-filter-part="max"]',
      )
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (el.isConnected) change(el);
      }, 350);
    }
  });
  document.addEventListener("click", (e) => {
    if (state.view !== "table") return;
    const el = e.target.closest(
      "[data-table-action],[data-table-sort-column],[data-table-column-action]",
    );
    if (!el) return;
    const p = preferences();
    if (el.dataset.tableColumnAction) {
      const action = el.dataset.tableColumnAction,
        field = el.dataset.column;
      if (action === "filter") return addFilter(field);
      const headers = [...document.querySelectorAll(".spreadsheet th[data-column-key]")];
      const index = headers.findIndex((header) => header.dataset.columnKey === field);
      const focusColumn = action === "hide"
        ? (headers[index + 1] || headers[index - 1])?.dataset.columnKey
        : field;
      if (action === "asc" || action === "desc")
        p.sorts = [{ field, dir: action === "asc" ? 1 : -1 }];
      if (action === "group") {
        p.groups = [field];
        state.tableCollapsed = new Set();
      }
      if (action === "hide") {
        state.tableColumns ||= tableFields(state.config).map((f) => ({
          key: f.key,
          width: f.key === "title" ? 300 : 160,
          visible: true,
        }));
        const column = state.tableColumns.find((c) => c.key === field);
        if (column) column.visible = false;
      }
      commit(null, { selector: focusColumn
        ? `.spreadsheet th[data-column-key="${CSS.escape(focusColumn)}"] .table-header-menu > summary`
        : '[data-board-menu="table-columns"] > summary' });
      return;
    }
    if (el.dataset.tableSortColumn) {
      const field = el.dataset.tableSortColumn,
        current = p.sorts.find((s) => s.field === field);
      const next = !current
        ? { field, dir: 1 }
        : current.dir === 1
          ? { field, dir: -1 }
          : null;
      if (!e.shiftKey) p.sorts = next ? [next] : [];
      else {
        p.sorts = p.sorts.filter((s) => s.field !== field);
        if (next) p.sorts.push(next);
        p.sorts = p.sorts.slice(-3);
      }
      commit();
      return;
    }
    const action = el.dataset.tableAction;
    if (action === "clear-groups") {
      p.groups = [];
      state.tableCollapsed = new Set();
      commit("groups", { selector: '[data-table-group="0"]' });
      return;
    }
    if (action === "remove-sort") p.sorts.splice(+el.dataset.index, 1);
    if (action === "clear-sorts") p.sorts = [];
    if (action === "add-sort" && p.sorts.length < 3)
      p.sorts.push({
        field: tableFields(state.config).find(
          (f) => !p.sorts.some((s) => s.field === f.key),
        ).key,
        dir: 1,
      });
    if (action === "remove-filter") p.filters.splice(+el.dataset.index, 1);
    if (action === "clear-filters") p.filters = [];
    if (action === "reset") {
      state.tablePreferences = { groups: [], sorts: [], filters: [] };
      state.tableCollapsed = new Set();
    }
    if (action === "expand") state.tableCollapsed = new Set();
    if (action === "collapse")
      state.tableCollapsed = new Set(state.tableGroupPaths || []);
    if (action === "group-toggle") {
      state.tableCollapsed ||= new Set();
      const key = el.dataset.group;
      state.tableCollapsed.has(key)
        ? state.tableCollapsed.delete(key)
        : state.tableCollapsed.add(key);
      persist();
      redraw();
      return;
    }
    commit(
      action.includes("sort")
        ? "sorts"
        : action.includes("filter")
          ? "filters"
          : ["expand", "collapse"].includes(action)
            ? "groups"
            : null,
    );
  });
  let edited = false;
  function refreshEdited() {
    if (
      !edited ||
      state.view !== "table" ||
      state.dialog ||
      document.activeElement?.closest("[data-cell]")
    )
      return;
    edited = false;
    redraw();
  }
  document.addEventListener("table-cell-saved", (e) => {
    const p = preferences(),
      key = e.detail;
    if (
      p.groups.includes(key) ||
      p.sorts.some((s) => s.field === key) ||
      p.filters.some((f) => f.field === key && activeTableFilter(f))
    ) {
      edited = true;
      refreshEdited();
    }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.closest("[data-cell]")) setTimeout(refreshEdited, 0);
  });
  return { html, preferences, persist, display };
}
