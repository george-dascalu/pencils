# Pencils

An offline project workspace for **organisations → projects → hierarchical tasks**, with portable Markdown notes and a Docker web interface. Shared mode is ready for trusted devices on your local network; optional accounts restrict access by organisation.

See [CHANGELOG.md](CHANGELOG.md) for dated additions, changes and fixes. The [Project Settings assessment](reports/2026-10-17-project-settings-assessment.md) records this redesign and the next priorities.

## Make the workspace yours

Every project view uses the same compact header: project title in the breadcrumb, **Overview**, **Planning**, **Tasks**, **Boards**, **New task** and **Project settings**. Tasks contains List, Tree, Table and Kanban; Planning contains Calendar, Timeline and Capacity. Overview shows project progress, open/blocked/overdue tasks, status counts and upcoming deadlines.

Project Settings has its own grouped sidebar and dedicated pages. General, Organisation & teams, Statuses & workflow, Types & hierarchy and Custom fields save independently. Data sources, Import notes, Automation, Diagnostics and Archive & recovery contain their own tools. Source configuration and automation editing have direct links; browser Back, Forward and reload preserve the page. Unsaved changes require an explicit discard before navigating away. Templates are removed from the settings navigation. On phones, choose a page using Settings section.

Colour fields throughout the app use the same circular swatch and dropdown palette, with a custom hex editor for exact colours.

Development rule: **Consistency**. Reuse shared UI and keep common actions, terminology and behaviour aligned across views. See [AGENTS.md](AGENTS.md).

- Use the sidebar toggle in the top bar to collapse or expand navigation on desktop. Your choice survives reloads. On phones, the menu still opens a navigation drawer.
- Open **Personal settings** with the avatar at the top right. Choose Light, Dark, or System appearance and one of eight fonts: Manrope (default), DM Sans, Space Grotesk, Outfit, Sora, Work Sans, Lora, or Fraunces. Preferences are local to this browser and shared across its tabs; other devices retain their own choices.
- Fonts and their SIL Open Font Licenses are bundled under `public/fonts/`, with source links in `SOURCES.json`. No external font service is used at runtime.
- Open **Project settings** to edit the ordered status list and specify which statuses count as completed. New projects can define their own workflow during creation. Changes apply only to that project and are stored in its Markdown frontmatter. A status used by an existing task cannot be removed until those tasks are moved to another status. Use **Types & hierarchy** for card types and parent/child rules, and **Custom fields** for additional task information.

## Project settings and task IDs

Project settings opens as its own page. Set a unique 2–12 character project key, such as `WEB`; tasks receive IDs such as `WEB-1`, `WEB-2`. Numbers are never reused after deletion. Changing a project key updates the visible prefix and retains previous IDs as Obsidian aliases. Internal IDs, Markdown filenames and board links stay stable. Existing vaults receive keys and task numbers automatically, with a backup before migration. Keep each project's `identity.md` registry when moving or backing up files.

On a board, the **Project tasks** icon in the left toolbar opens a task browser. Search the current project by ID or title, and filter by status, card type, assignee or whether a task is already on this board. Drag a result onto the canvas to place a linked card at the preview position without changing the camera, or click to place it automatically. Escape or releasing outside the canvas cancels a drag. On touch screens, drag sideways from a task; vertical gestures scroll the list. **New project task** replaces the list with a compact side panel, leaving the board usable. Back returns to the list and retains an unsaved browser draft. Creating the task places its linked card on the current board and reopens the list. Existing tasks open in the same compact, resizable editor. Board cards show title/expand, then ID/priority/status/assignee, then description; priority and status use coloured controls. Removing a card only removes that visual representation. Editing a linked task from any view updates the same Markdown record.

## Run with Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:3000**, or **http://SERVER-IP:3000** from another device on the same network. The server computer must be running and reachable. Core local features need no internet service, CDN, font server, account provider or API key. Optional Jira and SharePoint sources need internet access and registered OAuth applications. One-time Miro imports need internet access and either a Miro OAuth app or a temporary access token. Building the image initially needs internet access for Node and npm packages; see the offline instructions below to transfer a prebuilt image.

Set `VAULT_PATH` to the folder you want to use, and set `LOCAL_UID` / `LOCAL_GID` to the output of `id -u` / `id -g` on Linux. The app runs as that user in a read-only container, with a writable vault mount. The host folder must be writable by that user. Stop with `docker compose down`; the vault remains on disk.

The empty workspace offers an optional example project. No sample content is created automatically.

## What you can do

In **Project settings → Cards Hierarchies**, choose Freeflow or Enforce rules. The matrix controls which parent types allow each child type. The “No parent” row controls which types can exist at the top level. Enforced rules apply to task creation, reparenting, type changes and history restoration. Existing tasks must satisfy the rules before they can be enabled. Freeflow preserves the configured rules without restricting relationships; cycles are always rejected.

Add draft subtasks in the new-task editor before saving the parent. Choose each subtask’s type, enter its title and press Enter or Add. Drafts can be removed before saving; a title still in the capture field is included when creating the task. The parent and children are validated together, and retries do not create duplicates. Subtasks receive their own project task IDs.

Date fields use a shared Monday-first calendar with stronger weekdays and muted weekend columns. Type dates directly, or open the calendar button (Alt+Down from the field); arrow keys navigate days, Page Up/Down changes months, and Escape closes it. The Calendar view uses the same weekday/weekend distinction.

The task editor uses a compact layout with Start date beside Due date, searchable prerequisites under Dependencies, and Planning collapsed by default. Dependencies distinguish **Blocked by** (prerequisites) from **Blocks** (downstream tasks). Descriptions open in a WYSIWYG editor with the same formatting controls as board notes; Markdown and Preview remain available. Descriptions are still saved as Markdown, and browser drafts and attachments are preserved.

