// Every test file by importance (owner request F0.22-19), so the tests guarding the most used and
// most damaging behaviour run first. Risk-based: how often people meet the behaviour (daily, regular,
// rare; the live audit log shows card dates, times and order are the commonest changes) against what a
// failure costs (severe: lost or exposed data, a core task impossible; moderate: broken, with a
// workaround; minor: cosmetic):
//              severe  moderate  minor
//   daily        1        1        2
//   regular      1        2        3
//   rare         2        3        3
// Anything guarding saved data, recovery, access or security is tier 1 however rarely it is used.
//   1 critical: core journeys and data safety; a failure stops work or loses it.
//   2 important: regularly used features, and polish on daily surfaces.
//   3 peripheral: rare features, edge cases, cosmetic precision on rarely seen surfaces.
// A file takes the tier of what most of its tests guard. shortcut: tiers are per file, so a file mixing
// tiers runs whole in its main one; split the file to move a test. A new spec or unit test file needs a
// tier here (test/tiers.test.js checks).
// Usage: node scripts/tiers.mjs [1] [2] [3]   the tiers named, in that order (all by default), stopping
//                                             after a tier that fails; like npm run e2e, it leaves out
//                                             the Docker check, audits and (without HEAVY=1) @heavy tests
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command } from "./deploy.mjs";

