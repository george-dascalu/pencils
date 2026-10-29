import { validQuery } from "./query-model.js";
import { tableFields } from "./table-model.js";
export function queryEditor(ctx, preferences, persist) {
  const { state, esc, showDialog, closeDialog, dialogHead, toast, renderView } =
    ctx;
  let draft;
  const options = (list, value) =>
    list
      .map(
        ([key, name]) =>
          `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(name)}</option>`,
      )
      .join("");
  const at = (path) =>
    path === ""
      ? draft
      : path
          .split(".")
          .reduce((node, index) => node.rules[Number(index)], draft);
  function rows(node, path = "", depth = 0) {
    if (node.rules)
      return `<fieldset class="query-group"><legend>Match <select data-query-path="${path}" data-query-key="match" aria-label="Combine filter group">${options(
        [
          ["all", "All conditions (AND)"],
          ["any", "Any condition (OR)"],
        ],
        node.match,
      )}</select></legend>${node.rules.map((child, i) => rows(child, path ? `${path}.${i}` : String(i), depth + 1)).join("")}<div class="query-actions"><button type="button" class="button small" data-query-add="condition" data-query-path="${path}">Add condition</button>${depth < 3 ? `<button type="button" class="button small" data-query-add="group" data-query-path="${path}">Add group</button>` : ""}${path ? `<button type="button" class="button small" data-query-remove="${path}">Remove group</button>` : ""}</div></fieldset>`;
    const fields = tableFields(state.config),
      field = fields.find((f) => f.key === node.field);
    const ops = [
      ["contains", "Contains"],
      ["eq", "Equals"],
      ["empty", "Is empty"],
      ["not-empty", "Is not empty"],
      ...(field?.type === "date"
        ? [
            ["before", "Before"],
            ["after", "After"],
            ["today", "Today"],
            ["next7", "Next 7 days"],
            ["overdue", "Overdue and open"],
          ]
        : []),
      ...(node.field === "assignee" ? [["me", "Current user"]] : []),
    ];
    return `<div class="query-rule"><select data-query-path="${path}" data-query-key="field" aria-label="Filter field">${options(
      fields.map((f) => [f.key, f.name]),
      node.field,
    )}</select><select data-query-path="${path}" data-query-key="op" aria-label="Filter operator">${options(ops, node.op)}</select>${["contains", "eq", "before", "after"].includes(node.op) ? `<input data-query-path="${path}" data-query-key="value" aria-label="Filter value" maxlength="500" value="${esc(node.value || "")}" type="${["before", "after"].includes(node.op) ? "date" : "text"}">` : ""}<button type="button" class="icon-button" data-query-remove="${path}" aria-label="Remove condition"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>`;
  }
  function paint() {
    document.querySelector("#query-editor-rules").innerHTML = rows(draft);
  }
  function open() {
    draft = structuredClone(preferences().query || { match: "all", rules: [] });
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Advanced filters")}<form id="query-form"><div class="dialog-body"><p>Combine conditions with AND and OR. These apply together with the shared and column filters. Current user uses your signed-in name.</p><div id="query-editor-rules">${rows(draft)}</div></div><div class="dialog-foot"><button type="button" class="button" data-query-clear>Clear advanced filters</button><button type="submit" class="button primary">Apply filters</button></div></form></dialog>`,
      "query",
    );
  }
  document.addEventListener("input", (e) => {
    if (e.target.dataset.queryKey === "value")
      at(e.target.dataset.queryPath).value = e.target.value;
  });
  document.addEventListener("change", (e) => {
    if (!e.target.dataset.queryKey) return;
    const node = at(e.target.dataset.queryPath);
    node[e.target.dataset.queryKey] = e.target.value;
    if (e.target.dataset.queryKey === "field") {
      node.op = "contains";
      node.value = "";
    }
    paint();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-query-open]")) return open();
    if (e.target.closest("[data-query-clear]")) {
      draft = { match: "all", rules: [] };
      paint();
      return;
    }
    const button = e.target.closest("[data-query-add],[data-query-remove]");
    if (!button) return;
    if (button.hasAttribute("data-query-remove")) {
      const path = button.dataset.queryRemove.split("."),
        index = Number(path.pop());
      at(path.join(".")).rules.splice(index, 1);
    } else {
      const group = at(button.dataset.queryPath),
        child =
          button.dataset.queryAdd === "group"
            ? { match: "all", rules: [] }
            : { field: "title", op: "contains", value: "" };
      group.rules.push(child);
      if (!validQuery(draft)) {
        group.rules.pop();
        toast("Use up to 40 conditions and groups.", true);
      }
    }
    paint();
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "query-form") return;
    e.preventDefault();
    if (!validQuery(draft)) return toast("The filters are invalid.", true);
    const p = preferences();
    if (draft.rules.length) p.query = structuredClone(draft);
    else delete p.query;
    persist();
    state.page = 0;
    closeDialog(true);
    renderView();
  });
}
