# Changelog

User-facing additions, changes and fixes, newest first. Dates use Europe/London and `YYYY-MM-DD`.

## Unreleased

## 0.14.0 — 2026-10-14

### Added

- Project settings now has a status editor with names, ordering, a default starting status and completed statuses. Optional workflow rules specify the allowed moves from each status; existing projects remain unrestricted.
- Status pickers, Kanban dragging and board cards follow the project workflow. The server also enforces transitions, including history restores, and protects statuses used by active or archived tasks.

### Changed

- Capacity now measures **task counts per person**, including tasks without estimates. Each scheduled task counts once in every week it overlaps, with separate daily and unscheduled counts.
- People can have an optional weekly task limit, including zero. Previous hour-based capacity values are preserved and are not converted into task limits.

### Fixed

- Project settings fits narrow screens and can restore its saved browser draft.

## 0.13.0 — 2026-10-14

### Added

- Organisations can manage people, their weekly capacity and multiple teams. Projects can select several teams; their members populate task assignee pickers without needing login accounts.
- Capacity joins Calendar and Timeline in the Schedule views group. It shows weekly and daily estimated hours per person, team filtering, overloads and task links, with separate unscheduled, unestimated and unassigned work. Totals cover the current project and filters; other projects and time off are not included.
- Task editors include an inline subtask list with creation and status changes, plus a version-history side panel that keeps the editor open.

### Changed

- The editable task title now forms the modal header. Type and priority use icon buttons, and type and parent dropdowns show task icons. Duplicate, Version history, Archive and Delete share the footer.
- Clicking the task modal backdrop closes it and retains unsaved edits as a recoverable browser draft. Tags are hidden in the editor while existing tag data stays intact.
- Planning estimates are labelled in hours for Capacity. Team and person identities, membership, project team choices and assignments persist in the Markdown vault.

## 0.12.11 — 2026-10-14

### Changed

- Task editing puts the ID, changeable type icon and title together, with status, priority, parent, assignee and due date in one desktop row. Tags now follow the description, and the layout wraps on smaller screens.
- Priorities use consistent direction icons in the task editor and task views.

### Fixed

- Switching organisations clears the previous project link, so refreshing stays in the selected organisation.

## 0.12.10 — 2026-10-14

### Changed

- Kanban status changes and card reordering no longer show a success notification. Save errors still appear.

## 0.12.9 — 2026-10-14

### Changed

- Removed the decorative border around the board canvas and the focus outline after mouse interaction. Keyboard navigation retains a visible focus indicator.

## 0.12.8 — 2026-10-14

### Fixed

- Selected frames can be dragged from their empty interior, moving their contents together. Unselected frame interiors still support box selection; titles and borders remain direct drag handles.

## 0.12.7 — 2026-10-14

### Changed

- Board navigation preloads nearby objects and briefly retains recently visible cards, updating during zoom and pan instead of waiting for the gesture to end. Large boards keep a stable, bounded set of detailed cards instead of switching them all off at once.
- Grid titles, drag grips and title edit buttons keep a consistent on-screen size when zooming. Column handles and selection toolbars stay clear of the title.

## 0.12.6 — 2026-10-14

### Fixed

- Font family, size, vertical alignment and Fit update board text immediately while editing, including individual grid cells and preview mode. Line spacing scales with font size, typing and selections are preserved, and font dropdowns support native keyboard navigation.

## 0.12.5 — 2026-10-14

### Added

- Grids have editable titles in their top bar, with larger text and a clear empty-title hint. Double-click the title or use its pencil button to rename it; click outside or press Enter to save. Titles support Undo and travel with the grid in Markdown and Obsidian Canvas exports.

### Changed

- Grid drop targets show a cell highlight without the “Place in cell” text.

## 0.12.4 — 2026-10-14

### Changed

- Board object counts and rendering statistics sit beside the keyboard hints at the bottom left, keeping the right side of the canvas clear.

