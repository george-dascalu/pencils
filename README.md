# Pencils

An offline project workspace for **organisations → projects → hierarchical tasks**, with portable Markdown notes and a Docker web interface. Shared mode is ready for trusted devices on your local network; optional accounts restrict access by organisation.

## Make the workspace yours

Every project view uses the same compact header: project title in the breadcrumb, view tabs, Project menu, Project settings and New task. The Project menu contains details, progress, saved views, workflow, imports and task templates. List, Tree, Table, Kanban, Calendar and Timeline keep search, status/type filters and sorting in one compact toolbar; additional filters and grouping are under **Filters**, with a count of active extra filters.

View tabs are grouped into **Overview**, **List / Tree / Table**, **Kanban / Board**, and **Calendar / Timeline**. Overview shows project progress, open/blocked/overdue tasks, status counts and upcoming deadlines.

Development rule: **Consistency**. Reuse shared UI and keep common actions, terminology and behaviour aligned across views. See [AGENTS.md](AGENTS.md).

- Use the sidebar toggle in the top bar to collapse or expand navigation on desktop. Your choice survives reloads. On phones, the menu still opens a navigation drawer.
- Open **Personal settings** with the avatar at the top right. Choose Light, Dark, or System appearance and one of eight fonts: Manrope (default), DM Sans, Space Grotesk, Outfit, Sora, Work Sans, Lora, or Fraunces. Preferences are local to this browser and shared across its tabs; other devices retain their own choices.
- Fonts and their SIL Open Font Licenses are bundled under `public/fonts/`, with source links in `SOURCES.json`. No external font service is used at runtime.
- Open **Project settings** to edit the ordered status list and specify which statuses count as completed. New projects can define their own workflow during creation. Changes apply only to that project and are stored in its Markdown frontmatter. A status used by an existing task cannot be removed until those tasks are moved to another status. **Workflow & fields** also manages task types and custom fields.

## Run with Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:3000**, or **http://SERVER-IP:3000** from another device on the same network. The server computer must be running and reachable. No internet service, CDN, font server, account provider or API key is required at runtime. Building the image initially needs internet access for Node and npm packages; see the offline instructions below to transfer a prebuilt image.

Set `VAULT_PATH` to the folder you want to use, and set `LOCAL_UID` / `LOCAL_GID` to the output of `id -u` / `id -g` on Linux. The app runs as that user in a read-only container, with a writable vault mount. The host folder must be writable by that user. Stop with `docker compose down`; the vault remains on disk.

The empty workspace offers an optional example project. No sample content is created automatically.

## What you can do

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

Board view uses the shared compact project header and fills the remaining window. **Board** manages canvases; **Add** inserts objects; **Navigate** opens the outline and presentation; **More** holds canvas templates, exports, history and snapping. Project settings and New task remain beside the view tabs. **Expand board** hides the surrounding workspace, and **Full screen** also hides browser chrome.

Drag the sticky-note icon from the left toolbar onto the canvas to place a note. A preview follows the pointer; releasing on the canvas creates the note and opens its editor. Escape or dropping outside the canvas cancels. Clicking the tool then clicking the canvas still works.

Selected objects have a compact icon toolbar above them, grouped into appearance, comments, arrangement and object actions. Colour, alignment/grouping and extra actions open small menus. Controls adapt to the selection, support keyboard navigation and respect locked objects.

Each project can have multiple named canvases. The board includes eight connected capabilities:

1. **Direct editing:** double-click text or a note to edit Markdown or rich text inline; **Ctrl/Cmd+Enter** saves and **Escape** cancels. A contextual toolbar offers editing, comments, focus, appearance, framing, alignment, duplication, grouping and locking. Drag connection handles from any side of a selected object.
2. **Live notes:** task cards share the original task status and Markdown. **Live note** embeds any Markdown file in the current project. Use **Embed…** for `#Heading` or `#^block-id`; edits preserve the rest of the source note. **Backlinks** finds references from task notes and ordinary project Markdown files. `![[Task#Heading]]` and block transclusions render loaded task content, with bounded nesting.
3. **Native Obsidian files:** boards are saved directly as `.canvas` using [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/). Open the same file in Obsidian; changes appear when idle browsers refresh. Standard positions, note content, file paths, subpaths, colors, groups and connector endpoints round-trip. Unknown extensions are retained. Import/export also supports native `.canvas` files.
4. **Meaningful connectors:** choose straight, curved or elbow routes, attachment sides, start/end arrows, color, label and relationship. A **blocks** relationship can explicitly create a real task prerequisite; cycles are rejected. Deleting a visual connector leaves that task prerequisite intact.
5. **Structured frames:** nest frames through **Style / frame** or spatial containment, collapse/expand them, navigate the outline, and reorder presentation slides. Moving a frame moves its contents. Start with brainstorm, retrospective or roadmap templates; save a selection as a reusable template in that canvas. **Present** steps through frames with arrow keys and exits with Escape.
6. **Task planning:** overdue and blocked cards are highlighted. Filter by owner/status, convert a sticky into a real task while retaining its connectors/comments, or embed a **Live task view**. View cards follow a named project view or their own filters, showing up to 100 matching tasks.
7. **LAN collaboration:** participants see each other’s names, cursors and selected objects. Object comments can be resolved/reopened. Independent changes merge; overlapping changes stay in Recovery for an explicit choice. Each save commits an operation log together with the board. **Activity** and keyboard undo/redo check affected values before changing them. Save retries reuse the original operation ID, including when an acknowledgement is lost. Each browser tab keeps its own pending queue.
8. **Large boards and tablets:** search and jump to objects, navigate the minimap, use **Shift+2** to focus a selection, and pan/zoom with two fingers. Pen drawing stores pressure samples. Offscreen cards are culled; broad overviews use a bitmap so detailed DOM remains bounded.