export const TIERS = [
  // Tier 1: critical
  [
    "test/access-boundaries.test.js", // another person's private records stay hidden
    "test/access.test.js", // every write checked for edit access inside the lock
    "test/api.test.js", // HTTP project/task lifecycle, origin and input checks
    "test/audit-recovery.test.js", // interrupted restore and kernel lock recovery (data safety)
    "test/backend-concurrency.test.js", // saves not blocked, external edits detected
    "test/backup-upload.test.js", // large backup upload, verify, restore (data safety)
    "test/board-session.test.js", // presence invitation before board loads
    "test/calendar-create-model.test.js", // new Week board cards inherit filters and cell context
    "test/calendar-model.test.js", // move/resize calendar dates across DST
    "test/calendar-time.test.js", // hour selection and resize snapping
    "test/calendar-backlog.test.js", // places in the Week board's Unscheduled row
    "test/canvas.test.js", // board persistence, drafts, validation
    "test/capture.test.js", // iOS shortcut capture to card via token (data safety)
    "test/comment-model.test.js", // replies stay with parents (data safety)
    "test/deploy.test.js", // release keeps recorded vault (data safety)
    "test/document-autosave.test.js", // document typing persists every edit
    "test/document-boundaries.test.js", // document edit boundaries and Unicode
    "test/document-language.test.js", // inline Markdown parsing and cache
    "test/document-model.test.js", // document references and transclusion
    "test/document-performance.test.js", // incremental edits near blocks keep the parse correct
    "test/document-sheets.test.js", // table documents persist with access (data safety)
    "test/documents.test.js", // documents persist as Markdown with history
    "test/folder-tree-moves.test.js", // move docs/boards between folders atomically (data safety)
    "test/frame-limit-recovery.test.js", // draft rejected by old frame cap retries (data safety)
    "test/home.test.js", // per-person Home layout validation
    "test/shared-types.test.js", // shared data rules stay type-checked
    "test/identity.test.js", // task keys sequential, immutable, reserved
    "test/identity-ledger.test.js", // card number register read and written exactly
    "test/identity-scale.test.js", // new cards stay quick in big projects
    "test/task-create.test.js", // a new card's parent chain and repeated create requests
    "test/installation-recovery.test.js", // stopped installation recovers accounts and data (data safety)
    "test/journal.test.js", // related writes roll back together, crash recovery
    "test/kanban-model.test.js", // Kanban lanes and drop changes only destination
    "test/local-auth.test.js", // local admin only for local socket peers
    "test/model.test.js", // server validation of settings, task fields
    "test/organisations.test.js", // org init, migration preserves files
    "test/project-key.test.js", // a taken project key names its project only to people who can open it
    "test/personal-space.test.js", // personal space opens only for owner
    "test/record-index.test.js", // search index per project and deltas
    "test/release.test.js", // release versions, rollover, changelog checks
    "test/route-access.test.js", // every API route refuses people without access
    "test/save-state.test.js", // save warnings and conflict labels
    "test/search-query.test.js", // search query parsing and typo distance
    "test/search.test.js", // search ranks cards, documents, boards
    "test/store.test.js", // projects, tasks, canvases persist as Markdown
    "test/sync.test.js", // drafts recovery, validation failures retry, field order
    "test/table-paste.test.js", // table paste cannot overwrite descriptions (data safety)
    "test/task-autosave.test.js", // card edits autosave and keep revision
    "test/task-group-drop.test.js", // drop on group changes field, respects workflow
    "test/task-notes.test.js", // card notes persist in Markdown (data safety)
    "test/task-filter.test.js", // search, filters and sorts of the card lists
    "test/task-order.test.js", // manual reorder keeps hidden slots
    "test/task-visibility.test.js", // paging and filtered hierarchy
    "test/trash-audit.test.js", // deleted items wait in Trash, audit log
    "test/upgrade.test.js", // history, trash, backups restore exact content
    "test/upload-routes.test.js", // uploads limited, attachments never run
    "test/vault-roundtrip.test.js", // saves keep outside edits and frontmatter
    "test/workflow.test.js", // workflow transitions and statuses
    "e2e/board/board-bar-menus.spec.mjs", // use Board tools menu, rename, delete board
    "e2e/board/board-context-menu.spec.mjs", // copy, paste, duplicate, delete from the right-click menu
    "e2e/board/board-bottom-bar.spec.mjs", // reach menus above bottom bar on phone/iPad
    "e2e/board/board-editor.spec.mjs", // format text in board cards
    "e2e/board/board-interactions.spec.mjs", // convert note/task, connect cards
    "e2e/board/board-left-tools.spec.mjs", // use the left tool bar
    "e2e/board/board-quick-delete.spec.mjs", // delete a just-created note
    "e2e/board/board-task-panel.spec.mjs", // create and edit a card from the board
    "e2e/board/board-task-state.spec.mjs", // linked task archived/deleted shown on board
    "e2e/board/board-undo.spec.mjs", // undo on a board
    "e2e/board/canvas-browser.spec.mjs", // edit board with others, connect, comment
    "e2e/board/canvas-controls.spec.mjs", // pan, zoom, select, duplicate on board
    "e2e/board/drag-feedback.spec.mjs", // drag notes onto board, reorder Kanban cards
    "e2e/board/drawing-view.spec.mjs", // draw on board, offline drawing
    "e2e/board/in-place-editing.spec.mjs", // edit sticky/task/frame title in place
    "e2e/board/inline-autosave.spec.mjs", // edit text on board card/note
    "e2e/documents/comment-panels-markdown.spec.mjs", // write card descriptions and comments
    "e2e/documents/document-bar.spec.mjs", // rename a document and use its bar
    "e2e/documents/document-checkbox-touch.spec.mjs", // tick checklist boxes on iPhone/iPad
    "e2e/documents/document-components.spec.mjs", // edit callouts/tables/code in Live preview
    "e2e/documents/document-controls.spec.mjs", // format, Insert and Find in a document
    "e2e/documents/document-folder-drag.spec.mjs", // organise documents in folders by drag (data safety)
    "e2e/documents/document-list.spec.mjs", // reach the document list
    "e2e/documents/document-markdown.spec.mjs", // edit a document without file rewrite
    "e2e/documents/document-slash-menu.spec.mjs", // insert elements with /
    "e2e/documents/document-tabs-topbar.spec.mjs", // switch between open documents
    "e2e/documents/document-tools.spec.mjs", // use Document tools menu and view modes
    "e2e/documents/list-panel.spec.mjs", // open the document and board list panel
    "e2e/documents/personal-space.spec.mjs", // use Today note in personal space
    "e2e/documents/project-documents.spec.mjs", // open, edit, save, delete documents
    "e2e/documents/rich-toolbar.spec.mjs", // format text in descriptions, comments, documents
    "e2e/documents/save-warning.spec.mjs", // see and recover from a refused save
    "e2e/documents/table-documents.spec.mjs", // edit and calculate a spreadsheet
    "e2e/home/home-bar.spec.mjs", // use the project bar on Home
    "e2e/home/home.spec.mjs", // open Home, edit panel layout
    "e2e/lists/field-order.spec.mjs", // read task fields in consistent order
    "e2e/lists/ipad-top-bar-tools.spec.mjs", // use search/filters/sort on iPad
    "e2e/lists/kanban-cards.spec.mjs", // view Kanban cards and add a card
    "e2e/lists/live-redraw.spec.mjs", // see others' changes without losing your place
    "e2e/lists/table-parent-options.spec.mjs", // choose a parent in Table
    "e2e/lists/kanban-drag-steady.spec.mjs", // drag a Kanban card between columns
    "e2e/lists/kanban-inline-fields.spec.mjs", // edit card fields in Kanban
    "e2e/lists/kanban-touch-drag.spec.mjs", // drag a Kanban card by touch on phone/iPad
    "e2e/lists/kanban-viewport.spec.mjs", // use Kanban full window, drag saves status
    "e2e/lists/phone-row-fields.spec.mjs", // change status/assignee/priority from a phone row
    "e2e/lists/quiet-cell-saves.spec.mjs", // edit a Table cell; save fails or is pending
    "e2e/lists/source-local-fields.spec.mjs", // edit imported source card fields locally (data safety)
    "e2e/lists/task-reorder.spec.mjs", // reorder cards by drag or Alt+Arrow in List/Tree/Table
    "e2e/lists/task-row-editor.spec.mjs", // edit task title/fields in List and Tree rows
    "e2e/navigation/background-refresh.spec.mjs", // see other people's edits without losing focus
    "e2e/navigation/edge-swipe.spec.mjs", // open sidebar by swiping on phone
    "e2e/navigation/keyboard-shortcuts.spec.mjs", // press Ctrl+K from a menu button
    "e2e/navigation/mobile-focus.spec.mjs", // open cards/documents on phone without keyboard popping up
    "e2e/navigation/mobile-layout.spec.mjs", // use phone drawer, tab bar and task rows
    "e2e/navigation/navigation.spec.mjs", // Back/Forward, reload and deep links across views
    "e2e/navigation/phone-drawer.spec.mjs", // open sidebar drawer, switch project on phone
    "e2e/navigation/phone-search.spec.mjs", // search on phone with keyboard open
    "e2e/navigation/phone-tabbar.spec.mjs", // switch views from the phone bottom bar
    "e2e/navigation/project-layout.spec.mjs", // switch Tasks and Planning layouts, filters and selection
    "e2e/navigation/search.spec.mjs", // find cards, documents and boards
    "e2e/planning/calendar-cross-day-resize.spec.mjs", // resize a calendar card across days
    "e2e/planning/week-board-create-filters.spec.mjs", // filtered creation persists field defaults
    "e2e/planning/week-board-create.spec.mjs", // inline creation saves date and row defaults
    "e2e/planning/calendar-hours.spec.mjs", // create a timed card by dragging hours
    "e2e/planning/calendar-move.spec.mjs", // move a timed card on the calendar
    "e2e/planning/calendar-resize.spec.mjs", // resize timed card endpoints
    "e2e/planning/calendar-scheduling.spec.mjs", // move, resize and schedule cards in Month
    "e2e/planning/week-board-arrange.spec.mjs", // arrange dock cards without altering dates or fields
    "e2e/planning/calendar-workspace.spec.mjs", // use calendar viewport and drop unscheduled cards
    "e2e/platform/tls.spec.mjs", // serve over HTTPS (data safety)
    "e2e/platform/upgrade-browser.spec.mjs", // edit table rows, paste, recover drafts
    "e2e/settings/local-sign-in.spec.mjs", // open the app as local admin without login
    "e2e/settings/project-settings.spec.mjs", // edit project settings with conflict protection
    "e2e/settings/review-visibility.spec.mjs", // see every task in large projects and live changes
    "e2e/settings/settings-autosave.spec.mjs", // change settings and leave the page
    "e2e/settings/trash-audit.spec.mjs", // restore a deleted item, read audit log
    "e2e/settings/workspace-journey.spec.mjs", // new card, Table, Kanban, Tree, canvas end to end
    "e2e/tasks/create-another.spec.mjs", // create cards, failed create, Create another
    "e2e/tasks/task-all-day.spec.mjs", // toggle All day on a card
    "e2e/tasks/compact-dates.spec.mjs", // set a card's dates and times on one compact line
    "e2e/tasks/task-autosave.spec.mjs", // edit a card and let it autosave
    "e2e/tasks/task-editor-page.spec.mjs", // open card editor on phone/iPad/desktop
    "e2e/tasks/task-editor-touch.spec.mjs", // edit a card on phone/iPad
    "e2e/tasks/task-editor.spec.mjs", // open card editor and edit metadata and description
    "e2e/ui/accessibility.spec.mjs", // use any view with assistive tech
    "e2e/ui/critique-fixes.spec.mjs", // confirmed usability fixes
    "e2e/ui/layout-sweep.spec.mjs", // use every view on every device
    "e2e/ui/pencils-tasks.spec.mjs", // owner-reported mobile and workflow issues
    "e2e/ui/select-menu.spec.mjs", // choose values from any select
    "e2e/ui/ui-audit-fixes.spec.mjs", // keyboard and focus fixes
    "e2e/ui/ui-controls.spec.mjs", // use controls and dropdowns
  ],
  // Tier 2: important
  [
    "test/affected.test.js", // release picks the right browser tests
    "test/alignment-guides.test.js", // board snap guides while dragging
    "test/assignee-name.test.js", // assignee display name fallback
    "test/bar.test.js", // per-person bottom bar buttons
    "test/board-background.test.js", // board dots fade at small spacing
    "test/board-card-fields.test.js", // board card detail fields validated
    "test/board-folders.test.js", // board folders nest and validate
    "test/board-task-state.test.js", // board card availability (archived, deleted)
    "test/board-upgrades.test.js", // merged cells, connector bends survive
    "test/bookmarks.test.js", // per-person bookmarks show current names
    "test/card-fields.test.js", // turn off built-in card fields
    "test/card-key.test.js", // card ID shortening to number
    "test/document-comments.test.js", // comment anchors survive edits
    "test/document-embeds.test.js", // embed paths and ranges
    "test/document-properties.test.js", // document property types
    "test/document-sheet-axes.test.js", // sheet row/column moves keep data
    "test/document-sheet-engine.test.js", // formula calculation
    "test/document-sheet-model.test.js", // sheet and CSV model validation
    "test/document-table-format.test.js", // table Markdown serialisation
    "test/document-table-model.test.js", // table row/column edits
    "test/drawing-worker.test.js", // offline drawing page has every module it needs
    "test/folder-order.test.js", // folder and item ordering
    "test/frame-model.test.js", // frame selection and nesting
    "test/hierarchy.test.js", // card types and subtask validation
    "test/image-retention.test.js", // keeps three Docker images after release
    "test/node-layout.test.js", // board object resize limits
    "test/popup-motion.test.js", // popup exit motion
    "test/project-filters.test.js", // assignee and tag filters
    "test/project-frame.test.js", // nested card placement in project frames
    "test/project-people.test.js", // project people lists and teams
    "test/auto-assign.test.js", // new cards take the project's auto-assignee
    "test/project-tags.test.js", // project tag list ordering
    "test/query-model.test.js", // saved query groups, malformed fail closed
    "test/release-snapshot.test.js", // release snapshot holds right files
    "test/settings-combinations.test.js", // card field off combinations stay consistent
    "test/table-model.test.js", // Table groups, filters, sorting
    "test/task-group-order.test.js", // group order and tag groups
    "test/task-relationships.test.js", // relationships both directions
    "test/slide-moves.test.js", // cards and lanes slide to their new places in a Kanban drag
    "test/timeline-dates.test.js", // Timeline ranges and weekdays
    "test/uuid.test.js", // UUID generation fallback
    "test/viewport-cache.test.js", // zoom detail caching
    "e2e/board/advanced-board-tools.spec.mjs", // bulk notes, crop image, lasso
    "e2e/board/arrow-selection.spec.mjs", // select and edit connectors
    "e2e/board/bitmap-interactions.spec.mjs", // drag objects on zoomed-out board
    "e2e/board/board-card-pickers.spec.mjs", // edit card dates on board
    "e2e/board/board-card-scrolling.spec.mjs", // scroll a long card description
    "e2e/board/board-chrome.spec.mjs", // use board chrome on desktop/phone
    "e2e/board/board-comments-navigation.spec.mjs", // press Back with comments open
    "e2e/board/board-comments.spec.mjs", // comment on board objects
    "e2e/board/board-grid.spec.mjs", // edit grids on board
    "e2e/board/board-images.spec.mjs", // add images to board
    "e2e/board/board-layout.spec.mjs", // open board menus and layout
    "e2e/board/board-list.spec.mjs", // browse and create boards
    "e2e/board/board-popovers.spec.mjs", // change board settings, open comments
    "e2e/board/board-search.spec.mjs", // search within a board
    "e2e/board/board-task-drag.spec.mjs", // drag a project task onto board
    "e2e/board/board-task-panel-fit.spec.mjs", // the board's card panel and its History and Details fit on phones and in both themes (split by tier)
    "e2e/board/board-topbar.spec.mjs", // use board actions in the header
    "e2e/board/board-touch-selection.spec.mjs", // select objects by touch on iPad/phone
    "e2e/board/board-zoom-transition.spec.mjs", // zoom a large board
    "e2e/board/component-upgrades.spec.mjs", // use board components
    "e2e/board/connect-tool.spec.mjs", // connect two cards
    "e2e/board/connector-toolbar.spec.mjs", // style a connector
    "e2e/board/frames.spec.mjs", // use frames on board
    "e2e/board/grid-upgrade.spec.mjs", // select and reorder grid cells
    "e2e/board/ipad-board-zoom.spec.mjs", // pinch-zoom board on iPad
    "e2e/board/pen-tool.spec.mjs", // draw with the pen
    "e2e/board/pinch-guard.spec.mjs", // pinch with a dialog open on iPad
    "e2e/board/selection-toolbar.spec.mjs", // colour, lock, arrange selected objects
    "e2e/documents/document-block-keys.spec.mjs", // type inside code blocks and table cells
    "e2e/documents/document-card-mentions.spec.mjs", // link cards from documents
    "e2e/documents/document-comments.spec.mjs", // comment on document text
    "e2e/documents/document-components-important.spec.mjs", // document components pass the accessibility sweep (split by tier)
    "e2e/documents/document-embeds.spec.mjs", // embed documents and spreadsheet ranges
    "e2e/documents/document-focus.spec.mjs", // write in Focus mode
    "e2e/documents/document-properties.spec.mjs", // edit properties and tags of a document
    "e2e/documents/document-row-menu.spec.mjs", // rename, move, delete a document from the list
    "e2e/documents/document-split.spec.mjs", // open two documents side by side
    "e2e/documents/document-tables.spec.mjs", // edit Markdown tables in Live preview
    "e2e/documents/document-task-queries.spec.mjs", // list and tick cards inside a document
    "e2e/documents/document-templates.spec.mjs", // start a document from a template
    "e2e/documents/document-workspace.spec.mjs", // outline, folders, page versions
    "e2e/documents/editable-controls-keyboard.spec.mjs", // use document controls on touch without keyboard
    "e2e/documents/explorer-arrange.spec.mjs", // reorder documents and boards in the list
    "e2e/documents/inline-table-editor.spec.mjs", // compact inline table controls, merges, drag
    "e2e/documents/table-editing.spec.mjs", // edit spreadsheet cells, formulas, sort
    "e2e/documents/table-structure.spec.mjs", // rename/hide/drag rows and columns
    "e2e/home/home-panels.spec.mjs", // see Home panels
    "e2e/home/home-overview.spec.mjs", // Home loads every project's cards once
    "e2e/home/home-toolbar.spec.mjs", // edit Home layout
    "e2e/lists/active-filters.spec.mjs", // see and remove active filters in List/Calendar
    "e2e/lists/assignee-label.spec.mjs", // read assignee short name in a row
    "e2e/lists/assignee-names.spec.mjs", // assignee names in field boxes
    "e2e/lists/card-key-number.spec.mjs", // read card IDs on narrow rows
    "e2e/lists/field-box-background.spec.mjs", // view List/Tree field box
    "e2e/lists/field-box.spec.mjs", // see assignee/status/priority box in rows
    "e2e/lists/field-chips.spec.mjs", // view field chips in rows and relationships
    "e2e/lists/filters-sort-controls.spec.mjs", // open Filters and Sort, drag Kanban card
    "e2e/lists/group-by-tag.spec.mjs", // group cards by tag and move between tag groups
    "e2e/lists/group-drag.spec.mjs", // drag a card between List groups
    "e2e/lists/kanban-swimlanes.spec.mjs", // use Kanban swimlanes and drag across lanes
    "e2e/lists/list-row-card-chrome.spec.mjs", // view List rows and card chrome
    "e2e/lists/project-filter-controls.spec.mjs", // filter by assignee, tag, priority
    "e2e/lists/row-box-width.spec.mjs", // view row field box widths on iPad
    "e2e/lists/table-bulk.spec.mjs", // bulk edit selected Table rows
    "e2e/lists/table-cell-controls.spec.mjs", // edit Table cells
    "e2e/lists/table-tools-filters.spec.mjs", // group and filter Table
    "e2e/lists/table-tools.spec.mjs", // sort and hide Table columns
    "e2e/lists/task-reorder-motion.spec.mjs", // drag List rows
    "e2e/lists/tree-viewport.spec.mjs", // scroll Tree
    "e2e/navigation/bookmarks.spec.mjs", // bookmark a card/view and find it in search
    "e2e/navigation/bottom-bar.spec.mjs", // scroll to the end of a view on phone
    "e2e/navigation/under-bar.spec.mjs", // every view and page runs under the bottom bar and scrolls clear of it
    "e2e/navigation/install-app.spec.mjs", // install Pencils as an app from the tab bar
    "e2e/navigation/compact-navigation.spec.mjs", // use header navigation at all widths
    "e2e/navigation/desktop-tray.spec.mjs", // switch Tasks/Planning layouts on desktop
    "e2e/navigation/mobile-workspaces.spec.mjs", // use Table/Calendar/Timeline/Board on phone
    "e2e/navigation/sidebar-overlay.spec.mjs", // open sidebar over content
    "e2e/navigation/splash.spec.mjs", // start the app and see splash
    "e2e/navigation/topbar-title.spec.mjs", // read top bar title per page
    "e2e/planning/agenda-inline-fields.spec.mjs", // edit fields in Agenda rows
    "e2e/planning/calendar-toolbar.spec.mjs", // use calendar toolbar
    "e2e/planning/calendar-week.spec.mjs", // use Week layout
    "e2e/planning/project-people-assignees.spec.mjs", // add people and teams, make them assignable (split by tier)
    "e2e/settings/auto-assign.spec.mjs", // choose who new cards are auto-assigned to
    "e2e/settings/type-looks.spec.mjs", // choose each card type's icon and colour
    "e2e/settings/new-card-form.spec.mjs", // choose what the New card form shows
    "e2e/planning/timeline-date-editor.spec.mjs", // set dates from Timeline
    "e2e/planning/timeline-selection.spec.mjs", // schedule a row on Timeline by two clicks
    "e2e/planning/timeline-viewport.spec.mjs", // use Timeline
    "e2e/planning/week-board.spec.mjs", // use Week board
    "e2e/planning/week-board-order.spec.mjs", // order cards in a Week board cell
    "e2e/planning/week-board-row-order.spec.mjs", // order Week board rows
    "e2e/planning/week-board-daypart.spec.mjs", // group the Week board by time of day
    "e2e/planning/week-board-row-toggle.spec.mjs", // choose Week board rows with Group by
    "e2e/planning/week-board-empty-box.spec.mjs", // no empty field box on Week board cards
    "e2e/planning/week-board-backlog.spec.mjs", // arrange the Week board's Unscheduled row
    "e2e/planning/week-board-narrow.spec.mjs", // Week board on a narrow window
    "e2e/planning/week-board-snap.spec.mjs", // Week board settles on a day and a row
    "e2e/planning/week-board-dock.spec.mjs", // hide the Week board's Unscheduled dock; it tucks away while dragging
    "e2e/planning/calendar-today.spec.mjs", // today underlined in the Calendar
    "e2e/platform/audit-loading.spec.mjs", // open task views and document history
    "e2e/platform/backend-capacity.spec.mjs", // 100 members using the server at once
    "e2e/platform/canvas-large-board.spec.mjs", // import, edit, undo and keep an offline draft on a huge board
    "e2e/platform/offline.spec.mjs", // run the Docker image with no network
    "e2e/platform/performance.spec.mjs", // open a project of 3,001 task files
    "e2e/settings/people-teams-home.spec.mjs", // manage people and teams in Settings
    "e2e/settings/personal-browser.spec.mjs", // choose theme, fonts, collapse sidebar
    "e2e/settings/project-frame-lan.spec.mjs", // update project frame on iPad over LAN
    "e2e/settings/project-frame.spec.mjs", // draw a project frame and update the plan
    "e2e/settings/project-identities.spec.mjs", // rename project key and renumber task IDs
    "e2e/settings/project-tags.spec.mjs", // rename, recolour and delete tags
    "e2e/settings/review-workflows.spec.mjs", // connect board cards, detach, run automation
    "e2e/settings/settings-back.spec.mjs", // go back from Settings
    "e2e/settings/settings-page.spec.mjs", // open and navigate the Settings page
    "e2e/settings/workflow.spec.mjs", // edit statuses and transitions
    "e2e/tasks/card-header-fields.spec.mjs", // view card editor header
    "e2e/tasks/card-panel-outside.spec.mjs", // close the card panel with a press outside it
    "e2e/tasks/card-section-tabs.spec.mjs", // switch the card's Attachments, Notes, Relationships, Documents and Boards tabs
    "e2e/tasks/card-tags.spec.mjs", // add and create tags on a card
    "e2e/tasks/draft-tasks.spec.mjs", // use draft cards on a board
    "e2e/tasks/editor-compact-controls.spec.mjs", // use date popover and writing areas
    "e2e/tasks/new-card-head.spec.mjs", // open new card popup
    "e2e/tasks/relationship-fields.spec.mjs", // edit fields in relationship rows
    "e2e/tasks/task-attachments.spec.mjs", // attach files to a card
    "e2e/tasks/task-attachment-paste.spec.mjs", // paste or drag images onto a card or note
    "e2e/tasks/task-attachment-remove.spec.mjs", // remove an attachment from a card or note
    "e2e/tasks/task-card-comments-history.spec.mjs", // comment on a card and view history
    "e2e/tasks/task-colors.spec.mjs", // see field colours on cards
    "e2e/tasks/task-creation-tools.spec.mjs", // create cards with subtasks and set dates
    "e2e/tasks/task-editor-adapt.spec.mjs", // open card editor at narrow widths
    "e2e/tasks/date-range-picker.spec.mjs", // one calendar sets start and due dates
    "e2e/tasks/task-pane-info.spec.mjs", // dock comments/history panes
    "e2e/tasks/task-relationships.spec.mjs", // add and remove parent/child/blocks links
    "e2e/tasks/task-children.spec.mjs", // create a new child card from a card
    "e2e/ui/button-sweep.spec.mjs", // click through screens and buttons
    "e2e/ui/control-sizing.spec.mjs", // tap and click controls
    "e2e/ui/no-overscroll.spec.mjs", // no view scrolls past its edges on iPad and phones
    "e2e/ui/no-overscroll-spaces.spec.mjs", // no dialog, panel or settings page scrolls past its edges or sideways
    "e2e/ui/font-scale.spec.mjs", // read card popup and Table
    "e2e/ui/layout-priorities.spec.mjs", // view layout of navigation vs context
    "e2e/ui/ui-controls-polish.spec.mjs", // focus rings, states, icons, sliders, toasts and empty states look right (split by tier)
    "e2e/ui/view-options.spec.mjs", // use phone View options
  ],
  // Tier 3: peripheral
  [
    "test/agenda-range.test.js", // Agenda quick ranges and paging
    "test/date-range.test.js", // start/due picks in the shared calendar
    "test/automations.test.js", // automation previews and rules
    "test/board-scale.test.js", // 10,000-object board validation and marquee
    "test/browser-coverage.test.js", // coverage report maths
    "test/camera-motion.test.js", // board zoom easing
    "test/capacity-hours.test.js", // capacity hours spread over days
    "test/color-model.test.js", // colour picker conversions
    "test/connector-drag.test.js", // connector port snapping
    "test/dependency-style.test.js", // board dependency line styles persist
    "test/diagnostics.test.js", // Debug shows failed requests
    "test/document-list-callouts.test.js", // list callout toggling
    "test/document-mentions.test.js", // mention matching rules
    "test/document-pane-picker.test.js", // pane picker choices ordering
    "test/document-sheet-assets.test.js", // spreadsheet engine served from build
    "test/document-sheet-richtext.test.js", // rich cell formatting
    "test/document-table-window.test.js", // large table windowing and find
    "test/document-tables.test.js", // pasted tab-separated text to table
    "test/document-task-query.test.js", // task query blocks in documents
    "test/document-templates.test.js", // template tokens and variables
    "test/document-text-color.test.js", // text colour normalisation
    "test/document-web-links.test.js", // URL opening and punctuation
    "test/drawing-gestures.test.js", // pen gesture preferences
    "test/edge-labels.test.js", // relationship arrow labels
    "test/grid-containment.test.js", // grid cell containment on boards
    "test/grid-model.test.js", // grid edits and paste
    "test/hotkey-model.test.js", // hotkey rules
    "test/hotkeys.test.js", // hotkeys private, conflict-free
    "test/ink-smoothing.test.js", // pen smoothing
    "test/miro-import.test.js", // Miro import conversion
    "test/mutants.test.js", // mutation tool self-tests
    "test/orthogonal-route.test.js", // elbow arrow routing
    "test/pen-model.test.js", // ink thickness and pressure
    "test/priority-colors.test.js", // project priority colours validated
    "test/type-styles.test.js", // card type icons and colours validated
    "test/roadmap.test.js", // Roadmap times and durations
    "test/schedule-model.test.js", // schedule proposals cascade
    "test/search-items.test.js", // Search bookmark and command order
    "test/selection-arrange.test.js", // align and distribute selection
    "test/sketch.test.js", // sketch saved as strokes and SVG
    "test/source-model.test.js", // data source ownership and mapping
    "test/source-readers.test.js", // source merge, Excel import
    "test/sources.test.js", // source sync and Obsidian publication
    "test/task-board-links.test.js", // card board link lists
    "test/task-boards.test.js", // card board links persist
    "test/task-types.test.js", // Activity type migration
    "test/teams-capacity.test.js", // team members, short names
    "test/overscroll.test.js", // every scrolling rule stops at its edges (no rubber band)
    "test/themes.test.js", // theme colour tokens readable
    "test/tiers.test.js", // every test file has one tier
    "test/ui-audit-model.test.js", // contrast and static asset caching
    "e2e/board/alignment-guides.spec.mjs", // align objects while dragging
    "e2e/board/board-background.spec.mjs", // set board background
    "e2e/board/board-capacity-gauge.spec.mjs", // check board object limit
    "e2e/board/board-card-polish.spec.mjs", // read cards and relationship arrows
    "e2e/board/board-detail-motion.spec.mjs", // zoom and see detail fade
    "e2e/board/board-rail.spec.mjs", // see the tool rail
    "e2e/board/board-settings.spec.mjs", // change board appearance
    "e2e/board/board-sweep-fixes.spec.mjs", // use board tools after UI sweep
    "e2e/board/board-task-state-fit.spec.mjs", // placeholder cards fit their text (split by tier)
    "e2e/board/board-zoom-appearance.spec.mjs", // use zoom menu and Board appearance
    "e2e/board/bullet-shortcuts.spec.mjs", // type lists in board text
    "e2e/board/card-display.spec.mjs", // choose card details shown
    "e2e/board/card-labels.spec.mjs", // see blocked cards
    "e2e/board/card-toggle.spec.mjs", // expand a card description
    "e2e/board/component-upgrades-rare.spec.mjs", // export a board to PDF; session timer and votes (split by tier)
    "e2e/board/connector-zoom.spec.mjs", // zoom with arrow labels
    "e2e/board/drawing-gestures.spec.mjs", // draw with Apple Pencil
    "e2e/board/drawing-view-fit.spec.mjs", // the drawing gallery and offline names fit (split by tier)
    "e2e/board/frame-capacity.spec.mjs", // open board with thousands of frames
    "e2e/board/frame-scale.spec.mjs", // paste 5,000 frames
    "e2e/board/frame-title-steady.spec.mjs", // collapse a frame
    "e2e/board/grid-drag.spec.mjs", // drag a grid onto board
    "e2e/board/grid-text-formatting.spec.mjs", // format grid text
    "e2e/board/grid-zoom-type.spec.mjs", // zoom a board with a grid
    "e2e/board/live-task-saved-view.spec.mjs", // open a legacy Live task view
    "e2e/board/live-typography.spec.mjs", // style board text
    "e2e/board/note-styles.spec.mjs", // pick a note shape
    "e2e/board/pen-bar.spec.mjs", // use the pen bar
    "e2e/board/selection-filter.spec.mjs", // narrow Select all by type
    "e2e/board/selection-rows.spec.mjs", // use selection toolbar on phones
    "e2e/board/text-alignment.spec.mjs", // align text in objects
    "e2e/documents/document-code-blocks.spec.mjs", // code blocks with syntax colours
    "e2e/documents/document-folding.spec.mjs", // fold headings
    "e2e/documents/document-list-callouts.spec.mjs", // list callouts as in Obsidian plugin
    "e2e/documents/document-menus.spec.mjs", // open Document tools and Insert menus
    "e2e/documents/document-pane-picker.spec.mjs", // choose a file in a split pane
    "e2e/documents/document-performance.spec.mjs", // large documents stay responsive
    "e2e/documents/document-phone-margins.spec.mjs", // read documents on a phone
    "e2e/documents/document-reading-search.spec.mjs", // search in Reading mode
    "e2e/documents/document-selection.spec.mjs", // select and colour text
    "e2e/documents/document-sketch.spec.mjs", // draw a sketch in a document
    "e2e/documents/document-tab-rename.spec.mjs", // rename a tab by double-click
    "e2e/documents/document-table-layout.spec.mjs", // table fit width vs scroll
    "e2e/documents/document-table-split.spec.mjs", // table and Markdown side by side
    "e2e/documents/document-unlinked-mentions.spec.mjs", // find unlinked mentions and backlinks
    "e2e/documents/document-web-links.spec.mjs", // Ctrl-click links in documents
    "e2e/documents/document-width.spec.mjs", // switch page/full width
    "e2e/documents/document-word-count.spec.mjs", // see word count
    "e2e/documents/miro-import.spec.mjs", // import a Miro board
    "e2e/documents/phone-document-title.spec.mjs", // see document title on a phone
    "e2e/documents/reading-layout.spec.mjs", // Reading mode layout
    "e2e/documents/table-capacity.spec.mjs", // open a 1,000-row worksheet
    "e2e/documents/table-layout.spec.mjs", // spreadsheet compact layout
    "e2e/documents/table-production.spec.mjs", // spreadsheet engine in production build
    "e2e/documents/table-richtext.spec.mjs", // rich text and merge in spreadsheet cells
    "e2e/documents/table-views.spec.mjs", // spreadsheet Live/Source/Reading views
    "e2e/home/home-web.spec.mjs", // Web page panel
    "e2e/lists/card-id-dark.spec.mjs", // view card ID in dark theme
    "e2e/lists/group-order.spec.mjs", // reverse or reorder List groups
    "e2e/lists/kanban-columns.spec.mjs", // scroll Kanban columns snapping
    "e2e/lists/kanban-first-cards.spec.mjs", // open Kanban on a phone
    "e2e/lists/sort-beside-filters.spec.mjs", // find Sort next to Filters
    "e2e/lists/sort-direction.spec.mjs", // reverse sort by choosing it again
    "e2e/lists/sort-options.spec.mjs", // open Sort menu
    "e2e/lists/table-axis-scroll.spec.mjs", // scroll Table on touch
    "e2e/lists/table-benchmark.spec.mjs", // none (query model scale)
    "e2e/lists/table-bulk-layout.spec.mjs", // open Bulk edit
    "e2e/lists/table-column-drag.spec.mjs", // reorder Table columns
    "e2e/lists/table-description.spec.mjs", // view/edit Table description column
    "e2e/lists/table-narrow-columns.spec.mjs", // view Table default column widths
    "e2e/lists/table-viewport.spec.mjs", // scroll Table
    "e2e/lists/tree-cycle.spec.mjs", // expand/collapse all in Tree
    "e2e/lists/tree-flat.spec.mjs", // view Tree without subtasks
    "e2e/lists/tree-toggle.spec.mjs", // toggle Tree row
    "e2e/lists/view-options-phone.spec.mjs", // open View options on phone
    "e2e/navigation/bottom-bar-buttons.spec.mjs", // add own buttons to the phone bottom bar
    "e2e/navigation/desktop-tray-motion.spec.mjs", // open the layout tray on desktop
    "e2e/navigation/help.spec.mjs", // read Help articles and search them
    "e2e/navigation/help-lazy.spec.mjs", // Help loads when first opened
    "e2e/navigation/help-lazy-production.spec.mjs", // the built app opens Help
    "e2e/navigation/loading-bar.spec.mjs", // switch project and watch loading bar
    "e2e/navigation/roadmap.spec.mjs", // open the in-app Roadmap
    "e2e/navigation/search-items.spec.mjs", // reorder or remove Search bookmarks/commands
    "e2e/navigation/submenu-centre.spec.mjs", // open Tasks/Planning submenu
    "e2e/planning/agenda-range.spec.mjs", // change Agenda range
    "e2e/planning/calendar-month-scroll.spec.mjs", // scroll Month layout
    "e2e/planning/calendar-zoom.spec.mjs", // zoom hourly calendar
    "e2e/planning/overview-deadlines.spec.mjs", // view Overview deadlines
    "e2e/planning/teams-capacity.spec.mjs", // set teams and view Capacity
    "e2e/planning/timeline-bar-handles.spec.mjs", // resize Timeline bars and draw arrows
    "e2e/planning/timeline-card-list.spec.mjs", // toggle Timeline card list
    "e2e/planning/timeline-layers.spec.mjs", // scroll Timeline sideways
    "e2e/planning/timeline-toolbar.spec.mjs", // use Timeline range menu
    "e2e/planning/timeline-unplanned-label.spec.mjs", // scroll Timeline sideways
    "e2e/planning/timeline-weekends.spec.mjs", // hide Timeline weekends
    "e2e/platform/canvas-capacity.spec.mjs", // load a 100,000-object board
    "e2e/platform/canvas-performance.spec.mjs", // pan and load a 5,000-object board
    "e2e/platform/large-board-paste.spec.mjs", // paste thousands of items
    "e2e/settings/capture.spec.mjs", // create an iPhone Shortcut capture token
    "e2e/settings/card-fields.spec.mjs", // turn off card fields in a project
    "e2e/settings/debug-page.spec.mjs", // read Settings Debug
    "e2e/settings/density.spec.mjs", // settings rows compact layout
    "e2e/settings/hotkeys.spec.mjs", // set a personal shortcut
    "e2e/settings/project-create.spec.mjs", // create a new project via dialog
    "e2e/settings/project-sources.spec.mjs", // set up and sync an Obsidian data source
    "e2e/settings/project-views.spec.mjs", // turn views off in Settings
    "e2e/settings/settings-combinations.spec.mjs", // open views with fields/views turned off
    "e2e/settings/settings-layout.spec.mjs", // settings controls alignment
    "e2e/settings/settings-scroll.spec.mjs", // scroll Settings rail and page
    "e2e/settings/settings-you.spec.mjs", // view Settings You layout
    "e2e/settings/style-settings.spec.mjs", // change Style tokens
    "e2e/settings/themes.spec.mjs", // pick a theme
    "e2e/tasks/card-back.spec.mjs", // navigate to a related card and back
    "e2e/tasks/card-board.spec.mjs", // open a card's board
    "e2e/tasks/description-resize.spec.mjs", // resize card description
    "e2e/tasks/task-boards.spec.mjs", // link a card to a board
    "e2e/tasks/task-dependencies.spec.mjs", // set dependencies via board arrows
    "e2e/tasks/task-field-alignment.spec.mjs", // new card with optional fields off
    "e2e/tasks/task-notes.spec.mjs", // add notes to a card
    "e2e/tasks/untouched-draft.spec.mjs", // close an untouched new card
    "e2e/ui/card-ids.spec.mjs", // show or hide card IDs
    "e2e/ui/card-wording.spec.mjs", // read labels
    "e2e/ui/color-picker.spec.mjs", // choose a colour
    "e2e/ui/cut-off-titles.spec.mjs", // read long titles
    "e2e/ui/done-cards.spec.mjs", // tell done cards apart
    "e2e/ui/drag-ghost.spec.mjs", // drag items in views
    "e2e/ui/field-box-fit.spec.mjs", // view field boxes
    "e2e/ui/field-box-minimum.spec.mjs", // view long dates in field box
    "e2e/ui/field-dividers.spec.mjs", // view field dividers
    "e2e/ui/field-group-text.spec.mjs", // view field text sizes
    "e2e/ui/menu-motion.spec.mjs", // open dropdowns
    "e2e/ui/one-home.spec.mjs", // find each action in one place
    "e2e/ui/popup-motion.spec.mjs", // open card editor and date popups
    "e2e/ui/recovery-copy.spec.mjs", // read backup action names
    "e2e/ui/toolbar-scroll.spec.mjs", // scroll overflowing toolbars
    "e2e/ui/type-scale.spec.mjs", // read headings and menus
    "e2e/ui/ui-assessment.spec.mjs", // UI assessment findings
    "e2e/ui/visual-rules.spec.mjs", // edit workflow diagram
  ],
];