## 0.12.3 — 2026-10-14

### Fixed

- Frames can be selected by clicking or tapping any empty area inside them, including untitled frames. Objects inside remain directly selectable, and dragging empty frame space still draws a selection box. Small pointer movements no longer prevent a frame click.

## 0.12.2 — 2026-10-14

### Changed

- Grid rows and columns have clearer grip handles, a lifted content preview and an animated insertion gap when dragging. Neighbouring cells and contained objects move aside to show the destination. Escape or dropping outside the board cancels; Alt + arrow keys on a track handle provide keyboard reordering.
- Reordering keeps a stable pointer capture, supports Undo as one action, and leaves merged cells intact when dropped back in their original position.

## 0.12.1 — 2026-10-14

### Changed

- Choosing a grid background colour now replaces all individual cell colours, including merged cells, so the entire grid uses the chosen colour. Undo restores the previous colours.

## 0.12.0 — 2026-10-14

### Added

- Arrows participate in board multiselection: Shift/Ctrl/Command-click, selection boxes, Select all, object-type filtering, copy/duplicate and Delete. Multiple selected arrows share colour, route, stroke, thickness and arrowhead controls.

- Dedicated Project settings page and editable, workspace-unique project keys. Tasks receive permanent sequential numbers (for example WEB-42); deleted numbers are never reused and old keys remain aliases after a project key change.
- Searchable board task picker and creation of linked project tasks directly from the board.
- Object font, font size, vertical alignment, fit-to-box and copy/paste formatting controls.
- Grid cell merging with retained cell contents, automatic/manual sizing, fit contents and adjacent insertion buttons.
- Connector bend editing, movable and multiple labels, automatic body attachment, optional line jumps, and connected-note creation by clicking a connection port.
- Frame thumbnails, direct frame links, paste into a selected frame and local PDF export of selected frames.
- Multi-object resizing, match width/height, adjustable tidy layout and named layers with visibility and locking controls.
- Embedded Table, Kanban and Timeline task views with independent filters and table fields; Kanban status changes update the shared project task.
- Timeline drag-to-schedule, start/end resizing, day/week/month scales, milestones, dependency lines and an unscheduled task tray.
- Personal mouse/trackpad navigation, optional single-letter shortcuts, Tab object navigation, parent/child navigation and keyboard resizing.
- Flowchart shapes, border controls, object rotation, reversible image cropping and image replacement that preserves object identity and connections.
- Bulk sticky creation, partial ink erasing, lasso selection, separate pen/highlighter style memory and optional recognition of simple lines, rectangles and ellipses.
- Local board sessions with optional presenter following, invitations, a shared timer and voting.

### Fixed

- Manual arrow bends follow their connected objects when moving or duplicating a diagram. Filtered frame moves preserve excluded objects.

- Image captions and filenames survive native Canvas saves and remain searchable.
- Board refreshes wait while a toolbar or drag gesture is active. Resize and connector gestures capture the pointer so they continue beyond the canvas boundary.
- Additional typography controls stay grouped in the existing text menu, keeping the main object toolbar compact.

## 0.11.13 — 2026-10-14

### Changed

- Grid resizing follows Miro’s border gestures: internal dividers resize one row/column and push later cells along; outer edges resize all rows/columns proportionally. The end of the row/column label resizes the last track individually. Corner resizing remains available.
- Grid border targets stay usable at different zoom levels, highlight on hover, and show live dimensions. Track labels and contained objects follow the resize; minimum sizes protect contained objects. Escape cancels and Undo restores the whole gesture.

## 0.11.12 — 2026-10-14

### Added

