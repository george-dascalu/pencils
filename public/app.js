import { APP_VERSION, watchAppVersion } from "./app-version.js";
import { DEFAULT_TASK_TYPES } from "./task-types.js";
import { updateViewLayout } from "./view-layout.js";
import { installEditableControlGuard } from "./editable-controls.js";
import { taskFocus } from "./task-focus.js";
import { focusOnOpen, prepareDialogFocus } from "./open-focus.js";
import { randomUUID } from "./uuid.js";
import { formatDay } from "./format-date.js";
import { confirmAction } from "./confirm-popover.js";
import { priorityOptions as priorities, priorityLabels, priorityLabel, defaultPriority } from "./task-priority.js";
import { browserNavigation } from "./navigation.js";
import { installEdgeSwipeGuard, installPageZoomGuard, installAxisLockedScroll } from "./scroll-gestures.js";
import { helpPageHTML } from "./help.js";
import { helpArticle } from "./help-content.js";
import { saveState, saveIssue } from "./save-state.js";
import { appStatus } from "./app-status.js";
import {sourceLabel} from "./source-model.js";
import { pageOf, treePage } from "./task-visibility.js";
import { renderCanvasEdges } from "./canvas-lines.js";
import { boardTaskState, unavailableTaskHTML } from "./board-task-state.js";
import { draftTaskData, draftTaskFields } from "./draft-task.js";
import { installSelectMenus } from "./select-menu.js";
import { taskColorAttributes, taskColorDot, taskFieldColor, installTaskControlColors, fieldBoxStyle } from "./task-colors.js";
import { boardObjectDialog } from "./board-object-panel.js";
import { boardTaskEditor } from "./board-task-editor.js";
import { installDatePickers } from "./date-picker.js";
import {
  canTransition,
  nextStatuses,
  initialStatus,
  statusLabel,
  transitionError,
} from "./workflow-model.js";
import { assigneeOptions, assigneeHint } from "./teams.js";
import { taskPickerHTML } from "./task-modal.js";
import { updateFrameMembership } from "./frame-model.js";
import { taskDescriptionHTML } from "./task-description.js";
import { textAlignment } from "./text-alignment.js";
import { nodeMinimum, visualNodeType, isTaskNote } from "./node-layout.js";
import { smoothZoom } from "./camera-motion.js";
import { paintBoardBackground } from "./board-background.js";
import { installColorPickers } from "./color-picker.js";
import { installBookmarks } from "./bookmarks.js";
import { tabBar, boardFloor } from "./layout-tray.js";
import { kanbanDrag } from "./kanban-drag.js";
import { observeKanbanLayout } from "./kanban-layout.js";
import { kanbanGroup, kanbanLanes, laneKey } from "./kanban-model.js";
import { taskReorderHandle } from "./task-reorder.js";
import { compareTaskOrder } from "./task-order-model.js";
import { SaveQueue } from "./sync.js";
import { createMarkdown } from "./markdown.js";
import { installFeatures } from "./features.js";
const $ = (selector, root = document) => root.querySelector(selector);
// The sidebar opens over the content, so the swipe in from the left edge opens it.
installEdgeSwipeGuard({
  onSwipeFromLeft: () => {
    if (!state.menu && !state.dialog && $(".sidebar")) setSidebarOpen(true);
  },
});
installPageZoomGuard();
installAxisLockedScroll("#view-content > .table-scroll");
installEditableControlGuard();
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  warning: "M12 3 2 21h20L12 3zM12 9v5M12 17v.01",
  "case-sensitive": "M3 18 8 5l5 13M5 13h6M16 10c5-3 6 2 6 4v4M22 12c-8-2-8 8 0 5",
  "whole-word": "M3 7v12h18V7M7 14l2-6 2 6 2-6 2 6 2-6",
  regexp: "M6 16h.01M16 4v10M11 6l10 6M11 12l10-6",
  "select-all": "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h10v10H7z",
  replace: "M4 4h8v5H4zM12 14h8v6h-8zM8 10v7h3m-3-3 3 3-3 3",
  "replace-all": "M3 3h7v5H3zM13 3h7v5h-7zM3 15h7v5H3zM13 15h7v5h-7zM6 9v5m-2-2 2 2 2-2M16 9v5m-2-2 2 2 2-2",
  highlight: "m6 14 8-11 6 5-8 11zM6 14l6 5M6 17l-3 4h7",
  codeblock: "M3 3h18v18H3zM9 9l-3 3 3 3M15 9l3 3-3 3",
  math: "M19 4H5l7 8-7 8h14",
  footnote: "M4 20 9 7l5 13M6 15h6M17 3h3v7M17 10h6",
  attachment: "m8 12 7-7a3 3 0 0 1 4 4L9 19a5 5 0 0 1-7-7L13 1M6 14l9-9",

  "text-top": "M4 4h16M12 20V8m-5 5 5-5 5 5",
  "text-middle": "M4 12h16M12 2v6m-3-3 3 3 3-3M12 22v-6m-3 3 3-3 3 3",
  "text-bottom": "M4 20h16M12 4v12m-5-5 5 5 5-5",
  "text-left": "M4 5h16M4 10h10M4 15h16M4 20h10",
  "text-center": "M4 5h16M7 10h10M4 15h16M7 20h10",
  "text-right": "M4 5h16M10 10h10M4 15h16M10 20h10",
  "text-justify": "M4 5h16M4 10h16M4 15h16M4 20h16",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  hide: "M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 3.4M6.3 6.3A21 21 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5.7-1.7M9.9 9.9a3 3 0 0 0 4.2 4.2",
  sort: "M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4",
  bold: "M6 4h7a4 4 0 0 1 0 8H6zm0 8h8a4 4 0 0 1 0 8H6z",
  italic: "M10 4h10M4 20h10M15 4 9 20",
  strike: "M17 5c-1-2-9-3-10 2-1 3 4 4 6 5M7 18c1 3 10 3 10-2M3 12h18",
  heading: "M4 4v16M14 4v16M4 12h10M18 16c0-3 4-3 4 0 0 2-4 2-4 5h4",
  paragraph: "M13 4H9a5 5 0 0 0 0 10h4M13 4v17M18 4v17M9 4h12",
  numbered:
    "M9 6h12M9 12h12M9 18h12M3 4h1v4M3 13c0-3 3-3 3-1 0 1-3 2-3 3h3M3 18h3l-2 2h2v2H3",
  quote: "M4 5h6v7H5c0 3-1 4-3 5M14 5h6v7h-5c0 3-1 4-3 5",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  code: "m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18",
  preview:
    "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",

  capacity: "M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7",
  documents: "M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6",
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z",
  comment: "M4 4h16v12H9l-5 4V4ZM8 8h8M8 12h5",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  duplicate: "M8 8h13v13H8zM16 8V3H3v13h5",
  unlock: "M8 10V7a4 4 0 0 1 8 0M5 10h14v11H5zM12 14v3",
  rotate: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  frame: "M7 2v20M17 2v20M2 7h20M2 17h20",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  group: "M3 3h7v7H3zM14 14h7v7h-7zM14 3h7v7M3 14v7h7",
  ungroup: "M3 3h7v7H3zM14 14h7v7h-7zM17 2v7m-3-3 3 3 3-3M2 17h7m-3-3 3 3-3 3",
  arrange: "M4 3v18M8 5h12v5H8zM8 14h8v5H8z",
  "align-left": "M3 3v18M7 5h14v4H7zM7 15h9v4H7z",
  "align-center": "M12 2v3m0 4v6m0 4v3M3 5h18v4H3zM7 15h10v4H7z",
  "align-right": "M21 3v18M3 5h14v4H3zM8 15h9v4H8z",
  "align-top": "M3 3h18M5 7h4v14H5zM15 7h4v9h-4z",
  "align-middle": "M2 12h3m4 0h6m4 0h3M5 3h4v18H5zM15 7h4v10h-4z",
  "align-bottom": "M3 21h18M5 3h4v14H5zM15 8h4v9h-4z",
  distribute: "M3 3v18M21 3v18M8 7h3v10H8zM14 5h3v14h-3z",
  "distribute-vertical": "M3 3h18M3 21h18M7 8h10v3H7zM5 14h14v3H5z",
  front: "M3 3h12v12H3zM15 9h6v12H9v-6",
  back: "M9 9h12v12H9zM9 15H3V3h12v6",
  image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  tree: "M4 3v14h5M4 7h5M13 5h8v4h-8zM13 15h8v4h-8z",
  calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 18h2",
  drag: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  table: "M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16",
  kanban: "M3 4h5v10H3zM10 4h5v16h-5zM17 4h5v7h-5z",
  board: "M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7",
  task: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h4",
  story: "M5 3h14v18l-7-4-7 4z",
  epic: "m13 2-9 12h7l-1 8 10-13h-8z",
  milestone: "m12 2 10 10-10 10L2 12z",
  bug: "M8 9h8v7a4 4 0 0 1-8 0V9ZM9 9V6a3 3 0 0 1 6 0v3M3 11h5M16 11h5M3 17h5M16 17h5M5 4l3 4M19 4l-3 4",
  check: "m5 12 4 4L19 6",
  chevron: "m8 10 4 4 4-4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M18 6 6 18",
  folder: "M3 6h7l2 3h9v11H3V6Z",
  more: "M6.25 12a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z",
  reply: "M9 10 4 15l5 5M4 15h10a6 6 0 0 0 0-12h-2",
  smile: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 9h.01M16 9h.01M8 14c1 4 7 4 8 0",
  leaf: "M20 3C5 1 1 12 8 17c7 5 14-3 12-14ZM4 21 16 8",
  local: "M8 10V7a4 4 0 0 1 8 0v3M5 10h14v11H5z",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  flag: "M5 22V3m0 1c4-4 10 4 15 0v10c-5 4-11-4-15 0",
  "priority-none": "m6 5 6 6 6-6M6 13l6 6 6-6",
  "priority-low": "M12 4v16m-6-6 6 6 6-6",
  "priority-medium": "M5 9h14M5 15h14",
  "priority-high": "M12 20V4m-6 6 6-6 6 6",
  "priority-urgent": "m6 11 6-6 6 6M6 19l6-6 6 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  help: "M9 8a3 3 0 1 1 5 2c-1 1-2 1-2 4m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  down: "M12 4v16m-6-6 6 6 6-6",
  up: "M12 20V4m-6 6 6-6 6 6",
  sticky: "M3 3h18v12l-6 6H3V3Zm12 18v-6h6",
  text: "M3 5h18M12 5v16M8 21h8",
  shape: "M4 4h16v16H4z",
  connect: "M5 19 19 5M11 5h8v8",
  hand: "M8 11V4a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 4-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2",
  "project-frame": "M3 3h18v18H3zM6 7h5v4H6zM13 14h5v4h-5zM8 11v5h5",
  status: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  refresh: "M20 7a9 9 0 1 0 1 8M20 3v5h-5",
  cursor: "m4 3 5 18 4-8 8-4L4 3Z",
  minus: "M5 12h14",
  fit: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  expand: "M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7",
  fullscreen: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5",
  "chevron-left": "M15 18l-6-6 6-6",
  "chevron-right": "M9 18l6-6-6-6",
  shrink: "M21 3l-7 7m0-6v6h6M3 21l7-7m-6 0h6v6",
  "width-full": "M3 4v16M21 4v16M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
  "width-page": "M7 3v18M17 3v18M10 7h4M10 12h4M10 17h4",
  "split-columns": "M3 4h18v16H3zM12 4v16",
  "split-rows": "M3 4h18v16H3zM3 12h18",
  swap: "M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  undo: "M3 10h10a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5",
  redo: "M21 10H11a7 7 0 0 0 0 14m10-14-5-5m5 5-5 5",
  play: "m8 4 12 8-12 8Z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 10v7M12 7h.01",
  checklist: "M10 6h11M10 12h11M10 18h11M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17",
  codeblock: "M4 4h16v16H4zM9.5 9 7 12l2.5 3M14.5 9l2.5 3-2.5 3",
  divider: "M3 5h18v14H3zM7 12h10",
  markdown: "M3 6h18v12H3zM6.5 15V9l2.5 3 2.5-3v6M16 9v6m-2.5-2.5L16 15l2.5-2.5",
  pencil: "m4 16 12-12 4 4L8 20H4v-4Zm9-9 4 4",
  file: "M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6",
  highlighter: "m5 14 9-10 6 6-10 9-5-5ZM5 14l-2 7 7-2M3 21h12",
  eraser: "m4 13 9-10 8 8-9 10H7l-3-4v-4Zm3-3 9 8M12 21h10",
  "stroke-width": "M4 5h16M4 12h16M4 20h16M4 19h16M4 21h16",
  "pen-pressure": "M9 3h6l2 9-5 6-5-6 2-9ZM12 8v10M7 21h10",
  "recognise-shapes": "m8 3 5 8H3l5-8ZM14 14h7v7h-7zM10 18a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  repeat: "M3 7h15l-3-3M21 17H6l3 3M18 7l3 3V7M6 17l-3-3v3",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  archive: "M3 3h18v5H3zM5 8v13h14V8M10 12h4",
  "arrow-left": "M19 12H5m5-5-5 5 5 5",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  cost: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.task}"/></svg>`;
const colorPicker = installColorPickers({ esc, icon });
const bookmarks = installBookmarks({ api, esc, icon, toast });
const selectMenus = installSelectMenus({ esc, icon, taskColor: (field, value) => taskFieldColor(state, field, value) });
installTaskControlColors(() => state);
installDatePickers({ esc, icon });
document.addEventListener(
  "keydown",
  (event) => {
    if (!event.target.closest("#board-task-panel") || state.toolDragging)
      return;
    event.stopImmediatePropagation();
    if (event.key !== "Escape") return;
    event.preventDefault();
    state.boardTaskPanel = false;
    renderView();
    $('[data-action="board-task"]')?.focus();
  },
  true,
);
let statuses = ["backlog", "todo", "in-progress", "review", "done"];
const statusNames = {
  backlog: "Backlog",
  todo: "To do",
  "in-progress": "In progress",
  review: "In review",
  done: "Done",
};
let types = [...DEFAULT_TASK_TYPES];
const taskViews = ["list", "tree", "table", "kanban"];
const planningViews = ["calendar", "timeline", "capacity"];
const views = [
  "overview",
  "documents",
  "list",
  "tree",
  "table",
  "kanban",
  "board",
  "calendar",
  "timeline",
  "capacity",
];
const label = (str) => String(str || "").replace(/^./, (c) => c.toUpperCase());
const viewLabels = { board: "Boards" };
const viewLabel = (view) => viewLabels[view] || label(view);
const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`pencils:${key}`)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`pencils:${key}`, JSON.stringify(value));
    } catch {
      /* Private browser storage may be unavailable. */
    }
  },
};
const state = {
  organisations: [],
  organisation: null,
  directoryPage: null,
  helpArticle: null,
  workspaceSignature: "",
  navigation: 0,
  projects: [],
  project: null,
  tasks: [],
  boards: [],
  warnings: [],
  globalWarnings: [],
  view: "list",
  search: "",
  status: "all",
  type: "all",
  sort: "created",
  sortDir: 1,
  collapsed: new Set(),
  selectedBoard: null,
  camera: { x: 0, y: 0, z: 1 },
  selectedNode: null,
  selectedEdge: null,
  tool: "cursor",
  connectFrom: null,
  boardSaves: 0,
  boardConflict: false,
  history: [],
  future: [],
  online: true,
  loading: false,
  dirty: false,
  dialog: null,
  menu: false,
  signature: "",
};
const cameraMotion = smoothZoom({
  camera: () => state.camera,
  apply: (camera) => {
    state.camera = camera;
    updateCamera(true);
  },
  changed: (active) => {
    state.cameraAnimating = active;
    $("#canvas")?.classList.toggle("zooming", active);
  },
});
document.addEventListener("pointerdown", () => cameraMotion.cancel(), true);
window.addEventListener("blur", () => cameraMotion.cancel());
const sync = new SaveQueue({
  api,
  changed: () => {
    state.boardSaves = [...sync.entries.values()].filter((e) =>
      e.url.includes("/boards/"),
    ).length;
    state.boardConflict = [...sync.entries.values()].some(
      (e) => e.url.includes("/boards/") && e.conflict,
    );
    updateSaveState();
    features.taskSyncChanged();
    features.documentsSyncChanged();
  },
  saved: (url, record) => {
    if (!url.startsWith(`/projects/${state.project?.id}/`)) return;
    if (url.includes("/tasks/"))
      state.tasks = state.tasks.map((t) => (t.id === record.id ? record : t));
    else if (url.includes("/documents/")) {
      state.documents = state.documents.map(d => d.id === record.id ? record : d);
      features.documentsSyncChanged();
    } else {
      const current = state.boards.find((b) => b.id === record.id);
      if (current) {
        Object.assign(current, record);
        features.canvasSaved();
        features.drawingCheckpoint(sync.entries.has(url), current, state.project);
      }
    }
  },
});
const headerStatus = appStatus({ state, sync, version: APP_VERSION, icon, esc });
const markdown = createMarkdown({ state, esc });
let boardQueue = Promise.resolve(),
  pollBusy = false,
  dragging = null,
  spacePressed = false;