- Create multiple organisations, each with multiple projects; move projects between organisations without changing note paths or task identifiers.
- Work in overview, list, tree, spreadsheet, kanban, freeform board, calendar and timeline views. Save named views with filters, grouping, sorting and column layouts shared by everyone in the project.
- Define project-specific statuses, completed statuses, task types and typed custom fields (text, number, date, select or checkbox). Existing task values must remain valid when changing a workflow.
- Set assignees, priorities, tags, start/due dates, estimates, parents and prerequisites. Dependency cycles and hierarchy cycles are rejected. Progress uses leaf tasks, weighted by estimate when positive, otherwise weight 1; parent tasks are not counted twice.
- Repeat a task after completion by days, weeks or months. Each occurrence creates one successor, and dates at the end of a month are clamped to the last valid day. Reopening and recompleting an occurrence does not create another successor.
- Capture tasks inline, duplicate tasks, save task templates, add comments, import Markdown notes and attach files. Archive tasks/projects, and recover deleted tasks, boards or whole projects from Trash.
- Search tasks across all permitted organisations and projects. Organisation dashboards show deadlines, blocked tasks, overdue work and project progress. Calendar shows due dates; timeline shows start/due windows.

### Kanban

Drag cards between statuses or reorder them within a column. A card-sized insertion marker shows the drop position, neighbouring cards move aside, and hovering near the edge scrolls toward offscreen columns. Drops switch to manual order and save it to task frontmatter. Press Escape or drop outside the columns to cancel.

### Spreadsheet

Edit cells and use **Shift-click** for rectangular range selection, **Ctrl/Cmd+C/V** for TSV copy/paste, and **arrow keys** or **Enter** to navigate cells; Shift+arrows extends a range. Paste into existing visible rows; add rows first if needed. Select rows for bulk status changes or archiving. Resize columns with header handles, or use **Columns** to hide/reorder them. Save a named view to share its layout.

Rapid changes to the same task are serialized and retain the latest revision. Invalid values and unresolved concurrent edits remain recoverable in **Recovery & backups**. Spreadsheet formulas are not evaluated. Optional SharePoint sources import a named Excel table through a separate, read-only mapping preview; CSV export and validated clipboard paste are available.

### Board

The selection toolbar's text menu contains font, size, vertical alignment, fit-to-box and copy/paste formatting. **More → Bulk notes** creates one sticky per pasted line. Shape controls offer flowchart shapes, borders and rotation; image controls offer non-destructive crop percentages and replacement without breaking connections.

**Arrange** includes matching dimensions, tidy columns/gaps and selected-frame PDF export. A multi-selection has four outer resize handles. **More → Layers** assigns selections to named layers and hides or locks their objects. Frame links open the project, board and frame directly; copying objects and pasting with a destination frame selected places them inside that frame. Frame PDF pages are rasterised locally from the SVG export, without an external service. Exported text uses the simplified SVG representation; it is not a full browser screenshot.

Grid cell controls include merge/unmerge, fit contents and Auto/Manual sizing. Merging retains each cell's original text and formatting; unmerge restores them. If the merged text was edited, the edited anchor and the other original cells are retained. Structural row/column changes unmerge affected content first. Manual sizing does not grow a grid to accept an oversized dropped object.

Connectors support draggable bends and labels, additional labels in the label menu, automatic body attachment and optional crossing jumps on straight/elbow routes. Double-click a bend to remove it. Clicking a connection port creates a connected note. Explicit port drops keep fixed-side attachment.

Live task cards can display List, Table, Kanban or Timeline layouts. Each keeps its own filters and visible table fields. Dragging a task between embedded Kanban columns updates its project status. Timeline bars and their ends change task dates; the scale selector changes day/week/month density, diamonds mark milestones, and undated tasks can be dragged onto a dated track.

The Pen toolbar includes a partial eraser, lasso selection and optional simple shape recognition. Pen and highlighter remember their styles separately within each preset. **More → Board session** offers presenter sharing, opt-in invitations, a local timer and voting on selected objects. Following never starts without the recipient choosing it. Votes and timer state are stored with the board; presenter presence is temporary.

Personal settings can switch between wheel-to-zoom mouse navigation and scroll-to-pan trackpad navigation, and disable single-letter shortcuts. Tab cycles board objects; Alt + Up/Down selects a parent/child; Alt + Shift + arrows resizes by 10 pixels. Existing Shift + corner drag remains axis constrained.


Boards view uses the shared compact project header and fills the remaining window. **Boards** manages canvases. The left toolbar creates objects and opens **Project tasks**; **More** provides live notes, live task views, images, the outline, presentation, frame navigation, canvas templates, exports and history. **Board settings** controls the board name, snapping and appearance. Project settings and New task remain beside the view tabs. Expanding a task card opens the same compact, nonmodal side editor as New task; editing keeps the board camera unchanged and retains subtasks, header actions, comments and version history. **Expand board** hides the surrounding workspace, and **Full screen** also hides browser chrome.

Open **Project tasks → New draft task** to prepare a board-only task, including its description, priority, assignee and proposed subtasks. Priority and assignee can also be changed directly on draft cards; these changes save automatically and carry over when finalised. Drafts have a dashed border, a pencil icon before their title and no project ID. The type menu can turn a draft back into a Note; its task details are retained for converting it back later. Project task cards show their task-type icon before the title. Converting a Note to a Task creates a draft with a title from the note and a blank description, keeping its comments and connections. Converting an existing draft to a Note and back preserves its description. The **Finalise task** icon sits immediately left of Comments in the card header and creates the project task and its subtasks in place, preserving the card’s position, appearance, comments and connections. Undo returns the card to a draft without deleting the project records; finalising it again reuses them.

