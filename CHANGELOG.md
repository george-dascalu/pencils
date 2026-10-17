# Changelog

User-facing additions, changes and fixes, newest first. Dates use Europe/London and `YYYY-MM-DD`.

## Unreleased

## 0.15.5 — 2026-10-17

### Added

- Boards have a dedicated Images / GIFs button and support dropping image files onto the canvas. Import multiple PNG, JPG, WebP or GIF files at once, with original GIF animation, proportional display, selection, resizing and undo.

### Changed

- Tasks now contains List, Tree, Table and Kanban. Calendar, Timeline and Capacity live under Planning, with the last layout remembered per project on desktop and mobile.
- Draft task edits save automatically, including descriptions and subtasks. A Finalise task icon in the editor opens a compact review panel beside the card, without covering the board.

## 0.15.4 — 2026-10-17

### Fixed

- Note text editors now fill the entire note in rich text, Markdown and preview modes, including after resizing. Text keeps its padding and vertical alignment, and overflowing content remains scrollable.

## 0.15.3 — 2026-10-17

### Changed

- Removed automatic text shrinking from object and grid formatting. Font controls now give more width to the font name and use a narrower size selector in both formatting menus and inline editors.

## 0.15.2 — 2026-10-17

### Changed

- Renamed the Board view to Boards across desktop navigation, mobile view selection, the command palette, the default-view setting and its canvas menu.

## 0.15.1 — 2026-10-17

### Changed

- Board is the single canvas view, combining tasks, notes, images and drawing. Its Board menu includes the canvas gallery, task links, local checkpoints and offline drawing tools; existing drawings and drawing links continue to work.
- Pencil drawing, finger selection/panning/pinch zoom and configurable gestures now work on every board. Pending offline edits are checked before opening any canvas, with guarded sync or restore-as-copy recovery.

## 0.15.0 — 2026-10-17

### Added

- Table columns can be reordered by dragging their headers, with a drop marker and automatic horizontal scrolling. Mouse, touch and Alt + Left/Right keyboard controls share the existing column settings and saved views; clicking still sorts and header edges still resize.

- Drawing gesture settings configure canvas double-tap, two-finger tap and supported pen side buttons, with pen/eraser, undo, redo and fit actions. Preferences are shared between Personal settings and Pen preferences in this browser; Apple Pencil barrel-tap limitations are explained.
- Projects can combine Obsidian, Jira Cloud and SharePoint Excel sources, with mapping previews, stable IDs, private source ownership, source badges, conflict review and sync/publish logs. Reads are opt-in; explicit Jira and conservative Obsidian publication capabilities are separate from local edits. Excel remains read-only.
- Drawing view provides a gallery, task links, shared pen/layer/reference/export tools, device checkpoints and an offline ink pad with guarded reconnect or restore-as-copy recovery.
- Project automation offers manual, status-change and due-date triggers, disabled rules, previews, bounded actions and run logs.
- Keyboard connection controls select objects and ports and can create real task dependencies. Unavailable cards can be detached as notes; draft finalisation has a review step.
- Workspace diagnostics, a rebuildable SQLite search/query index, recoverable write journaling and scoped record updates improve recovery and refresh behaviour.

- Task details use a shared compact side panel with resize controls; Ctrl/Cmd+K opens task actions, views and settings.
- Tables support personal and shared saved views, nested AND/OR filters, column action menus, group summaries, parent/child outlines, pinned identity columns and keyboard cell navigation.
- Table bulk actions state their scope. Clipboard imports offer column mapping and validation before applying; CSV exports include all matching rows and protect against spreadsheet formulas.
- Schedule previews explain dependency/date conflicts before moving downstream tasks. Capacity supports estimated hours, individual working days, time off and allocation across accessible projects.
- Project frame updates preview added, removed and moved cards, preserve placement by default and offer explicit rearrangement.
- Board search lists object states and allows returning to the previous viewport.
- Calendar has an agenda layout, quick date editing and an unscheduled task tray. Phones initially use the agenda.
- Personal settings offer compact or comfortable spacing, and project navigation includes a mobile view switcher.
- Project backups can be uploaded as ZIP files up to 220 MB and verified before restoring. Recovery explains the archive's scope and expanded size limits.