const app = $("#app");
function toast(message, error = false) {
  const el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  el.setAttribute("role", error ? "alert" : "status");
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("data-toast-close", "");
  close.setAttribute("aria-label", "Dismiss notification");
  close.innerHTML = icon("close");
  const remove = () => {
    clearTimeout(timer);
    el.remove();
  };
  close.addEventListener("click", remove);
  el.append(text, close);
  $("#toasts").append(el);
  const timer = setTimeout(remove, error ? 9000 : 3500);
  return remove;
}
window.PencilsToast = toast;
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const last = $("#toasts .toast:last-child [data-toast-close]");
  if (last && !document.querySelector("dialog[open], :popover-open, .select-menu[open]")) last.click();
});
async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(`/api${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Pencils-Name": encodeURIComponent(
          localStorage.getItem("pencils:participant") ||
            state.session?.user?.username ||
            `Guest ${sync.client.slice(-4)}`,
        ),
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(url.includes("/miro") ? 300000 : url.includes("/sources") ? 120000 : 15000),
    });
  } catch {
    state.online = false;
    throw new Error(
      "Cannot reach the local server. Keep it running and stay connected to its network.",
    );
  }
  state.online = true;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function route(kind = "", id = "") {
  return `/projects/${state.project.id}${kind ? `/${kind}` : ""}${id ? `/${id}` : ""}`;
}
function board() {
  return state.boards.find((b) => b.id === state.selectedBoard);
}
function task(id) {
  return state.tasks.find((t) => t.id === id);
}
function options(values, current, names = {}) {
  return values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(names[v] || label(v))}</option>`,
    )
    .join("");
}
function projectDescription() {
  return (
    String(state.project.body || "")
      .split("\n")
      .find((l) => l.trim() && !l.startsWith("#")) ||
    "A little space to turn plans into progress."
  );
}
// Revisions are sorted: the server may list the same records in another order.
function signature(snapshot) {
  return JSON.stringify([
    snapshot.project.revision,
    snapshot.tasks.map((t) => t.revision).sort(),
    snapshot.boards.map((b) => b.revision).sort(),
    (snapshot.documents || []).map(d => d.revision).sort(),
    snapshot.warnings,
    snapshot.taskAvailability,
  ]);
}
function organisationProjects(id = state.organisation?.id) {
  return state.projects.filter(
    (project) =>
      project.organisation === id && (!project.archived || state.showArchived),
  );
}
async function fetchWorkspace() {
  const [projects, organisations] = await Promise.all([
    api("/projects"),
    api("/organisations"),
  ]);
  return {
    projects: projects.projects,
    organisations: organisations.organisations,
    warnings: [...new Set([...projects.warnings, ...organisations.warnings])],
  };
}
function applyWorkspace(data) {
  state.projects = data.projects;
  // Personal spaces open from the sidebar's Personal section, not the organisation switcher.
  state.organisations = data.organisations.filter((o) => !o.personal);
  state.globalWarnings = data.warnings;
  state.organisation =
    state.organisations.find((o) => o.id === state.organisation?.id) ||
    state.organisations[0] ||
    null;
  state.workspaceSignature = JSON.stringify(data);
}
function clearProject() {
  features.documentsReset();
  state.documents = [];
  state.selectedDocument = null;
  state.documentSearch = "";
  state.documentExplorerOpen = false;
  state.helpArticle = null;
  if (state.directoryPage) {
    state.dirty = false;
  }
  state.directoryPage = null;
  state.settingsDirty = false;
  state.project = null;
  state.tasks = [];
  state.boards = [];
  state.warnings = [];
  state.selectedBoard = null;
  state.boardGallery = false;
  features.drawingReset();
  state.selectedNode = null;
  {
    state.selectedEdge = null;
    state.selectedEdges?.clear();
  }
  state.history = [];
  state.future = [];
  state.boardConflict = false;
  state.search = "";
  state.status = "all";
  state.type = "all";
  state.collapsed.clear();
  state.menu = false;
  state.signature = "";
}
function canNavigate() {
  if (!features.settingsCanLeave()) return false;
  if (state.boardTaskEditor && !closeDialog(false, { confirmDirty: false }))
    return false;
  if (state.loading) {
    toast("Wait for the current changes to finish saving.");
    return false;
  }
  return true;
}
function preferredAreaView(area, layouts, fallback) {
  if (layouts.includes(state.view)) return state.view;
  const saved = storage.get(
    `${area}-view:${state.project.id}`,
    state.project.default_view,
  );
  return layouts.includes(saved) ? saved : fallback;
}
function openView(view) {
  if (!state.project || !canNavigate()) return false;
  const next = view === "tasks" ? preferredAreaView("task", taskViews, "list") : view === "planning" ? preferredAreaView("planning", planningViews, "calendar") : view === "drawing" ? "board" : view;
  if (!views.includes(next) || (state.project.personal && next !== "documents")) return false;
  if (state.view === next) return true;
  state.helpArticle = null;
  features.drawingReset();
  state.boardGallery = false;
  state.settingsDirty = false;
  state.dirty = false;
  state.view = next;
  state.page = 0;
  state.savedView = null;
  storage.set(`view:${state.project.id}`, state.view);
  renderApp();
  return true;
}
function setLoading(value) {
  state.loading = value;
  document.querySelector(".main")?.setAttribute("aria-busy", String(value));
  // A thin bar at the top of the screen while a project or organisation loads (styles.css).
  let bar = document.querySelector("#loading-bar");
  if (!bar) {
    bar = Object.assign(document.createElement("div"), { id: "loading-bar" });
    bar.setAttribute("aria-hidden", "true");
    document.body.append(bar);
  }
  bar.toggleAttribute("data-active", value);
  for (const control of document.querySelectorAll('[data-action="view"],#project-view-switcher'))
    control.disabled = value;
}
// Background refreshes pass { quiet: true }: when the changes hold nothing this page does not
// already show (this browser's own saves, changes in other projects), they are marked as seen
// without rebuilding the page.
async function refresh(render = true, shouldApply = () => true, { quiet = false } = {}) {
  await boardQueue;
  if (!shouldApply()) return;
  const projectId = state.project?.id;
  try {
  let snapshot=null,workspace=null;
  if(projectId && Number.isInteger(state.snapshotVersion)){
    const delta=await api(`/projects/${projectId}/delta?since=${state.snapshotVersion}`);
    if(quiet && !delta.full && state.project?.id === projectId && !deltaChangesState(delta.records)){
      state.snapshotVersion=Math.max(state.snapshotVersion,delta.version);
      // The page already shows these revisions; keep the 30-second check from rebuilding for them.
      state.signature=signature(state);
      return;
    }
    if(!delta.full){snapshot={version:delta.version,project:state.project,tasks:[...state.tasks],boards:[...state.boards],documents:[...(state.documents || [])],warnings:state.warnings,taskAvailability:state.taskAvailability,progress:state.progress};for(const record of delta.records){if(record.kind==="project")snapshot.project=record.value;else{const list=snapshot[record.kind],index=list.findIndex(v=>v.id===record.value.id);if(index<0)list.push(record.value);else list[index]=record.value;}}}
  }
  if(!snapshot){workspace=await fetchWorkspace();snapshot=projectId?await api(`/projects/${projectId}`):null;}
  // A user may start editing or placing an object while these requests are in flight.
  if (!shouldApply() || state.project?.id !== projectId) return;
  if(workspace)applyWorkspace(workspace);
  if (snapshot) {
    if (state.boardConflict) snapshot.boards = state.boards;
    applySnapshot(snapshot);
  }
  if (render) renderApp();
  }catch(error){
    if([401,403].includes(error.status)){
      closeDialog(true);clearProject();state.projects=state.projects.filter(p=>p.id!==projectId);
      if(error.status===401)await features.session();else await boot();
      toast("Project access is no longer available. Sign in with an authorised account or ask the workspace administrator.",true);
    }
    throw error;
  }
}