Board arrows can represent task dependencies: connect two project task cards, select the arrow, then choose **Task dependency → Make dependency**. A → B means A must finish before B. Existing arrows reflect relationships edited in task details, and cycles are prevented. Use **Remove dependency** to unlink tasks; deleting or reconnecting a visual arrow leaves existing task dependencies intact. Drafts must be finalised before their arrows can create dependencies. Set their shared colour, stroke, thickness and arrowhead in **Board settings → Dependency arrow style**; changes apply immediately to that board and its exports, with Ctrl/⌘ Z to undo and Reset to restore defaults. Existing project styles remain the starting appearance until a board chooses its own style. Dependency arrows also have a toolbar shortcut to these settings.

Drag the sticky-note icon from the left toolbar onto the canvas to place a note. A preview follows the pointer; releasing on the canvas creates the note and opens its editor. Escape or dropping outside the canvas cancels. Clicking the tool then clicking the canvas still works.

Selected objects have a compact icon toolbar above them, grouped into appearance, comments, arrangement and object actions. Bring to front, Send to back and Delete are directly on the main toolbar. Colour, alignment/grouping and type-specific extra actions open small menus. Controls adapt to the selection, support keyboard navigation and respect locked objects.

For multiple selected objects, **Filter** shows the count of each object type. Click **Only** to keep one type, or tick several types and **Apply**. Tasks displayed as notes appear under Notes; linked Markdown files appear under Live notes. **Restore all** returns to the original selection until you make a new manual selection. Filtering changes only the selection, so colour, alignment, dragging, duplication and deletion affect the chosen objects. When filtered frames move, excluded contents stay put. Locked objects retain their protection.

**Board settings** opens a popover for renaming the board, grid snapping, nearby-object alignment, background/pattern colours, Plain/Dots/Grid/Fine grid/Lines and visual spacing. Fine grid combines small squares with a stronger line every five squares. Changes apply automatically; use Ctrl/Cmd+Z to undo or Ctrl/Cmd+Shift+Z to redo. Reset beside the close button restores theme-aware defaults. Snapping and background are saved in each board’s `.canvas` file. Pattern and minimap visibility are remembered per board in this browser. In expanded/full-screen view, use the settings icon beside the zoom controls.

Each project can have multiple named canvases. The board includes eight connected capabilities:

1. **Direct editing:** double-click text or a note to edit Markdown or rich text inline; click outside the component to save automatically. **Ctrl/Cmd+Enter** or **Escape** also finishes editing; use **Undo** to revert saved text. A contextual toolbar offers editing, comments, focus, appearance, framing, alignment, duplication, grouping and locking. Drag connection handles from any side of a selected object.
2. **Live notes:** task cards share the original task status and Markdown. **Live note** embeds any Markdown file in the current project. Existing saved heading/block references remain readable, and editing them preserves the rest of the source note. `![[Task#Heading]]` and block transclusions render loaded task content, with bounded nesting.
3. **Native Obsidian files:** boards are saved directly as `.canvas` using [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/). Open the same file in Obsidian; changes appear when idle browsers refresh. Standard positions, note content, file paths, subpaths, colors, groups and connector endpoints round-trip. Unknown extensions are retained. Import/export also supports native `.canvas` files.
4. **Meaningful connectors:** select a line to open its floating toolbar. Shift/Ctrl/Command-click toggles arrows and objects in a mixed selection; selection boxes and Select all include arrows. Use Filter → Arrows to style several connectors together, copy/duplicate them or delete them without removing the connected cards. Route, Stroke and Thickness are directly on the toolbar. Use its remaining controls for colour, label, attachment sides and relationship. Start and end styles are independent: none, open arrow, filled triangle, filled/open circle, filled/open diamond or bar. Double-click a line to edit its label; Enter or clicking outside saves it. Changes save automatically and support Undo. SVG/PNG exports preserve the styles. JSON Canvas uses standard arrow endpoints for Obsidian, with richer shapes preserved in the Pencils extension. A **blocks** relationship can explicitly create a real task prerequisite; cycles are rejected. Deleting or reconnecting a visual connector leaves existing task prerequisites intact. Drag a side handle for a live curved preview; nearby objects reveal ports and highlight the snapped target. Ctrl/Cmd temporarily bypasses snapping. Select a line and drag either endpoint to reconnect it, preserving its label, colour and routing. Escape, a lost pointer or a drop on empty space cancels the drag. Snapping uses screen-pixel thresholds so it stays usable while zoomed out.
5. **Structured frames:** nest frames through **Style / frame** or spatial containment, collapse/expand them, navigate the outline, and reorder presentation slides. Moving a frame moves its contents. Start with brainstorm, retrospective or roadmap templates; save a selection as a reusable template in that canvas. **Present** steps through frames with arrow keys and exits with Escape.
6. **Task planning:** overdue and blocked cards are highlighted. Filter by owner/status, convert a sticky into a real task while retaining its connectors/comments, or embed a **Live task view**. View cards follow a named project view or their own filters, showing up to 100 matching tasks.
7. **LAN collaboration:** participants see each other’s names, cursors and selected objects. Object comments open in a compact nonmodal chat panel beside the object, with a scrollable thread, replies, deletion and five emoji reactions (👍 ❤️ 😂 🎉 👀). Independent changes merge; overlapping changes stay in Recovery for an explicit choice. Each save commits an operation log together with the board. **Activity** and keyboard undo/redo check affected values before changing them. Save retries reuse the original operation ID, including when an acknowledgement is lost. Each browser tab keeps its own pending queue.
8. **Large boards and tablets:** search and jump to objects, navigate the minimap, use **Shift+2** to focus a selection, and pan/zoom with two fingers. Pen drawing stores pressure samples. Offscreen cards are culled; broad overviews use a bitmap so detailed DOM remains bounded.