### Changed

- List, Tree and Table share one Tasks tab, with a compact layout selector inside it on desktop and mobile. Tasks remembers the last layout used for each project.
- Table headers are shorter, with full-height sorting, filter and column-menu click targets. Touch screens retain larger controls; columns scroll together on small screens so pinned headers cannot cover these controls.
- Table columns open in a compact popover beneath Columns. Visibility and order update immediately while the popover stays open; Escape or clicking outside dismisses it.
- Saved views sit beside shared query controls. Board scope explains task cards, distinct tasks, drafts and unavailable cards; save messages distinguish pending, saved and conflicting edits.
- Pen input uses adaptive stabilisation, adjustable pressure response, movable/left-handed tools and finger navigation in Drawing mode. Orthogonal connectors avoid nearby card obstacles while retaining stable label anchors.

- Recurrence controls explain the next occurrence and link previous/next instances.
- Active pen strokes render incrementally and retain sample timing and tilt with pressure.
- Shared form menus clamp to the visible viewport, including the on-screen keyboard. Reduced-motion settings suppress decorative transitions.
- Overview metrics open the corresponding task lists. Task views explain matching totals, archive counts and hierarchy context.

### Fixed

- Clicking anywhere on a Kanban card, including its padding and metadata, opens the full shared task editor. Title keyboard access and dragging cards between columns are preserved.
- In Drawing, fingers select, move and resize objects or pan and pinch the canvas without drawing or erasing. Pencil contact rejects palm input, and adding a second finger cancels an object drag before navigating. Background updates wait for active gestures or open pen preferences.
- Safari/WebKit keeps project links visible in the scrolling sidebar, and direct drawing links check for unsynced device changes before opening the canvas.
- Shared toolbar dropdowns keep consistent sizes across browsers. The prepared offline drawing shell opens from its cache without waiting for the network.
- Change notifications no longer rebuild the current view when its saved version is already displayed.
- View navigation waits for a project to finish loading, preventing quick tab clicks from being lost during snapshot loading.
- Pending offline drawing checkpoints survive reopening and offline preparation; related vault writes notify clients only after commit.
- Shared secondary text meets the automated light/dark contrast checks; table resize handles expose accessible values, and wrapped mobile toolbars remain usable with an open menu.
- Provider-owned task controls are read-only, and revoked project access clears the active project display.

- Timeline provides explicit paging beyond 200 dated tasks. Kanban counts the full filtered columns and loads more cards within each column. Tree pagination keeps complete subtrees and includes ancestors of filtered matches.
- Deadline filters consistently use the local calendar date.
- Backup creation and the new upload path share restore limits, preventing creation of unsupported archives.

## 0.14.45 — 2026-10-16

### Added

- Table view gains collapsible field groups (including nested groups), multi-column sorting, and column filters for values, text, empty fields and number/date ranges. Active filters and sorting are marked in column headers, with matching task counts and reset controls.
- Table preferences are remembered per project in this browser and included in shared saved views. Grouping, sorting and filtering support custom fields and apply before pagination; bulk actions only affect visible selected rows.

## 0.14.44 — 2026-10-16

### Added

- Notes now offer five visual styles in the appearance menu: Classic, Square, Rounded, Top fold and Bottom fold. Styles preserve note colours and formatting, support undo and copy/paste formatting, and are retained in saved boards and image exports.

## 0.14.43 — 2026-10-16

### Added

- Drag the Grid icon from the board sidebar to place a grid, with a live cell preview that follows the pointer at the current zoom. Drop outside the canvas or press Escape to cancel; placement supports undo.

### Changed

- Grid formatting uses the shared compact icon palette for horizontal and top/middle/bottom alignment, including cell, row and column selections.

## 0.14.42 — 2026-10-16

### Changed

