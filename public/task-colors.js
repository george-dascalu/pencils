import { statusColor } from "./workflow-model.js";

export const priorityColors = {
  none: "#89928b",
  low: "#508fb6",
  medium: "#b38a24",
  high: "#d87935",
  urgent: "#cf5555",
};
const peopleColors = [
  "#4b84b8",
  "#9470b2",
  "#368c85",
  "#b76c89",
  "#a17c3e",
  "#708c48",
  "#6979b6",
  "#b7754b",
];

// A project may choose its own priority colours (Settings → Workflow); these are the defaults.
export function taskFieldColor(state, field, value) {
  if (field === "priority") {
    const priority = priorityColors[value] ? value : "none", chosen = state.config?.priority_colors?.[priority];
    // The server accepts only #rrggbb; checking again keeps anything else out of style attributes.
    return /^#[0-9a-f]{6}$/i.test(chosen) ? chosen : priorityColors[priority];
  }
  if (field === "status")
    return statusColor(state.config || { done: [] }, value || "backlog");
  if (field !== "assignee") return "";
  if (!value) return priorityColors.none;
  const person = state.organisation?.people?.find(
    (person) => person.name === value,
  );
  const identity = person?.id || String(value).trim().toLocaleLowerCase();
  let hash = 0;
  for (const character of identity)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return peopleColors[hash % peopleColors.length];
}

export function taskColorAttributes(state, field, value) {
  const color = taskFieldColor(state, field, value);
  return color
    ? `data-task-color="${field}" style="--task-field-color:${color}"`
    : "";
}

// Assignee, status and priority share one box whose border takes the priority's colour.
export const fieldBoxStyle = (state, priority) =>
  `style="--field-box-color:${taskFieldColor(state, "priority", priority)}"`;

export function taskColorDot(state, field, value) {
  return `<span class="task-color-dot" ${taskColorAttributes(state, field, value)} aria-hidden="true"></span>`;
}

export function refreshTaskControlColors(root, state) {
  const controls = [...root.querySelectorAll("[data-task-color]")];
  if (root.matches?.("[data-task-color]")) controls.unshift(root);
  for (const element of controls) {
    const select = element.matches("select")
      ? element
      : element.querySelector("select");
    if (!select) continue;
    element.style.setProperty(
      "--task-field-color",
      taskFieldColor(state, element.dataset.taskColor, select.value),
    );
  }
}

export function installTaskControlColors(getState) {
  document.addEventListener(
    "change",
    (event) => {
      if (!event.target.matches("select")) return;
      const control = event.target.closest("[data-task-color]");
      if (control) refreshTaskControlColors(control, getState());
    },
    true,
  );
}
