import { edgeDependency, dependencyCycle } from "./dependency-model.js";
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
      headSample(
        dependency.active
          ? key === "fromEnd"
            ? "none"
            : "arrow"
          : edge[key] || fallback,
        key === "fromEnd",
      ),
      `<strong>${label}</strong>${arrowHeads.map(([value, name]) => `<button type="button" class="selection-action" data-edge-head="${key}" data-value="${value}" aria-label="${label}: ${name}" aria-pressed="${(edge[key] || fallback) === value}">${headSample(value, key === "fromEnd")}<span class="selection-action-label">${name}</span></button>`).join("")}`,
      dependency.active,
    );
  const lineIcon = (key, value) => {
    const path =
      key === "routing"
        ? {
            curve: "M3 19C3 5 21 19 21 5",
            elbow: "M3 19V12H21V5",
            straight: "M3 19L21 5",
          }[value]
        : "M3 12H21";
    const dash =
      key === "lineStyle"
        ? {
            dashed: 'stroke-dasharray="5 4"',
            dotted: 'stroke-dasharray="1 4"',
          }[value] || ""
        : "";
    return `<svg class="icon connector-line-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${key === "width" ? value : 1.6}" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" stroke-width="${key === "width" ? value : 1.6}" ${dash}/></svg>`;
  };
  const choiceLabel = (key, value) =>
    key === "width" ? `${value} px` : value[0].toUpperCase() + value.slice(1);
  const lineMenu = (key, label, options, value) =>
    menu(
      key,
      `${label}: ${choiceLabel(key, value)}`,
      key === "width" ? icon("stroke-width") : lineIcon(key, value),
      `<strong>${label}</strong>${options.map((option) => `<button type="button" class="selection-action" data-edge-choice="${key}" data-value="${option}" aria-label="${label}: ${choiceLabel(key, option)}" aria-pressed="${option === value}">${lineIcon(key, option)}<span class="selection-action-label">${choiceLabel(key, option)}</span></button>`).join("")}`,
    );
  const route =
    lineMenu(
      "routing",
      "Route",
      ["curve", "elbow", "straight"],
      edge.routing || "curve",
    ) +
    lineMenu(
      "lineStyle",
      "Stroke",
      ["solid", "dashed", "dotted"],
      edge.lineStyle || "solid",
    ) +
    lineMenu(
      "width",
      "Thickness",
      ["1", "2", "3", "5"],
      String(edge.width || 2),
    );
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
      '<button type="button" data-connector-command="reset-bends">Reset bends</button><label><input type="checkbox" data-edge-field="lineJumps" ' +
      (edge.lineJumps ? "checked" : "") +
      '> Line jumps (straight / elbow)</label><p class="conversion-hint">Use Task dependency to link two project tasks. Removing a line keeps its task dependency.</p>',
  );
  const dependency = edgeDependency(ctx.board(), edge, ctx.state.tasks);
  const cyclic =
    dependency.valid &&
    !dependency.active &&
    dependencyCycle(
      ctx.state.tasks,
      dependency.target.id,
      dependency.source.id,
    );
  const dependencyMenu = menu(
    "dependency",
    "Task dependency",
    icon("connect"),
    `<strong>Task dependency</strong>${
      dependency.valid
        ? `<p class="conversion-hint">${esc(dependency.source.key || dependency.source.title)} → ${esc(dependency.target.key || dependency.target.title)}<br>The start task must finish before the end task.</p>${button("pro", dependency.active ? "edge-dependency-remove" : "edge-dependency", dependency.active ? "Remove dependency" : "Make dependency", "connect", !dependency.active && cyclic)}${cyclic && !dependency.active ? '<p class="conversion-hint">This direction would create a dependency cycle.</p>' : ""}<p class="conversion-hint">Removing the line keeps the dependency. Use Remove dependency to unlink the tasks.</p>`
        : edge.planRelation === "parent"
          ? '<p class="conversion-hint">This arrow shows a parent–child relationship. Change the task parent, then choose Update plan on its Project frame.</p>'
          : '<p class="conversion-hint">Connect two different project task cards. Finalise draft tasks first.</p>'
    }`,
  );
  const color = ctx.colorPicker({
    value: palette[edge.color] || edge.color || "#78906f",
    label: "Connector colour",
    selection: true,
  });
  return `<div id="selection-tools" class="selection-tools connector-tools" role="toolbar" aria-label="${count > 1 ? "Selected connectors" : "Selected connector"}" data-connector-id="${esc(edge.id)}"><div class="selection-row" role="group" aria-label="Common tools">${filter ? group("Selection", filter) : ""}${group("Connector actions", count === 1 ? button("action", "edge-delete", "Delete connector", "trash") : button("feature", "duplicate", "Duplicate", "duplicate") + button("feature", "selection-delete", "Delete", "trash"))}</div><div class="selection-row" role="group" aria-label="Tools for this connector">${count === 1 && dependency.active ? group("Dependency style", button("feature", "board-settings", "Dependency arrow style in Board appearance", "settings")) : group("Endpoints", head("fromEnd", "Start style", "none") + head("toEnd", "End style", "arrow")) + group("Line appearance", route + color)}${count === 1 ? group("Connection details", dependencyMenu + label + more) : ""}</div></div>`;
}
