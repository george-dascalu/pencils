import { arrowHeads, headSample } from "./connector-style.js";
import { palette } from "./canvas-format.js";
export function connectorToolbar(
  ctx,
  edge,
  { menu, group, button, count = 1, filter = "" },
) {
  const { esc, icon } = ctx;
  const field = (key, label, options, value) =>
    `<label class="field">${label}<select data-edge-field="${key}" aria-label="${label}">${options.map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select></label>`;
  const head = (key, label, fallback) =>
    menu(
      key,
      label,
      headSample(edge[key] || fallback, key === "fromEnd"),
      `<strong>${label}</strong>${arrowHeads.map(([value, name]) => `<button type="button" class="selection-action" data-edge-head="${key}" data-value="${value}" aria-label="${label}: ${name}" aria-pressed="${(edge[key] || fallback) === value}">${headSample(value, key === "fromEnd")}<span class="selection-action-label">${name}</span></button>`).join("")}`,
    );
  const route = [
    [
      "routing",
      "Route",
      ["curve", "elbow", "straight"],
      edge.routing || "curve",
    ],
    [
      "lineStyle",
      "Stroke",
      ["solid", "dashed", "dotted"],
      edge.lineStyle || "solid",
    ],
    ["width", "Thickness", ["1", "2", "3", "5"], String(edge.width || 2)],
  ]
    .map(([key, label, options, value]) =>
      field(key, label, options, value).replace(
        'class="field"',
        'class="field connector-inline-field"',
      ),
    )
    .join("");
  const label = menu(
    "label",
    "Connector label",
    icon("text"),
    `<label class="field">Label<input data-edge-field="label" aria-label="Connector label text" maxlength="500" placeholder="Add a label…" value="${esc(edge.label || "")}"></label>${(edge.labels || []).map((label, i) => `<label class="field">Label ${i + 2}<input data-extra-label="${i}" maxlength="500" value="${esc(label.text)}"></label><button type="button" data-delete-label="${i}">Remove label ${i + 2}</button>`).join("")}<button type="button" data-connector-command="add-label">Add another label</button><span class="conversion-hint">Drag labels on the board to reposition them.</span>`,
  );
  const more = menu(
    "connection",
    "Connection options",
    icon("settings"),
    field(
      "relationship",
      "Relationship",
      ["relates", "blocks", "contains", "sequence"],
      edge.relationship || "relates",
    ) +
      field(
        "fromSide",
        "Start attachment",
        ["auto", "top", "right", "bottom", "left"],
        edge.fromSide || "auto",
      ) +
      field(
        "toSide",
        "End attachment",
        ["auto", "top", "right", "bottom", "left"],
        edge.toSide || "auto",
      ) +
      button(
        "pro",
        "edge-dependency",
        "Create task dependency",
        "connect",
        edge.relationship !== "blocks",
      ) +
      '<button type="button" data-connector-command="reset-bends">Reset bends</button><label><input type="checkbox" data-edge-field="lineJumps" ' +
      (edge.lineJumps ? "checked" : "") +
      '> Line jumps (straight / elbow)</label><p class="conversion-hint">For task cards: the destination depends on the source. Deleting this line leaves the task dependency intact.</p>',
  );
  const color = ctx.colorPicker({
    value: palette[edge.color] || edge.color || "#78906f",
    label: "Connector colour",
    selection: true,
  });
  return `<div id="selection-tools" class="selection-tools connector-tools" role="toolbar" aria-label="${count > 1 ? "Selected connectors" : "Selected connector"}" data-connector-id="${esc(edge.id)}">${filter ? group("Selection", filter) : ""}${group("Endpoints", head("fromEnd", "Start style", "none") + head("toEnd", "End style", "arrow"))}${group("Line appearance", route + color)}${count === 1 ? group("Connection details", label + more) : ""}${group("Connector actions", count === 1 ? button("action", "edge-delete", "Delete connector", "trash") : button("feature", "duplicate", "Duplicate", "duplicate") + button("feature", "selection-delete", "Delete", "trash"))}</div>`;
}