**One-time Miro import:** open **Board settings → Import from Miro**, connect, and paste a Miro board link or choose from the first 50 accessible boards. Load the board to preview its layout and conversion report. Import the whole board or select frames (including nested contents), choose draft cards or project tasks, and match Miro assignees to people in the project's teams. Choose a task type and status; imported cards default to Medium priority because the standard REST card response does not supply priority or task status. Available due dates and descriptions are copied. Changes to options require **Update preview** before **Import**.

The importer copies sticky notes, rich text, supported shapes, frames, connectors, accessible images/GIFs and supported documents into ordinary `.canvas` objects and local attachments. Embeds become links. Unreadable or unsupported items returned by Miro become labelled links at their original positions. The report lists approximations and omitted connectors; Miro may not return some unsupported items at all. Comments, native tables/grids, freehand strokes, live queries and Pencils project-frame behaviour are not imported. Use separate CSV/image exports for content unavailable through Miro's API. Fonts, transparency and connector routing may differ. Visual connectors do not automatically create task dependencies.

Choose **New canvas** or **Current canvas**. Existing-canvas imports preserve local changes to previously imported objects and add only new source objects; they never refresh or overwrite an earlier import. A changed destination requires a new preview. Imported task cards are local Markdown tasks, with no source-owned fields or background sync. A failed commit rolls back new tasks, attachments and canvas changes together. Retrying a completed preview does not duplicate its import. Previews last 30 minutes; the server retains tokens only in memory and clears the current connection after import or disconnect.

For **Connect Miro**, create a Miro OAuth app with only `boards:read`, register the exact callback `${APP_ORIGIN}/api/miro-callback`, and set `MIRO_CLIENT_ID`, `MIRO_CLIENT_SECRET` and `APP_ORIGIN` on the server. Use HTTPS or a localhost callback; Docker Compose passes these variables through. Alternatively, **Use an access token** accepts a temporary token from a Miro app with `boards:read` and access to the source board, without OAuth server configuration. Both options require `AUTH_MODE=local` or a signed-in account with project write access in required mode. The import makes no changes in Miro. Large reads can hit Miro's rate limits; the error gives a retry delay. Each preview supports up to 9,500 source objects, 19,000 connectors and 50 MB of media, with a 10 MB limit per file; canvas storage limits still apply.

**Grid titles:** double-click the title in a grid’s top bar, or click its pencil button, to rename it in place. Click outside or press Enter to save; Undo restores the previous title. The title is included above the Markdown table in Obsidian Canvas exports. Drag the top bar to move the grid.

**Frames:** press **F** or choose the frame tool, then drag around content; click to place a 16:9 frame. Click any empty space inside a frame to select it, including frames without a title. Click an object inside it to select that object instead. Drag a frame's title or border to move it and its contents. Drag empty space inside a frame to select objects. Objects attach/detach as you move them between frames. Resizing and size presets change only the frame, preserving content positions and sizes.

The frame toolbar provides **Rename**, **Size presets** (16:9, 4:3, square, portrait and A4), **Fit frame to contents**, **Select frame contents**, **Collapse/expand** and **Present from this frame**. Delete removes the frame and keeps the contents; Undo restores it. Copying or duplicating a frame includes nested objects and internal connectors, preserving linked task data.

Open **More → Outline** for frames and presentation order. Drag top-level rows or use the arrow buttons; **Order by position** sorts top-to-bottom, then left-to-right. Nested frames remain navigable but aren't separate slides. Presenting temporarily reveals collapsed contents without changing the saved collapse state. Frame data and nesting stay in the Markdown vault's native `.canvas` files.

**Text alignment** is available in both the selection and editing toolbars: left, centre, right and justified. It applies across an object, including task titles and bodies, notes, shapes, frame titles and captions. Multi-selection applies it to unlocked objects. Alignment is saved in the board’s Pencils extension, preserves linked Markdown, supports undo and survives native `.canvas` round trips. Obsidian retains this metadata but may use its own text layout. Exported text uses the saved alignment.

Clicking empty board space deselects objects and connectors, including their handles. Background taps and clicks with the hand tool also clear selection; panning keeps the selection.

Click **Task** or **Note** at the left of the selection toolbar to switch presentation. A new note becomes a task with its full Markdown body; comments, grouping, colour and connections stay attached. Switching a task to a note gives it the same appearance as a sticky note, hiding task controls and metadata while keeping its original task file linked. Editing its title/body updates that same task. Switching back restores its task controls without creating duplicates. The task remains in List, Table and other task views. Undo can restore the earlier board presentation.

Open the **Search board** icon in the left toolbar (or **Ctrl/Cmd+F**) to find objects and filter by owner or status. The panel closes with Escape or an outside click; a dot on the icon indicates active filters.

Pan with **Space+drag**, the hand tool, right/middle mouse button or **Shift+scroll**. Zoom with **scroll**, **Ctrl/Cmd+wheel** or pinch. Wheel and button zoom ease smoothly around the pointer (or the board centre for buttons), with gentler scroll sensitivity. Reduced-motion preferences disable the animation. **Shift-click** and a drag on empty canvas select multiple objects. **Ctrl/Cmd+A**, **D**, **C/V** select, duplicate and copy/paste objects. Pasted and duplicated items become the active selection and receive keyboard focus without moving or zooming the camera. **Board settings → Align with nearby objects** enables nearby-object snapping independently of **Snap to grid**. While dragging, magenta guides mark matching edges and centres; dimension guides show equal gaps. Groups move as one selection without changing their internal spacing. Guides appear only near a match and use a consistent screen-distance threshold at every zoom. Hold Alt during a drag to bypass both alignment and grid snapping (Alt at the start still duplicates). Escape cancels the drag. Grid snapping uses a 20-pixel grid. Both snapping settings are saved per board in its `.canvas` file and survive refreshes, server restarts and opening from another device. Grid visibility, minimap visibility and expanded view are remembered per board in this browser, alongside its pan and zoom. Browser full screen still requires a user gesture. Export a whole board as SVG or PNG for sharing.

