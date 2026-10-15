# Pencils

An offline project workspace for **organisations → projects → hierarchical tasks**, with portable Markdown notes and a Docker web interface. Shared mode is ready for trusted devices on your local network; optional accounts restrict access by organisation.

See [CHANGELOG.md](CHANGELOG.md) for dated additions, changes and fixes.

## Make the workspace yours

Every project view uses the same compact header: project title in the breadcrumb, view tabs, Project menu, Project settings and New task. The Project menu contains details, progress, saved views, workflow, imports and task templates. List, Tree, Table, Kanban, Calendar and Timeline keep search, status/type filters and sorting in one compact toolbar; additional filters and grouping are under **Filters**, with a count of active extra filters.

View tabs are grouped into **Overview**, **List / Tree / Table**, **Kanban / Board**, and **Calendar / Timeline**. Overview shows project progress, open/blocked/overdue tasks, status counts and upcoming deadlines.

Colour fields throughout the app use the same circular swatch and dropdown palette, with a custom hex editor for exact colours.

Development rule: **Consistency**. Reuse shared UI and keep common actions, terminology and behaviour aligned across views. See [AGENTS.md](AGENTS.md).

- Use the sidebar toggle in the top bar to collapse or expand navigation on desktop. Your choice survives reloads. On phones, the menu still opens a navigation drawer.
- Open **Personal settings** with the avatar at the top right. Choose Light, Dark, or System appearance and one of eight fonts: Manrope (default), DM Sans, Space Grotesk, Outfit, Sora, Work Sans, Lora, or Fraunces. Preferences are local to this browser and shared across its tabs; other devices retain their own choices.
- Fonts and their SIL Open Font Licenses are bundled under `public/fonts/`, with source links in `SOURCES.json`. No external font service is used at runtime.
- Open **Project settings** to edit the ordered status list and specify which statuses count as completed. New projects can define their own workflow during creation. Changes apply only to that project and are stored in its Markdown frontmatter. A status used by an existing task cannot be removed until those tasks are moved to another status. **Workflow & fields** also manages task types and custom fields.

## Project settings and task IDs

Project settings opens as its own page. Set a unique 2–12 character project key, such as `WEB`; tasks receive IDs such as `WEB-1`, `WEB-2`. Numbers are never reused after deletion. Changing a project key updates the visible prefix and retains previous IDs as Obsidian aliases. Internal IDs, Markdown filenames and board links stay stable. Existing vaults receive keys and task numbers automatically, with a backup before migration. Keep each project's `identity.md` registry when moving or backing up files.

On a board, the **Project tasks** icon in the left toolbar opens a task browser. Search the current project by ID or title, and filter by status, card type, assignee or whether a task is already on this board. Drag a result onto the canvas to place a linked card at the preview position without changing the camera, or click to place it automatically. Escape or releasing outside the canvas cancels a drag. On touch screens, drag sideways from a task; vertical gestures scroll the list. **New project task** replaces the list with a compact side panel, leaving the board usable. Back returns to the list and retains an unsaved browser draft. Creating the task places its linked card on the current board and reopens the list. Existing tasks still expand into the full editor. Board cards show title/expand, then ID/priority/status/assignee, then description; priority and status use coloured controls. Removing a card only removes that visual representation. Editing a linked task from any view updates the same Markdown record.

## Run with Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:3000**, or **http://SERVER-IP:3000** from another device on the same network. The server computer must be running and reachable. No internet service, CDN, font server, account provider or API key is required at runtime. Building the image initially needs internet access for Node and npm packages; see the offline instructions below to transfer a prebuilt image.

Set `VAULT_PATH` to the folder you want to use, and set `LOCAL_UID` / `LOCAL_GID` to the output of `id -u` / `id -g` on Linux. The app runs as that user in a read-only container, with a writable vault mount. The host folder must be writable by that user. Stop with `docker compose down`; the vault remains on disk.

The empty workspace offers an optional example project. No sample content is created automatically.

## What you can do

