// Built-in card fields a project can turn off (T23, Settings → Statuses & workflow → Card fields);
// cards always keep their ID and title. Values stay in the files: the page hides the fields
// (card-fields.css, through the root's data-fields-off) and the views that need them.
export const CARD_FIELDS = [
  ["type", "Type"], ["assignee", "Assignee"], ["status", "Status"], ["priority", "Priority"],
  ["start", "Start date"], ["due", "Due date"], ["estimate", "Estimate"], ["tags", "Tags"], ["parent", "Parent"],
];
// A view stays while one of its fields is on (Calendar and Timeline place cards by start or due).
const NEEDS = { kanban: ["status"], tree: ["parent"], calendar: ["start", "due"], timeline: ["start", "due"], capacity: ["assignee"] };
export const fieldOn = (config, field) => !config?.off?.includes(field);
export const viewOn = (config, view) => !NEEDS[view] || NEEDS[view].some((field) => fieldOn(config, field));
export const markFieldsOff = (config) => document.documentElement.setAttribute("data-fields-off", (config?.off || []).join(" "));