Collaboration uses the local server, with presence updates approximately every 800 ms and inactive participants expiring after 15 seconds. It does not perform character-by-character coauthoring: competing edits to the same text are shown as conflicts. Comments, drawing pressure, queries, nested-frame settings, templates and activity are Pencils extensions; Obsidian retains their data but does not provide the corresponding Pencils interface. References outside the current project remain intact for Obsidian, but Pencils does not read their content. Links open on demand; external web pages are not fetched into the offline board.

The recent operation log retains up to 200 operations (approximately 2 MB, or one larger operation). Older logs remain in file history. Keyboard undo/redo belongs to the current browser tab; **Activity** provides guarded undo after a restart or from another device. Full-file restoration is available through **History**.

## Markdown and Obsidian

**Documents**, between Overview and Planning, provides a project document explorer and a Markdown-native editor. **Live preview** formats Markdown around the active line. Edit callout titles/content, table cells, quotes and code directly in their rendered components; tables also have Add row and Add column controls. Math and diagrams have inline formula/code fields. Component edits autosave to Markdown without exposing the section's Markdown syntax. **Source** shows the complete Markdown with syntax highlighting and line numbers. **Reading** displays the formatted document. Switching views does not rewrite the source or clear undo history. Ctrl/⌘ E switches Live preview/Source, Ctrl/⌘ B and I format the selection, and Ctrl/⌘ F opens search in the current view. Tab indents, lists continue on Enter, and the gutter folds headings and code.

Use **Style**, the formatting buttons or **Insert** for headings, lists, checklists, quotes, code blocks, tables, callouts, footnotes, highlights, math and Mermaid diagrams. Live-preview checkboxes update their Markdown markers. Comments (`%%…%%`) stay in the source and are hidden in Reading. HTML is sanitised; executable scripts and remote image requests are excluded. Unknown plugin syntax stays intact in the source. **Document outline** jumps to headings; **Document tools** contains backlinks, undo/redo, export and Obsidian settings. Type `[[` to choose another project document: generated links use stable vault paths with readable labels. `![[…]]` embeds a document, heading or block, with bounded nesting. Duplicate document titles require a stable path. Attach local files through **Insert → Attach file**, or drop them onto the editor. Images render inline; other files open from their links.

The **Open in Obsidian** icon in the document header opens the same Markdown file in the installed Obsidian app. On first use, enter the vault name as shown in Obsidian. If Pencils' data directory is a subfolder of that vault, enter its relative folder too. These settings are saved only in this browser. The vault must be accessible to Obsidian on the device opening the link; a browser connection to Pencils does not copy or sync the server's files. Pending edits must finish saving before opening. Obsidian's plugins run in Obsidian, not in the Pencils browser editor; desktop-only plugins still require Obsidian desktop.

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

Filesystem notifications refresh idle browsers when notes change externally. Only live project/organisation folders are watched; if the operating system runs out of watchers, the server falls back to five-second polling without stopping writes. A rebuildable in-memory parse index avoids reparsing unchanged notes; file timestamps and revisions are still checked before writes. Task views render pages of 100 items; timeline displays up to 200 dated tasks. The server still returns a project snapshot, so very large vaults may need more indexing/pagination work. Boards support 100,000 objects, 200,000 connectors and 500 frames, within a 128 MB board API request limit. Native Canvas file imports are limited to 64 MB. Dense/zoomed-out boards use a lightweight overview; selected objects retain editable detail. Single-object saves send guarded deltas, but initial loading and durable vault snapshots still scale with total board size. See [measured capacity and limitations](reports/2026-10-21-board-100k.md). Attachments support PNG/JPEG/GIF/WebP, PDF, text, Markdown, CSV and ZIP up to 10 MB.

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

For single-user use on this computer or a trusted local network, set `AUTH_MODE=local` and `LOCAL_USER_NAME=George` in `.env`, then recreate the service with `docker compose up -d --no-build --force-recreate pencils`. Loopback and private-network connections automatically use George with administrator access, including source connections and background sync. Personal settings shows the name and role; no password or Sign out action is needed in this mode. Existing password accounts remain unchanged. The local identity is defined by these server settings and stops being available if you change the mode or name. Keep its name stable while it owns sources or automations.

Local mode trusts the socket peer address, including Docker bridge/private LAN addresses; it ignores browser-supplied forwarding headers. Public peers still require a password account. Use `AUTH_MODE=required` behind a public reverse proxy, since the proxy itself may connect from a private address.

Default `AUTH_MODE=shared` permits every device reaching the server to read and edit the workspace. This matches a trusted LAN deployment. For restricted access, first create an administrator (password is read from standard input):

```bash
read -rs -p 'Admin password (12+ characters): ' PENCILS_ADMIN_PASSWORD
printf '\n'
printf '%s' "$PENCILS_ADMIN_PASSWORD" | docker compose exec -T pencils node server/account.js admin
unset PENCILS_ADMIN_PASSWORD
```

Then set `AUTH_MODE=required` in `.env` and restart with `docker compose up -d`. Use **Accounts & access** to create or update users. Administrators access all organisations and recovery tools; each other account can be an editor, viewer or have no access to each organisation. Changing an account invalidates its existing sessions. Sessions use HttpOnly, SameSite cookies, expire after 12 hours, and end on server restart. Passwords are stored as salted scrypt hashes; login attempts are rate-limited.

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