In **Project settings → Cards Hierarchies**, choose Freeflow or Enforce rules. The matrix controls which parent types allow each child type. The “No parent” row controls which types can exist at the top level. Enforced rules apply to task creation, reparenting, type changes and history restoration. Existing tasks must satisfy the rules before they can be enabled. Freeflow preserves the configured rules without restricting relationships; cycles are always rejected.

Add draft subtasks in the new-task editor before saving the parent. Choose each subtask’s type, enter its title and press Enter or Add. Drafts can be removed before saving; a title still in the capture field is included when creating the task. The parent and children are validated together, and retries do not create duplicates. Subtasks receive their own project task IDs.

Date fields use a shared Monday-first calendar with stronger weekdays and muted weekend columns. Type dates directly, or open the calendar button (Alt+Down from the field); arrow keys navigate days, Page Up/Down changes months, and Escape closes it. The Calendar view uses the same weekday/weekend distinction.

The task editor uses a compact layout with Planning & relationships collapsed by default. Descriptions open in a WYSIWYG editor with the same formatting controls as board notes; Markdown and Preview remain available. Descriptions are still saved as Markdown, and browser drafts and attachments are preserved.

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

Edit cells and use **Shift-click** for rectangular range selection, **Ctrl/Cmd+C/V** for TSV copy/paste, and **Alt+arrow keys** or **Enter** to navigate cells. Paste into existing visible rows; add rows first if needed. Select rows for bulk status changes or archiving. Resize columns with header handles, or use **Columns** to hide/reorder them. Save a named view to share its layout.

Rapid changes to the same task are serialized and retain the latest revision. Invalid values and unresolved concurrent edits remain recoverable in **Recovery & backups**. Spreadsheet formulas and Excel workbook import/export are not implemented.

### Board

The selection toolbar's text menu contains font, size, vertical alignment, fit-to-box and copy/paste formatting. **More → Bulk notes** creates one sticky per pasted line. Shape controls offer flowchart shapes, borders and rotation; image controls offer non-destructive crop percentages and replacement without breaking connections.

**Arrange** includes matching dimensions, tidy columns/gaps and selected-frame PDF export. A multi-selection has four outer resize handles. **More → Layers** assigns selections to named layers and hides or locks their objects. Frame links open the project, board and frame directly; copying objects and pasting with a destination frame selected places them inside that frame. Frame PDF pages are rasterised locally from the SVG export, without an external service. Exported text uses the simplified SVG representation; it is not a full browser screenshot.

Grid cell controls include merge/unmerge, fit contents and Auto/Manual sizing. Merging retains each cell's original text and formatting; unmerge restores them. If the merged text was edited, the edited anchor and the other original cells are retained. Structural row/column changes unmerge affected content first. Manual sizing does not grow a grid to accept an oversized dropped object.

Connectors support draggable bends and labels, additional labels in the label menu, automatic body attachment and optional crossing jumps on straight/elbow routes. Double-click a bend to remove it. Clicking a connection port creates a connected note. Explicit port drops keep fixed-side attachment.

Live task cards can display List, Table, Kanban or Timeline layouts. Each keeps its own filters and visible table fields. Dragging a task between embedded Kanban columns updates its project status. Timeline bars and their ends change task dates; the scale selector changes day/week/month density, diamonds mark milestones, and undated tasks can be dragged onto a dated track.

The Pen toolbar includes a partial eraser, lasso selection and optional simple shape recognition. Pen and highlighter remember their styles separately within each preset. **More → Board session** offers presenter sharing, opt-in invitations, a local timer and voting on selected objects. Following never starts without the recipient choosing it. Votes and timer state are stored with the board; presenter presence is temporary.

Personal settings can switch between wheel-to-zoom mouse navigation and scroll-to-pan trackpad navigation, and disable single-letter shortcuts. Tab cycles board objects; Alt + Up/Down selects a parent/child; Alt + Shift + arrows resizes by 10 pixels. Existing Shift + corner drag remains axis constrained.


Board view uses the shared compact project header and fills the remaining window. **Board** manages canvases. The left toolbar creates objects and opens **Project tasks**; **More** provides live notes, live task views, images, the outline, presentation, frame navigation, canvas templates, exports and history. **Board settings** controls the board name, snapping and appearance. Project settings and New task remain beside the view tabs. Expanding a task card opens the same compact, nonmodal side editor as New task; editing keeps the board camera unchanged and retains subtasks, footer actions and version history. **Expand board** hides the surrounding workspace, and **Full screen** also hides browser chrome.

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

