# Note-taking features — design

Owner request, 29 October 2026: implement research ideas 1–10, the Omnisearch lessons for search, Templates, and the List Callouts plugin. Each item ships as its own patch release with its tests, changelog entry and a short review. Everything stays readable in Obsidian.

Decisions (owner, 29 Oct): captures land in a chosen project tagged `inbox`; Today notes live in a personal space outside every project; sketches are stored as a server-drawn SVG plus stroke data; iPad and desktop get a Search button in the top bar.

## Build order

### 1. List Callouts
- Syntax as the Obsidian plugin (github.com/mgmeyers/obsidian-list-callouts): list marker, optional checkbox, one of `! ? & ~ @ $ %`, a space, then text (`- ! item`, `- [ ] ? item`, `1. @ item`). The character stays in the Markdown.
- Names and colours: `!` Important (red), `?` Question (orange), `&` Bookmark (yellow), `~` Idea (purple), `@` Person (cyan), `$` Cost (green), `%` Aside (grey). Each has an icon.
- Live preview (`public/document-editor.js` decorations): line tint plus colour token; the character is replaced by an icon widget, also while the cursor is on the line. Reading view: the same through `public/document-markdown.js`.
- Slash menu: a "List callout" entry per character.
- Fix: block callout titles show as typed (drop `text-transform: capitalize`, `public/project-documents.css`).

### 2. Card mentions
- `[[KEY-12]]` (also `[[KEY-12|label]]`) in a document resolves to a card of the open project when no document matches; Obsidian resolves it through the card's `aliases`.
- Renders as a card chip (type icon, key, title, status chip) in live preview and reading view; click opens the card editor.
- `[[` completion lists cards (key and title) after documents.
- Selected text → **Make card** (selection toolbar): creates a card titled with the first line, links the document (`documents` on the card), and replaces the selection with `[[KEY]]`.

### 3. Unlinked mentions
- The document Tools panel's Backlinks section adds "Unlinked mentions": other documents containing this document's title as plain text, each with **Link** (turns that occurrence into `[[…]]`).
- The card editor's documents section lists documents that mention the card's key, linked or not.

### 4. Live task queries
- Fenced block ```` ```tasks ```` with one instruction per line, a subset of the Obsidian Tasks syntax: `done`, `not done`, `due today`, `due before <date>`, `due after <date>`, `overdue`, `assignee is me|<name>`, `status is <status>`, `priority is <priority>`, `type is <type>`, `tag includes <tag>`, `sort by due|priority|status|title|created`, `limit <n>`. Compiles to `public/query-model.js` rules; unknown lines show as an error inside the block.
- Scope: the document's project. Renders live card rows (same field order as List); ticking a row's checkbox moves the card to done; click opens it.
- Slash item **Task query** inserts a starter block.

### 5. Templates
- Document templates: documents in a folder named "Templates" (project or personal space). **New from template** in the New menu and document explorer.
- Variables: `{{title}}`, `{{date}}`, `{{time}}`, `{{date:FORMAT}}` / `{{time:FORMAT}}` (YYYY, MM, DD, HH, mm tokens), `{{project}}`, `{{cursor}}` (caret position), `{{prompt:Label}}` (asked in a small panel before creating). No script execution.
- Restore **Save as template** in the card editor for card templates (the dialog promises it; the code is missing).

### 6. Personal space and Today note
- Personal space: one private space per account, shown in the sidebar above organisations as "Personal". It holds documents only (with folders, templates, links, attachments). Internally a project record with `personal: <username>`, stored at `Projects/<id>/`, excluded from organisation project lists and readable/writable only by its owner.
- **Today** (sidebar entry, command and Ctrl/⌘ K) opens or creates `YYYY-MM-DD` in the personal space's "Daily" folder, from a "Daily" template when present; the default body includes a `tasks` block for cards assigned to me that are due today or overdue (queries in the personal space read across the projects you can open).

### 7. Search, Omnisearch-style
- Server index (`server/index-worker.js`): one FTS5 table for cards, documents and board text with `kind`, `project`, and weighted columns: title/key/aliases, headings, tags, body; `bm25()` weights 10/5/3/1; `prefix` index; `remove_diacritics 2`. Updated incrementally from the change log.
- `GET /api/search` returns one ranked list across allowed projects (and the caller's personal space) with `snippet()` excerpts; title-prefix and recency boosts applied after ranking.
- Query syntax: words (prefix match), `"phrase"`, `-word`, `#tag`, `in:cards|docs|boards`. When nothing matches, a "Did you mean" suggestion from `fts5vocab` within one or two edits.
- Dialog: highlighted excerpts and kind icons; Enter opens; Alt+Enter inserts a `[[link]]` into the open document. Search button in the top bar on every width (phones keep it in the bottom bar).

### 8. Document properties and tags
- Frontmatter `tags` plus owner-defined properties of type text, number, date, checkbox or list, as top-level keys (reserved: id, kind, project, title, created, updated, folder, version, comments). Server validates names and values.
- Properties panel at the top of the document (collapsible); tag chips; the explorer and search filter by `#tag`.

### 9. Comments on document text
- Select text → **Comment**. Stored in the document's frontmatter `comments` with an anchor `{quote, prefix, suffix}`; the body stays unchanged.
- Anchored ranges are highlighted; threads reuse `public/board-comments.js` (replies, reactions, resolve). A comment whose quote no longer exists shows as detached.

### 10. Phone quick capture
- Settings → You → "Capture from your phone": create a capture token (shown once), revoke it, pick the destination project, and follow the iOS Shortcut steps.
- `POST /api/capture` with `Authorization: Bearer <token>` and `{ text }`: the first line becomes the title, the rest the description, `#tags` become tags, plus `inbox`.
- Security: tokens are random, stored as SHA-256 hashes, can only create cards in the chosen project, and are rate-limited. Only this endpoint accepts bearer tokens and skips the same-origin check (no cookies are involved).

### 11. Sketches in documents
- Slash item **Sketch** opens a pen pad (full screen on phones, a panel on iPad and desktop) built from `public/pen-model.js` and `public/ink-preview.js`, with a reusable module extracted from the offline pad.
- Saving sends the strokes to the server, which validates them with the board stroke rules and writes `attachments/s-<uuid>.json` (strokes) and `attachments/s-<uuid>.svg` (drawn by the server from numbers and colours only). The document embeds `![[attachments/s-<uuid>.svg]]`, so Obsidian shows the drawing. Tapping a sketch reopens the pad; each save writes a new file pair and updates the embed.

### 12. Style settings (owner request, 29 Oct, like Obsidian's Style Settings)
- Settings → You → Appearance gains a **Style** group of fixed options, each a CSS custom property applied on the root element by `public/appearance.js` and kept with the other appearance choices in this browser: accent colour (shared colour picker), document text size, readable line width, line height, document and code fonts, corner roundness, heading colours, block callout and list callout colours. Every option shows its default and has a reset; **Reset all** restores defaults.
- Options only change tokens the shared styles already use; light and dark themes keep working, and Compact mode and 44px touch targets are unaffected.

## Out of scope (for later)
Natural-language dates, Day Planner time blocks, weekly notes, `.base` export, client-side search index, arbitrary template scripts.

## Testing
Each item: unit tests for parsers and models (query syntax, template variables, list-callout detection, search query parsing, capture text parsing), Playwright specs on phone and desktop for the user flow, and the release's affected run. Security-relevant items (capture tokens, personal space access, sketch SVG) get server tests for refusal cases.