# Focused checks during development
npm run check
npm test
npm run test:table-performance
npm run test:accessibility
npm run test:drawing
npm run test:sources
BROWSER=firefox npm run test:review-workflows
```

Tests use temporary vaults. They cover Markdown persistence/migration, file revisions, safe paths, UTF-8 request chunking, backup/history/trash restore, workflow validation, recurrence, three-way merge, organisation permissions, browser editing, saved views, range paste, offline save recovery, canvas manipulation/export and mobile layout. `test/offline.mjs` and `test/compose.offline.yaml` verify an isolated Docker deployment without outbound connectivity.

Board navigation uses **scroll to zoom at the pointer** and **Shift + scroll to pan vertically**. Pinch and Ctrl/Command-wheel also zoom. Right-drag, middle-drag and Space-drag pan while preserving selection. V selects, H pans, N/T/S select click-to-place sticky/text/shape tools, L connects and P draws. Ctrl/Command-click adds or removes a selection; Alt/Option-drag duplicates. F1 opens the shortcut reference. Native touch pan/pinch and pressure-sensitive pen input remain available.

**Expand board** fills the browser window; the adjacent **Full screen** button also hides browser chrome where supported. Escape returns to the normal view (first closing an active editor or presentation). Card actions float above the selection, or below it when there is not enough room above.

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

Press **E** or choose Eraser to swipe across drawings. By default it removes entire strokes; enable Partial eraser to cut only touched sections. It leaves other objects and locked drawings untouched; one Undo restores an entire erase gesture. Escape cancels the current gesture, and **V** returns to selection. With a touchscreen, two-finger gestures pan/zoom and cancel a stroke in progress. When a drawing is selected, its toolbar lets you change ink colour or thickness, lock it, duplicate it, or delete it.

Drawings and their pressure/style data persist in the board’s local Canvas file. SVG/PNG exports retain the stroke styling. Enable Recognise shapes for simple line, rectangle and ellipse recognition; Lasso selects enclosed object centres; Partial eraser removes portions of ink.

### Grid selection and containers

Click or drag across cells to select them. **Shift-click** and **Shift + arrows** extend a rectangle; **Ctrl/Command-click** toggles individual cells, and **Ctrl/Command+A** selects every cell when a cell has focus. Cell colour and text alignment apply to all selected cells. Copy/cut uses tab-separated text; Delete clears selected cell text without deleting contained board objects. The separate **Grid background** swatch applies one colour to the entire grid, clearing existing cell colour overrides, including merged cells. Undo restores the previous colours. Individual cells can still be recoloured afterwards.

Click the letters above columns or numbers beside rows to select a complete track. Drag a handle to reorder it; the insertion line marks the destination, and Escape cancels. The Rows/Columns menus also provide keyboard-accessible movement actions.

Drop an object over a grid cell to attach it. A target outline previews the cell; cells expand to fit objects with padding, preserving their size. Objects remain individually editable. Moving a grid carries its children, including locked ones, and row/column reordering moves children with their cell. Frames use the same containment model, including a grid inside a frame. Drag objects out to detach them. Duplicate/copy preserves the complete hierarchy. Removing a track, grid or frame keeps its board objects; Undo restores the relationship.

Grid row and column handles show grip dots and highlight the selected track. Drag a handle to lift a preview of its cells and contained objects; neighbouring tracks animate aside around the insertion gap. Release to reorder, press Escape or drop outside the board to cancel. A short drag within the original position leaves the grid unchanged. Focus a column handle and use Alt + Left/Right, or a row handle and Alt + Up/Down, to reorder with the keyboard. Each move supports Undo; reduced-motion preferences disable the gap animation.

## Teams and Capacity

Open **People** in the sidebar’s **Teams** section to add people with optional weekly task limits. Open **Teams** to create teams and choose their members. Both pages stay scoped to the selected organisation and can be reopened directly after refreshing. Unsaved edits remain recoverable as browser drafts. These controls are also available in **Organisation settings**. People are directory entries, independent of login accounts. In **Project settings**, select one or more of that organisation’s teams. Task assignees are the union of those teams’ members. Existing assignments remain readable if a person leaves a team; removing a team requires removing it from its projects first.

**Capacity**, beside Calendar and Timeline, measures task counts per person for the current project and task filters. Each open task counts once per week that overlaps its start/due dates; the daily columns count tasks active that day. Estimates are not used. Tasks without dates appear in each person’s Unscheduled list. Optional weekly task limits are editable in Organisation settings; blank means no limit, and zero flags any scheduled work. Prior hour-based capacities are retained in the vault without being reinterpreted as task limits. Capacity does not aggregate other projects, holidays or time off.

People and teams are stored in organisation Markdown frontmatter; projects store team IDs, and tasks retain the readable assignee name plus a stable `assignee_id`. These remain available offline and in Obsidian. Opening and saving a legacy task preserves its prior assignment and tags.

Existing task editors save changes automatically while you work. Header icons provide Delete, Duplicate, Archive, Version history and Comments; comments and history open to the right without closing the editor. Failed saves stay in the browser queue and retry when the server is reachable. Closing flushes pending edits; incomplete required fields remain recoverable as a browser draft. New tasks still use Create task.

## Project workflows

Use **Project settings → Statuses & workflow** to add statuses, change their names, reorder them, choose the default for new tasks and mark completed statuses. Names can change without rewriting task files. A status cannot be removed while active or archived tasks use it; move those tasks first. At least one completed status is required.

Enable **Restrict status changes**, then expand each status’s **Allowed moves** and check its destinations. An empty list prevents leaving that status. Include a return destination if tasks should be reopened or sent back for changes. Ordering is visual and does not itself impose transition rules. Existing projects allow all moves until restrictions are enabled. The default applies to task creation unless a status is explicitly selected, such as adding a card in a Kanban column.

Task editors, table cells, subtasks, board cards and Kanban use the same rules. The API validates status changes and history restores as well. Workflow definitions live in the project Markdown frontmatter (`status_labels`, `initial_status`, `transitions` inside `schema`). Direct edits in Obsidian are file changes, not workflow transitions; task status values must still belong to the project schema.

### Grid text formatting and board settings

Select a grid, then click its row number or column letter to select that whole row or column. Open **Text formatting** (the text icon) in the selection toolbar to change font, size, emphasis or alignment for every selected cell. Keyboard users can focus a row/column header and press Enter or Space. Changes save with the board and support Undo.

**Board settings** opens a popover beneath its button (above it when there is insufficient space below). Changes apply automatically and support **Ctrl/Cmd+Z** undo and **Ctrl/Cmd+Shift+Z** redo while the popover is open. Reset is beside Close. Clicking outside or pressing Escape closes the popover and keeps the applied changes.

### Colour menus

All colour fields share a compact two-row palette: seven system colours on top, then a multicolour button and six recent colours. Click the multicolour button to expand the spectrum, hue and hex controls. Drag in the spectrum and adjust the hue, then choose **Apply colour** (or press Enter in the spectrum or hex field). Arrow keys adjust saturation and brightness; Shift makes larger adjustments. Palette and recent swatches apply with one click. The latest six colours are remembered in this browser across projects and refreshes. Closing the picker discards unapplied changes.

### Board task fields and numbered lists

Board task cards let you change status, priority and assignee directly. Assignees come from the project’s teams, and each card edits the same project task.

Rich-text toolbars include **Bullet list** and **Numbered list** buttons. Type `1.` or `1)` followed by Space at the start of a paragraph to start numbering; Enter adds the next item, and Enter on an empty item leaves the list. Lists save as Markdown.

### Project frames

Choose **Project frame** in the board's left toolbar, then drag to draw it or click to place it. Drag its title or selected empty surface to move it with its contents. **Update plan** fills or refreshes that frame from the project's active tasks without changing your zoom or canvas position, reuses its task cards and removes generated cards for tasks no longer in the project. Other board content stays in place. The frame title comes from the project and cannot be edited on the canvas.

Dependency arrows run from a prerequisite's right side to the dependent task's left side and are labelled **blocks**. They use **Board settings → Dependency arrow style**. Parent–child arrows run from the parent's bottom to the child's left, with children indented to the right. Updating the plan supports undo/redo and does not change the task relationships.

### Visual rules

Project settings and **Workflow & fields** include visual workflow and card hierarchy editors. Select a card to inspect its connections, or choose **Connect**, then a source and destination to toggle a rule. Connection chips also remove individual rules. **All links** shows the full graph; turn it off to focus on the selected card.

Workflow arrows are allowed status moves when **Restrict status changes** is enabled. **Status names, order & defaults** contains the naming and ordering controls. Hierarchy arrows point from a parent type to an allowed child type; **No parent** defines the top-level types. Saved hierarchy rules apply in **Enforce rules** mode; **Freeflow** permits all relationships. Both editors use the existing project save and validation rules.

Board cards remain visible when a task is archived or deleted. **Archived** means the task still exists; enable **Filters → Include archived** in the task list to show it there, or use **Unarchive** directly on its board card. **Deleted task** retains the task's last title and ID from the trash and offers **Restore task**. Project editors can restore it directly without changing its original content, ID, board placement or connectors. If it was archived before deletion, it remains archived until you choose **Unarchive**. **Recovery & backups → Trash** also remains available to administrators. Missing or unreadable task files are labelled **Task unavailable**, rather than being assumed deleted.


## Mixed project sources

The header's **Help** button opens a local wiki with searchable setup guides, article contents and browser Back/Forward navigation. Start with **Connect a project**, then **Server setup**, **Obsidian**, **Jira Cloud** or **SharePoint Excel**. Each guide includes the actual permissions and limits of this installation, mapping examples and troubleshooting. Direct links such as `/#help/jira` and `/#help/excel` can be bookmarked. The guides load locally; provider documentation opens only when you follow an external reference.