Pan with **Space+drag**, the hand tool, right/middle mouse button or **Shift+scroll**. Zoom with **scroll**, **Ctrl/Cmd+wheel** or pinch. **Shift-click** and a drag on empty canvas select multiple objects. **Ctrl/Cmd+A**, **D**, **C/V** select, duplicate and copy/paste objects. Snap uses a 20-pixel grid; hold Alt to bypass it. Export a whole board as SVG or PNG for sharing.

Collaboration uses the local server, with presence updates approximately every 800 ms and inactive participants expiring after 15 seconds. It does not perform character-by-character coauthoring: competing edits to the same text are shown as conflicts. Comments, drawing pressure, queries, nested-frame settings, templates and activity are Pencils extensions; Obsidian retains their data but does not provide the corresponding Pencils interface. References outside the current project remain intact for Obsidian, but Pencils does not read their content. Links open on demand; external web pages are not fetched into the offline board.

The recent operation log retains up to 200 operations (approximately 2 MB, or one larger operation). Older logs remain in file history. Keyboard undo/redo belongs to the current browser tab; **Activity** provides guarded undo after a restart or from another device. Full-file restoration is available through **History**.

## Markdown and Obsidian

Open `VAULT_PATH` as an Obsidian vault:

```text
vault/
  Organisations/o-….md
  Projects/p-…/
    project.md
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

The preview supports GFM Markdown, tables, fenced code, task lists, wiki links, backlinks within a project and local attachment images. Raw HTML is displayed as text and output is sanitized. Remote images are displayed as a text reference rather than fetched, so opening notes never requires internet access. Cross-project wiki links resolve when those tasks have been loaded by global search or the overview; Obsidian plugins are not executed. Heading and paragraph/list block references are supported in live cards; advanced plugin-specific Markdown syntax is preserved as source.

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
BROWSER=firefox npm run test:board-editor
BROWSER=firefox npm run test:canvas-controls
```

Tests use temporary vaults. They cover Markdown persistence/migration, file revisions, safe paths, UTF-8 request chunking, backup/history/trash restore, workflow validation, recurrence, three-way merge, organisation permissions, browser editing, saved views, range paste, offline save recovery, canvas manipulation/export and mobile layout. `test/offline.mjs` and `test/compose.offline.yaml` verify an isolated Docker deployment without outbound connectivity.

Board navigation uses **scroll to zoom at the pointer** and **Shift + scroll to pan vertically**. Pinch and Ctrl/Command-wheel also zoom. Right-drag, middle-drag and Space-drag pan while preserving selection. V selects, H pans, N/T/S select click-to-place sticky/text/shape tools, L connects and P draws. Ctrl/Command-click adds or removes a selection; Alt/Option-drag duplicates. F1 opens the shortcut reference. Native touch pan/pinch and pressure-sensitive pen input remain available.

**Expand board** fills the browser window; the adjacent **Full screen** button also hides browser chrome where supported. Escape returns to the normal view (first closing an active editor or presentation). Card actions float above the selection, or below it when there is not enough room above.

Double-click a text object, sticky, task or note, then choose **Rich text** for visual editing with bold, italic, strikethrough, headings, lists, quotes and links. **Markdown** exposes the source. **Preview** renders the current draft without saving; **Back to edit** returns to the previous editor mode. Visual edits are converted to Markdown for Obsidian; conversion may normalize Markdown formatting. Wiki links and local attachment references are preserved. Pasted content is inserted as plain text.

The board performance test uses a temporary 5,000-object / 2,000-connector board with live task cards and drawings. Regression budgets are under 6 seconds from navigation to a usable board, fewer than 700 detailed DOM cards, and under 150 ms at the 95th percentile for a two-frame pan measurement. One local Chromium run measured **342 ms initial load**, **24 detailed cards**, and **35 ms pan p95**; hardware and network affect those numbers. The same test exercises real browser touch and pen events, including pinch zoom and pressure persistence.
