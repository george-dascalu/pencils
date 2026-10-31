# Pencils

An offline project workspace for **organisations → projects → hierarchical tasks**, with portable Markdown notes and a Docker web interface. Shared mode is ready for trusted devices on your local network; optional accounts restrict access by organisation.

See [CHANGELOG.md](CHANGELOG.md) for dated additions, changes and fixes. The [Project Settings assessment](reports/2026-10-17-project-settings-assessment.md) records this redesign and the next priorities.

## Make the workspace yours

Every project view uses the same compact header: project title in the breadcrumb, **Overview**, **Planning**, **Tasks**, **Boards**, **New** (a card, a document or one from a template, a board, or a document in your personal space, in groups split by dividers; the personal space offers documents only) and **Project settings**. Tasks contains List, Tree, Table and Kanban; Planning contains Calendar, Timeline and Capacity. Overview shows project progress, open/blocked/overdue tasks, status counts and upcoming deadlines.

Project Settings has its own grouped sidebar and dedicated pages. General, Teams, Statuses & workflow, Types & hierarchy and Custom fields save independently. Data sources, Import notes, Automation, Diagnostics and Archive & recovery contain their own tools. Source configuration and automation editing have direct links; browser Back, Forward and reload preserve the page. Unsaved changes require an explicit discard before navigating away. Templates are removed from the settings navigation. On phones, choose a page using Settings section.

Colour fields throughout the app use the same circular swatch and dropdown palette, with a custom hex editor for exact colours.

Development rule: **Consistency**. Reuse shared UI and keep common actions, terminology and behaviour aligned across views. See [AGENTS.md](AGENTS.md).

- The menu button at the left of the top bar slides the sidebar in over the page on every device (half as wide again on iPad); the page doesn't move. Escape, its close button, a click outside it or choosing something closes it. Settings, Help and the version sit at its bottom. On phones the header has no title or bar, only the menu and New buttons floating as round buttons, with the view's own row (search or the board's menus, star, sort and View options) between them. On iPad, List, Tree, Table and Kanban put their search, filters and sort in the middle of the top bar; every view with a bookmark star, including Board, Planning and an open document, puts it before the title. Phones and iPad switch views from a floating bar at the bottom (narrower and centred on iPad); pages run behind it, and the end of each page scrolls clear of it. Boards stop above it. Tapping the open Tasks or Planning tab again shows its layouts in a tray above the bar; tapping the open Documents tab shows the document list button and the Live preview, Source and Reading views. Add your own buttons to the bar, between the views and Search: commands (such as New card, Today's note or a view) and your bookmarked cards, documents, boards and views. Add, order and remove them in **Settings → You → Bottom bar**, or press and hold the bar to change them there. They're saved for you on every device, and the bar scrolls sideways when they don't fit.
- Open **Settings** at the bottom of the sidebar; its **You** section holds your own preferences. Choose Light, Dark, or System appearance and one of eight fonts: Manrope (default), DM Sans, Space Grotesk, Outfit, Sora, Work Sans, Lora, or Fraunces. Preferences are local to this browser and shared across its tabs; other devices retain their own choices.
- **Themes** (Settings → You → Appearance): Pencils, Minimal, Paper, Catppuccin (with optional rainbow headings) and Typewriter, each in light and dark. They are our own CSS from each Obsidian theme's design, not its code; Typewriter uses iA Writer Quattro S and Mono S (SIL Open Font License, bundled unmodified under `public/fonts/` with their licences). Text, links and buttons keep at least 4.5:1 contrast (`test/themes.test.js`).
- **Style** (Settings → You) fine-tunes the accent colour, document text size, readable line width, line height, document and code fonts, corner roundness, and heading, callout and list callout colours. Each option shows its default and resets on its own; **Reset all** restores them. Like the theme, these stay in this browser.
- **Capture from your phone** (Settings → You): make a token for a project, then add a **Get Contents of URL** step to an iPhone Shortcut that sends `POST /api/capture` with `Authorization: Bearer <token>` and a JSON body `{ "text": "…" }`. The first line becomes a card's title, the rest its description, and `#words` its tags, with `inbox`. A token is shown once and can be revoked there.
- Fonts and their SIL Open Font Licenses are bundled under `public/fonts/`, with source links in `SOURCES.json`. No external font service is used at runtime.
- Open **Project settings** to edit the ordered status list and specify which statuses count as completed. New projects can define their own workflow during creation. Changes apply only to that project and are stored in its Markdown frontmatter. A status used by an existing task cannot be removed until those tasks are moved to another status. Use **Types & hierarchy** for card types and parent/child rules, and **Custom fields** for additional task information.
- Standard card types are Epic, Milestone, Story, Task, Activity and Bug. Choose **Activity** in the task editor’s type picker; it supports the same dates, assignments, descriptions and relationships as other cards.

## Project settings and task IDs

Project settings opens as its own page. Set a unique 2–12 character project key, such as `WEB`; tasks receive IDs such as `WEB-1`, `WEB-2`. Numbers are never reused after deletion. Changing a project key updates the visible prefix and retains previous IDs as Obsidian aliases. Internal IDs, Markdown filenames and board links stay stable. Existing vaults receive keys and task numbers automatically, with a backup before migration. Keep each project's `identity.md` registry when moving or backing up files.

On a board, the **Project tasks** icon in the left toolbar opens a task browser. Search the current project by ID or title, and filter by status, card type, assignee or whether a task is already on this board. Drag a result onto the canvas to place a linked card at the preview position without changing the camera, or click to place it automatically. Escape or releasing outside the canvas cancels a drag. On touch screens, drag sideways from a task; vertical gestures scroll the list. **New project task** replaces the list with a compact side panel, leaving the board usable. Back returns to the list and retains an unsaved browser draft. Creating the task places its linked card on the current board and reopens the list. Existing tasks open in the same compact, resizable editor. Board cards show title/expand, then ID/priority/status/assignee, then description; priority and status use coloured controls. Removing a card only removes that visual representation. Editing a linked task from any view updates the same Markdown record.

## Run with Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Needs Docker Engine 25 or later. Open **http://localhost:3000**, or **http://SERVER-IP:3000** from another device on the same network. The server computer must be running and reachable. Core local features need no internet service, CDN, font server, account provider or API key. Optional Jira and SharePoint sources need internet access and registered OAuth applications. One-time Miro imports need internet access and either a Miro OAuth app or a temporary access token. Building the image initially needs internet access for Node and npm packages; see the offline instructions below to transfer a prebuilt image.

Set `VAULT_PATH` to the folder you want to use, and set `LOCAL_UID` / `LOCAL_GID` to the output of `id -u` / `id -g` on Linux. The app runs as that user in a read-only container, with a writable vault mount. The host folder must be writable by that user. Stop with `docker compose down`; the vault remains on disk.

The empty workspace offers an optional example project. No sample content is created automatically.

## What you can do

In **Project settings → Cards Hierarchies**, choose Freeflow or Enforce rules. The matrix controls which parent types allow each child type. The “No parent” row controls which types can exist at the top level. Enforced rules apply to task creation, reparenting, type changes and history restoration. Existing tasks must satisfy the rules before they can be enabled. Freeflow preserves the configured rules without restricting relationships; cycles are always rejected.

Add draft subtasks in the new-task editor before saving the parent. Choose each subtask’s type, enter its title and press Enter or Add. Drafts can be removed before saving; a title still in the capture field is included when creating the task. The parent and children are validated together, and retries do not create duplicates. Subtasks receive their own project task IDs.

Date fields use a shared Monday-first calendar with stronger weekdays and muted weekend columns. Type dates directly, or open the calendar button (Alt+Down from the field); arrow keys navigate days, Page Up/Down changes months, and Escape closes it. The Calendar view uses the same weekday/weekend distinction.

The task editor keeps Start and Due dates together. **Relationships** contains parents, children, **Blocked by**, **Blocks** and related tasks; its sort icon opens ordering and direction, while **+** opens a contextual task picker beside the button. On phones (and in other narrow panels) relationship rows look like List rows: the title, then the type, ID, the assignee, status and priority box and the due date. Descriptions use the shared rich-text editor and still save as Markdown. A narrow toolbar keeps common formatting on one line; **More formatting** contains strikethrough, numbered lists, Markdown and Preview. Use **Add attachments** below the description to choose files on any device; desktop drag and drop also works. Browser drafts and attachments are preserved.