In **Project settings → Data sources & sync**, add one or more Obsidian folders, Jira Cloud queries, or SharePoint Excel tables. Use **Preview mapping** before **Sync now**. Sources start with read access and polling disabled. Enable polling for five-minute reads; Pause or Disconnect stops future reads. Disconnect removes credentials while retaining imported tasks and local annotations.

Integration setup supports `AUTH_MODE=local` automatic administrator access, or `AUTH_MODE=required` with a signed-in workspace administrator. The first connected source makes that project private to its source owner and workspace administrators, even after disconnect. Provider fields (title, type, status, priority, assignee and due date) are read-only in local editors. Local descriptions, comments, dependencies and related-record links remain separate. Imported records have stable source IDs and source badges; source links open the original Jira issue, workbook or Obsidian note. A missing query result means **not returned**, not necessarily deleted.

This is a personal integration model. It does not reproduce each provider's record-level sharing rules. Imported Markdown, backups and browser/device caches can be read by people with access to those files/devices. Use a vault and devices whose readers are authorised for the imported data. Workspace administrators can read these projects. Loss of provider access stops synchronisation; it does not erase previous imports or exports.

| Source | Setup and read permissions | Optional publication | Limits |
| --- | --- | --- | --- |
| Obsidian | Set `OBSIDIAN_ROOT` to an explicitly selected vault root. Configure a relative folder, note ID property and vault name. Notes require stable frontmatter IDs; opted-in checklist items also require `^block-ids`. | Enable Edit (title), Assign or Transition individually. Writes preserve note bodies and unrelated YAML, check the full file revision and retain a previous-file backup. | No arbitrary note creation or comment publication. Up to 10,000 Markdown files / 50 MB total / 2 MB per file. A root on the host is not automatically available inside Docker. |
| Jira Cloud | Register a 3LO OAuth app. Set `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `APP_ORIGIN`. Scopes: `read:jira-work`, `read:jira-user`, `offline_access`. Connect, select a Cloud ID and scoped JQL, map source statuses/types/priorities, then preview. | Individually enable Create, Edit title, Assign by account ID, Transition by transition ID, or Comment. Reconnect to consent to `write:jira-work`. Provider permissions and required fields still apply. | Basic creation supports project, issue type and title; additional required custom fields can cause a visible rejection. Unsupported rich text remains in the source snapshot. Up to 10,000 results; pagination and rate-limit responses are handled. |
| SharePoint Excel | Register a Microsoft web app. Set `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT`, `APP_ORIGIN`. Delegated `Files.Read.All` plus `offline_access`; tenant consent policy applies. Configure drive ID, workbook item ID, named table and unique stable ID column. | Read-only. No Excel or SharePoint write permission is requested. | `.xlsx` download, 20 MB compressed / 100 MB expanded / 10,000 rows / 5,000 ZIP entries. IDs cannot be formulas. Use ISO date text columns. Selected-resource permission variants are not implemented or tenant-verified. |

Register exact callbacks `${APP_ORIGIN}/api/source-callback/jira` and `${APP_ORIGIN}/api/source-callback/excel`. Use HTTPS, or localhost during development. OAuth tokens are encrypted with a server key in `.pencils/source-key`; keep that key with the installation backup and restrict filesystem access. Do not commit secrets to `.env` or source control. Docker Compose passes the OAuth variables; mount an Obsidian folder explicitly (read-only for imports) and set `OBSIDIAN_CONTAINER_ROOT` to its container path. Enable writes only with an intentionally writable mount.

Publish actions are explicit and logged. Failed, conflicting and uncertain outcomes remain visible; uncertain remote writes are not blindly retried. Source conflicts display local/source values. Refresh and review the provider after an uncertain outcome. These adapters have fixture and mocked-provider coverage; live consent, provider permissions and tenant behaviour still require your accounts.

## Drawing on iPad and offline recovery

**Boards** combines tasks, notes, images and drawing in one view. The **Boards** menu opens the canvas gallery, task links, local checkpoints and offline drawing tools. All existing drawings appear in the canvas selector and gallery; old drawing URLs still open the same canvas. Pen, colours, layers, reference images, selection and editable canvas/SVG/PNG exports work together. Lock reference images to keep them in place. Pencil draws; fingers select, move, resize, pan and pinch on every canvas. Pen preferences include drawing hand, a movable toolbar, pressure response and stabilisation. Pressure, sample timing, tilt and original sample coordinates are retained with new strokes.

The online app works across the local network. On iPad, **Prepare offline drawing** additionally requires a trusted HTTPS origin; plain LAN HTTP cannot register a service worker. Set up the existing native HTTPS/proxy deployment and trust its certificate on the iPad. Prepare while online, then open `/drawing-offline.html` once before disconnecting. The offline pad caches its own shell, not authenticated API responses.

All canvases checkpoint to IndexedDB on the current device. **Saved on this device** differs from server sync. The offline pad currently previews ink; other board objects and images remain in the document but are not rendered there. On reconnect, open **Local checkpoints → Sync checkpoint** for a guarded three-way merge, or **Restore as copy** to retain both versions. Opening a canvas never replaces a pending offline checkpoint. Browser storage can be cleared or evicted; export and server backups remain necessary. The iPad Pro 2021/Pencil 2 feel, pressure calibration and palm rejection require physical-device verification; no hover feature is assumed.

## Project automation and diagnostics

Project settings offers disabled-by-default automation rules for manual, status-change and due-date triggers. Actions set status, priority, assignee or a tag. Preview changes before enabling/running a rule. Due-date rules use UTC and exclude completed/archived tasks. Actions do not recursively trigger rules; source-owned fields are skipped. Run logs retain counts and failures, and repeated automatic failures wait for changed inputs or another day. Each run is limited to 200 tasks, with at most 20 rules per project.

**Diagnostics** is administrator-only and reports aggregate request timings, HTTP errors, index rebuilds and retained journal conflicts without request bodies or tokens. Markdown/canvas files remain authoritative. SQLite is a rebuildable search/query index; use `npm run index:rebuild` or the Diagnostics button to recreate it. Node **22.12 or later** is required (tested with 22.22.1); its built-in SQLite API can print an experimental warning.

Related local writes have a recoverable journal and a process writer lock. A crash rolls back incomplete known writes; external edits are preserved as conflicts under `.pencils/journal`. Do not delete a writer lock while a server may be using it. These guarantees cover local vault records, not a distributed transaction with Jira, Microsoft or an external Obsidian vault. Project subscriptions send record deltas, with full refresh when safe delta reconstruction is unavailable.

## Review implementation checks

[IMPLEMENTATION.md](IMPLEMENTATION.md) maps the 60 review recommendations to code, checks and verification limits. Run `npm run test:release` for syntax, model/server tests and 12 maintained journeys in each of Chromium, Firefox and WebKit. Install the Playwright browsers and their platform dependencies first (`npx playwright install-deps` on supported Linux distributions). `GATE_BROWSERS=webkit node test/browser-gate.mjs` selects one engine for targeted work. `npm run test:accessibility` checks all nine views in light/dark themes using axe; this does not replace a manual screen-reader or physical-device review. `npm run test:table-performance` measures 1k/10k/50k query models, not full network/render latency. All fixtures use temporary vaults. The drawing interruption test stops its temporary origin, avoiding a [WebKit offline-emulation bug](https://github.com/microsoft/playwright/issues/42775).