- Select multiple grid cells by dragging, Shift-clicking or Shift + arrow keys; Ctrl/Command-click adds individual cells. Apply colour or text alignment to the selection, copy it as spreadsheet cells, or clear its text together.
- Separate whole-grid background colour control, using the shared colour picker. Explicit cell colours remain as overrides.
- Row and column handles select an entire track and drag it to a new position, with a destination indicator and Escape cancellation. Cell text, formatting and contained objects travel together.
- Drop board objects into grid cells with a visible target. Cells grow to fit their contents. Moving, duplicating or copying the grid carries its contents; dragging an object out releases it. Deleting a row or grid preserves contained board objects.

### Fixed

- Frames and grids share containment through nested containers, including locked children moving with their parent. New objects placed inside frames join them automatically.
- Undo compares metadata independently of key order and records the actual saved Canvas representation, preventing false conflicts after grid layout changes or duplication.

## 0.11.11 — 2026-10-14

### Added

- Dedicated Pen button and P shortcut, with a compact icon toolbar for freehand ink, translucent highlighter and a drawings-only eraser (E).
- Smooth strokes, stylus pressure, single-click dots, Shift straight lines, colour/thickness controls, and three personal presets saved across refreshes.
- Draw over board objects without moving them. Eraser gestures preserve cards and locked drawings, support cancellation, and undo as a single action.
- Selected drawings have a stroke thickness control. SVG/PNG exports use the same stroke shape, thickness, pressure and opacity as the board.

### Fixed

- Two-finger pinch gestures now work when the first finger starts over a connector.
- Drawing colour now affects the ink rather than filling its bounding box, and empty drawing captions no longer take space away from the stroke.

## 0.11.10 — 2026-10-14

### Added

- Resize board objects from any of their four corners. The opposite corner stays anchored, with nearby-size snapping, minimum dimensions, Shift axis constraints, live dimensions, cancellation and undo preserved.

## 0.11.9 — 2026-10-14

### Added

- Live width × height labels beside board objects while resizing. Dimensions reflect snapping and minimum sizes; labels stay readable at any zoom, remain inside the board, and disappear when resizing finishes or is cancelled.

## 0.11.8 — 2026-10-14

### Added

- Board Grid component: place a 3 × 3 grid, edit Markdown-rich text directly in cells, and navigate cells with arrows or Tab.
- Grid toolbar controls to add, delete and reorder rows/columns, toggle header styling, set cell colours/alignment, and export CSV.
- Drag cell boundaries to resize rows/columns; paste spreadsheet cells into a selected cell to expand the grid (up to 30 × 30).
- Grids support board selection/filtering, duplication, undo, resizing, connectors and SVG/PNG export. Canvas files carry full grid metadata plus a readable Markdown table for Obsidian.

## 0.11.7 — 2026-10-14

### Added

- Draw frames around content with the left toolbar or F; click to place a 16:9 frame. Escape cancels placement.
- Frame toolbar controls for 16:9, 4:3, square, portrait and A4 sizes, fitting the frame to its contents, selecting contents, collapse/expand and presenting from a frame.
- Frames panel with object counts, dimensions, drag-to-reorder slides, keyboard-accessible reorder buttons and automatic ordering by position.

### Changed

- Drag frames by their border or title; dragging inside empty frame space selects objects. Resizing changes the container without scaling its contents.
- Objects attach to the containing frame on drop and detach when dragged out. Nested frames move with their contents, including keyboard movement.
- Duplicating, copying or saving a frame as a template includes nested contents and internal connections. Paste and duplication keep the camera unchanged.
- Presentations use top-level frames in the saved order. Collapsed contents are temporarily revealed during presenting and restored when exiting.
- Frame deletion keeps its contents and remains undoable; its toolbar tooltip now makes that behavior explicit.

### Fixed

- Frame backgrounds respect the shared colour picker and light/dark themes. Nested frame surfaces remain behind their own contents, including in SVG/PNG exports.

## 0.11.6 — 2026-10-14

### Changed

- Bring to front, Send to back and Delete are direct, grouped icon buttons on the board selection toolbar. Notes no longer need a More menu; task-specific actions remain available.

## 0.11.5 — 2026-10-14

### Added