Open `VAULT_PATH` as an Obsidian vault:

```text
vault/
  Organisations/o-….md
  Projects/p-…/
    project.md
    identity.md              reserved task numbers and next sequence
    tasks/t-….md
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

Filesystem notifications refresh idle browsers when notes change externally. Only live project/organisation folders are watched; if the operating system runs out of watchers, the server falls back to five-second polling without stopping writes. A rebuildable in-memory parse index avoids reparsing unchanged notes; file timestamps and revisions are still checked before writes. Task views render pages of 100 items; timeline displays up to 200 dated tasks. The server still returns a project snapshot, so very large vaults may need more indexing/pagination work. Boards support 10,000 objects, 20,000 connectors and 500 frames, within a 16 MB API request limit. Canvas imports are limited to 12 MB. Attachments support PNG/JPEG/GIF/WebP, PDF, text, Markdown, CSV and ZIP up to 10 MB.

## Recovery and concurrent editing

- **History:** before a note is overwritten by the app, its previous exact contents are retained. Task/project/board history can restore a version while retaining the displaced version. External edits are captured when the app next replaces that note; this is not a complete filesystem audit log.
- **Trash:** tasks, boards and projects can be restored in the app. Removing a task with children or dependants is rejected to avoid dangling relationships. A restored task may need relationship repairs if its related tasks were subsequently removed.
- **Backups:** before the first app mutation each day, a ZIP backup of `Projects/` and `Organisations/` is created. Manual backups, downloads, upload of backup ZIPs up to 10 MB, and full restore are available. Restore first backs up the current state and rolls back directory replacement if an I/O operation fails. Restore supports archives up to 200 MB uncompressed / 30,000 files.
- **Browser drafts:** task, project and organisation editor drafts are retained locally and offered when that editor is reopened. Task, live-note and canvas save queues survive reload and retry connectivity failures. Clearing browser storage removes these drafts; the app must already be loaded to keep editing during a server interruption.
- **Conflicts:** independent fields and independent board objects are merged automatically. If both writers change the same value, Recovery shows both versions and lets you choose which conflicting values to keep, while preserving independent changes. Drafts can be exported before discarding them.

Backups do not include `.history`, `.trash`, account credentials or unrelated folders in an existing Obsidian vault. Copy the entire vault separately if you need those, and keep an off-device backup: backups on the same disk cannot protect against disk failure. Backups and history are retained until the administrator removes them from the filesystem, so monitor disk use. While restoring, pause external Obsidian edits; application mutations are serialized, but external editors cannot participate in that queue. Board operations are stored atomically in the native canvas; Activity exposes that durable history. External editors cannot participate in the application writer queue, so avoid simultaneous filesystem writes to the same file while a restore is running.

## Optional accounts and remote access

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

Without Docker, use Node 22 or newer:

```bash
npm ci
npm start
```

`VAULT_PATH`, `HOST` and `PORT` configure the local server. Runtime dependencies are served locally from `node_modules`; no browser CDN is used.

## Validation

```bash
npm run check
npm test
npx playwright install chromium firefox
npm run test:browser
npm run test:upgrade
BROWSER=firefox npm run test:upgrade
npm run test:canvas
BROWSER=firefox npm run test:canvas
npm run test:canvas-performance
npm run test:canvas-controls
npm run test:personal
npm run test:board-editor
npm run test:in-place-editing
npm run test:inline-autosave
npm run test:bullet-shortcuts
npm run test:board-interactions
npm run test:connector-toolbar
npm run test:selection-filter
npm run test:alignment
npm run test:frames
BROWSER=firefox npm run test:board-editor
BROWSER=firefox npm run test:in-place-editing
BROWSER=firefox npm run test:canvas-controls
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

Task editors use an editable title header, icon selectors, an inline subtask list and a right-hand version-history panel. Clicking the backdrop closes the editor; unsaved changes remain a browser draft that can be restored when reopening the task.

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