const NAMES = ["critical", "important", "peripheral"];

// The chosen tiers ("1"–"3", all by default) in the order asked, each split into unit test files and
// browser specs.
export function steps(chosen, tiers = TIERS) {
  const numbers = chosen.length ? chosen.map(Number) : tiers.map((_, i) => i + 1);
  const wrong = chosen.find((n) => ![1, 2, 3].includes(Number(n)));
  if (wrong !== undefined) throw new Error(`Choose tier 1, 2 or 3, not ${wrong}.`);
  return numbers.map((tier) => ({ tier, unit: tiers[tier - 1].filter((f) => f.startsWith("test/")), e2e: tiers[tier - 1].filter((f) => f.startsWith("e2e/")) }));
}

// Runs each tier's unit tests, then its browser tests in Chromium (IOS=1 adds WebKit's phone and
// iPad runs, HEAVY=1 the scale tests), and stops after the first tier that fails. As in npm run e2e,
// the Docker check and the audits stay out; they keep a tier for when they run on their own.
const LEFT_OUT = "the Docker check (offline.spec.mjs: npx playwright test --project=docker), audits (@audit: --project=audit)";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = (cmd, args) => command(cmd, args, { log: process.stdout, env: process.env, timeout: 90 * 60 * 1000 });
  const projects = ["--project=chromium", ...(process.env.IOS === "1" ? ["--project=ios"] : [])];
  console.log(`[tiers] Not run here: ${LEFT_OUT}${process.env.HEAVY === "1" ? "" : " and the @heavy scale tests (HEAVY=1 adds them)"}.`);
  try {
    const plan = steps(process.argv.slice(2));
    await run("npm", ["run", "build:server"]);
    for (const { tier, unit, e2e } of plan) {
      const started = Date.now(), took = () => `${Math.round((Date.now() - started) / 1000)}s`;
      console.log(`\n[tiers] Tier ${tier} (${NAMES[tier - 1]}): ${unit.length} unit test files, ${e2e.length} browser spec files`);
      try {
        if (unit.length) await run("node", ["--test", ...unit]);
        if (e2e.length) await run("npx", ["playwright", "test", ...projects, ...e2e]);
      } catch {
        console.error(`[tiers] Tier ${tier} failed after ${took()}; the tiers after it did not run.`);
        process.exitCode = 1;
        break;
      }
      console.log(`[tiers] Tier ${tier} passed in ${took()}.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