// Whether any record differs from what the page holds (object key order aside).
function deltaChangesState(records) {
  const stable = (value) => JSON.stringify(value, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
  return records.some(({ kind, value }) => {
    const current = kind === "project" ? state.project : state[kind]?.find((item) => item.id === value.id);
    return !current || stable(current) !== stable(value);
  });
}
// Shows a board the server has just returned (after undo or redo) without reloading the project.
function applyBoard(record) {
  if (!state.boards.some((b) => b.id === record.id)) return; // another project opened meanwhile
  state.boards = state.boards.map((b) => (b.id === record.id ? record : b));
  state.boardBases = { ...state.boardBases, [record.id]: structuredClone(record) };
  renderView();
}
function applySnapshot(snapshot) {
  if (state.project?.id !== snapshot.project.id) {
    state.boardTaskPanel = false;
    state.boardTaskFilters = {};
  }
  state.snapshotVersion=snapshot.version;
  // A project moved to another organisation reopens there.
  if (state.project?.id === snapshot.project.id && state.project.organisation !== snapshot.project.organisation)
    storage.set(`project:${snapshot.project.organisation}`, snapshot.project.id);
  state.project = snapshot.project;
  state.projects = state.projects.map(p=>p.id===snapshot.project.id?{...p,...snapshot.project}:p);
  state.config = snapshot.project.schema || {
    statuses: ["backlog", "todo", "in-progress", "review", "done"],
    types: [...DEFAULT_TASK_TYPES],
    done: ["done"],
    fields: [],
  };
  statuses = state.config.statuses;
  types = state.config.types;
  for (const name of statuses)
    statusNames[name] = statusLabel(state.config, name);
  state.progress = snapshot.progress;
  state.tasks = snapshot.tasks;
  state.taskAvailability = snapshot.taskAvailability || {};
  state.boards = snapshot.boards;
  state.documents = snapshot.documents || [];
  state.warnings = snapshot.warnings;
  state.signature = signature(snapshot);
  for (const entry of sync.entries.values()) {
    if (entry.packedBoard) {
      const current = snapshot.boards.find(b => entry.url.endsWith(`/boards/${b.id}`));
      if (current) sync.hydrate(entry, current); else continue;
    }
    if (entry.url.startsWith(`/projects/${state.project.id}/documents/`))
      state.documents = state.documents.map(d => d.id === entry.local.id ? entry.local : d);
    if (entry.url.startsWith(`/projects/${state.project.id}/tasks/`))
      state.tasks = state.tasks.map((t) =>
        t.id === entry.local.id ? entry.local : t,
      );
    if (entry.url.startsWith(`/projects/${state.project.id}/boards/`))
      state.boards = state.boards.map((b) =>
        b.id === entry.local.id ? entry.local : b,
      );
  }
  state.boardBases = Object.fromEntries(
    snapshot.boards.map((b) => [b.id, structuredClone(b)]),
  );
  state.organisation =
    state.organisations.find((o) => o.id === snapshot.project.organisation) ||
    state.organisation;
  if (!board()) state.selectedBoard = state.boards[0]?.id || null;
}
function activateProject(snapshot) {
  clearProject();
  state.savedView = null;
  state.tableColumns = null;
  state.tablePreferences = null;
  state.tableCollapsed = new Set();
  state.tableFilterSearch = {};
  state.groupBy = "status";
  state.extraFilters = {};
  state.page = 0;
  applySnapshot(snapshot);
  const id = snapshot.project.id;
  state.groupBy = storage.get(`group-by:${id}`, "status");
  state.kanbanGroupBy = kanbanGroup(storage.get(`kanban-group:${id}`, "none"));
  state.kanbanCollapsed = storage.get(`kanban-collapsed:${id}`, []);
  state.sort = storage.get(`sort:${id}`, snapshot.tasks.some(t => Number.isFinite(t.order)) ? "order" : "created");
  state.sortDir = 1;
  state.view = storage.get(
    `view:${id}`,
    snapshot.project.default_view || "list",
  );
  if (state.view === "drawing") state.view = "board";
  if (![...views, "settings"].includes(state.view)) state.view = "list";
  if (snapshot.project.personal) state.view = "documents";
  state.selectedBoard = storage.get(`board:${id}`, state.boards[0]?.id);
  if (!board()) state.selectedBoard = state.boards[0]?.id;
  loadCamera();
  storage.set("project", id);
  if (snapshot.project.personal) return;
  storage.set(`project:${snapshot.project.organisation}`, id);
  storage.set("organisation", snapshot.project.organisation);
}
async function openProject(id) {
  if (!canNavigate()) return false;
  setLoading(true);
  state.navigation++;
  try {
    const snapshot = await api(`/projects/${id}`);
    // A project just created (or an organisation just joined) is not in the sidebar yet.
    if (
      (!snapshot.project.personal && !state.organisations.some((o) => o.id === snapshot.project.organisation)) ||
      !state.projects.some((p) => p.id === id)
    )
      applyWorkspace(await fetchWorkspace());
    activateProject(snapshot);
    renderApp();
    return true;
  } finally {
    setLoading(false);
  }
}
async function openOrganisation(id) {
  if (["teams", "people"].includes(state.directoryPage)) return openDirectory(state.directoryPage, id);
  if (!canNavigate()) return false;
  const organisation = state.organisations.find((o) => o.id === id);
  if (!organisation)
    throw new Error(
      "This organisation no longer exists. Refresh the workspace.",
    );
  setLoading(true);
  state.navigation++;
  try {
    const projects = organisationProjects(id),
      last = storage.get(`project:${id}`, null),
      project = projects.find((p) => p.id === last) || projects[0];
    const snapshot = project ? await api(`/projects/${project.id}`) : null;
    clearProject();
    state.organisation = organisation;
    storage.set("organisation", id);
    if (snapshot?.project.organisation === id) activateProject(snapshot);
    renderApp();
    return true;
  } finally {
    setLoading(false);
  }
}
async function openDirectory(page, organisationId = state.organisation?.id) {
  if (!["teams", "people"].includes(page) || !canNavigate()) return false;
  const organisation = state.organisations.find((o) => o.id === organisationId);
  if (!organisation) return false;
  setLoading(true);
  state.navigation++;
  try {
    await boardQueue;
    if (state.boardConflict)
      throw new Error(
        "Resolve the unsaved canvas changes before opening the directory.",
      );
    clearProject();
    state.organisation = organisation;
    state.directoryPage = page;
    storage.set("organisation", organisation.id);
    renderApp();
    return true;
  } finally {
    setLoading(false);
  }
}
function directoryPageHTML() {
  const o = state.organisation,
    page = state.directoryPage,
    title = label(page);
  return `<section class="content project-settings-page directory-page"><header class="settings-page-heading"><h1>${title}</h1><p>${page === "teams" ? "Build teams and choose their members." : "Manage people and their weekly task limits."} ${esc(o.title)}.</p></header><nav class="directory-tabs" aria-label="Organisation directory"><button class="button" data-action="directory-open" data-page="teams" ${page === "teams" ? 'aria-current="page"' : ""}>${icon("group")}Teams <span class="count">${o.teams?.length || 0}</span></button><button class="button" data-action="directory-open" data-page="people" ${page === "people" ? 'aria-current="page"' : ""}>${icon("people")}People <span class="count">${o.people?.length || 0}</span></button></nav><form id="organisation-form" data-directory-page="${page}" data-id="${esc(o.id)}" data-revision="${esc(o.revision)}"><div class="dialog-body"><div class="form-error hidden" role="alert"></div></div><div class="dialog-foot"><span class="field-hint">Changes apply to this organisation.</span><button class="button primary" type="submit">Save ${page}</button></div></form></section>`;
}
function renderApp() {
  keepFocus(renderAppNow);
}
function renderAppNow() {
  const dateOpener = document.activeElement?.closest("[data-task-dates]");
  const dateScope = dateOpener?.closest("[data-timeline]")?.dataset.timeline;
  features.documentsReset();
  navigation.schedule();
  if (
    state.boardTaskEditor &&
    (!["board", "drawing"].includes(state.view) ||
      state.project?.id !== state.boardTaskEditor.project)
  )
    closeDialog(false, { confirmDirty: false });
  const p = state.project;
  document.title = `${state.helpArticle ? helpArticle(state.helpArticle).title + " · Help" : state.directoryPage ? label(state.directoryPage) + " · " + state.organisation?.title : p ? `${viewLabel(state.view)} · ${p.title}` : state.organisation?.title || "Workspace"} · Pencils`;
  app.innerHTML = `<div class="shell">
    <button class="sidebar-overlay ${state.menu ? "visible" : ""}" data-action="menu" aria-label="Close sidebar"></button>
    <aside id="workspace-sidebar" class="sidebar ${state.menu ? "open" : ""}" data-drawer-level="${p && state.drawerLevel === "documents" ? "documents" : "menu"}">
      <button class="brand" data-action="home" aria-label="Pencils home"><img src="/icon.svg" alt=""><span class="wordmark">pencils<span style="color:#b9d18c">.</span></span></button>
      <button class="icon-button phone-drawer-close" id="sidebar-close" data-action="menu" aria-label="Close navigation">${icon("close")}</button>
      <nav class="personal-links" aria-label="Personal"><button class="directory-link ${p?.personal ? "active" : ""}" data-action="personal-open" ${p?.personal ? 'aria-current="page"' : ""}>${icon("person")}<span>Personal</span></button><button class="directory-link" data-action="today">${icon("calendar")}<span>Today</span></button></nav>
      <div class="organisation-switch"><div class="organisation-switch-row"><span class="workspace-icon" style="color:${safeColor(state.organisation?.color)}">${icon("folder")}</span><label class="organisation-choice"><span>ORGANISATION</span><select id="organisation-select" aria-label="Switch organisation">${state.organisations.map((o) => `<option value="${esc(o.id)}" ${o.id === state.organisation?.id ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></label></div><div class="organisation-actions"><button data-action="organisation-new">${icon("plus")}New organisation</button><button data-action="organisation-edit" aria-label="Organisation settings" ${state.organisation ? "" : "disabled"}>${icon("settings")}</button></div></div>
      <div class="side-label">PROJECTS<button data-action="project-new" aria-label="Create project">${icon("plus")}</button></div>
      <nav class="project-links" aria-label="Projects">${organisationProjects()
        .map(
          (project) =>
            `<button class="project-link ${project.id === p?.id ? "active" : ""}" data-action="project-open" data-id="${esc(project.id)}"><span class="project-mark" style="background:${safeColor(project.color)}"></span><span>${esc(project.title)}</span></button>`,
        )
        .join("")}</nav>
      <button class="side-new" data-action="project-new">${icon("plus")}New project</button>
      ${p ? '<section id="sidebar-documents" class="sidebar-documents" aria-label="Documents"></section>' : ""}
      ${state.organisation ? `<section class="sidebar-directory"><div class="side-label">TEAMS</div><nav class="directory-links" aria-label="Teams and people">${["teams", "people"].map((page) => `<button class="directory-link ${state.directoryPage === page ? "active" : ""}" data-action="directory-open" data-page="${page}" ${state.directoryPage === page ? 'aria-current="page"' : ""}>${icon(page === "teams" ? "group" : "people")}<span>${label(page)}</span><span class="directory-count">${state.organisation[page]?.length || 0}</span></button>`).join("")}</nav></section>` : ""}
      <div class="phone-drawer-utilities" role="group" aria-label="Settings and help" style="--tiles:2"><button class="button" data-action="settings" aria-label="Settings" ${(p ? state.view === "settings" : state.directoryPage === "settings") ? 'aria-current="page"' : ""}>${icon("settings")}<span>Settings</span></button><button class="button" data-action="help" aria-label="Help & guides" ${state.helpArticle ? 'aria-current="page"' : ""}>${icon("help")}<span>Help</span></button></div>
      <div class="side-bottom">
      <div class="side-footer"><span class="dot"></span>Local workspace${headerStatus.versionHTML()}</div></div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle sidebar" aria-controls="workspace-sidebar" aria-expanded="${state.menu}">${icon("menu")}</button><strong ${p ? 'role="heading" aria-level="1"' : ""}>${esc(p?.title || (state.helpArticle ? "Help" : state.directoryPage ? label(state.directoryPage) : "Projects"))}</strong></div>${p ? projectNavigationHTML() : ""}<div class="top-actions">${p ? newMenuHTML("icon") : ""}<div class="save-state" id="save-state">${appStatusHTML()}</div></div></header>
      ${!state.online ? '<div class="connection-banner">Local server unavailable. Reconnect to its network to save changes.</div>' : ""}
      ${state.helpArticle ? helpPageHTML(state.helpArticle, { esc, icon }) : state.directoryPage === "settings" ? '<div id="view-toolbar"></div><section id="view-content" class="content"></section>' : state.directoryPage ? directoryPageHTML() : p ? projectPage() : welcomePage()}
    </main></div>`;
  updateViewLayout(state);
  if (p) renderView();
  if (state.directoryPage === "settings") void features.settingsRender();
  else if (state.directoryPage) {
    const form = $("#organisation-form");
    features.dialogOpened("organisation", form);
    const dirty = () => {
      state.settingsDirty = true;
      state.dirty = true;
    };
    form.addEventListener("input", dirty);
    form.addEventListener("change", dirty);
  }
  features.afterRender();
  setLoading(state.loading);
  if (dateOpener && !dateOpener.isConnected) {
    const scope = dateScope
      ? `[data-timeline="${CSS.escape(dateScope)}"] `
      : "";
    document.querySelector(`${scope}[data-task-dates="${CSS.escape(dateOpener.dataset.taskDates)}"]`)
      ?.focus({ preventScroll: true });
  }
}
// Background refreshes and saves rebuild the page or the view; keep keyboard focus on the
// same control when the rebuild replaced it and focus fell to the page.
function keepFocus(render) {
  const focused = document.activeElement !== document.body ? document.activeElement : null;
  const key = focusKey(focused);
  const result = render();
  if (key && !focused.isConnected && document.activeElement === document.body)
    [...document.querySelectorAll(key)].find((el) => el.getClientRects().length)?.focus({ preventScroll: true });
  return result;
}
// A selector that finds the same control after a rebuild: a board object (or the board), an
// element with an id, or a control named by its data-action / data-id / data-feature / data-pro.
function focusKey(el) {
  const node = el?.closest("#canvas [data-node], #canvas");
  if (node) return node.id === "canvas" ? "#canvas" : `#canvas [data-node="${CSS.escape(node.dataset.node)}"]`;
  if (el?.id) return `#${CSS.escape(el.id)}`;
  const keys = ["action", "id", "feature", "pro"].filter((key) => el?.dataset[key]);
  return keys.length ? keys.map((key) => `[data-${key}="${CSS.escape(el.dataset[key])}"]`).join("") : null;
}
function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#66856f";
}
function welcomePage() {
  const projects = organisationProjects(),
    organisation = state.organisation;
  if (projects.length)
    return `${warningsHTML(state.globalWarnings)}<section class="hero"><div><div class="eyebrow project-kicker"><span class="project-mark" style="background:${safeColor(organisation.color)}"></span>ORGANISATION</div><h1>${esc(organisation.title)}</h1><p>${esc(
      String(organisation.body || "All your projects, together in one place.")
        .split("\n")
        .find((line) => line.trim()) ||
        "All your projects, together in one place.",
    )}</p></div><button class="button primary" data-action="project-new">${icon("plus")}New project</button></section><section class="content organisation-overview"><h2 class="section-title">Projects<span class="count">${projects.length}</span><span class="line"></span></h2><div class="project-grid">${projects
      .map(
        (project) =>
          `<button class="project-card" data-action="project-open" data-id="${esc(project.id)}"><span class="project-card-top"><span class="project-mark" style="background:${safeColor(project.color)}"></span>${icon("arrow")}</span><strong>${esc(project.title)}</strong><span>${esc(
            String(
              project.body || "A little space to turn plans into progress.",
            )
              .split("\n")
              .find((line) => line.trim()) || "Open project",
          )}</span></button>`,
      )
      .join("")}</div></section>`;
  return `${warningsHTML(state.globalWarnings)}<section class="welcome"><div class="eyebrow">LESS FRICTION. MORE POSSIBILITY.</div><h1>A little space for your<br><em>next big thing.</em></h1><p>Bring your projects, plans, and scattered ideas together. An open canvas for your work, with Markdown at its heart.</p><div class="welcome-actions"><button class="button primary" data-action="project-new">${icon("plus")}Create a project</button><button class="button" data-action="demo">Explore an example ${icon("arrow")}</button></div><div class="welcome-features"><div class="welcome-feature">${icon("file")}<strong>Made of Markdown</strong><p>Real files you can read, move, and open in Obsidian.</p></div><div class="welcome-feature">${icon("board")}<strong>Your work, your view</strong><p>Lists, trees, tables, kanban, and room to think on a canvas.</p></div><div class="welcome-feature">${icon("local")}<strong>Happily offline</strong><p>Runs on your network. No cloud, account, or internet required.</p></div></div></section>`;
}
function warningsHTML(warnings) {
  return warnings.length
    ? `<details class="warning"><summary>${warnings.length} vault ${warnings.length === 1 ? "issue" : "issues"} need attention</summary>${warnings.map((w) => `<div>${esc(w)}</div>`).join("")}</details>`
    : "";
}
// One New control everywhere: it offers a card or a document (PEN-6).
let personalOpening = null;
function newMenuHTML(kind = "button") {
  const summary = kind === "icon"
    ? `<summary class="icon-button" aria-label="New" title="New card or document">${icon("plus")}</summary>`
    : `<summary class="button primary" title="New card or document">${icon("plus")}New</summary>`;
  // A personal space holds documents only.
  const card = state.project?.personal ? "" : `<button type="button" data-action="task-new">${icon("task")}Card</button>`;
  return `<details class="board-menu new-menu${kind === "icon" ? " phone-new-task" : ""}" data-new-menu data-board-menu="new-${kind}">${summary}<div class="board-menu-panel new-menu-panel">${card}<button type="button" data-action="document-new">${icon("file")}Document</button><button type="button" data-action="document-template">${icon("file")}From template</button></div></details>`;
}
// Phones: the drawer lists the organisation, projects and teams, with Settings and Help at the
// bottom; in Documents it opens on its document list level, with a way back.
function setDrawerLevel(level) {
  state.drawerLevel = level;
  const sidebar = $(".sidebar");
  sidebar?.setAttribute("data-drawer-level", level);
  if (state.menu) sidebar?.querySelector(level === "documents" ? "[data-drawer-back]" : ".phone-drawer-close")?.focus({ preventScroll: true });
}
document.addEventListener("click", event => {
  if (event.target.closest("[data-drawer-back]")) setDrawerLevel("menu");
});
function setSidebarOpen(open, focus = true) {
  state.menu = open;
  const sidebar = $(".sidebar");
  // In Documents each opening starts on the document list.
  if (open && state.project) {
    state.drawerLevel = state.view === "documents" ? "documents" : "menu";
    sidebar?.setAttribute("data-drawer-level", state.drawerLevel);
  }
  sidebar?.classList.toggle("open", open);
  $(".sidebar-overlay")?.classList.toggle("visible", open);
  if (sidebar) sidebar.inert = !open;
  if ($(".main")) $(".main").inert = open;
  $(".mobile-menu")?.setAttribute("aria-expanded", String(open));
  if (focus) (open ? sidebar?.querySelector(".phone-drawer-close") : $(".mobile-menu"))?.focus({ preventScroll: true });
}
// The drawer uses the same action handlers as the desktop navigation.
document.addEventListener("click", event => {
  // Choosing or creating a document in the drawer also closes it.
  const button = event.target.closest('.sidebar [data-action], .sidebar [data-document-open], .sidebar [data-document-action="create"]');
  if (state.menu && button && button.dataset.action !== "menu") setSidebarOpen(false, false);
}, true);
document.addEventListener("keydown", event => {
  if (!state.menu || state.dialog || event.defaultPrevented) return;
  if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); setSidebarOpen(false); }
  if (event.key === "Tab") {
    const items = [...$(".sidebar").querySelectorAll('button,select,a[href],input')].filter(el => !el.disabled && el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}, true);
function projectNavigationHTML() {
  const total = state.tasks.filter((task) => !task.archived).length;
  const area = state.helpArticle ? "help" : taskViews.includes(state.view) ? "tasks" : planningViews.includes(state.view) ? "planning" : state.view;
  // A personal space holds documents only.
  const groups = [
    ["Overview", ["overview"]],
    ["Documents", ["documents"]],
    ["Planning views", ["planning"]],
    ["Task views", ["tasks"]],
    ["Visual views", ["board"]],
  ].filter(([name]) => !state.project.personal || name === "Documents");
  return `<div id="board-project-tools" class="board-project-tools">
    <nav class="tabs" aria-label="Project views"><div class="tabs-scroll" style="--bar-items: ${groups.length + features.bottomBar.count()}">${groups
      .map(
        ([name, group]) =>
          `<div class="view-tab-group" role="group" aria-label="${name}">${group.map((view) => {
            const active = view === "tasks" ? taskViews.includes(state.view) : view === "planning" ? planningViews.includes(state.view) : state.view === view;
            return `<button class="tab ${active ? "active" : ""}" data-action="view" data-view="${view}" aria-label="${viewLabel(view)}" title="${viewLabel(view)}${view === "tasks" ? ` · ${total} tasks` : ""}" ${active ? 'aria-current="page"' : ""}>${icon(view === "tasks" ? "list" : view === "planning" ? "calendar" : view)}</button>`;
          }).join("")}</div>`,
      )
      .join("")}${features.bottomBar.html()}</div><span class="tabs-divider" aria-hidden="true"></span><button type="button" class="tab tab-search" data-feature="global-search" aria-label="Search" title="Search tasks, documents and boards">${icon("search")}</button></nav>
    <label class="mobile-view-switcher">View <select id="project-view-switcher" aria-label="Project view">${["settings", "help"].includes(area) ? `<option value="${area}" selected disabled>${label(area)}</option>` : ""}${(state.project.personal ? ["documents"] : ["overview", "documents", "planning", "tasks", "board"]).map((view) => `<option value="${view}" ${view === area ? "selected" : ""}>${viewLabel(view)}</option>`).join("")}</select></label>
    ${newMenuHTML()}
  </div>`;
}
function projectPage() {
  if (taskViews.includes(state.view))
    storage.set(`task-view:${state.project.id}`, state.view);
  if (planningViews.includes(state.view))
    storage.set(`planning-view:${state.project.id}`, state.view);
  const total = state.tasks.filter((t) => !t.archived).length,
    metric = features.progress(),
    done = metric.done,
    progress = metric.percent;
  return `<section class="hero"><div><div class="eyebrow project-kicker"><span class="project-mark" style="background:${safeColor(state.project.color)}"></span>PROJECT WORKSPACE</div><h1>${esc(state.project.title)}</h1><p>${esc(projectDescription())}</p></div></section>
    <div class="stats-strip"><span class="stat">${icon("task")}<strong>${total}</strong> tasks</span><span class="stat-divider"></span><span class="stat"><span class="progress"><span style="width:${progress}%"></span></span><strong>${progress}%</strong> complete</span><span class="stat-divider"></span><span class="stat">${icon("check")}<strong>${done}</strong> done</span><span class="stat">${icon("file")}Markdown workspace</span></div>
    ${warningsHTML([...state.globalWarnings, ...state.warnings])}

    <div id="view-toolbar"></div><section id="view-content"></section>`;
}
// The Sort menu: Manual order, then the sorts grouped by what they compare.
const sortGroups = [["", ["order"]], ["Card", ["key", "title", "parent", "assignee"]], ["Progress", ["status", "priority"]], ["Dates", ["due", "created"]]];
const sortNames = { order: "Manual order", key: "Card ID", title: "Title A–Z", parent: "Parent", assignee: "Assignee", status: "Status", priority: "Priority", due: "Due date", created: "Date created" };
// Text in natural order (PEN-9 before PEN-10), with empty values last.
const byText = (a, b) => !a - !b || String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });
function filteredTasks() {
  const query = state.search.toLowerCase().trim();
  const list = state.tasks.filter(
    (t) =>
      features.filter(t) &&
      (state.status === "all" || t.status === state.status) &&
      (state.type === "all" || t.type === state.type) &&
      (!query ||
        [
          t.title,
          t.body,
          t.assignee,
          t.id,
          t.key,
          ...(t.aliases || []),
          ...(t.tags || []),
        ].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(query),
        )),
  );
  const parentKeys = state.sort === "parent" && new Map(state.tasks.map((t) => [t.id, t.key]));
  return list.sort((a, b) => {
    let result;
    if (state.sort === "order") result = (a.order || 0) - (b.order || 0);
    else if (state.sort === "parent") result = byText(parentKeys.get(a.parent), parentKeys.get(b.parent));
    else if (state.sort === "key" || state.sort === "assignee") result = byText(a[state.sort], b[state.sort]);
    else if (state.sort === "priority")
      result = priorities.indexOf(a.priority) - priorities.indexOf(b.priority);
    else if (state.sort === "status")
      result = statuses.indexOf(a.status) - statuses.indexOf(b.status);
    else if (state.sort === "due")
      result = String(a.due || "9999").localeCompare(String(b.due || "9999"));
    else
      result = String(a[state.sort] || "").localeCompare(
        String(b[state.sort] || ""),
      );
    return result * state.sortDir || a.id.localeCompare(b.id);
  });
}
function renderView(onlyContent = false) {
  return keepFocus(() => renderViewNow(onlyContent));
}
function renderViewNow(onlyContent) {
  observeKanbanLayout(null);
  navigation.schedule();
  updateViewLayout(state);
  if (
    state.boardTaskEditor &&
    state.selectedBoard !== state.boardTaskEditor.board
  )
    closeDialog(false, { confirmDirty: false });
  features.canvasBeforeRender();
  if (!state.project || state.helpArticle) return;
  if (!features.viewReady()) {
    const view = state.view, project = state.project.id;
    $("#view-toolbar").innerHTML = "";
    $("#view-content").innerHTML = '<p role="status">Opening view…</p>';
    void features.prepareView().then(() => {
      if (state.project?.id === project && state.view === view) renderView();
    }).catch(error => {
      if (state.project?.id === project && state.view === view)
        $("#view-content").innerHTML = `<p role="alert">This view could not load. Retry the connection, or reload to use the latest app version.</p><button class="button" data-action="view" data-view="${esc(view)}">Retry opening view</button> <button class="button" data-action="reload-app">Reload app</button>`;
    });
    return;
  }
  if (state.view !== "documents") features.documentsReset();
  if (state.view === "documents") {
    $("#view-toolbar").innerHTML = "";
    features.documentsRender();
    return;
  }
  if (state.view === "settings") {
    void features.settingsRender();
    return;
  }
  if (state.view === "board" && (state.boardGallery || !features.drawingReady())) {
    $("#view-toolbar").innerHTML = "";
    $("#view-content").className = "content";
    $("#view-content").innerHTML = state.boardGallery ? features.drawingGallery() : '<p role="status">Opening canvas…</p>';
    features.viewToolbar();
    return;
  }
  if (!onlyContent) {
    $("#view-toolbar").innerHTML =
      ["board", "drawing"].includes(state.view)
        ? boardToolbar()
        : state.view === "overview"
          ? ""
          : `<div class="toolbar"><div class="toolbar-left"><label class="search">${icon("search")}<input id="search" type="search" aria-label="Search tasks" placeholder="Find a task…" value="${esc(state.search)}"></label><select id="filter-status" class="filter" aria-label="Filter by status"><option value="all">All statuses</option>${options(statuses, state.status, statusNames)}</select><select id="filter-type" class="filter" aria-label="Filter by task type"><option value="all">All types</option>${options(types, state.type)}</select>${bookmarks.button("view", state.project.id, state.view)}</div><div class="toolbar-right"><span class="caption">A place for every little detail</span><select id="sort" class="filter" aria-label="Sort tasks">${sortGroups.map(([group, values]) => (group ? `<optgroup label="${group}">${options(values, state.sort, sortNames)}</optgroup>` : options(values, state.sort, sortNames))).join("")}</select></div><div class="view-controls"></div></div>`;
  }
  const content = $("#view-content");
  const previousKanban = onlyContent && state.view === "kanban" ? content.querySelector(".kanban") : null;
  const kanbanScroll = previousKanban && { group: previousKanban.dataset.group, x: previousKanban.scrollLeft, y: previousKanban.scrollTop, columns: [...previousKanban.querySelectorAll(".kanban-column")].map(c => c.scrollTop) };
  const previousTree = onlyContent && state.view === "tree"
    ? content.querySelector(".tree-wrapper")
    : null;
  const treeScroll = previousTree && {
    left: previousTree.scrollLeft,
    top: previousTree.scrollTop,
  };
  content.className = ["board", "drawing"].includes(state.view) ? "board-content" : "content";
  const previousTools = content.querySelector(".board-tools");
  const toolScroll = previousTools && previousTools.dataset.board === board()?.id ? previousTools.scrollTop : 0;
  const allTasks = filteredTasks();
  state.statusTotals = Object.fromEntries(state.config.statuses.map((status) => [status, allTasks.filter((t) => t.status === status).length]));
  const page =
    state.view === "tree"
      ? treePage(allTasks, state.tasks, state.page, undefined, state.sort === "order" ? compareTaskOrder : null)
      : pageOf(allTasks, state.page);
  if (["list", "tree"].includes(state.view)) state.page = page.page;
  const tasks = ["list", "tree"].includes(state.view) ? page.items : allTasks;
  features.viewToolbar();
  if (["board", "drawing"].includes(state.view)) {
    content.innerHTML = boardView();
    updateCamera();
    features.canvasRender();
    features.drawingRender();
    features.timelineRender();
    const tools = $(".board-tools");
    if (tools) tools.scrollTop = toolScroll;
    taskPanelController?.position();
    return;
  }
  const renderers = {
    overview: features.overview,
    list: (tasks) => features.groupedList(tasks, listView, taskRow),
    tree: treeView,
    table: features.table,
    kanban: kanbanView,
    calendar: features.calendar,
    timeline: features.timeline,
    capacity: features.capacity,
  };
  // Views with their own controls return { controls, html }; the controls go in the toolbar row.
  const view =
    !tasks.length &&
    !["kanban", "overview", "capacity", "table", "timeline", "calendar"].includes(state.view)
      ? `<div class="empty">${icon("leaf")}<h2>${state.tasks.length ? "No matching tasks" : "Create your first card"}</h2><p>${state.tasks.length ? "No tasks match the current filters. Archived tasks are hidden unless Include archived is selected." : ["list", "tree"].includes(state.view) ? "Use New card above to add your first card." : "Add your first card, then make the plan your own."}</p>${state.tasks.length ? '<button class="button soft" data-action="filters-reset">Clear filters</button>' : ["list", "tree"].includes(state.view) ? "" : '<button class="button soft" data-action="task-new">${icon("plus")}Add a card</button>'}</div>`
      : renderers[state.view](tasks);
  content.innerHTML = view.html ?? view;
  const controls = $(".view-controls");
  if (controls) controls.innerHTML = view.controls || "";
  // Safari needs a local listener on non-button cards to send taps to the
  // shared click handler, including taps on their padding and metadata.
  if (state.view === "kanban")
    content.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener("click", () => {});
    });
  if (state.view === "tree") {
    let tree = content.querySelector(".tree-wrapper");
    if (!tree) {
      // Empty and filtered trees use the same full-height viewport.
      tree = document.createElement("div");
      tree.className = "tree-wrapper";
      tree.append(...content.childNodes);
      content.append(tree);
    }
    tree.setAttribute("role", "region");
    tree.setAttribute("aria-label", "Task hierarchy");
    tree.tabIndex = 0;
  }
  features.timelineRender();
  features.adaptToolbar();
  if (["overview", "table", "timeline"].includes(state.view)) return;
  features.pagination(state.view === "tree" ? page.total : allTasks.length);
  if (treeScroll) content.querySelector(".tree-wrapper").scrollTo(treeScroll);
  const currentKanban = content.querySelector(".kanban");
  observeKanbanLayout(currentKanban);
  if (kanbanScroll && currentKanban?.dataset.group === kanbanScroll.group) {
    currentKanban.scrollTo(kanbanScroll.x, kanbanScroll.y);
    if (kanbanScroll.group === "none") [...currentKanban.children].forEach((c, i) => c.scrollTop = kanbanScroll.columns[i] || 0);
  }
}
function typeHTML(t) {
  return `<span class="task-type ${esc(t.type)}" title="${esc(label(t.type))}">${icon(t.type)}<span>${esc(label(t.type))}</span></span>${t.source?`<small class="source-badge" title="${esc(sourceLabel(t))}">${esc(t.source.provider)} · ${esc(t.source.key)}</small>`:""}`;
}
function tagsHTML(t) {
  return `<span class="tags">${(t.tags || [])
    .slice(0, 2)
    .map(
      (tag) =>
        `<span class="tag ${["design", "quality", "discovery"].includes(tag) ? tag : ""}">${esc(tag)}</span>`,
    )
    .join("")}</span>`;
}
function assigneeHTML(t) {
  const initials = String(t.assignee || "")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return `<span class="task-assignee ${initials ? "" : "unassigned"}" ${taskColorAttributes(state, "assignee", t.assignee)} title="${esc(t.assignee || "Unassigned")}">${esc(initials) || "–"}</span>`;
}
function priorityHTML(t) {
  return `<span class="field-chip field-chip-priority priority ${esc(t.priority)}" role="img" aria-label="Priority: ${esc(priorityLabel(t.priority))}" ${taskColorAttributes(state, "priority", t.priority)} title="${esc(priorityLabel(t.priority))} priority">${icon(`priority-${t.priority || "none"}`)}</span>`;
}
function dueHTML(t) {
  const today = new Date(),
    local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return t.due
    ? `<span class="due ${t.due < local && !state.config.done.includes(t.status) ? "overdue" : ""}">${esc(formatDay(t.due))}</span>`
    : "";
}
function taskRow(t, depth = null, hasChildren = false, flat = false) {
  const done = state.config.done.includes(t.status);
  const priority = t.priority || "none";
  const assignee = t.assignee || "Unassigned";
  const control = (field, name) => `name="${field}" data-row-field="${field}" data-id="${esc(t.id)}" aria-label="${name} for ${esc(t.title)}" ${t.source ? 'disabled title="Managed by the connected source"' : ""}`;
  // Phones show a summary that opens the card; its fields open their own picker (the row's select).
  // The date follows the fields in their box and opens the date editor, in rows and phone summaries.
  const dates = className => `<button type="button" class="${className}" data-row-dates="${esc(t.id)}" aria-label="${esc(t.due ? new Date(`${t.due}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Set dates")} — edit dates for ${esc(t.title)}" aria-haspopup="dialog" aria-expanded="false" title="${esc(`Start: ${t.start || "Not set"} · Due: ${t.due || "Not set"}`)}">${dueHTML(t) || '<span class="due">—</span>'}</button>`;
  const phoneField = (field, name, value, chip) => `<button type="button" class="phone-field" data-action="phone-field" data-field="${field}" data-id="${esc(t.id)}" aria-haspopup="listbox" aria-label="${name} for ${esc(t.title)}: ${esc(value)}" ${t.source ? "disabled" : ""}>${chip}</button>`;
  return `<div data-task-order-row="${esc(t.id)}" data-task-order-group="${esc(depth !== null || state.groupBy === "none" ? "" : t[state.groupBy || "status"] || "")}" class="task-row ${depth !== null ? "tree-row" : ""}${flat ? " tree-flat" : ""} ${t.contextOnly ? "tree-context" : ""}" ${depth !== null ? `style="--depth:${Math.min(depth, 12)}"` : ""}>
    ${depth !== null ? `<button class="tree-toggle ${state.collapsed.has(t.id) ? "collapsed" : ""}" data-action="collapse" data-id="${esc(t.id)}" aria-label="${state.collapsed.has(t.id) ? "Expand" : "Collapse"} subtasks" ${hasChildren ? `aria-expanded="${!state.collapsed.has(t.id)}" title="${state.tasks.filter(c => c.parent === t.id).length} subtasks"` : "disabled"}>${hasChildren ? icon("chevron") : ""}</button>` : ""}
    ${taskReorderHandle(t, esc)}
    <button type="button" class="task-type row-task-link ${esc(t.type)}" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(t.title)} (${esc(label(t.type))})" title="${esc(label(t.type))} · Open task details">${icon(t.type)}</button>
    <button type="button" class="task-id row-task-link" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(t.key || t.id)}: ${esc(t.title)}" title="${esc(t.source ? sourceLabel(t) : t.key || t.id)}">${esc(t.key || t.id)}</button>
    <div class="row-title"><input class="task-title ${done ? "done" : ""}" data-row-field="title" data-id="${esc(t.id)}" aria-label="Title for ${esc(t.title)}" title="${esc(t.title)}" value="${esc(t.title)}" maxlength="300" required ${t.source ? 'readonly aria-description="Managed by the connected source"' : 'aria-description="Enter to save. Escape to cancel."'}>${t.contextOnly ? '<span class="context-badge">Ancestor context</span>' : ""}</div>
    <div class="row-fields field-box" ${fieldBoxStyle(state, priority)}><label class="row-assignee row-choice" title="${esc(assignee)}">${assigneeHTML(t)}<select ${control("assignee", "Assignee")}>${assigneeOptions(state, t.assignee, esc)}</select></label>
    <label class="row-status row-choice" ${taskColorAttributes(state, "status", t.status)} title="${esc(statusNames[t.status] || t.status)}"><span class="field-chip field-chip-status" aria-hidden="true">${esc(statusNames[t.status] || t.status)}</span><select ${control("status", "Status")}>${options(nextStatuses(state.config, t.status), t.status, statusNames)}</select></label>
    <label class="row-priority row-choice" ${taskColorAttributes(state, "priority", priority)} title="${esc(priorityLabel(priority))} priority"><span class="field-chip field-chip-priority priority ${esc(priority)}" aria-hidden="true">${icon(`priority-${priority}`)}</span><select ${control("priority", "Priority")}>${options(priorities, priority, priorityLabels)}</select></label>${dates("row-due")}</div>
    <div class="phone-task"><button type="button" class="phone-task-open" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(t.key || t.id)}: ${esc(t.title)}"><span class="phone-task-title ${done ? "done" : ""}">${esc(t.title)}</span></button><span class="phone-task-meta">${icon(t.type)}<span>${esc(t.key || t.id)}</span><span class="field-box phone-task-fields" ${fieldBoxStyle(state, priority)}>${phoneField("assignee", "Assignee", assignee, assigneeHTML(t))}${phoneField("status", "Status", statusNames[t.status] || t.status, `<span class="field-chip field-chip-status phone-task-status" ${taskColorAttributes(state, "status", t.status)}>${esc(statusNames[t.status] || t.status)}</span>`)}${phoneField("priority", "Priority", priorityLabel(priority), `<span class="field-chip field-chip-priority phone-task-priority" ${taskColorAttributes(state, "priority", priority)}>${icon(`priority-${priority}`)}</span>`)}${dates("phone-field phone-due")}</span></span></div></div>`;
}
function listView(tasks) {
  return statuses
    .filter((s) => tasks.some((t) => t.status === s))
    .map(
      (status) =>
        `<section class="list-group"><h2 class="section-title"><span class="status-dot ${status}" ${taskColorAttributes(state, "status", status)}></span>${esc(statusNames[status])}<span class="count">${state.statusTotals?.[status] ?? tasks.filter((t) => t.status === status).length}</span><span class="line"></span></h2><div>${tasks
          .filter((t) => t.status === status)
          .map((t) => taskRow(t))
          .join(
            "",
          )}</div></section>`,
    )
    .join("");
}
function treeView(tasks) {
  const map = new Map(tasks.map((t) => [t.id, t])),
    seen = new Set();
  const childMap = new Map();
  for (const t of tasks) {
    if (!childMap.has(t.parent)) childMap.set(t.parent, []);
    childMap.get(t.parent).push(t);
  }
  const children = (id) => childMap.get(id) || [];
  // With no subtasks in the project there's nothing to expand, and the rows line up with List's.
  const ids = new Set(state.tasks.map((t) => t.id)), flat = !state.tasks.some((t) => t.parent && ids.has(t.parent));
  function walk(t, depth) {
    if (seen.has(t.id)) return "";
    seen.add(t.id);
    const subs = children(t.id);
    let out = taskRow(t, depth, !!subs.length, flat);
    if (!state.collapsed.has(t.id))
      out += subs.map((s) => walk(s, depth + 1)).join("");
    else {
      const mark = (id) => {
        for (const sub of children(id))
          if (!seen.has(sub.id)) {
            seen.add(sub.id);
            mark(sub.id);
          }
      };
      mark(t.id);
    }
    return out;
  }
  let html = tasks
    .filter((t) => !t.parent || !map.has(t.parent))
    .map((t) => walk(t, 0))
    .join("");
  html += tasks
    .filter((t) => !seen.has(t.id))
    .map((t) => walk(t, 0))
    .join("");
  return `<div class="section-title">${icon("tree")}The big picture<span class="line"></span><button class="button small" data-action="expand-all">Expand all</button></div><div class="tree-wrapper">${html}</div>`;
}
function parentOptions(current, exclude) {
  return `<option value="">No parent</option>${state.tasks
    .filter((t) => t.id !== exclude)
    .map(
      (t) =>
        `<option value="${esc(t.id)}" ${current === t.id ? "selected" : ""}>${esc(t.title)}</option>`,
    )
    .join("")}`;
}
function tableView(tasks) {
  const select = (t, key, values, names) =>
    `<select data-task-field="${key}" data-id="${esc(t.id)}" aria-label="${label(key)} for ${esc(t.title)}">${options(values, t[key], names)}</select>`;
  const input = (t, key, type = "text") =>
    `<input type="${type}" data-task-field="${key}" data-id="${esc(t.id)}" value="${esc(key === "tags" ? (t.tags || []).join(", ") : t[key] || "")}" aria-label="${label(key)} for ${esc(t.title)}" ${key === "title" ? 'maxlength="300" required' : ""}>`;
  return `<div class="table-scroll"><table class="task-table"><thead><tr><th>#</th>${["title", "type", "status", "priority", "parent", "assignee", "due", "tags"].map((field) => `<th><button data-action="sort-column" data-field="${field}">${field === "due" ? "Due date" : label(field)}${state.sort === field ? (state.sortDir === 1 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead><tbody>${tasks.map((t, index) => `<tr><td>${index + 1}</td><td class="title-cell"><button class="table-open" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(t.title)}">${icon("external")}</button>${input(t, "title")}</td><td>${select(t, "type", types)}</td><td>${select(t, "status", statuses, statusNames)}</td><td>${select(t, "priority", priorities, priorityLabels)}</td><td><select data-task-field="parent" data-id="${esc(t.id)}" aria-label="Parent for ${esc(t.title)}">${parentOptions(t.parent, t.id)}</select></td><td>${input(t, "assignee")}</td><td>${input(t, "due", "date")}</td><td>${input(t, "tags")}</td></tr>`).join("")}</tbody></table></div><button class="add-row" data-action="task-new">${icon("plus")}New row</button>`;
}
function kanbanCard(t, showIds = false) {
  return `<article class="kanban-card" draggable="true" data-drag-task="${esc(t.id)}"><div class="card-top"><span class="task-type ${esc(t.type)}" role="img" aria-label="${esc(label(t.type))}" title="${esc(label(t.type))}">${icon(t.type)}</span>${showIds ? `<span class="task-id" title="${esc(t.source ? sourceLabel(t) : t.key || t.id)}">${esc(t.key || t.id)}</span>` : ""}<button class="task-title" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-description="Alt + Up or Down reorders this task within its column." data-action="task-open" data-id="${esc(t.id)}">${esc(t.title)}</button></div><div class="card-bottom"><span class="field-box" ${fieldBoxStyle(state, t.priority)}><span class="kanban-assignee" role="img" aria-label="Assignee: ${esc(t.assignee || "Unassigned")}" title="${esc(t.assignee || "Unassigned")}">${assigneeHTML(t)}</span>${priorityHTML(t)}${t.due ? `<span class="sr-only">Due </span>${dueHTML(t)}` : ""}</span></div></article>`;
}
function kanbanView(tasks) {
  const showIds = storage.get(`kanban-show-ids:${state.project.id}`, false) === true;
  const field = kanbanGroup(state.kanbanGroupBy);
  const header = (status, items, defaults = "") => `<div class="column-header"><span class="status-dot ${esc(status)}" ${taskColorAttributes(state, "status", status)}></span>${esc(statusNames[status])}<span class="count">${items.length}</span><button type="button" class="icon-button" data-action="task-new" data-status="${esc(status)}" ${defaults} aria-label="Add card to ${esc(statusNames[status])}" title="Add card">${icon("plus")}</button></div>`;
  const column = (status, items, value = "") => {
    const grouped = field !== "none";
    const key = grouped ? JSON.stringify([field, value, status]) : status;
    const limit = state.kanbanLimits?.[`${state.project.id}/${key}`] || 100;
    const defaults = grouped ? `data-kanban-field="${field}" data-kanban-value="${esc(value)}"` : "";
    return `<section class="kanban-column" data-drop-status="${esc(status)}" ${defaults} aria-label="${esc(statusNames[status])}">${grouped ? "" : header(status, items)}${items.slice(0, limit).map(t => kanbanCard(t, showIds)).join("")}${items.length > limit ? `<button class="button small" data-kanban-more="${esc(key)}">Show 100 more (${Math.min(limit, items.length)} shown)</button>` : ""}${grouped ? `<button class="add-row" data-action="task-new" data-status="${esc(status)}" ${defaults}>${icon("plus")}Add card</button>` : ""}</section>`;
  };
  if (field === "none") return `<div class="kanban" role="region" aria-label="Kanban board" tabindex="0" data-group="none">${statuses.map(status => column(status, tasks.filter(t => t.status === status))).join("")}</div>`;
  const lanes = kanbanLanes(tasks, field, state.config);
  return `<div class="kanban kanban-swimlanes" role="region" aria-label="Kanban board" tabindex="0" data-group="${field}" style="--kanban-columns:${statuses.length}"><div class="kanban-lanes-content"><div class="kanban-lanes-header">${statuses.map(status => header(status, tasks.filter(t => t.status === status))).join("")}</div>${lanes.map(([value, items], index) => {
    const key = laneKey(field, value), collapsed = (state.kanbanCollapsed || []).includes(key);
    const title = field === "assignee" ? value || "Unassigned" : field === "priority" ? priorityLabel(value) : label(value);
    return `<section class="kanban-lane" data-lane-value="${esc(value)}"><h2 class="kanban-lane-heading"><button type="button" data-kanban-collapse="${esc(key)}" aria-expanded="${!collapsed}" aria-controls="kanban-lane-${index}">${icon("chevron")}${["assignee", "priority"].includes(field) ? taskColorDot(state, field, value) : ""}<span>${esc(title)}</span><span class="count">${items.length}</span></button></h2><div class="kanban-lane-row" id="kanban-lane-${index}" ${collapsed ? "hidden" : ""}>${statuses.map(status => column(status, items.filter(t => t.status === status), value)).join("")}</div></section>`;
  }).join("")}</div></div>`;
}

let taskPanelController = null, restoreTaskFocus = null;
// Small operations open at a width sized to their content instead of the full dialog.
const COMPACT_DIALOGS = ["board", "canvas-note", "canvas-name", "board-layers", "bulk-stickies", "quick-capture", "view", "keyboard-connector", "frame-link"];
function showDialog(html, kind, { boardPanel = false, nodeId = null } = {}) {
  const opener = document.activeElement;
  if (taskPanelController && !closeDialog(false, { confirmDirty: false }))
    return;
  state.boardTaskEditor = boardPanel
    ? { project: state.project.id, board: state.selectedBoard }
    : null;
  if (boardPanel) {
    state.boardTaskPanel = false;
    renderView();
  }
  state.dialog = boardPanel ? null : kind;
  state.dirty = false;
  $("#dialogs").innerHTML = html;
  const dialog = $("dialog");
  if (COMPACT_DIALOGS.includes(kind)) dialog.classList.add("compact-dialog");
  prepareDialogFocus(dialog);
  restoreTaskFocus = kind === "task"
    ? taskFocus(opener, dialog.querySelector("#task-form")?.dataset.id)
    : null;
  if (kind === "task")
    taskPanelController = boardTaskEditor(dialog, {
      $,
      state,
      closeDialog,
      renderView,
      icon,
    });
  else if (["draft-review", "frame-update"].includes(kind))
    taskPanelController = boardObjectDialog(dialog, {
      state,
      board,
      closeDialog,
      nodeId,
      triggerSelector:
        kind === "frame-update" ? ".project-frame-update" : '[data-pro="convert"]',
    });
  else dialog.showModal();
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("input", () => {
    if (!["search", "frame-update"].includes(kind)) state.dirty = true;
  });
  dialog.addEventListener("change", () => {
    if (!["search", "frame-update"].includes(kind)) state.dirty = true;
  });
  features.dialogOpened(kind);
  $("[autofocus]", dialog)?.focus();
}
function closeDialog(force = false, { confirmDirty = true, keepDraft = false } = {}) {
  // The phone search sheet closes at once, so whatever was chosen opens; an inert copy slides away
  // unless motion is reduced.
  const sheet = $("#dialogs > dialog.search-dialog[open]");
  if (sheet && matchMedia("(max-width: 600px) and (prefers-reduced-motion: no-preference)").matches) {
    const box = sheet.getBoundingClientRect(), copy = sheet.cloneNode(true);
    for (const el of [copy, ...copy.querySelectorAll("[id]")]) el.removeAttribute("id");
    Object.assign(copy.style, { position: "fixed", inset: "auto", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: "0" });
    copy.inert = true;
    document.body.append(copy);
    copy.show();
    copy.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(24px)", opacity: 0 }], { duration: 160, easing: "ease-in", fill: "forwards" })
      .finished.catch(() => {}).then(() => copy.remove());
  }
  const form = $("#task-form");
  if (form?.dataset.id || form?.dataset.draftNode) {
    void features.flushTask();
    if (!force && !keepDraft && (!form.checkValidity() || !form.elements.title.value.trim())) {
      let notice = form.querySelector(".task-close-notice");
      if (!notice) {
        notice = document.createElement("div");
        notice.className = "task-close-notice";
        notice.setAttribute("role", "alert");
        notice.innerHTML = '<p>Complete the required fields to save, or keep this edit as a browser draft.</p><button type="button" class="button small" data-keep-editing>Keep editing</button><button type="button" class="button small" data-keep-draft>Keep draft and close</button>';
        form.querySelector(".dialog-body").prepend(notice);
        notice.querySelector("[data-keep-editing]").onclick = () => {
          notice.remove();
          (form.querySelector(":invalid") || form.elements.title).focus();
        };
        notice.querySelector("[data-keep-draft]").onclick = () => closeDialog(false, { keepDraft: true });
      }
      notice.querySelector("[data-keep-editing]").focus();
      return false;
    }
    confirmDirty = false;
  }
  if (state.boardTaskEditor && !force) {
    if ($("#task-form [type=submit]")?.disabled) return false;
    confirmDirty = false;
  }
  if (
    !force &&
    confirmDirty &&
    state.dirty &&
    !confirm(
      "Close this editor? Your draft will remain available in this browser.",
    )
  )
    return;
  if (force) features.clearDraft();
  taskPanelController?.destroy();
  taskPanelController = null;
  state.boardTaskEditor = null;
  features.dialogClosed();
  $("dialog")?.close();
  $("#dialogs").innerHTML = "";
  state.dialog = null;
  state.dirty = false;
  const restore = restoreTaskFocus;
  restoreTaskFocus = null;
  requestAnimationFrame(() => {
    if (!$("#dialogs").children.length) restore?.();
  });
  return true;
}
const dialogHead = (title) =>
  `<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" class="icon-button" data-action="dialog-close" aria-label="Close dialog">${icon("close")}</button></div>`;
const navigationDefaults = {
  search: "",
  status: "all",
  type: "all",
  sort: "created",
  sortDir: 1,
  extraFilters: {},
  groupBy: "status",
  kanbanGroupBy: "none",
  kanbanCollapsed: [],
  page: 0,
  savedView: null,
  tableColumns: null,
  tablePreferences: null,
  settingsReturn: "list",
};
function navigationSnapshot() {
  const route = state.helpArticle
    ? { page: "help", article: state.helpArticle, project: state.project?.id || null, view: "help", organisation: state.organisation?.id || null }
    : state.project
    ? {
        project: state.project.id,
        view: state.view,
        document: state.view === "documents" ? state.selectedDocument : null,
        settingsSection: state.view === "settings" ? state.settingsSection || "general" : null,
        settingsDetail: state.view === "settings" ? state.settingsDetail || "" : "",
        board: state.view === "board" ? state.selectedBoard : null,
        gallery: state.view === "board" && !!state.boardGallery,
      }
    : {
        organisation: state.organisation?.id || null,
        page: state.directoryPage || "home",
        settingsSection: state.directoryPage === "settings" ? state.settingsSection : null,
      };
  const preferences = Object.fromEntries(
    Object.entries(navigationDefaults).map(([key, fallback]) => [
      key,
      structuredClone(state[key] ?? fallback),
    ]),
  );
  preferences.collapsed = [...state.collapsed];
  preferences.tableCollapsed = [...(state.tableCollapsed || [])];
  return { route, preferences };
}
async function restoreNavigation(entry, stillCurrent = () => true) {
  if (!features.settingsCanLeave()) return false;
  if (state.loading || state.toolDragging || state.kanbanDragging || state.taskReordering) {
    toast("Finish the current action before navigating back.");
    return false;
  }
  setLoading(true);
  state.navigation++;
  try {
    if (!(await features.flushTask())) {
      toast("Finish saving this task before leaving it.", true);
      return false;
    }
    await boardQueue;
    if (state.boardConflict) {
      toast("Resolve the canvas conflict before changing pages.", true);
      return false;
    }
    if (!stillCurrent()) return false;
    const destination = entry.route;
    const snapshot =
      destination.project && destination.project !== state.project?.id
        ? await api(`/projects/${destination.project}`)
        : null;
    const organisation =
      !destination.project && destination.organisation
        ? state.organisations.find((o) => o.id === destination.organisation)
        : null;
    if (!destination.project && destination.organisation && !organisation)
      throw new Error("This organisation is no longer available.");
    if (!stillCurrent()) return false;
    if ($("dialog") && !closeDialog(false)) return false;
    features.canvasBeforeRender();
    features.drawingReset();
    state.settingsDirty = false;
    state.dirty = false;
    if (destination.project) {
      if (snapshot) activateProject(snapshot);
      Object.assign(state, structuredClone(navigationDefaults));
      if (!entry.preferences) {
        state.sort = storage.get(`sort:${state.project.id}`, state.tasks.some(t => Number.isFinite(t.order)) ? "order" : "created");
        state.groupBy = storage.get(`group-by:${state.project.id}`, "status");
        state.kanbanGroupBy = kanbanGroup(storage.get(`kanban-group:${state.project.id}`, "none"));
        state.kanbanCollapsed = storage.get(`kanban-collapsed:${state.project.id}`, []);
      }
      for (const key of Object.keys(navigationDefaults))
        if (entry.preferences && key in entry.preferences)
          state[key] = structuredClone(entry.preferences[key]);
      state.collapsed = new Set(entry.preferences?.collapsed || []);
      state.tableCollapsed = new Set(entry.preferences?.tableCollapsed || []);
      state.tableFilterSearch = {};
      state.headerMenu = null;
      state.helpArticle = destination.page === "help" ? helpArticle(destination.article).id : null;
      state.view = state.helpArticle ? "help" : destination.view;
      state.selectedDocument = destination.document || null;
      state.settingsSection = destination.settingsSection || "general";
      state.settingsDetail = destination.settingsDetail || "";
      state.boardGallery = !!destination.gallery;
      if (state.view === "board") {
        if (
          destination.board &&
          state.boards.some((b) => b.id === destination.board)
        )
          state.selectedBoard = destination.board;
        state.history = [];
        state.future = [];
        state.selectedNode = state.selectedEdge = null;
        state.selectedEdges?.clear();
        storage.set(`board:${state.project.id}`, state.selectedBoard);
        loadCamera();
      }
      if (!state.helpArticle) storage.set(`view:${state.project.id}`, state.view);
    } else {
      clearProject();
      state.organisation = organisation || state.organisation;
      state.directoryPage = ["teams", "people", "settings"].includes(destination.page)
        ? destination.page
        : null;
      if (state.directoryPage === "settings") {
        state.settingsSection = destination.settingsSection || "personal";
        state.settingsDetail = "";
      }
      state.helpArticle = destination.page === "help" ? helpArticle(destination.article).id : null;
      if (state.organisation)
        storage.set("organisation", state.organisation.id);
    }
    renderApp();
    if (destination.view === "board" && !destination.gallery) {
      await features.drawingSettled();
      if (stillCurrent() && destination.frame)
        focusLinkedFrame(destination.frame);
    }
    return true;
  } finally {
    setLoading(false);
  }
}
function focusLinkedFrame(id) {
  const n = board()?.nodes.find((n) => n.id === id),
    c = $("#canvas");
  if (!n || !c) return;
  const height = boardFloor(c);
  const z = Math.min(
    1.5,
    (c.clientWidth - 140) / n.w,
    (height - 100) / n.h,
  );
  state.camera = {
    z,
    x: c.clientWidth / 2 - (n.x + n.w / 2) * z,
    y: height / 2 - (n.y + n.h / 2) * z,
  };
  updateCamera();
}
const navigation = browserNavigation({
  capture: navigationSnapshot,
  restore: restoreNavigation,
  onError: (error) => toast(error.message, true),
});
const features = installFeatures({
  state,
  taskViews,
  planningViews,
  statusNames,
  colorPicker,
  storage,
  sync,
  api,
  route,
  esc,
  icon,
  label,
  viewLabel,
  options,
  $,
  $$,
  assigneeHTML,
  dueHTML,
  bookmarks,
  toast,
  task,
  board,
  renderApp,
  renderView,
  refresh,
  applyBoard,
  organisationFormHTML,
  openProject,
  openView,
  openSelectMenu: (select, anchor) => selectMenus.open(select, anchor),
  canNavigate,
  loadCamera,
  openOrganisation,
  taskDialog,
  draftTaskDialog,
  showDialog,
  closeDialog,
  dialogHead,
  patchTask,
  changeBoard,
  addNode,
  saveBoard,
  boardSnapshot,
  remember,
  updateCamera,
  updateEdges,
  safeColor,
  clearProject,
  filteredTasks,
  nodeHTML,
  markdown,
  zoom,
  fitBoard,
  flushBoard: () => boardQueue,
});
kanbanDrag({ state, task, patchTask, renderView, storage, toast, statusNames });
// New organisations are created in a dialog; the current one is edited on the Settings page.
function organisationFormHTML(organisation = state.organisation) {
  const edit = !!organisation?.id;
  return `<form id="organisation-form" data-id="${esc(edit ? organisation.id : "")}" data-revision="${esc(organisation.revision || "")}">${edit ? "" : dialogHead("A home for your projects")}<div class="dialog-body"><div class="form-error hidden" role="alert"></div><label class="field">Organisation name<input name="title" value="${esc(organisation.title)}" placeholder="A company, a team, or your own space" maxlength="300" required ${edit ? "" : "autofocus"}></label><label class="field">Description<textarea name="body" rows="3" placeholder="What brings these projects together?">${esc(organisation.body)}</textarea></label><div class="field">Organisation colour${colorPicker({ label: "Organisation colour", value: organisation.color })}</div><p>Each organisation has its own project list. You can switch organisations at any time.</p></div><div class="dialog-foot">${edit ? "" : '<button type="button" class="button" data-action="dialog-close">Cancel</button>'}<button type="submit" class="button primary">${edit ? "Save organisation" : "Create organisation"}</button></div></form>`;
}
function organisationDialog(edit = false) {
  if (edit) return state.organisation && features.settingsOpen("organisation");
  showDialog(`<dialog class="dialog">${organisationFormHTML({ title: "", body: "", color: "#66856f" })}</dialog>`, "organisation");
}
function projectFormHTML(edit = false) {
  const p = edit
    ? state.project
    : {
        title: "",
        body: "",
        color: "#66856f",
        default_view: "list",
        organisation: state.organisation.id,
      };
  return `<form id="project-form" data-edit="${edit}" data-revision="${esc(p.revision || "")}">${edit ? "" : dialogHead("A fresh page for a new project")}<div class="dialog-body"><div class="form-error hidden" role="alert"></div><label class="field">Project name<input name="title" value="${esc(p.title)}" placeholder="What are we working on?" maxlength="300" required autofocus></label><label class="field">Project key<input name="key" value="${esc(p.key || "")}" placeholder="e.g. WEB" pattern="[A-Za-z][A-Za-z0-9]{1,11}" maxlength="12" ${edit ? "required" : ""}><span class="field-hint">Tasks use IDs such as WEB-1. Leave blank when creating a project to generate a key.</span></label><label class="field">Organisation<select name="organisation" required>${state.organisations.map((o) => `<option value="${esc(o.id)}" ${o.id === p.organisation ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select>${edit ? '<span class="field-hint">Changing this moves the project, including its tasks and canvases, to the selected organisation.</span>' : ""}</label><label class="field">A few words about it<textarea name="body" rows="3" placeholder="The idea, the intention, the possibilities…">${esc(p.body)}</textarea></label><div class="field-row"><div class="field">Project colour${colorPicker({ label: "Project colour", value: p.color })}</div>${edit ? `<label class="field">Default view<select name="default_view">${options(views, p.default_view === "drawing" ? "board" : p.default_view, viewLabels)}</select></label>` : ""}</div><p>Projects live in your vault as folders. Every task is a Markdown file you can open in Obsidian.</p></div><div class="dialog-foot"><button type="button" class="button" data-action="${edit ? "settings-close" : "dialog-close"}">${edit ? "Back to project" : "Cancel"}</button><button class="button primary" type="submit">${edit ? "Save project" : "Create project"} ${icon("arrow")}</button></div></form>`;
}
function projectDialog(edit = false) {
  if (!canNavigate()) return;
  if (!state.organisation) return organisationDialog();
  if (edit) {
    features.settingsOpen("general");
  } else
    showDialog(
      `<dialog class="dialog">${projectFormHTML(false)}</dialog>`,
      "project",
    );
}

function draftTaskDialog(nodeId = "new") {
  const node = board()?.nodes.find((n) => n.id === nodeId);
  if (nodeId !== "new" && (!node || node.type !== "draft" || node.locked))
    return;
  if (state.boardTaskEditor && !closeDialog(false, { confirmDirty: false }))
    return;
  taskDialog(null, { ...(node ? draftTaskData(node) : {}), draftNode: nodeId });
}

function taskDialog(id = null, defaults = {}, replace = false) {
  if (!id && state.boardTaskEditor && !$("#task-form")?.dataset.id) {
    focusOnOpen($("#task-form [name=title]"), $('.task-dialog [data-action="dialog-close"]'));
    return;
  }
  const t = id
    ? task(id)
    : {
        title: "",
        body: "",
        type: types.includes("task") ? "task" : types[0],
        status: initialStatus(state.config),
        priority: defaultPriority,
        parent: null,
        assignee: "",
        due: "",
        tags: [],
        ...defaults,
      };
  if (!t) return;
  const isDraft = !!t.draftNode;
  state.dialogTask = t;
  const picker = (name, title, value, choices, iconOnly = false) =>
    taskPickerHTML({ name, title, value, choices, iconOnly }, { esc, icon, state });
  const metadata = {
    priority: `<div class="field"><span class="sr-only">Priority</span>${picker(
      "priority",
      "Priority",
      t.priority,
      priorities.map((value) => ({
        value,
        label: priorityLabel(value),
        icon: `priority-${value}`,
      })),
      true,
    )}</div>`,
    status: `<label class="field"><span class="sr-only">Status</span><select name="status" aria-label="Status" ${taskColorAttributes(state, "status", t.status)}>${options(id ? nextStatuses(state.config, t.status) : statuses, t.status, statusNames)}</select></label>`,
    assignee: `<label class="field task-assignee-field"><span class="sr-only">Assignee</span><span class="task-assignee-choice"><span data-assignee-avatar>${assigneeHTML(t)}</span><select name="assignee" aria-label="Assignee" ${taskColorAttributes(state, "assignee", t.assignee)} ${assigneeHint(state) ? 'aria-describedby="task-assignee-help"' : ""}>${assigneeOptions(state, t.assignee, esc)}</select></span></label>`,
  };
  const html = `<dialog class="dialog task-dialog" aria-label="Task editor"><form id="task-form" class="${id ? "task-edit-form" : "task-create-form"}" data-board="${esc(!id && ["board", "drawing"].includes(state.view) ? state.selectedBoard : "")}" data-draft-node="${esc(t.draftNode || "")}" data-id="${esc(id || "")}" data-revision="${esc(t.revision || "")}">
    <div class="dialog-head task-editor-head"><div class="task-editor-header-row"><div class="task-identity-row">
      ${picker(
        "type",
        "Task type",
        t.type,
        types.map((value) => ({ value, label: label(value), icon: value })),
        true,
      )}
    </div>${id ? `<div class="task-editor-actions" role="group" aria-label="Task actions"><button type="button" class="icon-button danger" data-action="task-delete" data-id="${esc(id)}" aria-label="Delete task" title="Delete task">${icon("trash")}</button><button type="button" class="icon-button" data-feature="task-duplicate" aria-label="Duplicate task" title="Duplicate task">${icon("duplicate")}</button><button type="button" class="icon-button" data-feature="task-archive" aria-label="${t.archived ? "Unarchive task" : "Archive task"}" title="${t.archived ? "Unarchive task" : "Archive task"}">${icon("archive")}</button><button type="button" class="icon-button" data-feature="task-history" aria-expanded="false" aria-label="Version history" title="Version history">${icon("clock")}</button><button type="button" class="icon-button" data-feature="task-comments" aria-expanded="false" aria-label="Task comments" title="Comments">${icon("comment")}</button></div>` : isDraft ? `<div class="task-editor-actions" role="group" aria-label="Draft actions"><button type="button" class="icon-button" data-feature="draft-finalise" aria-label="Finalise task" title="Finalise task">${icon("task")}</button></div>` : ""}<button type="button" class="icon-button" data-action="dialog-close" aria-label="Close dialog">${icon("close")}</button></div><div class="task-title-row"><input class="title-input" name="title" aria-label="Task title" value="${esc(t.title)}" placeholder="Task title" required maxlength="300" autofocus>${t.key || id ? `<span class="task-id task-key" title="${esc(t.key || id)}">${esc(t.key || id)}</span>` : isDraft ? '<span class="task-id task-key">Draft</span>' : ""}${id ? bookmarks.button("card", state.project.id, id) : ""}</div></div>
    <div class="task-editor-content"><div class="dialog-body"><div class="form-error hidden" role="alert"></div>
      <div class="task-metadata"><div class="task-metadata-main"><div class="task-fields field-box" ${fieldBoxStyle(state, t.priority)}>${metadata.assignee}${metadata.status}${metadata.priority}</div><div class="field task-dates"><span class="sr-only">Dates</span><div class="task-date-range" role="group" aria-label="Start and due dates"><input type="date" name="start" aria-label="Start date" title="Start date" value="${esc(t.start || "")}"><span aria-hidden="true">→</span><input type="date" name="due" aria-label="Due date" title="Due date" value="${esc(t.due || "")}"></div></div></div></div>
      ${assigneeHint(state) ? `<p id="task-assignee-help" class="sr-only">${esc(assigneeHint(state))}</p>` : ""}
      ${taskDescriptionHTML(t.body, { esc, icon })}
      <input type="hidden" name="parent" value="${esc(t.parent || "")}">
      <select name="dependencies" multiple hidden>${[...new Set([...(t.dependencies || []), ...state.tasks.filter(task => task.id !== id).map(task => task.id)])].map(dependency => `<option value="${esc(dependency)}" ${(t.dependencies || []).includes(dependency) ? "selected" : ""}>${esc(dependency)}</option>`).join("")}</select>
      <input type="hidden" name="tags" value="${esc((t.tags || []).join(", "))}">
      <input type="hidden" name="pendingSubtasks" value="${esc(JSON.stringify(t.subtasks || []))}"><input type="hidden" name="creation_request" value="${id ? "" : randomUUID()}">
      ${(t.related_records || []).map(record => `<input type="hidden" name="related_records" value="${esc(record)}">`).join("")}
      ${(t.documents || []).map(document => `<input type="hidden" name="documents" value="${esc(document)}">`).join("")}
      </div>
      <aside class="task-history-panel" aria-label="Task version history" hidden></aside></div>
    <div class="dialog-foot task-editor-foot">${id || isDraft ? '<span class="task-autosave-status" data-autosave-status role="status" aria-live="polite">Saved automatically</span>' : `<div class="task-create-actions"><label class="create-another"><input type="checkbox" name="createAnother" ${t.createAnother ? "checked" : ""}>Create another</label><button class="button primary" type="submit">Create card</button></div>`}</div></form></dialog>`;
  if (replace && $(".task-dialog")) {
    const template = document.createElement("template");
    template.innerHTML = html;
    prepareDialogFocus(template.content.firstElementChild);
    $(".task-dialog").replaceChildren(
      ...template.content.firstElementChild.childNodes,
    );
    if (taskPanelController) {
      taskPanelController?.destroy();
      taskPanelController = boardTaskEditor($(".task-dialog"), {
        $,
        state,
        closeDialog,
        renderView,
        icon,
      });
    }
    state.dirty = false;
    features.dialogOpened("task");
  } else showDialog(html, "task", { boardPanel: ["board", "drawing"].includes(state.view) });
}

async function openHelp(article = "start") {
  const id = helpArticle(article).id;
  if (state.helpArticle === id) return;
  const opened = await restoreNavigation({ route: {
    page: "help", article: id, project: state.project?.id || null, view: "help", organisation: state.organisation?.id || null,
  }, preferences: navigationSnapshot().preferences });
  if (opened) {
    window.scrollTo(0, 0);
    $("#help-title")?.focus({ preventScroll: true });
  }
}
async function patchTask(id, changes, rerender = true) {
  const t = task(id);
  if (!t) throw new Error("Task no longer exists.");
  if (changes.status && !canTransition(state.config, t.status, changes.status))
    throw new Error(transitionError(state.config, t.status, changes.status));
  const base = structuredClone(t);
  Object.assign(t, changes);
  await sync.enqueue(route("tasks", id), base, changes);
  if (rerender) renderApp();
  return task(id);
}

function boardToolbar() {
  return `<div class="board-toolbar"><select id="board-select" aria-label="Select board">${state.boards.filter(b=>!b.archived).map((b) => `<option value="${esc(b.id)}" ${b.id === state.selectedBoard ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select><button class="button small" data-action="board-new">${icon("plus")}New board</button><span class="spacer"></span>${state.selectedBoard ? bookmarks.button("board", state.project.id, state.selectedBoard) : ""}<button type="button" class="button small board-settings-button" data-feature="board-settings">${icon("settings")}Board settings</button><span class="board-save" id="board-save">${esc(saveIssue([...sync.entries.values()], {storageError:sync.storageError,online:state.online}) ? "" : saveState([...sync.entries.values()],{storageError:sync.storageError,online:state.online}))}</span>${state.boardConflict ? '<button class="button small" data-feature="recovery">Resolve</button>' : ""}</div>`;
}
function boardToolsHTML() {
  const tool = (name, title, action = "board-add", glyph = name) =>
    `<button type="button" class="${state.tool === name ? "active" : ""}" aria-pressed="${state.tool === name}" data-action="${action}" data-tool="${name}" title="${title}" aria-label="${title}">${icon(glyph)}</button>`;
  const groups = [
    ["Navigate", tool("cursor", "Select / move", "board-tool") + tool("hand", "Pan canvas", "board-tool") + `<button type="button" data-pro="search-toggle" aria-label="Search board" title="Search board (Ctrl / ⌘ F)" aria-expanded="false" aria-controls="canvas-search-panel">${icon("search")}</button>`],
    ["Tasks", `<button type="button" data-action="board-task" aria-label="Project tasks" title="Project tasks" aria-expanded="${!!state.boardTaskPanel}" aria-controls="board-task-panel">${icon("task")}</button><button type="button" data-feature="project-frame-add" data-tool="project-frame" title="Project frame" aria-label="Add Project frame">${icon("project-frame")}</button>`],
    ["Create", tool("sticky", "Add sticky note") + tool("text", "Add text") + tool("shape", "Add shape") + `<button type="button" data-feature="image-add" aria-label="Add images or GIFs" title="Images / GIFs · PNG, JPG, WebP or GIF · Up to 10 MB each">${icon("image")}</button><button type="button" data-feature="draw-tool" data-tool="draw" aria-label="Pen" title="Pen (P)">${icon("pencil")}</button>`],
    ["Arrange", `<button type="button" data-feature="frame-add" data-tool="frame" title="Frame (F)" aria-label="Draw frame">${icon("frame")}</button>` + tool("grid", "Add grid", "board-add", "table") + tool("connect", "Connect two objects", "board-tool")],
    ["History", `<button type="button" data-action="board-undo" title="Undo" aria-label="Undo canvas change" ${state.history.length ? "" : "disabled"}>${icon("undo")}</button><button type="button" data-action="board-redo" title="Redo" aria-label="Redo canvas change" ${state.future.length ? "" : "disabled"}>${icon("redo")}</button>`],
  ];
  return `<div class="board-tools" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical" data-board="${esc(board().id)}">${groups.map(([name, buttons]) => `<div class="board-tool-group" role="group" aria-label="${name}"><span class="board-tool-category" aria-hidden="true">${name}</span>${buttons}</div>`).join("")}</div>`;
}
function boardView() {
  const b = board();
  if (!b)
    return `<div class="empty">${icon("board")}<h2>A little room to think.</h2><p>Create a canvas to connect your tasks and ideas.</p><button class="button primary" data-action="board-new">Create a canvas</button></div>`;
  return `<div class="canvas ${state.tool === "hand" ? "pan-mode" : state.tool === "connect" ? "connect-mode" : ""}" id="canvas" tabindex="0" aria-label="Freeform project canvas. Use tools to add objects, drag to move them, and double-click to edit.">
    <div class="canvas-world" id="canvas-world"><svg class="canvas-lines" id="canvas-lines">${edgesHTML(b)}</svg>${features.canvasNodes(b).map(nodeHTML).join("")}</div>
    ${boardToolsHTML()}
    ${boardTaskPanelHTML()}${selectionHTML()}<div class="board-controls"><button type="button" class="icon-button board-zoom" id="zoom-label" data-action="board-zoom" title="Zoom level: double-click to fit the board (Alt+1)" aria-keyshortcuts="Alt+1">${Math.round(state.camera.z * 100)}%</button></div>
    ${!b.nodes.length ? '<div class="board-empty"><h3>Give your ideas a little room.</h3><p>Add notes, tasks, images or shapes.<br>Drop image files here to get started.</p></div>' : ""}</div>`;
}
function selectionHTML() {
  return state.selectedEdge
    ? `<div class="board-selection"><button class="button small" data-action="edge-delete">${icon("trash")}Delete connector</button></div>`
    : "";
}
function nodeHTML(n) {
  const t = n.type === "task" ? task(n.task) : null;
  const availability = boardTaskState(n, t, state.taskAvailability);
  return `<div class="board-node ${esc(visualNodeType(n))} ${isTaskNote(n) ? "task-as-note" : ""} ${n.id === state.selectedNode ? "selected" : ""}" data-node="${esc(n.id)}" tabindex="0" role="group" aria-label="${esc(n.type === "task" ? t?.title || "Missing task" : n.text || n.type)}" style="--node-text-align:${textAlignment(n)};left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;${n.color && n.type !== "draw" ? `background:${safeColor(n.color)};` : ""}">${n.type === "task" && !t ? unavailableTaskHTML(n, availability, { esc, icon }) : isTaskNote(n) ? `<div class="node-text">${esc(t?.title || "Note unavailable")}</div>` : n.type === "task" ? `${t ? `${typeHTML(t)}<span class="task-title">${esc(t.title)}</span><div class="board-task-bottom"><span class="task-type"><span class="status-dot ${esc(t.status)}" ${taskColorAttributes(state, "status", t.status)}></span>${esc(statusNames[t.status])}</span>${assigneeHTML(t)}</div>` : '<span class="task-title">Task was removed</span><span class="field-hint">Remove this card from the canvas.</span>'}` : `<div class="node-text">${esc(n.text)}</div>`}</div>`;
}
function edgesHTML(b) {
  return features.canvasEdges(b);
}
function updateEdges() {
  const svg = $("#canvas-lines");
  if (!svg || !board()) return;
  renderCanvasEdges(svg, edgesHTML(board()), state.camera.z);
}
function updateCamera(animated = false, { persist = true, navigating = false } = {}) {
  if (!animated) cameraMotion.cancel();
  const world = $("#canvas-world"),
    canvas = $("#canvas");
  if (!world) return;
  const { x, y, z } = state.camera;
  world.style.transform = `translate(${x}px,${y}px) scale(${z})`;
  paintBoardBackground(canvas, board()?.settings?.background, state.camera);
  const zoomLabel = $("#zoom-label"), zoomText = `${Math.round(z * 100)}%`;
  if (zoomLabel.textContent !== zoomText) zoomLabel.textContent = zoomText;
  if (persist) storage.set(`camera:${state.selectedBoard}`, state.camera);
  features.canvasCamera({ navigating });
}
function loadCamera() {
  const saved = storage.get(`camera:${state.selectedBoard}`, storage.get(`drawing-camera:${state.selectedBoard}`, { x: 15, y: 0, z: 0.85 }));
  state.camera =
    [saved.x, saved.y, saved.z].every(Number.isFinite) &&
    saved.z >= 0.001 &&
    saved.z <= 3
      ? saved
      : { x: 15, y: 0, z: 0.85 };
  state.selectedNode = null;
  {
    state.selectedEdge = null;
    state.selectedEdges?.clear();
  }
  state.connectFrom = null;
}
function zoom(multiplier, px, py) {
  const canvas = $("#canvas");
  if (!canvas) return;
  cameraMotion.zoom(
    multiplier,
    px ?? canvas.clientWidth / 2,
    py ?? canvas.clientHeight / 2,
  );
}
let zoomClickedAt = -Infinity;
function fitBoard() {
  const b = board(),
    canvas = $("#canvas");
  if (!b || !canvas) return;
  if (!b.nodes.length) {
    state.camera = { x: 0, y: 0, z: 1 };
    updateCamera();
    return;
  }
  const minX = Math.min(...b.nodes.map((n) => n.x)),
    minY = Math.min(...b.nodes.map((n) => n.y)),
    maxX = Math.max(...b.nodes.map((n) => n.x + n.w)),
    maxY = Math.max(...b.nodes.map((n) => n.y + n.h));
  // Fit above the bottom bar and the phone dock, which float over the board.
  const height = boardFloor(canvas);
  const z = Math.max(
    0.001,
    Math.min(
      1.25,
      (canvas.clientWidth - 160) / (maxX - minX),
      (height - 100) / (maxY - minY),
    ),
  );
  state.camera = {
    z,
    x: (canvas.clientWidth - (maxX - minX) * z) / 2 - minX * z + 20,
    y: (height - (maxY - minY) * z) / 2 - minY * z,
  };
  updateCamera();
}
function boardSnapshot() {
  const b = board();
  return structuredClone({
    title: b.title,
    nodes: b.nodes,
    edges: b.edges,
    templates: b.templates || [],
    presentation: b.presentation || [],
    settings: b.settings || {},
    layers: b.layers || [],
  });
}
function remember(snapshot = boardSnapshot()) {
  state.history.push(snapshot);
  const historyLimit = Math.max(1, Math.min(40, Math.floor(300000 / Math.max(1, snapshot.nodes.length + snapshot.edges.length))));
  while (state.history.length > historyLimit) state.history.shift();
  state.future = [];
}
function saveBoard() {
  const b = board(), project = state.project;
  if (!b) return;
  features.drawingCheckpoint(true, b, project);
  const base = state.boardBases?.[b.id] || b;
  boardQueue = sync
    .enqueue(route("boards", b.id), base, boardSnapshot(), { snapshot: true })
    .then(() => {
      state.boardBases ||= {};
      state.boardBases[b.id] = structuredClone(b);
      features.drawingCheckpoint(sync.entries.has(`/projects/${project.id}/boards/${b.id}`), b, project);
    });
}
function appStatusHTML() {
  return headerStatus.html();
}
function updateSaveState() {
  const text=saveState([...sync.entries.values()],{storageError:sync.storageError,online:state.online});
  if ($("#board-save")) $("#board-save").textContent = saveIssue([...sync.entries.values()], { storageError: sync.storageError, online: state.online }) ? "" : text;
  headerStatus.update();
}
function changeBoard(fn, { render = true, adoptNewFrames = true } = {}) {
  if (!board()) return;
  const before = structuredClone(board().nodes);
  remember();
  fn(board());
  const old = new Map(before.map((n) => [n.id, n]));
  const moved = new Set(
    board()
      .nodes.filter(
        (n) =>
          !old.has(n.id) || old.get(n.id).x !== n.x || old.get(n.id).y !== n.y,
      )
      .map((n) => n.id),
  );
  if (moved.size) updateFrameMembership(board().nodes, moved, before, { adoptNewFrames });
  saveBoard();
  if (render) renderView();
  else {
    updateCamera();
    features.canvasSaved();
  }
}
function addNode(type, taskId = null, position = null, draft = null) {
  const canvas = $("#canvas");
  if (!canvas || !board()) return;
  const { x, y, z } = state.camera,
    id = `n-${randomUUID()}`;
  const node = {
    id,
    type,
    x: Math.round(
      ((state.boardTaskPanel
        ? Math.min(
            canvas.clientWidth - 100,
            Math.max(canvas.clientWidth / 2, 560),
          )
        : canvas.clientWidth / 2) -
        x) /
        z -
        110,
    ),
    y: Math.round((canvas.clientHeight / 2 - y) / z - 80),
    w:
      type === "draft"
        ? 320
        : type === "task"
          ? 280
          : type === "text"
            ? 360
            : 220,
    h:
      type === "draft"
        ? 240
        : type === "task"
          ? 180
          : type === "text"
            ? 90
            : 180,
  };
  if (position) {
    node.x = Math.round(position.x);
    node.y = Math.round(position.y);
  }
  if (type === "draft") {
    node.draft = draftTaskFields(draft);
    node.text = draft.body || "";
  } else if (type === "task") node.task = taskId;
  else {
    node.text = "";
    if (type === "sticky") node.color = "#f5e7a2";
  }
  changeBoard((b) => {
    b.nodes.push(node);
    state.selectedNode = id;
    {
      state.selectedEdge = null;
      state.selectedEdges?.clear();
    }
    state.tool = "cursor";
  });
  if (!["task", "draft"].includes(type)) features.canvasEdit(id);
  return node;
}
function boardNameDialog(rename = false) {
  if (rename && !board()) return;
  showDialog(
    `<dialog class="dialog"><form id="board-form" data-rename="${rename}">${dialogHead(rename ? "Name this board" : "A new place to think")}<div class="dialog-body"><div class="form-error hidden" role="alert"></div><label class="field">Board name<input name="title" value="${esc(rename ? board().title : "")}" required maxlength="300" placeholder="Ideas, a roadmap, the big picture…" autofocus></label></div><div class="dialog-foot"><button type="button" class="button" data-action="dialog-close">Cancel</button><button type="submit" class="button primary">${rename ? "Save name" : "Create canvas"}</button></div></form></dialog>`,
    "board",
  );
}
function boardTaskPanelHTML() {
  if (!state.boardTaskPanel) return "";
  const f = state.boardTaskFilters || {};
  const filter = (name, label, values) =>
    `<label class="field">${label}<select data-board-task-filter="${name}" aria-label="${label}"><option value="">All</option>${values.map(([v, text]) => `<option value="${esc(v)}" ${f[name] === v ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  return `<aside id="board-task-panel" class="canvas-panel board-task-panel" aria-label="Project tasks"><header><h3>Project tasks</h3><button type="button" class="icon-button" data-action="board-task-close" aria-label="Close project tasks">${icon("close")}</button></header><input type="search" id="board-task-search" aria-label="Search project tasks" placeholder="Search by ID or title…" value="${esc(f.search || "")}"><div class="board-task-filters">${filter(
    "status",
    "Task status",
    state.config.statuses.map((s) => [s, statusNames[s] || label(s)]),
  )}${filter(
    "type",
    "Card type",
    state.config.types.map((t) => [t, label(t)]),
  )}${filter("assignee", "Task assignee", [["__unassigned", "Unassigned"], ...[...new Set(state.tasks.map((t) => t.assignee).filter(Boolean))].map((a) => [a, a])])}${filter(
    "placement",
    "Board placement",
    [
      ["off", "Not on this board"],
      ["on", "On this board"],
    ],
  )}</div><div class="board-task-results" aria-live="polite">${boardTaskResultsHTML()}</div><footer><button type="button" class="button primary" data-action="board-create-task">${icon("plus")}New project card</button><button type="button" class="button" data-action="board-create-draft">${icon("pencil")}New draft card</button><small>Drag a task onto the board, or click to place it. Cards share the project task.</small></footer></aside>`;
}
function boardTaskResultsHTML() {
  const f = state.boardTaskFilters || {},
    current = new Set(
      board()
        .nodes.filter((n) => n.task)
        .map((n) => n.task),
    );
  const tasks = state.tasks.filter(
    (t) =>
      !t.archived &&
      `${t.key || ""} ${t.title}`
        .toLowerCase()
        .includes((f.search || "").toLowerCase().trim()) &&
      (!f.status || t.status === f.status) &&
      (!f.type || t.type === f.type) &&
      (!f.assignee ||
        (f.assignee === "__unassigned"
          ? !t.assignee
          : t.assignee === f.assignee)) &&
      (!f.placement || current.has(t.id) === (f.placement === "on")),
  );
  return `<p class="field-hint">${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}</p><div class="task-picker-list">${tasks.map((t) => `<button type="button" class="board-pick" data-action="board-pick" data-id="${esc(t.id)}" aria-label="Add ${esc(t.key || "")} ${esc(t.title)} to board">${icon(t.type)}<span><small>${esc(t.key || t.id)} · ${esc(statusNames[t.status] || t.status)}</small><strong>${esc(t.title)}</strong><small>${current.has(t.id) ? "On board · Add another card" : esc(t.assignee || "Unassigned")}</small></span>${icon("plus")}</button>`).join("") || '<p id="task-picker-empty">No matching tasks.</p>'}</div>`;
}
function toggleBoardTasks() {
  if (!board()) return;
  if (state.boardTaskEditor) {
    if (!closeDialog(false, { confirmDirty: false })) return;
    state.boardTaskPanel = false;
  }
  state.boardTaskPanel = !state.boardTaskPanel;
  renderView();
  if (state.boardTaskPanel) focusOnOpen($("#board-task-search"), $('[data-action="board-task"]'));
}
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id !== "board-task-search" && !el.matches("[data-board-task-filter]"))
    return;
  state.boardTaskFilters ||= {};
  state.boardTaskFilters[el.dataset.boardTaskFilter || "search"] = el.value;
  $(".board-task-results").innerHTML = boardTaskResultsHTML();
});

document.addEventListener("click", async (event) => {
  const card = event.target.closest(".kanban-card[data-drag-task]");
  if (card && state.kanbanDragging) return;
  // Card padding and metadata open the same editor as its keyboard-accessible title.
  // Leave interactive controls to their own handlers.
  const el = event.target.closest("[data-action]") ||
    (card && !event.target.closest("button,a,input,select,textarea,[contenteditable],[role=button]")
      ? card.querySelector('[data-action="task-open"]')
      : null);
  if (!el) return;
  const { action, id } = el.dataset;
  try {
    switch (action) {
      case "reload-app":
        if ($("#task-form") && !closeDialog(false, { confirmDirty: false })) return;
        location.reload();
        break;
      case "directory-open":
        if (state.directoryPage !== el.dataset.page)
          await openDirectory(el.dataset.page);
        break;
      case "home":
        if (!canNavigate()) return;
        state.navigation++;
        clearProject();
        renderApp();
        break;
      case "menu":
        setSidebarOpen(!state.menu);
        break;
      case "organisation-new":
        organisationDialog();
        break;
      case "organisation-edit":
        organisationDialog(true);
        break;
      case "project-new":
        projectDialog();
        break;
      case "settings-close":
        if (!canNavigate()) return;
        state.settingsDirty = false;
        state.dirty = false;
        if (!state.project) {
          state.directoryPage = null;
          renderApp();
          break;
        }
        state.view = state.settingsReturn || "list";
        storage.set(`view:${state.project.id}`, state.view);
        renderApp();
        break;
      case "settings":
        features.settingsOpen();
        break;
      case "project-edit":
        projectDialog(true);
        break;
      case "project-open":
        await openProject(id);
        break;
      case "demo":
        if (!state.organisation) {
          organisationDialog();
          break;
        }
        el.disabled = true;
        {
          const p = await api("/demo", {
            method: "POST",
            body: { organisation: state.organisation.id },
          });
          await refresh(false);
          await openProject(p.id);
        }
        break;
      case "help":
      case "help-article":
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        await openHelp(el.dataset.article || id || "start");
        break;
      case "help-back":
        if (history.state?.index > 0) history.back();
        else { clearProject(); renderApp(); }
        break;
      case "dialog-close":
        closeDialog();
        break;
      case "document-new": {
        const record = await features.createDocument();
        if (record) {
          await features.openDocument(record.id);
        }
        break;
      }
      // The account's personal space (made on first use), and Today's note in it.
      // One at a time, so a double click doesn't make two notes for the day.
      case "personal-open":
      case "today":
        personalOpening ||= (async () => {
          const { project } = await api("/personal", { method: "POST", body: {} });
          if (state.project?.id !== project.id && !(await openProject(project.id))) return;
          if (action === "today") await features.today();
        })().finally(() => { personalOpening = null; });
        await personalOpening;
        break;
      case "document-template": {
        const menu = el.closest("details");
        menu?.removeAttribute("open");
        await features.documentTemplate(menu?.querySelector("summary") || el);
        break;
      }
      case "task-new":
        taskDialog(null, {
          status: el.dataset.status || initialStatus(state.config),
          ...(kanbanGroup(el.dataset.kanbanField) !== "none" ? { [el.dataset.kanbanField]: el.dataset.kanbanValue } : {}),
        });
        break;
      case "task-open":
        taskDialog(id);
        break;
      case "phone-field": {
        const select = el.closest(".task-row")?.querySelector(`select[data-row-field="${el.dataset.field}"]`);
        if (select) selectMenus.open(select, el);
        break;
      }
      case "wiki-open":
        closeDialog();
        if (!state.dialog) taskDialog(id);
        break;
      case "task-child":
        closeDialog();
        if (!state.dialog) taskDialog(null, { parent: id });
        break;
      case "task-delete":
        if (!(await features.flushTask())) return;
        if (
          await confirmAction({ anchor: el, title: "Delete this task?", message: "Its Markdown file moves to the vault’s .trash folder.", confirmLabel: "Delete task", danger: true })
        ) {
          await api(route("tasks", id), {
            method: "DELETE",
            body: { revision: $("#task-form").dataset.revision },
          });
          closeDialog(true);
          await refresh();
          toast("Task moved to .trash.");
        }
        break;
      case "view": {
        const fromLayout = el.closest(".view-layout-switcher"), fromTray = el.closest(".layout-tray");
        // With the bottom bar, tapping Documents again shows its tray (project-layout.js), or,
        // with no document open, the document list (the drawer's Documents level).
        if (el.dataset.view === "documents" && state.view === "documents" && el.closest(".tabs") && tabBar.matches) {
          if (!el.hasAttribute("aria-controls")) setSidebarOpen(true);
          break;
        }
        // The phone layout tray closes with the new view, so focus returns to its tab.
        if (openView(el.dataset.view))
          document
            .querySelector(fromTray ? ".tabs .tab.active" : `${fromLayout ? ".view-layout-switcher" : ".tabs"} [data-view="${el.dataset.view}"]`)
            ?.focus({ preventScroll: true });
        break;
      }
      case "filters-reset":
        state.search = "";
        state.status = "all";
        state.type = "all";
        state.extraFilters = {};
        if (state.view === "table") {
          const p = features.tablePreferences();
          p.filters = [];
          delete p.query;
          features.tablePersist();
        }
        state.page = 0;
        renderView();
        break;
      case "collapse":
        state.collapsed.has(id)
          ? state.collapsed.delete(id)
          : state.collapsed.add(id);
        renderView(true);
        $(`.tree-toggle[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
        break;
      case "expand-all":
        state.collapsed.clear();
        renderView(true);
        $('[data-action="expand-all"]')?.focus({ preventScroll: true });
        break;
      case "sort-column":
        if (state.sort === el.dataset.field) state.sortDir *= -1;
        else {
          state.sort = el.dataset.field;
          state.sortDir = 1;
        }
        renderView();
        break;
      case "md-preview":
        $("#markdown-preview").innerHTML = markdown(
          $('[name="body"]', $("#task-form")).value,
        );
        $("#markdown-preview").classList.remove("hidden");
        $(".markdown-source").classList.add("hidden");
        break;
      case "md-edit":
        $("#markdown-preview").classList.add("hidden");
        $(".markdown-source").classList.remove("hidden");
        break;
      case "board-new":
        boardNameDialog();
        break;
      case "board-tool":
        state.tool = el.dataset.tool;
        state.connectFrom = null;
        renderView(true);
        break;
      case "board-add":
        addNode(el.dataset.tool);
        break;
      case "board-create-draft":
        draftTaskDialog();
        break;
      case "board-create-task":
        taskDialog();
        break;
      case "board-task-close":
        state.boardTaskPanel = false;
        renderView();
        $('[data-action="board-task"]')?.focus();
        break;
      case "board-task":
        toggleBoardTasks();
        break;
      case "board-pick":
        addNode("task", id);
        break;
      case "node-edit":
        features.canvasEdit(state.selectedNode);
        break;
      case "node-delete":
        if (board()?.nodes.find((n) => n.id === state.selectedNode)?.locked) {
          toast("Unlock the object before deleting it.");
          break;
        }
        changeBoard((b) => {
          b.nodes = b.nodes.filter((n) => n.id !== state.selectedNode);
          b.edges = b.edges.filter(
            (e) => e.from !== state.selectedNode && e.to !== state.selectedNode,
          );
          state.selectedNode = null;
        });
        break;
      case "edge-delete":
        changeBoard((b) => {
          b.edges = b.edges.filter((e) => e.id !== state.selectedEdge);
          {
            state.selectedEdge = null;
            state.selectedEdges?.clear();
          }
        });
        break;
      case "board-zoom":
        // Double-clicking or double-tapping the zoom level fits the board, like Alt+1.
        if (event.timeStamp - zoomClickedAt < 400) {
          zoomClickedAt = -Infinity;
          fitBoard();
        } else zoomClickedAt = event.timeStamp;
        break;
      case "board-reload":
        if (
          await confirmAction({ anchor: el, title: "Reload this board from disk?", message: "Unsaved board edits will be discarded.", confirmLabel: "Reload" })
        ) {
          await boardQueue;
          state.boardConflict = false;
          state.history = [];
          state.future = [];
          await refresh();
        }
        break;
      case "board-undo":
      case "board-redo": {
        const from = action === "board-undo" ? state.history : state.future,
          to = action === "board-undo" ? state.future : state.history;
        if (from.length) {
          to.push(boardSnapshot());
          Object.assign(board(), from.pop());
          state.selectedNode = null;
          {
            state.selectedEdge = null;
            state.selectedEdges?.clear();
          }
          saveBoard();
          renderView();
        }
        break;
      }
    }
  } catch (error) {
    toast(error.message, true);
    if (action === "demo") el.disabled = false;
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.hasAttribute("data-settings-form")) return;
  if (
    ![
      "organisation-form",
      "project-form",
      "task-form",
      "node-form",
      "board-form",
    ].includes(form.id)
  )
    return;
  event.preventDefault();
  const submit = $('[type="submit"]', form);
  if (submit.disabled) return;
  submit.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "organisation-form") {
      await boardQueue;
      if (state.boardConflict)
        throw new Error(
          "Resolve the unsaved canvas changes before changing organisations.",
        );
      // Only forms with the Teams and People editors send these; others leave them as they are.
      if ("people" in data) data.people = JSON.parse(data.people || "[]");
      if ("teams" in data) data.teams = JSON.parse(data.teams || "[]");
      const id = form.dataset.id;
      const organisation = await api(`/organisations${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        body: { ...data, ...(id ? { revision: form.dataset.revision } : {}) },
      });
      closeDialog(true);
      state.settingsDirty = false;
      applyWorkspace(await fetchWorkspace());
      if (id) renderApp();
      else await openOrganisation(organisation.id);
      toast(
        form.dataset.directoryPage
          ? `${label(form.dataset.directoryPage)} saved.`
          : id
            ? "Organisation saved."
            : "Organisation created. Add its first project.",
      );
    } else if (form.id === "project-form") {
      data.teams = JSON.parse(data.teams || "[]");
      const edit = form.dataset.edit === "true";
      data.schema = JSON.parse(data.workflowSchema);
      delete data.workflowSchema;
      delete data["workflow-initial"];
      const p = await api(edit ? route() : "/projects", {
        method: edit ? "PATCH" : "POST",
        body: { ...data, ...(edit ? { revision: form.dataset.revision } : {}) },
      });
      state.settingsDirty = false;
      state.dirty = false;
      closeDialog(true);
      await refresh(false);
      await openProject(p.id);
      toast(edit ? "Project updated." : "A fresh page. Make it yours.");
    } else if (form.id === "task-form") {
      const createAnother =
        !form.dataset.id && form.elements.createAnother?.checked;
      delete data.createAnother;
      Object.assign(data, features.taskData(form));
      if (!form.dataset.id) {
        data.subtasks = JSON.parse(data.pendingSubtasks || "[]");
      }
      delete data.pendingSubtasks;
      delete data.subtaskTitle;
      delete data.subtaskType;
      const originalTask = task(form.dataset.id);
      if (originalTask?.assignee_id && data.assignee === originalTask.assignee)
        data.assignee_id = originalTask.assignee_id;
      data.tags = data.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      data.parent ||= null;
      data.due ||= null;
      if (form.dataset.draftNode) {
        await features.flushTask();
        return;
      }
      const id = form.dataset.id;
      if (id) {
        await sync.enqueue(
          route("tasks", id),
          features.formBase(form) || task(id),
          data,
        );
        if (sync.entries.has(route("tasks", id)))
          throw new Error(
            "Your draft is retained. Open Recovery to resolve a conflict, or wait for the connection to return.",
          );
      } else {
        const created = await api(route("tasks"), {
          method: "POST",
          body: data,
        });
        if (form.dataset.board) {
          if (!task(created.id)) state.tasks.push(created);
          const target = state.boards.find((b) => b.id === form.dataset.board);
          if (
            target &&
            target.id === state.selectedBoard &&
            !target.nodes.some(
              (n) => n.type === "task" && n.task === created.id,
            )
          )
            addNode("task", created.id);
        }
        await features.commitRelationships(created.id);
      }
      const wasPanel = !!state.boardTaskEditor;
      if (createAnother) {
        await refresh();
        closeDialog(true);
        taskDialog(null, {
          type: data.type,
          parent: data.parent,
          status: data.status,
          priority: data.priority,
          assignee: data.assignee,
          start: data.start || "",
          due: data.due || "",
          createAnother: true,
        });
      } else {
        closeDialog(true);
        if (wasPanel) state.boardTaskPanel = true;
        await refresh();
      }
      toast(id ? "Task saved." : "One good idea, written down.");
    } else if (form.id === "node-form") {
      for (const key of ["x", "y", "w", "h"]) data[key] = Number(data[key]);
      const minimum = nodeMinimum(
        board().nodes.find((n) => n.id === form.dataset.id),
      );
      data.w = Math.max(minimum.w, data.w);
      data.h = Math.max(minimum.h, data.h);
      if (state.boardConflict)
        throw new Error("Resolve the canvas conflict before saving objects.");
      changeBoard((b) =>
        Object.assign(
          b.nodes.find((n) => n.id === form.dataset.id),
          data,
        ),
      );
      closeDialog(true);
    } else if (form.id === "board-form") {
      await boardQueue;
      if (state.boardConflict)
        throw new Error(
          "Resolve the canvas conflict before changing canvases.",
        );
      const rename = form.dataset.rename === "true",
        b = board();
      const result = await api(route("boards", rename ? b.id : ""), {
        method: rename ? "PATCH" : "POST",
        body: { ...data, ...(rename ? { revision: b.revision } : {}) },
      });
      state.selectedBoard = result.id;
      closeDialog(true);
      await refresh(false);
      state.view = "board";
      state.boardGallery = false;
      features.drawingReset();
      storage.set(`board:${state.project.id}`, result.id);
      storage.set(`view:${state.project.id}`, "board");
      loadCamera();
      renderApp();
    }
  } catch (error) {
    const output = $(".form-error", form);
    if (output) {
      output.textContent = error.message;
      output.classList.remove("hidden");
      output.scrollIntoView({ block: "nearest" });
    } else toast(error.message, true);
  } finally {
    submit.disabled = false;
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    state.search = event.target.value;
    state.page = 0;
    renderView(true);
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.id === "organisation-select") {
      if (!(await openOrganisation(el.value)))
        el.value = state.organisation?.id || "";
    }
    if (el.id === "filter-status") {
      state.status = el.value;
      state.page = 0;
      renderView(true);
    }
    if (el.id === "filter-type") {
      state.type = el.value;
      state.page = 0;
      renderView(true);
    }
    if (el.id === "sort") {
      state.sort = el.value;
      storage.set(`sort:${state.project.id}`, state.sort);
      state.sortDir = 1;
      renderView(true);
    }
    if (el.id === "board-select") {
      if (
        state.boardTaskEditor &&
        !closeDialog(false, { confirmDirty: false })
      ) {
        el.value = state.selectedBoard;
        return;
      }
      if (state.boardSaves || state.boardConflict) {
        el.value = state.selectedBoard;
        toast("Finish saving the current canvas first.", true);
        return;
      }
      if (!(await features.drawingEnter(el.value))) el.value = state.selectedBoard;
    }
    if (el.dataset.taskField) {
      const field = el.dataset.taskField,
        id = el.dataset.id,
        t = task(id);
      let value = el.value;
      value = features.cellValue(field, value);
      if (JSON.stringify(t[field]) === JSON.stringify(value)) return;
      el.disabled = true;
      await patchTask(id, features.cellPatch(id, field, value), false);
      el.disabled = false;
      if (field === "status")
        el.innerHTML = options(
          nextStatuses(state.config, task(id).status),
          task(id).status,
          statusNames,
        );
      el.dataset.saved = "true";
      if (state.view === "table")
        document.dispatchEvent(
          new CustomEvent("table-cell-saved", { detail: field }),
        );
      toast(
        sync.entries.has(route("tasks", id))
          ? "Edit retained. Open Recovery to review pending saves."
          : "Cell saved.",
      );
    }
  } catch (error) {
    toast(error.message, true);
    if (el.id === "organisation-select")
      el.value = state.organisation?.id || "";
    if (el.dataset.taskField) {
      el.disabled = false;
      el.dataset.unsaved = "true";
      if (el.dataset.taskField === "status")
        el.value = task(el.dataset.id)?.status || el.value;
    }
  }
});
// Choosing the active sort again reverses it (select-menu.js); Manual order has no direction.
document.addEventListener("reselect", (event) => {
  if (event.target.id !== "sort" || event.target.value !== state.sort || state.sort === "order") return;
  state.sortDir *= -1;
  renderView(true);
});
document.addEventListener("dblclick", (event) => {
  const node = event.target.closest("[data-node]");
  if (node) {
    state.selectedNode = node.dataset.node;
    features.canvasEdit(state.selectedNode);
  }
});
document.addEventListener("pointerdown", (event) => {
  const canvas = event.target.closest("#canvas");
  if (!canvas || event.target.closest("button,select,input")) return;
  if (event.button !== 0 && event.button !== 1) return;
  const element = event.target.closest("[data-node]"),
    edge = event.target.closest("[data-edge]");
  if (edge && state.tool !== "hand" && !spacePressed) {
    state.selectedEdge = edge.dataset.edge;
    state.selectedNode = null;
    renderView(true);
    return;
  }
  if (element && state.tool === "connect" && !spacePressed) {
    const id = element.dataset.node;
    if (!state.connectFrom) {
      state.connectFrom = id;
      state.selectedNode = id;
      renderView(true);
    } else if (id !== state.connectFrom) {
      changeBoard((b) => {
        b.edges.push({
          id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: state.connectFrom,
          to: id,
        });
        state.connectFrom = null;
        state.tool = "cursor";
        state.selectedNode = null;
      });
    }
    return;
  }
  if (element && state.tool !== "hand" && !spacePressed && event.button === 0) {
    if (state.boardConflict) return;
    const node = board().nodes.find((n) => n.id === element.dataset.node);
    state.selectedNode = node.id;
    {
      state.selectedEdge = null;
      state.selectedEdges?.clear();
    }
    $$(".board-node").forEach((el) =>
      el.classList.toggle("selected", el.dataset.node === node.id),
    );
    dragging = {
      type: "node",
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      x: node.x,
      y: node.y,
      before: boardSnapshot(),
      moved: false,
    };
  } else {
    state.selectedNode = null;
    {
      state.selectedEdge = null;
      state.selectedEdges?.clear();
    }
    dragging = {
      type: "pan",
      startX: event.clientX,
      startY: event.clientY,
      x: state.camera.x,
      y: state.camera.y,
      moved: false,
    };
  }
  (dragging.type === "node" ? element : canvas).setPointerCapture(
    event.pointerId,
  );
  canvas.focus({ preventScroll: true });
  event.preventDefault();
});
document.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - dragging.startX,
    dy = event.clientY - dragging.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
  if (dragging.type === "pan") {
    state.camera.x = dragging.x + dx;
    state.camera.y = dragging.y + dy;
    updateCamera();
  } else {
    const n = board().nodes.find((n) => n.id === dragging.id);
    n.x = Math.round(dragging.x + dx / state.camera.z);
    n.y = Math.round(dragging.y + dy / state.camera.z);
    const el = $(`[data-node="${n.id}"]`);
    if (el) {
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
    }
    updateEdges();
  }
});
function endDrag(cancel = false) {
  if (!dragging) return;
  const moved = dragging.moved;
  if (dragging.type === "node") {
    if (cancel) Object.assign(board(), dragging.before);
    else if (dragging.moved) {
      remember(dragging.before);
      saveBoard();
    }
  }
  dragging = null;
  if (moved || cancel) renderView(true);
  else {
    $$(".board-selection").forEach((el) => el.remove());
    $("#canvas")?.insertAdjacentHTML("beforeend", selectionHTML());
    $$(".board-node").forEach((el) =>
      el.classList.toggle("selected", el.dataset.node === state.selectedNode),
    );
  }
}
document.addEventListener("pointerup", () => endDrag());
document.addEventListener("pointercancel", () => endDrag(true));
document.addEventListener(
  "wheel",
  (event) => {
    const canvas = event.target.closest("#canvas");
    if (!canvas) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = canvas.getBoundingClientRect();
      zoom(
        Math.exp(-event.deltaY * 0.007),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    } else {
      state.camera.x -= event.deltaX;
      state.camera.y -= event.deltaY;
      updateCamera();
    }
  },
  { passive: false },
);
document.addEventListener("keydown", (event) => {
  const typing = event.target.matches(
    'input,textarea,select,[contenteditable="true"]',
  );
  if (state.dialog) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      $("dialog form")?.requestSubmit();
    }
    return;
  }
  // The page behind an open sidebar takes no shortcuts.
  if (typing || state.menu) return;
  if (
    event.key === "n" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    state.project
  ) {
    event.preventDefault();
    taskDialog();
  }
  if (event.key === "/") {
    event.preventDefault();
    $("#search")?.focus();
  }
  if (["board", "drawing"].includes(state.view) && state.project) {
    if (event.code === "Space") {
      event.preventDefault();
      spacePressed = true;
      $("#canvas")?.classList.add("pan-mode");
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      $(`[data-action="board-${event.shiftKey ? "redo" : "undo"}"]`)?.click();
    }
    if (
      ["Delete", "Backspace"].includes(event.key) &&
      (state.selectedNode || state.selectedEdge)
    ) {
      event.preventDefault();
      $(
        `[data-action="${state.selectedNode ? "node" : "edge"}-delete"]`,
      )?.click();
    }
    if (event.key === "Enter" && event.target.dataset.node) {
      state.selectedNode = event.target.dataset.node;
      features.canvasEdit(state.selectedNode);
    }
    if (event.key === "Escape") {
      state.tool = "cursor";
      state.connectFrom = null;
      state.selectedNode = null;
      {
        state.selectedEdge = null;
        state.selectedEdges?.clear();
      }
      renderView(true);
    }
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
      state.selectedNode
    ) {
      event.preventDefault();
      const step = event.shiftKey ? 30 : 5;
      changeBoard((b) => {
        const node = b.nodes.find((n) => n.id === state.selectedNode);
        if (node.locked) return;
        if (event.key === "ArrowLeft") node.x -= step;
        if (event.key === "ArrowRight") node.x += step;
        if (event.key === "ArrowUp") node.y -= step;
        if (event.key === "ArrowDown") node.y += step;
      });
    }
  }
});
document.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spacePressed = false;
    if (state.tool !== "hand") $("#canvas")?.classList.remove("pan-mode");
  }
});
window.addEventListener("blur", () => {
  spacePressed = false;
  endDrag(true);
});
window.addEventListener("beforeunload", (event) => {
  if (state.dirty || state.settingsDirty || sync.entries.size) {
    event.preventDefault();
    event.returnValue = "";
  }
});
setInterval(async () => {
  if (
    pollBusy ||
    sync.entries.size ||
    state.loading ||
    state.dialog ||
    state.boardTaskEditor ||
    state.canvasEditing ||
    state.headerMenu ||
    state.selectionToolbarOpen ||
    document.querySelector("#shared-select-menu") ||
    state.kanbanDragging ||
    state.timelineSelecting ||
    state.taskReordering ||
    state.toolDragging ||
    state.cameraAnimating ||
    state.boardSaves ||
    state.boardConflict ||
    dragging ||
    document.hidden ||
    document.activeElement?.matches("input,textarea,select,[contenteditable=true]")
  )
    return;
  pollBusy = true;
  try {
    const navigation = state.navigation,
      wasOnline = state.online,
      data = await fetchWorkspace();
    if (
      navigation !== state.navigation ||
      state.loading ||
      state.dialog ||
      state.boardTaskEditor ||
      state.canvasEditing ||
      state.headerMenu ||
      state.selectionToolbarOpen ||
      document.querySelector("#shared-select-menu") ||
      state.settingsDirty ||
      state.settingsSaving ||
      document.activeElement?.closest(".documents-workspace") ||
      state.kanbanDragging ||
      state.timelineSelecting ||
      state.taskReordering ||
      state.toolDragging ||
      state.cameraAnimating ||
      state.boardSaves ||
      state.boardConflict ||
      dragging
    )
      return;
    const listChanged = JSON.stringify(data) !== state.workspaceSignature;
    applyWorkspace(data);
    if (
      state.project &&
      !state.projects.some((p) => p.id === state.project.id)
    ) {
      clearProject();
      renderApp();
      return;
    }
    if (state.project) {
      const activeId = state.project.id,
        snapshot = await api(`/projects/${activeId}`);
      if (
        navigation !== state.navigation ||
        state.loading ||
        state.project?.id !== activeId ||
        state.dialog ||
        state.canvasEditing ||
        state.headerMenu ||
        state.selectionToolbarOpen ||
        document.querySelector("#shared-select-menu") ||
        state.settingsDirty ||
        state.settingsSaving ||
        document.activeElement?.closest(".documents-workspace") ||
        state.kanbanDragging ||
        state.timelineSelecting ||
        state.taskReordering ||
        state.toolDragging ||
        state.cameraAnimating ||
        state.boardSaves ||
        state.boardConflict ||
        dragging
      )
        return;
      if (
        signature(snapshot) !== state.signature ||
        listChanged ||
        !wasOnline
      ) {
        const oldBoard = board()?.revision;
        applySnapshot(snapshot);
        if (oldBoard !== board()?.revision) {
          state.history = [];
          state.future = [];
        }
        renderApp();
      }
    } else if (listChanged || !wasOnline) renderApp();
  } catch {
    updateSaveState();
  } finally {
    pollBusy = false;
  }
}, 30000);
async function boot() {
  try {
    if (!(await features.session())) return;
    applyWorkspace(await fetchWorkspace());
    const lastProject = state.projects.find(
      (p) => p.id === storage.get("project", null),
    );
    const lastOrganisation = storage.get(
      "organisation",
      lastProject?.organisation,
    );
    const organisation =
      state.organisations.find((o) => o.id === lastOrganisation) ||
      state.organisations[0];
    const destination = navigation.initial();
    if (destination) {
      if (!(await restoreNavigation(destination))) renderApp();
    } else if (organisation) await openOrganisation(organisation.id);
    else renderApp();
    navigation.start();
  } catch (error) {
    renderApp();
    navigation.start();
    toast(error.message, true);
  }
}
features.start(boot);
boot();

watchAppVersion(version => { state.serverAppVersion = version; updateSaveState(); });