- Text formatting now uses a compact icon palette for horizontal alignment, top/middle/bottom alignment, automatic vertical alignment and copy/paste formatting. The same controls support selected objects and grid cells, rows or columns, with tooltips and keyboard access.

## 0.14.41 — 2026-10-16

### Fixed

- Arrow text now uses continuous glyph scaling during zoom, eliminating the small jumps caused by font metrics snapping between zoom levels.

## 0.14.40 — 2026-10-16

### Fixed

- Arrow labels retain their SVG elements during zoom and pan, preventing repeated text replacement and flickering. Connector hit areas and handles still adjust to the zoom level.

## 0.14.39 — 2026-10-16

### Added

- Press Enter with one arrow selected to open and focus its label editor. Type the label and press Enter again to save it.

## 0.14.38 — 2026-10-16

### Fixed

- Update plan aligns dependency chains from left to right instead of scattering tasks across separate rows. Dependency arrows now take the short route between separated cards, while parent/child groups stay indented and avoid overlapping.

## 0.14.37 — 2026-10-16

### Added

- Deleted board cards now offer Restore task, reconnecting all their board cards and retaining their original content and ID. Archived cards offer Unarchive directly. Task restoration respects project editing permissions and never overwrites an existing task.

## 0.14.36 — 2026-10-16

### Fixed

- Board cards now identify archived tasks and show a Deleted task placeholder, with its title and ID, when the linked task is in the trash. Missing or unreadable task files show Task unavailable instead of stale editing controls.

## 0.14.35 — 2026-10-16

### Changed

- Project frames can now be drawn or placed on the board like regular frames. Use Update plan to fill them with tasks. Creating or updating a Project frame keeps the current zoom and canvas position.

## 0.14.34 — 2026-10-16

### Added

- Project frames create and refresh a project task plan on the board, with labelled dependency arrows and indented parent–child relationships. Updates reuse generated cards, preserve unrelated board content and support undo.
- Interactive visual editors for project workflow transitions and card hierarchy rules, with selectable cards, connection arrows and keyboard-accessible controls.

### Changed

- Dependency arrow styles now live in Board settings and apply per board. Changes save immediately and support undo and reset. Existing project styles remain the starting appearance for boards that have not chosen their own style.

## 0.14.33 — 2026-10-16

### Added

- Project settings now define dependency arrow colour, stroke, thickness and arrowhead with a live preview. Every dependency arrow in the project, including exports, uses this shared style; ordinary connectors retain their own appearance.
- Dependency arrows have a distinct purple dashed style by default and a toolbar shortcut to their project style settings.

## 0.14.32 — 2026-10-16

### Changed

- Start date sits beside Due date in task creation, editing and draft panels.
- Dependencies show searchable prerequisites with task IDs, types and statuses, one-click removal, and a separate list of tasks blocked by this one. Choices that would form a cycle are disabled.
- Board arrows have a Task dependency menu to create or remove real task prerequisites. Arrows between dependent task cards show the blocking direction and update when task dependencies change.

## 0.14.31 — 2026-10-16

### Added

- Draft task cards now have editable priority and assignee dropdowns. Changes save automatically, support board undo and carry through when finalising the task.

## 0.14.30 — 2026-10-16

### Changed

- New Note-to-Draft conversions start with a blank description instead of repeating the title. Existing draft descriptions survive a round trip through Note.
- Task comments use the same attached sidebar layout as version history, including responsive sizing and an independently scrolling conversation.
- Finalise task is now an icon button in the draft card header, immediately left of Comments.

## 0.14.29 — 2026-10-16

### Changed

- Draft tasks can be converted back to Notes from the type menu, preserving title, description, draft details, comments and connections. Converting back to a draft restores its priority, assignee and proposed subtasks.
- Board task cards show their type icon before the title; drafts use a pencil icon.

## 0.14.28 — 2026-10-15

### Changed

- Converting a Note to a Task now creates a board-only draft first. Use Finalise task when ready to create the project task and its ID; note text, appearance, comments and connections stay with the card.

## 0.14.27 — 2026-10-15

### Changed