- Create multiple organisations, each with multiple projects; move projects between organisations without changing note paths or task identifiers.
- Work in overview, list, tree, spreadsheet, kanban, freeform board, calendar and timeline views. The Sort button shows the active sort and its direction (↑ or ↓); choose the active sort again to reverse it. Tree indents subtasks under an expand button; with no subtasks its cards line up as in List. The button beside its heading cycles through all expanded, all collapsed and back to the rows you opened and closed yourself. The Sort menu starts with Manual order, then groups Card ID, Title, Parent and Assignee under Card, Status and Priority under Progress, and Due date and Date created under Dates.
- Define project-specific statuses, completed statuses, task types and typed custom fields (text, number, date, select or checkbox). Existing task values must remain valid when changing a workflow.
- Set assignees, priorities, tags, start/due dates, estimates, parents and prerequisites. Dependency cycles and hierarchy cycles are rejected. Progress uses leaf tasks, weighted by estimate when positive, otherwise weight 1; parent tasks are not counted twice.
- Repeat a task after completion by days, weeks or months. Each occurrence creates one successor, and dates at the end of a month are clamped to the last valid day. Reopening and recompleting an occurrence does not create another successor.
- Capture tasks inline, duplicate tasks, save task templates, add comments, import Markdown notes and attach files. Archive tasks/projects, and recover deleted tasks, boards or whole projects from Trash.
- Search tasks across all permitted organisations and projects. Organisation dashboards show deadlines, blocked tasks, overdue work and project progress. Calendar shows due dates by Month, Week (one week, with room for each day's cards) or Agenda; timeline shows start/due windows.

### Kanban

Cards show their due date after the assignee and priority, in the same box; the + at the top right of a column adds a card to it. Drag cards between statuses or reorder them within a column; on touch screens, press and hold a card to lift it (with a haptic tick where the device allows), then drag. A card-sized insertion marker shows the drop position, neighbouring cards move aside, and hovering near the edge scrolls toward offscreen columns. Drops switch to manual order and save it to task frontmatter. Press Escape or drop outside the columns to cancel.

### Spreadsheet

Edit cells and drag across them or use **Shift-click** for rectangular range selection, **Ctrl/Cmd+C/V** for TSV copy/paste, and **arrow keys** or **Enter** to navigate cells; Shift+arrows extends a range. Paste into existing visible rows; add rows first if needed. **Bulk edit** changes the status of, or archives, the rows a range spans (two or more), the visible rows or every matching task; there are no row checkboxes. Resize columns with header handles, or use **Columns** to hide/reorder them. Save a named view to share its layout.

Rapid changes to the same task are serialized and retain the latest revision. Invalid values and unresolved concurrent edits remain recoverable in **Recovery & backups**. Spreadsheet formulas are not evaluated. Optional SharePoint sources import a named Excel table through a separate, read-only mapping preview; CSV export and validated clipboard paste are available.

### Board

The selection toolbar's text menu contains font, size, vertical alignment, fit-to-box and copy/paste formatting. **Insert → Bulk notes** in the left toolbar creates one sticky per pasted line. Shape controls offer flowchart shapes, borders and rotation; image controls offer non-destructive crop percentages and replacement without breaking connections.

**Arrange** includes matching dimensions, tidy columns/gaps and selected-frame PDF export. A multi-selection has four outer resize handles. **Frames → Layers** assigns selections to named layers and hides or locks their objects. Frame links open the project, board and frame directly; copying objects and pasting with a destination frame selected places them inside that frame. Frame PDF pages are rasterised locally from the SVG export, without an external service. Exported text uses the simplified SVG representation; it is not a full browser screenshot.

Grid cell controls include merge/unmerge, fit contents and Auto/Manual sizing. Merging retains each cell's original text and formatting; unmerge restores them. If the merged text was edited, the edited anchor and the other original cells are retained. Structural row/column changes unmerge affected content first. Manual sizing does not grow a grid to accept an oversized dropped object.

Connectors support draggable bends and labels, additional labels in the label menu, automatic body attachment and optional crossing jumps on straight/elbow routes. Double-click a bend to remove it. Clicking a connection port creates a connected note. Explicit port drops keep fixed-side attachment.

Live task cards can display List, Table, Kanban or Timeline layouts. Each keeps its own filters and visible table fields. Dragging a task between embedded Kanban columns updates its project status. Timeline bars and their ends change task dates; the scale selector changes day/week/month density, diamonds mark milestones, and undated tasks can be dragged onto a dated track.

The Pen toolbar includes a partial eraser, lasso selection and optional simple shape recognition. Pen and highlighter remember their styles separately within each preset. **Session → Board session** offers presenter sharing, opt-in invitations, a local timer and voting on selected objects. Following never starts without the recipient choosing it. Votes and timer state are stored with the board; presenter presence is temporary.

Settings → You can switch between wheel-to-zoom mouse navigation and scroll-to-pan trackpad navigation, and disable single-letter shortcuts. Tab cycles board objects; Alt + Up/Down selects a parent/child; Alt + Shift + arrows resizes by 10 pixels. Existing Shift + corner drag remains axis constrained.


Boards view uses the shared compact project header and fills the remaining window. **Boards** manages canvases. The left toolbar creates objects and opens **Project tasks**: **Frames** opens the outline, with layers on its second tab, **Live task view** sits with the tasks, and **Insert** opens beside the toolbar with live notes, templates and bulk notes. **Connections** opens from the selection toolbar, and **Boards** also imports an Obsidian .canvas or a Miro board. The right side holds **Session** (Present and Board session), **Version history** (Activity, History and Local checkpoints), the bookmark star and **Board tools** (⋯: Rename, Copy board link, Link tasks, exports, the offline pad and Delete board). **Board appearance**, at the foot of the left toolbar, holds snapping, the background and the dependency arrow style. Project settings and New task remain beside the view tabs. Expanding a task card opens the same compact, nonmodal side editor as New task; editing keeps the board camera unchanged and retains subtasks, header actions, comments and version history. **Full screen** hides the surrounding workspace and, where the browser allows it, the browser chrome.

Open **Project tasks → New draft task** to prepare a board-only task, including its description, priority, assignee and proposed subtasks. Priority and assignee can also be changed directly on draft cards; these changes save automatically and carry over when finalised. Drafts have a dashed border, their card type icon and a Draft badge, and no project ID. The type menu can turn a draft back into a Note; its task details are retained for converting it back later. Project task cards show their task-type icon before the title. Converting a Note to a Task creates a draft with a title from the note and a blank description, keeping its comments and connections. Converting an existing draft to a Note and back preserves its description. The **Finalise task** icon sits immediately left of Comments in the card header and creates the project task and its subtasks in place, preserving the card’s position, appearance, comments and connections. Undo returns the card to a draft without deleting the project records; finalising it again reuses them.

Board arrows can represent task dependencies: connect two project task cards, select the arrow, then choose **Task dependency → Make dependency**. A → B means A must finish before B. Existing arrows reflect relationships edited in task details, and cycles are prevented. Use **Remove dependency** to unlink tasks; deleting or reconnecting a visual arrow leaves existing task dependencies intact. Drafts must be finalised before their arrows can create dependencies. Set their shared colour, stroke, thickness and arrowhead in **Board appearance → Dependency arrow style**; changes apply immediately to that board and its exports, with Ctrl/⌘ Z to undo and Reset to restore defaults. Existing project styles remain the starting appearance until a board chooses its own style. Dependency arrows also have a toolbar shortcut to these settings.

Drag the sticky-note icon from the left toolbar onto the canvas to place a note. A preview follows the pointer; releasing on the canvas creates the note and opens its editor. Escape or dropping outside the canvas cancels. Clicking the tool then clicking the canvas still works.

Selected objects have a compact icon toolbar above them, grouped into appearance, comments, arrangement and object actions. Bring to front, Send to back and Delete are directly on the main toolbar. Colour, alignment/grouping and type-specific extra actions open small menus. Controls adapt to the selection, support keyboard navigation and respect locked objects.

For multiple selected objects, **Filter** shows the count of each object type. Click **Only** to keep one type, or tick several types and **Apply**. Tasks displayed as notes appear under Notes; linked Markdown files appear under Live notes. **Restore all** returns to the original selection until you make a new manual selection. Filtering changes only the selection, so colour, alignment, dragging, duplication and deletion affect the chosen objects. When filtered frames move, excluded contents stay put. Locked objects retain their protection.

**Board appearance** opens a popover beside the toolbar for grid snapping, nearby-object alignment, background/pattern colours, Plain/Dots/Grid/Fine grid/Lines and visual spacing (**Board tools → Rename** names the board). Fine grid combines small squares with a stronger line every five squares. Changes apply automatically; use Ctrl/Cmd+Z to undo or Ctrl/Cmd+Shift+Z to redo. Reset beside the close button restores theme-aware defaults. Snapping and background are saved in each board’s `.canvas` file. Pattern and minimap visibility, set in the zoom level's menu or with G and M, are remembered per board in this browser.

Each project can have multiple named canvases. The board includes eight connected capabilities:

1. **Direct editing:** double-click text or a note to edit Markdown or rich text inline; click outside the component to save automatically. **Ctrl/Cmd+Enter** or **Escape** also finishes editing; use **Undo** to revert saved text. A contextual toolbar offers editing, comments, focus, appearance, framing, alignment, duplication, grouping and locking. Drag connection handles from any side of a selected object.
2. **Live notes:** task cards share the original task status and Markdown. **Live note** embeds any Markdown file in the current project. Existing saved heading/block references remain readable, and editing them preserves the rest of the source note. `![[Task#Heading]]` and block transclusions render loaded task content, with bounded nesting.
3. **Native Obsidian files:** boards are saved directly as `.canvas` using [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/). Open the same file in Obsidian; changes appear when idle browsers refresh. Standard positions, note content, file paths, subpaths, colors, groups and connector endpoints round-trip. Unknown extensions are retained. Import/export also supports native `.canvas` files.
4. **Meaningful connectors:** select a line to open its floating toolbar. Shift/Ctrl/Command-click toggles arrows and objects in a mixed selection; selection boxes and Select all include arrows. Use Filter → Arrows to style several connectors together, copy/duplicate them or delete them without removing the connected cards. Route, Stroke and Thickness are directly on the toolbar. Use its remaining controls for colour, label, attachment sides and relationship. Start and end styles are independent: none, open arrow, filled triangle, filled/open circle, filled/open diamond or bar. Double-click a line to edit its label; Enter or clicking outside saves it. Changes save automatically and support Undo. SVG/PNG exports preserve the styles. JSON Canvas uses standard arrow endpoints for Obsidian, with richer shapes preserved in the Pencils extension. A **blocks** relationship can explicitly create a real task prerequisite; cycles are rejected. Deleting or reconnecting a visual connector leaves existing task prerequisites intact. Drag a side handle for a live curved preview; nearby objects reveal ports and highlight the snapped target. Ctrl/Cmd temporarily bypasses snapping. Select a line and drag either endpoint to reconnect it, preserving its label, colour and routing. Escape, a lost pointer or a drop on empty space cancels the drag. Snapping uses screen-pixel thresholds so it stays usable while zoomed out.
5. **Structured frames:** nest frames through **Style / frame** or spatial containment, collapse/expand them, navigate the outline, and reorder presentation slides. Moving a frame moves its contents. Start with brainstorm, retrospective or roadmap templates; save a selection as a reusable template in that canvas. **Present** steps through frames with arrow keys and exits with Escape.
6. **Task planning:** overdue and blocked cards are highlighted. Filter by owner/status, convert a sticky into a real task while retaining its connectors/comments, or embed a **Live task view**. View cards follow a named project view or their own filters, showing up to 100 matching tasks.
7. **LAN collaboration:** participants see each other’s names, cursors and selected objects. Object comments open in a compact nonmodal chat panel beside the object, with a scrollable thread, replies, deletion and five emoji reactions (👍 ❤️ 😂 🎉 👀). Independent changes merge; overlapping changes stay in Recovery for an explicit choice. Each save commits an operation log together with the board. **Activity** and keyboard undo/redo check affected values before changing them. Save retries reuse the original operation ID, including when an acknowledgement is lost. Each browser tab keeps its own pending queue.
8. **Large boards and tablets:** search and jump to objects, navigate the minimap, use **Shift+2** to focus a selection, and pan/zoom with two fingers. Pen drawing stores pressure samples. Offscreen cards are culled; broad overviews use a bitmap so detailed DOM remains bounded.

**One-time Miro import:** open the sidebar's **New board → Import from Miro**, connect, and paste a Miro board link or choose from the first 50 accessible boards. Load the board to preview its layout and conversion report. Import the whole board or select frames (including nested contents), choose draft cards or project tasks, and match Miro assignees to people in the project's teams. Choose a task type and status; imported cards default to Medium priority because the standard REST card response does not supply priority or task status. Available due dates and descriptions are copied. Changes to options require **Update preview** before **Import**.

The importer copies sticky notes, rich text, supported shapes, frames, connectors, accessible images/GIFs and supported documents into ordinary `.canvas` objects and local attachments. Embeds become links. Unreadable or unsupported items returned by Miro become labelled links at their original positions. The report lists approximations and omitted connectors; Miro may not return some unsupported items at all. Comments, native tables/grids, freehand strokes, live queries and Pencils project-frame behaviour are not imported. Use separate CSV/image exports for content unavailable through Miro's API. Fonts, transparency and connector routing may differ. Visual connectors do not automatically create task dependencies.

Choose **New board** or **Current canvas**. Existing-canvas imports preserve local changes to previously imported objects and add only new source objects; they never refresh or overwrite an earlier import. A changed destination requires a new preview. Imported task cards are local Markdown tasks, with no source-owned fields or background sync. A failed commit rolls back new tasks, attachments and canvas changes together. Retrying a completed preview does not duplicate its import. Previews last 30 minutes; the server retains tokens only in memory and clears the current connection after import or disconnect.

For **Connect Miro**, create a Miro OAuth app with only `boards:read`, register the exact callback `${APP_ORIGIN}/api/miro-callback`, and set `MIRO_CLIENT_ID`, `MIRO_CLIENT_SECRET` and `APP_ORIGIN` on the server. Use HTTPS or a localhost callback; Docker Compose passes these variables through. Alternatively, **Use an access token** accepts a temporary token from a Miro app with `boards:read` and access to the source board, without OAuth server configuration. Both options require `AUTH_MODE=local`, `AUTH_MODE=single-user` or a signed-in account with project write access in required mode. The import makes no changes in Miro. Large reads can hit Miro's rate limits; the error gives a retry delay. Each preview supports up to 9,500 source objects, 19,000 connectors and 50 MB of media, with a 10 MB limit per file; canvas storage limits still apply.

**Grid titles:** double-click the title in a grid’s top bar, or click its pencil button, to rename it in place. Click outside or press Enter to save; Undo restores the previous title. The title is included above the Markdown table in Obsidian Canvas exports. Drag the top bar to move the grid.

**Frames:** press **F** or choose the frame tool, then drag around content; click to place a 16:9 frame. Click any empty space inside a frame to select it, including frames without a title. Click an object inside it to select that object instead. Drag a frame's title or border to move it and its contents. Drag empty space inside a frame to select objects. Objects attach/detach as you move them between frames. Resizing and size presets change only the frame, preserving content positions and sizes.

The frame toolbar provides **Rename**, **Size presets** (16:9, 4:3, square, portrait and A4), **Fit frame to contents**, **Select frame contents**, **Collapse/expand** and **Present from this frame**. Delete removes the frame and keeps the contents; Undo restores it. Copying or duplicating a frame includes nested objects and internal connectors, preserving linked task data.

Open **Frames** in the left toolbar for frames and presentation order. Drag top-level rows or use the arrow buttons; **Order by position** sorts top-to-bottom, then left-to-right. Nested frames remain navigable but aren't separate slides. Presenting temporarily reveals collapsed contents without changing the saved collapse state. Frame data and nesting stay in the Markdown vault's native `.canvas` files.

**Text alignment** is available in both the selection and editing toolbars: left, centre, right and justified. It applies across an object, including task titles and bodies, notes, shapes, frame titles and captions. Multi-selection applies it to unlocked objects. Alignment is saved in the board’s Pencils extension, preserves linked Markdown, supports undo and survives native `.canvas` round trips. Obsidian retains this metadata but may use its own text layout. Exported text uses the saved alignment.

Clicking empty board space deselects objects and connectors, including their handles. Background taps and clicks with the hand tool also clear selection; panning keeps the selection.

Click **Task** or **Note** at the left of the selection toolbar to switch presentation. A new note becomes a task with its full Markdown body; comments, grouping, colour and connections stay attached. Switching a task to a note gives it the same appearance as a sticky note, hiding task controls and metadata while keeping its original task file linked. Editing its title/body updates that same task. Switching back restores its task controls without creating duplicates. The task remains in List, Table and other task views. Undo can restore the earlier board presentation.

Open the **Search board** icon in the left toolbar (or **Ctrl/Cmd+F**) to find objects and filter by owner or status. The panel closes with Escape or an outside click; a dot on the icon indicates active filters.

Pan with **Space+drag**, the hand tool, right/middle mouse button or **Shift+scroll**. Zoom with **scroll**, **Ctrl/Cmd+wheel** or pinch. Wheel and keyboard zoom ease smoothly around the pointer (or the board centre for the keyboard), with gentler scroll sensitivity. Undo, redo and the view controls sit at the foot of the left toolbar, fixed while the tools above them scroll (phones keep the capacity and zoom level in the bottom dock, and undo/redo, full screen and Board appearance under its +; the capacity gauge shows only once the board passes 80% of its object or frame limit). The view controls show the board's capacity, the zoom level, the full-screen toggle and **Board appearance**. The zoom level opens a menu with **Fit board** (Alt+1, or double-click the zoom level), **100%** (Ctrl/Cmd+0), **Minimap** (M) and **Background pattern** (G). Reduced-motion preferences disable the animation. **Shift-click** and a drag on empty canvas select multiple objects. **Ctrl/Cmd+A**, **D**, **C/V** select, duplicate and copy/paste objects. Pasted and duplicated items become the active selection and receive keyboard focus without moving or zooming the camera. **Board appearance → Align with nearby objects** enables nearby-object snapping independently of **Snap to grid**. While dragging, magenta guides mark matching edges and centres; dimension guides show equal gaps. Groups move as one selection without changing their internal spacing. Guides appear only near a match and use a consistent screen-distance threshold at every zoom. Hold Alt during a drag to bypass both alignment and grid snapping (Alt at the start still duplicates). Escape cancels the drag. Grid snapping uses a 20-pixel grid. Both snapping settings are saved per board in its `.canvas` file and survive refreshes, server restarts and opening from another device. Grid visibility, minimap visibility and expanded view are remembered per board in this browser, alongside its pan and zoom. Browser full screen still requires a user gesture. Export a whole board as SVG or PNG for sharing.

Collaboration uses the local server, with presence updates approximately every 800 ms and inactive participants expiring after 15 seconds. It does not perform character-by-character coauthoring: competing edits to the same text are shown as conflicts. Comments, drawing pressure, queries, nested-frame settings, templates and activity are Pencils extensions; Obsidian retains their data but does not provide the corresponding Pencils interface. References outside the current project remain intact for Obsidian, but Pencils does not read their content. Links open on demand; external web pages are not fetched into the offline board.

The recent operation log retains up to 200 operations (approximately 2 MB, or one larger operation). Older logs remain in file history. Keyboard undo/redo belongs to the current browser tab; **Activity** provides guarded undo after a restart or from another device. Full-file restoration is available through **History**.

## Markdown and Obsidian

**Documents**, between Overview and Planning, provides a project document explorer and a Markdown-native editor. **Live preview** formats Markdown around the active line. Edit callout titles/content, table cells, quotes and code directly in their rendered components; tables also have Add row and Add column controls, and **Table options** inserts, moves, aligns and deletes rows and columns at the cell you're in, and copies the table as CSV. Insert → Table starts an empty table with the caret in its first cell. In a cell, Enter moves down a row (adding one after the last; Shift+Enter starts a new line), Tab past the last cell adds a row, and the arrow keys cross cells at their edges. Cells copied from a spreadsheet paste into a table from the cell you're in, adding rows and columns, or become a new table when pasted into the text. Tables keep escaped pipes (`\|`, as in `[[Note\|alias]]`) and the cells you didn't edit as written. Math and diagrams have inline formula/code fields. Component edits autosave to Markdown without exposing the section's Markdown syntax. **Source** shows the complete Markdown with syntax highlighting and line numbers. **Reading** displays the formatted document. Switching views does not rewrite the source or clear undo history. Ctrl/⌘ E switches Live preview/Source, Ctrl/⌘ B and I format the selection, and Ctrl/⌘ F opens search in the current view. Tab indents, lists continue on Enter, and the gutter folds headings and code. Cards link to documents from the **Documents** section of the card editor, and a document lists the cards that link to it.

A ```` ```tasks ```` block (Insert → Task query) lists the project's matching cards live, with Obsidian Tasks instructions such as `not done`, `due before tomorrow`, `assignee is me`, `sort by priority` and `limit 10`; tick a row to complete its card.

Documents in a folder named **Templates** start new documents from **New → From template**, as in Obsidian's Templates plugin: `{{title}}`, `{{date}}`, `{{time}}` (also with a format, such as `{{date:D MMMM YYYY}}`), `{{project}}`, `{{prompt:Question}}` (asked when you create the document) and `{{cursor}}` (where the caret starts) are filled in. Templates are plain text; nothing in them runs.

Like Obsidian, the document bar holds only the formatting (behind **Show formatting** on phones), a **Reading view** toggle (back to Live preview or Source, whichever you used last), the bookmark star and **⋯** (**Document tools**). Document tools is one list, split by dividers: the views (Live preview, Source, Reading); split, width and the outline; Undo, Redo and Find; Rename, Move to folder and Add property; Page versions, **Backlinks and mentions** and **Comments**; Export Markdown and Obsidian; and Delete. Properties show above the text once a document has some. On iPad and desktop, documents you open stay as tabs in the top bar, in the title's place and type. **Document tools → Split side by side** (or **Split top and bottom**) shows a second document, chosen from the pane's list, with its own Live preview, Source or Reading view; **Swap documents** exchanges the two. Properties, comments and Insert belong to the main pane. Tabs and the split are remembered per project in this browser; phones show one document at a time.

Choose **Insert → Sketch** (or `/sketch`) to draw with a pen, a finger or the mouse in a pad over the document, full screen on phones. Saving adds `![[attachments/s-….svg]]`, an SVG that Obsidian shows, beside a `.json` file with the strokes; tapping the sketch reopens it, and each save makes a new pair. The pad keeps an unsaved sketch until you save it or reload.

Select words and choose **Insert → Comment on text** (or `/comment`) to discuss them in the shared comments panel; the words stay highlighted in Live preview and Source, and **Document tools → Comments** lists every thread, including detached ones whose words were removed. Threads live in the document's `comments` frontmatter with the quote and a little context, so the Markdown body is untouched.

**Properties**, at the top of a document, edits its frontmatter as Obsidian does: tags, plus text, number, date, checkbox and list properties. Pencils' own keys (`id`, `title`, `folder`, `version` and the like) are reserved, and values of other kinds, such as nested ones, are kept but not shown. `#tag` in **Find a document** matches tags from properties or from the text.

**Search** (the magnifier after the view tabs, or Ctrl/⌘ K outside a document) ranks cards, documents and board text from every project you can open in one list, in the manner of Obsidian's Omnisearch: titles weigh most, then headings, tags and text; words match as prefixes and ignore accents; results show highlighted excerpts. Use `"a phrase"`, `-word`, `#tag` and `in:cards|docs|boards`; when nothing matches it suggests a close spelling. Enter opens a result, and Alt+Enter inserts a `[[link]]` to it into the open document. Inside a document, Ctrl/⌘ K inserts a Markdown link instead. Its field takes focus at once, so phones open the keyboard; there Search is a compact sheet like Obsidian's, with one-line results above the field at the bottom, and its ✕ clears the text or closes the sheet.

**Bookmarks** keep the things you return to at the top of Search. The star beside a card's ID in the card editor, in the document bar, beside the board name and after a view's filters (List, Tree, Table, Kanban, Calendar, Timeline or Capacity; in View options on phones) bookmarks that card, document, board or view; press it again to remove it. Search lists your bookmarks first: all of them before you type, the matching ones as you do. Bookmarks belong to your account (up to 200, kept on the server in `.pencils/bookmarks.json`), show their current names, and leave out anything deleted or no longer open to you.

**Personal**, at the top of the sidebar, is your own space for documents outside every project. Only your account can open it in Pencils, administrators included. Its Markdown files still sit in the vault (`Projects/<id>/`), so anyone with access to the server's files or backups can read them. **Today** (sidebar, or Ctrl/⌘ K) opens or makes today's note (`YYYY-MM-DD`) in its Daily folder, using a "Daily" template when there is one. Task queries in the personal space list cards from every project you can open.

Use **Style**, the formatting buttons or **Insert** for headings, lists, checklists, quotes, code blocks, tables, callouts, footnotes, highlights, math and Mermaid diagrams. Live-preview checkboxes update their Markdown markers. List callouts (`- ! item`, `- ? item`, and `&`, `~`, `@`, `$`, `%`, as in Obsidian's List Callouts plugin) tint the item and show an icon; type `/` and the callout's name to add one. Comments (`%%…%%`) stay in the source and are hidden in Reading. HTML is sanitised; executable scripts and remote image requests are excluded. Unknown plugin syntax stays intact in the source. **Document outline** jumps to headings; **Document tools** contains backlinks, unlinked mentions (with **Link**), undo/redo, export and Obsidian settings. A card's Documents section lists the documents that mention its key. Type `[[` to choose another project document or a card: generated links use stable vault paths with readable labels, and `[[WEB-12]]` shows the card as a chip that opens it. **Card from text** (Insert or `/card`) turns the selection or the current line into a card linked to the document. `![[…]]` embeds a document, heading or block, with bounded nesting. Duplicate document titles require a stable path. Attach local files through **Insert → Attach file**, or drop them onto the editor. Images render inline; other files open from their links.

**Document tools → Open in Obsidian** opens the same Markdown file in the installed Obsidian app. On first use, enter the vault name as shown in Obsidian. If Pencils' data directory is a subfolder of that vault, enter its relative folder too. These settings are saved only in this browser. The vault must be accessible to Obsidian on the device opening the link; a browser connection to Pencils does not copy or sync the server's files. Pending edits must finish saving before opening. Obsidian's plugins run in Obsidian, not in the Pencils browser editor; desktop-only plugins still require Obsidian desktop.

Search titles or content, create notes and import/export `.md` files. Edits save automatically; pending offline edits stay in this browser, and conflicting edits can be reviewed in Recovery. Deleted documents go to Trash. On narrow screens, **Browse documents** switches between the explorer and editor.

Open `VAULT_PATH` as an Obsidian vault:

```text
vault/
  Organisations/o-….md
  Projects/p-…/
    project.md
    identity.md              reserved task numbers and next sequence
    tasks/t-….md
    documents/d-….md           project documents with Markdown content
    boards/b-….canvas
    notes/… .md               optional ordinary project notes
    attachments/a-….*
  .history/                  previous note versions
  .trash/                    recoverable removed records
  .backups/                  ZIP snapshots of Projects/ and Organisations/
  .pencils/accounts.json     optional password hashes and access rules
  .pencils/legacy-boards/     exact sources retained during canvas migration
```

Tasks have YAML properties and a normal Markdown body. Titles are also stored as Obsidian aliases. Keep identifiers, paths and project references intact. Unknown frontmatter and YAML comments are preserved when editing existing notes in Pencils. **Import notes** copies selected `.md` files into new task notes, preserving body text and foreign properties except reserved Pencils properties; it does not modify the originals.

The preview supports GFM Markdown, tables, fenced code, task lists, wiki links and local attachment images. Raw HTML is displayed as text and output is sanitized. Remote images are displayed as a text reference rather than fetched, so opening notes never requires internet access. Cross-project wiki links resolve when those tasks have been loaded by global search or the overview; Obsidian plugins are not executed. Heading and paragraph/list block references are supported in live cards; advanced plugin-specific Markdown syntax is preserved as source.

Existing Markdown/YAML boards migrate automatically on startup. Their exact original files are retained under `.pencils/legacy-boards/`, and identifiers and task links stay stable. Take a vault backup before upgrading.

Filesystem notifications refresh idle browsers when notes change externally. Only live project/organisation folders are watched; if the operating system runs out of watchers, the server falls back to five-second polling without stopping writes. A rebuildable in-memory parse index avoids reparsing unchanged notes; file timestamps and revisions are still checked before writes. Task views render pages of 100 items; timeline displays up to 200 dated tasks. The server still returns a project snapshot, so very large vaults may need more indexing/pagination work. Boards support 100,000 objects, 200,000 connectors and 10,000 frames, within a 128 MB board API request limit. Native Canvas file imports are limited to 64 MB. Dense/zoomed-out boards use a lightweight overview; selected objects retain editable detail. Single-object saves send guarded deltas, but initial loading and durable vault snapshots still scale with total board size. See [measured capacity and limitations](reports/2026-10-21-board-100k.md). Attachments support PNG/JPEG/GIF/WebP, PDF, text, Markdown, CSV and ZIP up to 10 MB.

## Recovery and concurrent editing

- **History:** before a note is overwritten by the app, its previous exact contents are retained. Task/project/board history can restore a version while retaining the displaced version. External edits are captured when the app next replaces that note; this is not a complete filesystem audit log.
- **Trash:** tasks, boards and projects can be restored in the app. Removing a task with children or dependants is rejected to avoid dangling relationships. A restored task may need relationship repairs if its related tasks were subsequently removed.
- **Backups:** before the first app mutation each day, a ZIP backup of `Projects/` and `Organisations/` is created. Manual backups, downloads, binary upload and verification of backup ZIPs up to 220 MB, and full restore are available. Restore first backs up the current state and rolls back directory replacement if an I/O operation fails. Restore supports archives up to 200 MB uncompressed / 30,000 files.
- **Browser drafts:** task, project and organisation editor drafts are retained locally and offered when that editor is reopened. Task, live-note and canvas save queues survive reload and retry connectivity failures. Clearing browser storage removes these drafts; the app must already be loaded to keep editing during a server interruption.
- **Conflicts:** independent fields and independent board objects are merged automatically. If both writers change the same value, Recovery shows both versions and lets you choose which conflicting values to keep, while preserving independent changes. Drafts can be exported before discarding them.

Backups do not include `.history`, `.trash`, account credentials or unrelated folders in an existing Obsidian vault. Copy the entire vault separately if you need those, and keep an off-device backup: backups on the same disk cannot protect against disk failure. Backups and history are retained until the administrator removes them from the filesystem, so monitor disk use. While restoring, pause external Obsidian edits; application mutations are serialized, but external editors cannot participate in that queue. Board operations are stored atomically in the native canvas; Activity exposes that durable history. External editors cannot participate in the application writer queue, so avoid simultaneous filesystem writes to the same file while a restore is running.

### Complete installation recovery

Project ZIPs are portable project-data snapshots, not installation backups. Use **Verify** in Recovery before restoring a downloaded ZIP. Supported project snapshots contain at most 200 MB expanded data and 30,000 files; archives can be up to 220 MB. An over-limit automatic backup stops the edit with an error instead of falsely claiming the edit was protected. Large vaults need an installation backup plan before reaching that limit.

For an installation backup, stop Pencils and pause every Obsidian/sync writer, then copy the **entire** `VAULT_PATH`, including hidden directories (`.history`, `.trash`, `.pencils` and account storage), plus the deployment `.env`, compose/service configuration and any external TLS certificates or credentials. Preserve file ownership and permissions. Encrypt backups containing credentials. Keep at least one copy on another device; a reasonable starting retention is seven daily and four weekly copies, adjusted to available disk space.

Practice recovery into a separate directory and an isolated server instance before relying on a backup. Restore the matching application version and configuration, point `VAULT_PATH` at that directory, keep cloud/sync processes disabled, and start on a different loopback port. Sign in, verify organisation access, open a representative project, task, attachment and board, inspect history/trash, then make and reopen a test edit. Record the backup date, application version and result. Only switch the real deployment after the drill succeeds; retain the original vault until verification is complete. Do not run the restored instance against the production source folders.


## Optional accounts and remote access

For single-user use on this computer or a trusted local network, set `AUTH_MODE=local` and `LOCAL_USER_NAME=George` in `.env`, then recreate the service with `docker compose up -d --no-build --force-recreate pencils`. Loopback and private-network connections automatically use George with administrator access, including source connections and background sync. Settings shows the name and role; no password or Sign out action is needed in this mode. Existing password accounts remain unchanged. The local identity is defined by these server settings and stops being available if you change the mode or name. Keep its name stable while it owns sources or automations.

Local mode trusts the socket peer address, including Docker bridge/private LAN addresses; it ignores browser-supplied forwarding headers. Public peers still require a password account. Use `AUTH_MODE=required` behind a public reverse proxy, since the proxy itself may connect from a private address.

For a personal installation without any login screen, set `AUTH_MODE=single-user` and keep `LOCAL_USER_NAME=George`, then recreate the service. Every connection, including Tailscale, automatically uses that administrator identity. Integrations, source ownership and background sync remain available. Anyone who can reach the server has full workspace access in this mode; use network access controls for the installation. Existing password accounts are preserved, so setting `AUTH_MODE=required` restores password-based access.

Default `AUTH_MODE=shared` permits every device reaching the server to read and edit the workspace. This matches a trusted LAN deployment. For restricted access, first create an administrator (password is read from standard input):

```bash
read -rs -p 'Admin password (12+ characters): ' PENCILS_ADMIN_PASSWORD
printf '\n'
printf '%s' "$PENCILS_ADMIN_PASSWORD" | docker compose exec -T pencils node server/account.js admin
unset PENCILS_ADMIN_PASSWORD
```

Then set `AUTH_MODE=required` in `.env` and restart with `docker compose up -d`. Use **Accounts & access** to create or update users. Administrators access all organisations and recovery tools; each other account can be an editor, viewer or have no access to each organisation. Changing an account invalidates its existing sessions. Sessions use HttpOnly, SameSite cookies, expire after 12 hours, and end on server restart. Passwords are stored as salted scrypt hashes; login attempts are rate-limited.

Capture tokens (Settings → You → Capture from your phone) are the only credential accepted without a session. Each one can only add cards to its project, acts as the person who made it (their edit access is checked on every capture), is stored as a SHA-256 hash in `.pencils/capture-tokens.json`, and shares a limit of 30 captures a minute per address. A token travels with each request, so use HTTPS or a VPN such as Tailscale when capturing away from the local network.

For native HTTPS, provide a certificate trusted by the client devices and its key in `.env`:

```dotenv
TLS_CERT_FILE=/absolute/path/fullchain.pem
TLS_KEY_FILE=/absolute/path/privkey.pem
```

```bash
docker compose -f compose.yaml -f compose.https.yaml up -d
```

This override requires authentication, mounts the certificate files read-only and serves **https://SERVER-IP:3000** (use the certificate's hostname if applicable). The container user must be able to read the private key. A trusted reverse proxy or VPN is another deployment option; set `COOKIE_SECURE=true` when using HTTPS through a proxy and preserve the original Host header. Public DNS, certificate issuance, firewall/router changes and internet exposure are deployment choices and are not performed automatically.

## Offline transfer and local development

On a machine that can build the image:

```bash
docker compose build
docker save pencils:local -o pencils-image.tar
```

Transfer the image archive, `compose.yaml`, `.env` and your vault to the offline host:

```bash
docker load -i pencils-image.tar
docker compose up -d --no-build
```

Without Docker, use Node 22.12 or newer:

```bash
npm ci
npm start
```

`VAULT_PATH`, `HOST` and `PORT` configure the local server. Runtime dependencies are served locally from `node_modules`; no browser CDN is used.

For a production Node installation, run `npm run build` before `NODE_ENV=production npm start`. Docker builds these assets automatically. Production uses content-hashed JavaScript chunks, one minified stylesheet and negotiated Brotli/gzip compression; the HTML is revalidated so updates pick up the new asset names. Board/drawing and Documents controllers load on first use. Keep the previous hashed assets when updating a running Node installation so already-open pages can finish loading their matching chunks. The separate prepared offline drawing shell remains locally available.

## Backend structure and capacity

The HTTP layer uses Fastify and TypeScript in `server/http/`, with routes grouped by domain. Task, document and board services remain JavaScript in `server/services/`; `server/store.js` owns vault access and transactional writes. `npm run build:server` compiles the HTTP modules, and `npm run typecheck` checks them. Normal installation, development, tests and production builds include the compilation step.

Markdown and `.canvas` files remain authoritative. Search and table queries use a rebuildable SQLite index in a worker thread. Task edits update affected rows incrementally. Provider network requests run outside the vault writer queue; applying fetched changes remains transactional.

See the [backend and board performance assessment](reports/2026-10-20-backend-board-performance.md) for the 100-session load test, board measurements, current limits and prioritized renderer improvements. The application uses one writer process per vault.

## Validation

```bash
npx playwright install chromium firefox webkit
npm run test:release

# During development
npm run check                       # syntax and types, about 2 seconds
npm test                            # unit tests, about 2 seconds
npm run e2e                         # every browser test in Chromium, in parallel (a few minutes)
npm run e2e -- e2e/board            # a folder or file;  -- -g "drawer"  for matching titles
npx playwright show-trace test-results/…/trace.zip   # step through a failed test

# Release the working tree to the running container (see AGENTS.md › Deployment)
npm run release -- patch
```

Browser tests are Playwright Test specs in `e2e/<area>/` (see `e2e/README.md`). Each file starts its own server and temporary vault; failures are retried once and reported as flaky, with a trace. Audits run with `npx playwright test --project=audit`, and the offline Docker image check with `--project=docker` (it changes host networking, so it never runs alongside the other tests). `npm run test:release` adds the `@gate` tests in Firefox and WebKit (`GATE_BROWSERS=firefox` limits it to installed engines).

`npm run release` refuses to start unless `CHANGELOG.md` has the changes under `## Unreleased`. It runs the checks and unit tests, sets the version in `package.json`, `package-lock.json` and `public/app-version.js`, dates the changelog entry (Europe/London), builds the image, tags the running image `pencils:rollback-before-<version>`, recreates the container with its existing settings and waits for `/api/health` to report the new version. If the new version does not become healthy, it restores the previous image. Afterwards it tags `pencils:release-<version>`.

Tests use temporary vaults. They cover Markdown persistence/migration, file revisions, safe paths, UTF-8 request chunking, backup/history/trash restore, workflow validation, recurrence, three-way merge, organisation permissions, browser editing, range paste, offline save recovery, canvas manipulation/export and mobile layout. `e2e/platform/offline.spec.mjs` builds the image and verifies it in containers without any network.

Board navigation uses **scroll to zoom at the pointer** and **Shift + scroll to pan vertically**. Pinch and Ctrl/Command-wheel also zoom. Right-drag, middle-drag and Space-drag pan while preserving selection. V selects, H pans, N/T/S select click-to-place sticky/text/shape tools, L connects and P draws. Ctrl/Command-click adds or removes a selection; Alt/Option-drag duplicates. F1 opens the shortcut reference. Native touch pan/pinch and pressure-sensitive pen input remain available.

**Full screen** fills the browser window and also hides browser chrome where supported (not on iPhone). Escape or the same toggle returns to the normal view (first closing an active editor or presentation). Card actions float above the selection, or below it when there is not enough room above.

Double-click a text object, sticky, task or note to edit its text directly on the existing surface, with rich text enabled by default. Frame titles, shape labels, image/drawing captions and link labels also edit in place. Formatting controls float in a compact icon bar matching the selection toolbar. Clicking outside saves automatically; toolbar interactions keep the editor open. Undo/Redo restores saved edits, including linked task and note text in this browser tab. Undo refuses to overwrite newer changes to linked text. The Text style menu contains paragraphs, headings, quotes and numbered lists; bullet lists, bold, italic, strikethrough, links, Markdown and preview are directly accessible. Type **- then Space** at the start of a paragraph to turn it into a bullet immediately; **\* then Space** and **+ then Space** work too. The shortcut also converts existing text when typed at its beginning. Code, existing list items, plain labels and Markdown source mode stay literal. Click **Bullet list** to start or toggle bullets. Enter adds the next point; Enter on an empty point ends the list. Bullets save as ordinary Markdown and remain editable in Obsidian. Tooltips name each action, formatting buttons reflect the selected text, and Escape closes an open menu before finishing the edit. Controls stay outside the object; its size, colour and typography stay the same. Rich text supports bold, italic, strikethrough, headings, lists, quotes and links. **Markdown** exposes the source. **Preview** renders the current draft without saving; **Back to edit** returns to the previous editor mode. Visual edits are converted to Markdown for Obsidian; conversion may normalize Markdown formatting. Wiki links and local attachment references are preserved. Pasted content is inserted as plain text. Notes and other labelled objects show muted italic placeholders that are not stored as content. Empty frames show no label. Finishing an empty text object removes it and its connectors; Undo restores them.

Notes, text, task/story cards and other text-based board objects share 16 px inner padding, unchanged during editing. Image and drawing captions use the same horizontal inset.

Each object type has a minimum resize size. Long contents stay inside the object and show an ellipsis when clipped; editing allows scrolling through the full text. Hold **Shift while dragging the corner handle** to resize only horizontally or vertically: the first dominant movement chooses the axis. Release Shift to resize both dimensions again. With **Align with nearby objects** enabled, resizing also snaps to nearby widths and heights; paired W/H dimension guides show the matching size. Hold **Alt** to resize freely.

The board performance test uses a temporary 5,000-object / 2,000-connector board with live task cards and drawings. Regression budgets are under 6 seconds from navigation to a usable board, fewer than 700 detailed DOM cards, and under 150 ms at the 95th percentile for a two-frame pan measurement. One local Chromium run measured **342 ms initial load**, **24 detailed cards**, and **35 ms pan p95**; hardware and network affect those numbers. The same test exercises real browser touch and pen events, including pinch zoom and pressure persistence.

### Board grids

Use **Add grid** in the left board toolbar, then click the canvas to place a 3 × 3 grid. Click to select it; double-click a cell (or select a cell and press Enter) to edit rich text in place. Clicking outside saves. Arrow keys and Tab move between selected cells. Drag the slim top strip to move the whole grid, any corner to resize it, or an internal cell boundary to resize that row/column without squeezing its neighbour. Drag an outer edge to resize all rows or columns proportionally. To resize the final row/column alone, drag the end of its numbered/lettered handle. Hover highlights the border; dimensions appear while dragging. Contained objects set a minimum cell size. Escape cancels; Undo restores the entire resize.

The floating toolbar provides Rows/Columns menus to add, move and delete tracks; the shared colour and alignment controls apply to the selected cell. Paste tab-separated spreadsheet cells into a selected cell to expand the grid automatically. Grids support up to 30 rows × 30 columns and 6,000 characters per cell (200,000 Markdown characters per grid). CSV export is in the same toolbar, and normal board duplication, undo, connectors and image export work with grids.

Grids are stored in the board’s `.canvas` file with a Markdown table fallback for Obsidian. If you edit that fallback in another application, Pencils preserves your edited text as a text object rather than replacing it with stale grid data. Cells support rich text, contained board objects and rectangular merge/unmerge.

### Pen and highlighter

Choose **Pen** from the left board toolbar or **+ Add → Pen**, or press **P**. Drag to draw over the board, hold **Shift** for a straight stroke, or click for a dot. The compact toolbar offers Pen, Highlighter, colour, thickness and stylus pressure controls. Three personal presets remember their settings in this browser. Click a preset to use it; changing the controls updates that preset.

Press **E** or choose Eraser to swipe across drawings. The double-tap and pen side-button gestures (Pen settings) switch between pen and eraser only while a drawing tool is open, so double-tapping the board otherwise leaves the pen tools closed. By default it removes entire strokes; enable Partial eraser to cut only touched sections. It leaves other objects and locked drawings untouched; one Undo restores an entire erase gesture. Escape cancels the current gesture, and **V** returns to selection. With a touchscreen, two-finger gestures pan/zoom and cancel a stroke in progress. When a drawing is selected, its toolbar lets you change ink colour or thickness, lock it, duplicate it, or delete it.

Drawings and their pressure/style data persist in the board’s local Canvas file. SVG/PNG exports retain the stroke styling. Enable Recognise shapes for simple line, rectangle and ellipse recognition; Lasso selects enclosed object centres; Partial eraser removes portions of ink.

### Grid selection and containers

Click or drag across cells to select them. **Shift-click** and **Shift + arrows** extend a rectangle; **Ctrl/Command-click** toggles individual cells, and **Ctrl/Command+A** selects every cell when a cell has focus. Cell colour and text alignment apply to all selected cells. Copy/cut uses tab-separated text; Delete clears selected cell text without deleting contained board objects. The separate **Grid background** swatch applies one colour to the entire grid, clearing existing cell colour overrides, including merged cells. Undo restores the previous colours. Individual cells can still be recoloured afterwards.

Click the letters above columns or numbers beside rows to select a complete track. Drag a handle to reorder it; the insertion line marks the destination, and Escape cancels. The Rows/Columns menus also provide keyboard-accessible movement actions.

Drop an object over a grid cell to attach it. A target outline previews the cell; cells expand to fit objects with padding, preserving their size. Objects remain individually editable. Moving a grid carries its children, including locked ones, and row/column reordering moves children with their cell. Frames use the same containment model, including a grid inside a frame. Drag objects out to detach them. Duplicate/copy preserves the complete hierarchy. Removing a track, grid or frame keeps its board objects; Undo restores the relationship.

Grid row and column handles show grip dots and highlight the selected track. Drag a handle to lift a preview of its cells and contained objects; neighbouring tracks animate aside around the insertion gap. Release to reorder, press Escape or drop outside the board to cancel. A short drag within the original position leaves the grid unchanged. Focus a column handle and use Alt + Left/Right, or a row handle and Alt + Up/Down, to reorder with the keyboard. Each move supports Undo; reduced-motion preferences disable the gap animation.

## Teams and Capacity

People and teams live in **Settings → Organisation**. Add people with optional weekly task limits and short names (up to three characters, shown on task avatars instead of the name's first three letters), then create teams and choose their members. Unsaved edits remain recoverable as browser drafts, and links to the former People and Teams pages open this section. People are directory entries, independent of login accounts. In **Project settings**, select one or more of that organisation’s teams. Task assignees are the union of those teams’ members. Existing assignments remain readable if a person leaves a team; removing a team requires removing it from its projects first.

**Capacity**, beside Calendar and Timeline, measures task counts per person for the current project and task filters. Each open task counts once per week that overlaps its start/due dates; the daily columns count tasks active that day. Estimates are not used. Tasks without dates appear in each person’s Unscheduled list. Optional weekly task limits are editable in Organisation settings; blank means no limit, and zero flags any scheduled work. Prior hour-based capacities are retained in the vault without being reinterpreted as task limits. Capacity does not aggregate other projects, holidays or time off.

People and teams are stored in organisation Markdown frontmatter; projects store team IDs, and tasks retain the readable assignee name plus a stable `assignee_id`. These remain available offline and in Obsidian. Opening and saving a legacy task preserves its prior assignment and tags.

Existing task editors save changes automatically while you work. The header groups Details, Version history and Comments; narrow screens switch between them in the same panel, while wide screens show comments/history alongside the details (the board's panel from 1100px, other views from 1320px) and leave out the Details button; tapping the open pane's button again closes it. On phones, type and ID precede a smaller title. Duplicate, Archive and Delete form a group of icons before Close on every screen. Failed saves stay in the browser queue and retry when the server is reachable. Closing flushes pending edits; incomplete required fields remain recoverable as a browser draft. New tasks still use Create task.

## Project workflows

Use **Project settings → Statuses & workflow** to add statuses, change their names, reorder them, choose the default for new tasks and mark completed statuses. Names can change without rewriting task files. A status cannot be removed while active or archived tasks use it; move those tasks first. At least one completed status is required.

Enable **Restrict status changes**, then expand each status’s **Allowed moves** and check its destinations. An empty list prevents leaving that status. Include a return destination if tasks should be reopened or sent back for changes. Ordering is visual and does not itself impose transition rules. Existing projects allow all moves until restrictions are enabled. The default applies to task creation unless a status is explicitly selected, such as adding a card in a Kanban column.

Task editors, table cells, subtasks, board cards and Kanban use the same rules. The API validates status changes and history restores as well. Workflow definitions live in the project Markdown frontmatter (`status_labels`, `initial_status`, `transitions` inside `schema`). Direct edits in Obsidian are file changes, not workflow transitions; task status values must still belong to the project schema.

### Grid text formatting and board appearance

Select a grid, then click its row number or column letter to select that whole row or column. Open **Text formatting** (the text icon) in the selection toolbar to change font, size, emphasis or alignment for every selected cell. Keyboard users can focus a row/column header and press Enter or Space. Changes save with the board and support Undo.

**Board appearance** opens a popover beside the toolbar, level with its button. Changes apply automatically and support **Ctrl/Cmd+Z** undo and **Ctrl/Cmd+Shift+Z** redo while the popover is open. Reset is beside Close. Clicking outside or pressing Escape closes the popover and keeps the applied changes.

### Colour menus

All colour fields share a compact two-row palette: seven system colours on top, then a multicolour button and six recent colours. Click the multicolour button to expand the spectrum, hue and hex controls. Drag in the spectrum and adjust the hue, then choose **Apply colour** (or press Enter in the spectrum or hex field). Arrow keys adjust saturation and brightness; Shift makes larger adjustments. Palette and recent swatches apply with one click. The latest six colours are remembered in this browser across projects and refreshes. Closing the picker discards unapplied changes.

### Board task fields and numbered lists

Board task cards let you change status, priority and assignee directly. Assignees come from the project’s teams, and each card edits the same project task.

Rich-text toolbars include **Bullet list** and **Numbered list** buttons. Type `1.` or `1)` followed by Space at the start of a paragraph to start numbering; Enter adds the next item, and Enter on an empty item leaves the list. Lists save as Markdown.

### Project frames

Choose **Project frame** in the board's left toolbar, then drag to draw it or click to place it. Drag its title or selected empty surface to move it with its contents. **Update plan** fills or refreshes that frame from the project's active tasks without changing your zoom or canvas position, reuses its task cards and removes generated cards for tasks no longer in the project. Other board content stays in place. The frame title comes from the project and cannot be edited on the canvas.

Dependency arrows run from a prerequisite's right side to the dependent task's left side and are labelled **blocks**. They use **Board appearance → Dependency arrow style**. Parent–child arrows run from the parent's bottom to the child's left, with children indented to the right. Updating the plan supports undo/redo and does not change the task relationships.

### Visual rules

Project settings and **Statuses & workflow** include visual workflow and card hierarchy editors. Select a card to inspect its connections, or choose **Connect**, then a source and destination to toggle a rule. Connection chips also remove individual rules. **All links** shows the full graph; turn it off to focus on the selected card.

A card's assignee, status and priority sit together in one box whose border takes the priority's colour, wherever they appear together, with the due date after them in the same box (board cards show the start and due dates, each opening the calendar in place); Table cells keep one field each. On phones, tapping a List or Tree row's assignee, status or priority opens that field's picker, and tapping its date opens the date editor, without opening the card. **Settings → Workflow → Priority colours** sets the colours for the project (`priority_colors` inside `schema`); colours left at their defaults are not stored.

Workflow arrows are allowed status moves when **Restrict status changes** is enabled. **Status names, order & defaults** contains the naming and ordering controls. Hierarchy arrows point from a parent type to an allowed child type; **No parent** defines the top-level types. Saved hierarchy rules apply in **Enforce rules** mode; **Freeflow** permits all relationships. Both editors use the existing project save and validation rules.

Board cards remain visible when a task is archived or deleted. **Archived** means the task still exists; enable **Filters → Include archived** in the task list to show it there, or use **Unarchive** directly on its board card. **Deleted task** retains the task's last title and ID from the trash and offers **Restore task**. Project editors can restore it directly without changing its original content, ID, board placement or connectors. If it was archived before deletion, it remains archived until you choose **Unarchive**. **Recovery & backups → Trash** also remains available to administrators. Missing or unreadable task files are labelled **Task unavailable**, rather than being assumed deleted.


## Mixed project sources

**Help**, at the bottom of the sidebar, opens a local wiki with searchable setup guides, article contents and browser Back/Forward navigation. Start with **Connect a project**, then **Server setup**, **Obsidian**, **Jira Cloud** or **SharePoint Excel**. Each guide includes the actual permissions and limits of this installation, mapping examples and troubleshooting. Direct links such as `/#help/jira` and `/#help/excel` can be bookmarked. The guides load locally; provider documentation opens only when you follow an external reference.

In **Project settings → Data sources & sync**, add one or more Obsidian folders, Jira Cloud queries, or SharePoint Excel tables. Use **Preview mapping** before **Sync now**. Sources start with read access and polling disabled. Enable polling for five-minute reads; Pause or Disconnect stops future reads. Disconnect removes credentials while retaining imported tasks and local annotations.

Integration setup supports `AUTH_MODE=local` or `AUTH_MODE=single-user` automatic administrator access, or `AUTH_MODE=required` with a signed-in workspace administrator. The first connected source makes that project private to its source owner and workspace administrators, even after disconnect. Provider fields (title, type, status, priority, assignee and due date) are read-only in local editors. Local descriptions, comments, dependencies and related-record links remain separate. Imported records have stable source IDs and source badges; source links open the original Jira issue, workbook or Obsidian note. A missing query result means **not returned**, not necessarily deleted.

This is a personal integration model. It does not reproduce each provider's record-level sharing rules. Imported Markdown, backups and browser/device caches can be read by people with access to those files/devices. Use a vault and devices whose readers are authorised for the imported data. Workspace administrators can read these projects. Loss of provider access stops synchronisation; it does not erase previous imports or exports.

| Source | Setup and read permissions | Optional publication | Limits |
| --- | --- | --- | --- |
| Obsidian | Set `OBSIDIAN_ROOT` to an explicitly selected vault root. Configure a relative folder, note ID property and vault name. Notes require stable frontmatter IDs; opted-in checklist items also require `^block-ids`. | Enable Edit (title), Assign or Transition individually. Writes preserve note bodies and unrelated YAML, check the full file revision and retain a previous-file backup. | No arbitrary note creation or comment publication. Up to 10,000 Markdown files / 50 MB total / 2 MB per file. A root on the host is not automatically available inside Docker. |
| Jira Cloud | Register a 3LO OAuth app. Set `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `APP_ORIGIN`. Scopes: `read:jira-work`, `read:jira-user`, `offline_access`. Connect, select a Cloud ID and scoped JQL, map source statuses/types/priorities, then preview. | Individually enable Create, Edit title, Assign by account ID, Transition by transition ID, or Comment. Reconnect to consent to `write:jira-work`. Provider permissions and required fields still apply. | Basic creation supports project, issue type and title; additional required custom fields can cause a visible rejection. Unsupported rich text remains in the source snapshot. Up to 10,000 results; pagination and rate-limit responses are handled. |
| SharePoint Excel | Register a Microsoft web app. Set `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT`, `APP_ORIGIN`. Delegated `Files.Read.All` plus `offline_access`; tenant consent policy applies. Configure drive ID, workbook item ID, named table and unique stable ID column. | Read-only. No Excel or SharePoint write permission is requested. | `.xlsx` download, 20 MB compressed / 100 MB expanded / 10,000 rows / 5,000 ZIP entries. IDs cannot be formulas. Use ISO date text columns. Selected-resource permission variants are not implemented or tenant-verified. |

Register exact callbacks `${APP_ORIGIN}/api/source-callback/jira` and `${APP_ORIGIN}/api/source-callback/excel`. Use HTTPS, or localhost during development. OAuth tokens are encrypted with a server key in `.pencils/source-key`; keep that key with the installation backup and restrict filesystem access. Do not commit secrets to `.env` or source control. Docker Compose passes the OAuth variables; mount an Obsidian folder explicitly (read-only for imports) and set `OBSIDIAN_CONTAINER_ROOT` to its container path. Enable writes only with an intentionally writable mount.

Publish actions are explicit and logged. Failed, conflicting and uncertain outcomes remain visible; uncertain remote writes are not blindly retried. Source conflicts display local/source values. Refresh and review the provider after an uncertain outcome. These adapters have fixture and mocked-provider coverage; live consent, provider permissions and tenant behaviour still require your accounts.

## Drawing on iPad and offline recovery

**Boards** combines tasks, notes, images and drawing in one view. The sidebar lists the project's boards, like documents, in folders you can make, rename, nest and drag boards into, with search; its **New board** menu makes a blank board in the chosen folder or imports an Obsidian `.canvas` or a Miro board, and **Board tools → Move to folder** files the open board. On phones the menu opens on the board list. **Board tools** also holds task links and the offline drawing tools, and **Version history** the local checkpoints. All existing drawings appear in the list; old drawing URLs still open the same canvas. Pen, colours, layers, reference images, selection and editable canvas/SVG/PNG exports work together. Lock reference images to keep them in place. Pencil draws; fingers select, move, resize, pan and pinch on every canvas. Pen preferences include drawing hand, a movable toolbar, pressure response and stabilisation. Pressure, sample timing, tilt and original sample coordinates are retained with new strokes.

The online app works across the local network. On iPad, **Prepare offline drawing** additionally requires a trusted HTTPS origin; plain LAN HTTP cannot register a service worker. Set up the existing native HTTPS/proxy deployment and trust its certificate on the iPad. Prepare while online, then open `/drawing-offline.html` once before disconnecting. The offline pad caches its own shell, not authenticated API responses.

All canvases checkpoint to IndexedDB on the current device. **Saved on this device** differs from server sync. The offline pad currently previews ink; other board objects and images remain in the document but are not rendered there. On reconnect, open **Local checkpoints → Sync checkpoint** for a guarded three-way merge, or **Restore as copy** to retain both versions. Opening a canvas never replaces a pending offline checkpoint. Browser storage can be cleared or evicted; export and server backups remain necessary. The iPad Pro 2021/Pencil 2 feel, pressure calibration and palm rejection require physical-device verification; no hover feature is assumed.

## Project automation and diagnostics

Project settings offers disabled-by-default automation rules for manual, status-change and due-date triggers. Actions set status, priority, assignee or a tag. Preview changes before enabling/running a rule. Due-date rules use UTC and exclude completed/archived tasks. Actions do not recursively trigger rules; source-owned fields are skipped. Run logs retain counts and failures, and repeated automatic failures wait for changed inputs or another day. Each run is limited to 200 tasks, with at most 20 rules per project.

**Diagnostics** is administrator-only and reports aggregate request timings, HTTP errors, index rebuilds and retained journal conflicts without request bodies or tokens. Markdown/canvas files remain authoritative. SQLite is a rebuildable search/query index; use `npm run index:rebuild` or the Diagnostics button to recreate it. Node **22.12 or later** is required (tested with 22.22.1); its built-in SQLite API can print an experimental warning.

Related local writes have a recoverable journal and a process writer lock. A crash rolls back incomplete known writes; external edits are preserved as conflicts under `.pencils/journal`. Do not delete a writer lock while a server may be using it. These guarantees cover local vault records, not a distributed transaction with Jira, Microsoft or an external Obsidian vault. Project subscriptions send record deltas, with full refresh when safe delta reconstruction is unavailable.

## Review implementation checks

[IMPLEMENTATION.md](IMPLEMENTATION.md) maps the 60 review recommendations to code, checks and verification limits. Run `npm run test:release` for syntax, model/server tests and 12 maintained journeys in each of Chromium, Firefox and WebKit. Install the Playwright browsers and their platform dependencies first (`npx playwright install-deps` on supported Linux distributions). `GATE_BROWSERS=webkit npm run test:release` selects one engine for targeted work. `npm run e2e -- accessibility` checks all nine views in light/dark themes using axe; this does not replace a manual screen-reader or physical-device review. `npm run e2e -- table-benchmark` measures 1k/10k/50k query models, not full network/render latency. All fixtures use temporary vaults. The drawing interruption test stops its temporary origin, avoiding a [WebKit offline-emulation bug](https://github.com/microsoft/playwright/issues/42775).
