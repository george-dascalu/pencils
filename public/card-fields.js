// @ts-check
/** @typedef {import("./model-types.js").ProjectConfig} ProjectConfig */
// Built-in card fields a project can turn off (T23, Settings → Statuses & workflow → Card fields);
// cards always keep their ID and title. Values stay in the files: the page hides the fields
// (card-fields.css, through the root's data-fields-off) and the views that need them. A project
// can also turn off views and whole components (T39, Settings → Views); Overview stays.
export const CARD_FIELDS = [
  ["type", "Type"], ["assignee", "Assignee"], ["status", "Status"], ["priority", "Priority"],
  ["start", "Start date"], ["due", "Due date"], ["estimate", "Estimate"], ["tags", "Tags"], ["parent", "Parent"],
  ["notes", "Notes"],
];
// A view stays while one of its fields is on (Calendar and Timeline place cards by start or due).
/** @type {Record<string, string[]>} */
export const VIEW_NEEDS = { kanban: ["status"], tree: ["parent"], calendar: ["start", "due"], timeline: ["start", "due"], capacity: ["assignee"] };
/** @type {[string, string, string[]][]} */
export const VIEW_GROUPS = [
  ["tasks", "Tasks", ["list", "tree", "table", "kanban"]], ["planning", "Planning", ["calendar", "timeline", "capacity"]],
  ["boards", "Boards", ["board"]], ["documents", "Documents", ["documents"]],
];
/** @param {Partial<ProjectConfig> | null | undefined} config @param {string} field */
export const fieldOn = (config, field) => !config?.off?.includes(field);
/** @param {Partial<ProjectConfig> | null | undefined} config @param {string} view */
export const viewOn = (config, view) => !config?.views_off?.includes(view) && (!VIEW_NEEDS[view] || VIEW_NEEDS[view].some((field) => fieldOn(config, field)));
// New cards need a Tasks or Planning view to show in.
/** @param {Partial<ProjectConfig> | null | undefined} config */
export const cardsOn = (config) => VIEW_GROUPS.slice(0, 2).some(([, , views]) => views.some((view) => viewOn(config, view)));
/** @param {Partial<ProjectConfig> | null | undefined} config */
export const markFieldsOff = (config) => document.documentElement.setAttribute("data-fields-off", (config?.off || []).join(" "));
// What the New card form shows (F0.22-75, Settings → Statuses & workflow → New card form): the title
// always; a project leaves the rest out through schema.create_off, which the form carries in
// data-create-off (card-fields.css). Left out, a part keeps its default and the card editor still has it.
export const NEW_CARD_PARTS = [
  ["type", "Card type"], ["assignee", "Assignee"], ["status", "Status"], ["priority", "Priority"], ["dates", "Dates"], ["tags", "Tags"],
  ["description", "Description"], ["attachments", "Attachments"], ["notes", "Notes"], ["relationships", "Relationships"], ["documents", "Documents"], ["boards", "Boards"],
];
// The card fields a part needs one of; a part whose fields are all off, or whose view is (Documents,
// Boards), isn't offered.
/** @type {Record<string, string[]>} */
const PART_NEEDS = { type: ["type"], assignee: ["assignee"], status: ["status"], priority: ["priority"], dates: ["start", "due"], tags: ["tags"], notes: ["notes"] };
/** @param {Partial<ProjectConfig> | null | undefined} config @param {string} part */
export const newCardPartOffered = (config, part) =>
  (!PART_NEEDS[part] || PART_NEEDS[part].some((field) => fieldOn(config, field))) && (part !== "documents" || viewOn(config, "documents")) && (part !== "boards" || viewOn(config, "board"));