- Object appearance dropdowns now show stroke samples for border style and thickness, and shape icons, including the selected value. Tooltips and keyboard-accessible names identify each option.

## 0.14.26 — 2026-10-15

### Added

- Draft Tasks live only on their board until converted to project tasks. Prepare task details and subtasks in the shared editor; conversion preserves the card’s position, appearance, comments and connections.

### Changed

- Existing task editors save edits automatically without closing or losing focus. Duplicate, Archive, Version history, Comments and Delete are compact header icons; comments and history open beside the editor.
- Dropdowns across project views, task editors, board cards, filters and settings now share the priority picker’s rounded menu, spacing, selected highlight and checkmark, with keyboard navigation and light/dark styling.

## 0.14.25 — 2026-10-15

### Changed

- Existing task editors now use the same field order and spacing as New task: priority/status/assignee, then parent/due date, followed by description and subtasks, across desktop and mobile.

## 0.14.24 — 2026-10-15

### Changed

- New task forms show type and title together, then priority/status/assignee, parent/due date, and description. Planning & Relationships is removed from creation forms.
- Create another keeps the form open after a successful creation, retaining type, parent, status, priority, assignee and due date while clearing title, description and subtasks.

## 0.14.23 — 2026-10-15

### Changed

- Board comments support threaded replies, deletion and five toggleable emoji reactions (👍 ❤️ 😂 🎉 👀). Resolve/Reopen has been removed; previously resolved comments remain visible. Deleting a parent preserves its replies, and comment counts reflect all remaining comments and replies.

## 0.14.22 — 2026-10-15

### Changed

- Connect two objects reveals connection points on hovered objects. Drag between points or click a start and end point to attach a curved arrow to specific sides; Escape cancels.

## 0.14.21 — 2026-10-15

### Changed

- Moved board resize handles and connection points slightly farther outside objects to reduce overlap with their borders and content, including touch controls.

## 0.14.20 — 2026-10-15

### Changed

- Board task cards show Comments beside the title, immediately left of Expand, with the unresolved count on the icon. The duplicate task toolbar action has been removed; other object comment controls are unchanged.

## 0.14.19 — 2026-10-15

### Changed

- Object appearance uses a smaller icon-led popup, with rotation and border width side by side, compact border controls, and quick access to frame settings and border colour.

## 0.14.18 — 2026-10-15

### Changed

- Expanding a task card on the board opens the same compact, nonmodal side panel used for New task. Existing task details, subtasks, save and footer actions remain available, with version history beside the panel on wide screens and inside it on small screens.

## 0.14.17 — 2026-10-15

### Changed

- Board settings apply automatically as you change them, with Ctrl/Cmd+Z undo and redo available inside the popup. Reset sits beside Close; Apply and Cancel buttons have been removed.
- Object comments open in a compact chat-style panel to the right of the object, with a scrollable thread, composer, Resolve/Reopen controls and retained drafts.
- Removed Choose heading or block and Backlinks actions, dialogs and task backlinks UI. Existing saved note references remain readable.

## 0.14.16 — 2026-10-15

### Fixed

- Focus rings are now a thin 1px inset line, so all sides remain visible inside clipped cards, grid cells and toolbars. Board assignee, status and priority controls share the same treatment, as do form fields, menus and colour pickers.

## 0.14.15 — 2026-10-15

### Fixed

- The task type selector no longer overlaps the title in the board’s New task panel, including on narrow screens.
- Focus indicators use a slimmer, theme-aware green ring across fields, menus, toolbars and colour pickers, replacing the thick blue outline while preserving visible keyboard focus.

## 0.14.14 — 2026-10-15

### Changed

- Creating a task on the board opens a compact, nonmodal side panel in place of the Project tasks list. The canvas remains usable; Back returns to the list, unsaved drafts can be restored, and creating a task returns to the list. The form retains rich descriptions, metadata, subtasks and planning fields.
- Board task cards show the title and expand button first, then ID, priority, status and assignee in one row, with the description below. Priority and status have coloured backgrounds in light and dark themes, including custom workflow statuses.