- Resizing snaps to nearby object widths and heights, with paired dimension guides, Shift axis locking and Alt bypass. Uses the existing per-board nearby-object alignment setting.
- Left, centre, right and justified text alignment in the board selection and editing toolbars, including multi-selection. Alignment persists per object without altering linked Markdown and supports undo and native Canvas round trips.

### Changed

- Shared 16 px text padding across notes, text, task/story cards and other board objects, preserved during inline editing.
- Connector Route, Stroke and Thickness controls are directly on the main arrow toolbar.
- The task editor is wider and more compact, with smaller typography, a simple Edit task heading, collapsed Planning & relationships and a WYSIWYG description using the shared Markdown toolbar.
- Pasted and duplicated board objects become the active selection and receive keyboard focus without changing zoom or camera position.
- Empty frames display no placeholder label. Finishing an empty text object removes it and its connectors; Undo restores them.

### Fixed

- Clicking empty board space clears selected objects and arrows, including stale arrow highlights and endpoint handles. Background taps and hand-tool clicks also deselect; panning preserves selection.
- Finding an object clears any previous connector selection.
- A placement click no longer immediately finishes a newly opened text editor in Firefox. Background refreshes wait for active editing, placement, search and toolbar interactions, then retry when idle.

## 0.11.4 — 2026-10-14

### Changed

- Moved Find on board, Owner and Status into a collapsible search panel opened from the left toolbar. The canvas starts with the panel hidden.
- Ctrl/Cmd+F opens and focuses board search; Escape, outside clicks and selecting a result close it. Active filters remain indicated on the search icon.

## 0.11.3 — 2026-10-14

### Added

- This changelog and a project rule requiring it to be maintained with future changes.

### Changed

- Removed the board header's Navigate menu. Outline, presentation and frame navigation are available under More.
- Moved board renaming into **Board settings → Board name**, alongside snapping, background and display settings. Names persist with the board and support undo.

### Fixed

- Converting a Task to a Note now gives it the sticky note appearance, hiding task controls, status, assignee and warning badges. Task data stays linked and returns when converted back.
- Converted notes retain editable titles and Markdown content, consistent colour previews and exports. Switching a small note back to a task restores a suitable minimum card size.

## Earlier updates — recorded 2026-10-14

These features were present before 0.11.3. Individual release dates and version mappings were not recorded; this is a retrospective summary.

### Added

- Board settings for persistent grid snapping, nearby-object alignment, background colour, dots/grid/lines and display preferences.
- Alignment guides for nearby edges, centres and equal spacing, with Alt to bypass snapping.
- Lossless Task ↔ Note conversion from the selection toolbar.
- Curved connector previews, nearby connection points, endpoint reconnection and a connector toolbar with arrowhead, route, stroke and label controls.
- Multi-selection filtering by object type, with counts and restoration of the original selection.

### Changed

- Grouped board selection tools with icons and a shared colour picker throughout the app.
- Smoother board zoom, draggable sticky note creation and Kanban insertion feedback.
- In-place rich text editing with formatting tools, bullet lists and `-` followed by Space to start a list.
- Text saves when clicking outside the component; undo replaces separate Save/Cancel controls.
- Clearer placeholder text, safer minimum object sizes and Shift-constrained resizing.

## 0.7.0 baseline — 2026-10-14

Recorded in Git commit `9923256` (Initial version). This is the baseline commit date, not a reconstruction of each feature's introduction date.

### Included

- Offline Docker web app with Markdown/Obsidian storage, organisations, projects and hierarchical tasks.
- Overview, List, Tree, Table, Kanban, Board, Calendar and Timeline views, saved views and project workflows.
- Shared compact headers, grouped view tabs, collapsible sidebar, personal font choices and light/dark appearance.
- Canvas objects, frames, drawing, images, connections, Markdown embeds, presentation, imports and exports.
- History, trash, backups, conflict recovery and optional organisation-scoped accounts.
