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
  const standard = [
    "title",
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
  const fieldValue = (t, key) =>
    key.startsWith("fields.") ? t.fields?.[key.slice(7)] : t[key];
  const fields = () => [
    ...standard,
    ...(state.config?.fields || []).map((f) => `fields.${f.id}`),
  ];
  const fieldName = (key) =>
    key.startsWith("fields.")
      ? state.config.fields.find((f) => `fields.${f.id}` === key)?.name
      : label(key);
  function config() {
    const saved =
      state.tableColumns ||
      fields().map((key) => ({
        key,
        width: key === "title" ? 300 : 160,
        visible: true,
      }));
    const valid = saved.filter((c) => fields().includes(c.key));
    for (const key of fields()) {
      if (!valid.some((c) => c.key === key))
        valid.push({ key, width: 160, visible: true });
    }
    return valid;
  }
  function render(tasks) {
    columns = config().filter((c) => c.visible !== false);
    rowIds = tasks.map((t) => t.id);
    cells = [];
    anchor = null;
    focus = null;
    const custom = (key) =>
      state.config.fields.find((f) => `fields.${f.id}` === key);
    const cell = (t, key) => {
      const field = custom(key),
        value = fieldValue(t, key),
        attrs = `data-task-field="${esc(key)}" data-id="${esc(t.id)}" aria-label="${esc(fieldName(key))} for ${esc(t.title)}"`;
      const values =
        key === "type"
          ? state.config.types
          : key === "status"
            ? state.config.statuses
            : key === "priority"
              ? ["none", "low", "medium", "high", "urgent"]
              : field?.type === "select"
                ? field.options
                : null;
      if (values) return `<select ${attrs}>${options(values, value)}</select>`;
      if (key === "parent")
        return `<select ${attrs}><option value="">No parent</option>${state.tasks
          .filter((x) => x.id !== t.id)
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === value ? "selected" : ""}>${esc(x.title)}</option>`,
          )
          .join("")}</select>`;
      if (field?.type === "checkbox")
        return `<select ${attrs}>${options(["false", "true"], String(value || false))}</select>`;
      return `<input ${attrs} type="${["start", "due"].includes(key) || field?.type === "date" ? "date" : key === "estimate" || field?.type === "number" ? "number" : "text"}" value="${esc(Array.isArray(value) ? value.join(", ") : (value ?? ""))}" ${key === "title" ? 'maxlength="300" required' : ""}>`;
    };
    return `<div class="grid-tools"><button class="button small" data-feature="columns">Columns</button><label>Bulk status <select id="bulk-status"><option value="">Choose…</option>${options(state.config.statuses, "")}</select></label><button class="button small" data-feature="bulk-archive">Archive selected rows</button><span>Shift-click cells for a range · Ctrl/Cmd+C/V · Alt+arrows to navigate</span></div><div class="table-scroll"><table class="task-table spreadsheet" role="grid" aria-label="Tasks spreadsheet"><colgroup><col style="width:60px">${columns.map((c) => `<col style="width:${c.width || 160}px">`).join("")}</colgroup><thead><tr><th><input type="checkbox" id="grid-all" aria-label="Select all visible rows"></th>${columns.map((c) => `<th><button data-action="sort-column" data-field="${esc(c.key)}">${esc(fieldName(c.key))}</button><span class="column-resizer" data-resize-column="${esc(c.key)}" role="separator" aria-label="Resize ${esc(fieldName(c.key))}" tabindex="0"></span></th>`).join("")}</tr></thead><tbody>${tasks.map((t, r) => `<tr><td><input type="checkbox" data-row-select="${t.id}" ${selected.has(t.id) ? "checked" : ""} aria-label="Select ${esc(t.title)}"><button class="table-open" data-action="task-open" data-id="${t.id}" aria-label="Open ${esc(t.title)}">↗</button></td>${columns.map((c, k) => `<td data-cell="${r},${k}">${cell(t, c.key)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><button class="add-row" data-action="task-new">+ New row</button>`;
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
    try {
      const rows = text
        .replace(/\r/g, "")
        .replace(/\n$/, "")
        .split("\n")
        .map((r) => r.split("\t"));
      if (rows.length > 100) throw new Error("Paste up to 100 rows at a time.");
      const patches = new Map();
      for (let r = 0; r < rows.length; r++) {
        const id = rowIds[focus[0] + r];
        if (!id) throw new Error("Add enough rows before pasting.");
        for (let c = 0; c < rows[r].length; c++) {
          const col = columns[focus[1] + c];
          if (!col)
            throw new Error(
              "The pasted range extends beyond the visible columns.",
            );
          const next = patch(id, col.key, value(col.key, rows[r][c])),
            current = patches.get(id) || {};
          patches.set(id, {
            ...current,
            ...next,
            ...(next.fields
              ? {
                  fields: {
                    ...next.fields,
                    ...current.fields,
                    [col.key.slice(7)]: value(col.key, rows[r][c]),
                  },
                }
              : {}),
          });
        }
      }
      for (const [id, changes] of patches) await patchTask(id, changes, false);
      renderView(true);
      toast(
        `Pasted ${patches.size} rows. Check Recovery for any rejected values.`,
      );
    } catch (error) {
      toast(error.message, true);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      state.view !== "table" ||
      state.dialog ||
      !event.target.closest(".spreadsheet")
    )
      return;
    const resize = event.target.closest("[data-resize-column]");
    if (resize && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const cols = config();
      cols.find((c) => c.key === resize.dataset.resizeColumn).width = Math.max(
        90,
        (cols.find((c) => c.key === resize.dataset.resizeColumn).width || 160) +
          (event.key === "ArrowRight" ? 20 : -20),
      );
      state.tableColumns = cols;
      renderView(true);
      return;
    }
    if (!focus) return;
    const directions = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if ((event.altKey && directions[event.key]) || event.key === "Enter") {
      event.preventDefault();
      const delta = directions[event.key] || [event.shiftKey ? -1 : 1, 0];
      focus = [
        Math.min(rowIds.length - 1, Math.max(0, focus[0] + delta[0])),
        Math.min(columns.length - 1, Math.max(0, focus[1] + delta[1])),
      ];
      if (!event.shiftKey) anchor = focus;
      paint();
      $(`[data-cell="${focus}"] input,[data-cell="${focus}"] select`)?.focus();
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
  });
  document.addEventListener("pointerup", () => (resize = null));
  document.addEventListener("change", async (event) => {
    const el = event.target;
    if (el.dataset.rowSelect) {
      el.checked
        ? selected.add(el.dataset.rowSelect)
        : selected.delete(el.dataset.rowSelect);
    }
    if (el.id === "grid-all") {
      for (const id of rowIds)
        el.checked ? selected.add(id) : selected.delete(id);
      renderView(true);
    }
    if (el.id === "bulk-status" && el.value) {
      for (const id of [...selected].filter((id) => task(id)))
        await patchTask(id, { status: el.value }, false);
      renderView(true);
    }
  });
  async function click(action, el) {
    if (action === "columns") {
      state.tableColumns = config();
      showDialog(
        `<dialog class="dialog">${dialogHead("Table columns")}<div class="dialog-body"><p>Show, resize and reorder columns. Save a named view to share this layout.</p><div id="column-list">${state.tableColumns.map((c, i) => `<div class="column-setting"><label><input type="checkbox" data-column-visible="${esc(c.key)}" ${c.visible !== false ? "checked" : ""}> ${esc(fieldName(c.key))}</label><button class="button small" data-feature="column-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button class="button small" data-feature="column-down" data-index="${i}" ${i === state.tableColumns.length - 1 ? "disabled" : ""}>↓</button></div>`).join("")}</div></div><div class="dialog-foot"><button class="button primary" data-feature="columns-done">Done</button></div></dialog>`,
        "columns",
      );
      return true;
    }
    if (action === "column-up" || action === "column-down") {
      const i = Number(el.dataset.index),
        j = i + (action === "column-up" ? -1 : 1);
      [state.tableColumns[i], state.tableColumns[j]] = [
        state.tableColumns[j],
        state.tableColumns[i],
      ];
      closeDialog(true);
      await click("columns");
      return true;
    }
    if (action === "columns-done") {
      closeDialog(true);
      renderView();
      return true;
    }
    if (action === "bulk-archive") {
      if (!selected.size) {
        toast("Select rows first.");
        return true;
      }
      if (confirm(`Archive ${selected.size} selected tasks?`)) {
        for (const id of [...selected].filter((id) => task(id)))
          await patchTask(id, { archived: true }, false);
        selected.clear();
        renderView(true);
      }
      return true;
    }
    return false;
  }
  document.addEventListener("change", (event) => {
    if (event.target.dataset.columnVisible)
      state.tableColumns.find(
        (c) => c.key === event.target.dataset.columnVisible,
      ).visible = event.target.checked;
  });
  return { render, click, value, patch };
}