## 0.14.13 — 2026-10-15

### Added

- Drag tasks from the board’s Project tasks list onto the canvas. A scaled card preview follows the pointer, and dropping creates a linked card at that position without changing the camera. Escape or dropping outside the board cancels; click-to-place and undo/redo remain available. Touch users can drag sideways from a task while vertical gestures scroll the list.

## 0.14.12 — 2026-10-15

### Added

- Draft subtasks while creating a task, with a type selector and removable drafts. Creating the parent also creates its subtasks with unique project IDs; validation runs before saving and retries do not duplicate the group.
- Project settings includes Cards Hierarchies: choose Freeflow or enforce allowed parent/child types and which types may exist without a parent. Rules apply across views and task history restoration, and incompatible existing tasks must be resolved before enabling them.
- A Project tasks icon in the board’s left toolbar opens a searchable list with status, type, assignee and board-placement filters. Place linked cards or create a new project task without changing the camera.

### Changed

- Removed the board’s + Add menu. Existing creation tools remain in the left toolbar or More menu, including live notes, live task views and images.
- Date fields share a Monday-first calendar with stronger weekdays, quieter weekends, keyboard navigation, month/year selection, Today and Clear. The Calendar view also distinguishes weekdays from weekends.

## 0.14.11 — 2026-10-15

### Added

- Board settings offers a Fine grid background with small squares and stronger lines every five squares. Colours and spacing are configurable, follow pan and zoom, and are saved per board.

## 0.14.10 — 2026-10-15

### Added

- Change task priority and assignee directly on board cards. Assignees use project team members, and changes update the underlying project task.

### Changed

- Numbered lists have their own button beside bullets in all rich-text toolbars. Typing `1.` or `1)` followed by Space starts a numbered list.

## 0.14.9 — 2026-10-15

### Fixed

- Grid titles stay anchored to the top edge when zooming in. Column controls follow the title, while titles and drag handles retain their readable screen size.

## 0.14.8 — 2026-10-15

### Fixed

- Empty task assignee lists explain whether the project needs a team or its teams need members. Project settings clearly identify teams with no members.

## 0.14.7 — 2026-10-14

### Changed

- Connector thickness uses an icon dropdown with visual line-weight choices, matching Route and Stroke for single and multiple arrows.
- Colour menus use two compact rows: seven system colours, then a multicolour picker button and six recent colours. Spectrum, hue and hex controls expand on demand.

## 0.14.6 — 2026-10-14

### Added

- Every shared colour menu now includes a visual saturation/brightness picker, a hue slider and a matching hex preview, with pointer and keyboard controls.
- The 14 most recently used colours are shared across component and settings menus in this browser, deduplicated and remembered after refresh.

### Fixed

- Nested border colour menus stay within the viewport and close independently of their appearance menu.

## 0.14.5 — 2026-10-14

### Added

- Grid row and column selections can apply bold, italic, strikethrough, font, size and alignment across all selected cells. Formatting controls identify the selected row or column and show mixed values; Enter or Space selects a focused row/column header.

### Changed

- Board settings opens as an anchored popover instead of a full modal. It preserves naming, snapping, background and display controls, closes on outside click or Escape, and fits smaller screens and expanded boards.

## 0.14.4 — 2026-10-14

### Fixed

- Every selected board arrow now has a clear highlight, including multi-selection, selection boxes and mixed object selections. Highlights preserve line colours and styles and stay out of exports.

## 0.14.3 — 2026-10-14

### Changed

- Connector toolbars use visual Route and Stroke menus with current-style previews, smaller arrowhead icons and more spacing between controls.

## 0.14.2 — 2026-10-14

### Changed

- Moved the Teams and People sidebar section below Projects.

## 0.14.1 — 2026-10-14

### Added

- A Teams section in the sidebar opens dedicated Teams and People pages for the current organisation, with membership editing and optional weekly task limits.
- Directory pages support direct links, refresh, organisation switching and recoverable browser drafts. Restoring an older draft cannot overwrite newer saved organisation changes.

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
