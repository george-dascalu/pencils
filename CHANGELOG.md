# Changelog

User-facing additions, changes and fixes, newest first. Dates use Europe/London and `YYYY-MM-DD`.

## 0.19.30 — 2026-10-29

### Fixed

- The page no longer redraws itself about 30 seconds after your own save, or when nothing has changed but the server lists records in another order.
- Removing or recreating folders in the vault while Pencils runs (for example from Obsidian) keeps every folder watched, and a folder that disappears mid-scan no longer risks stopping the server.
- On a board, background updates also wait while you type in a formatted text field.

## 0.19.29 — 2026-10-29

### Changed

- Saving no longer redraws the whole page a moment later. Your own saves, and changes in other projects, are recognised and skipped; changes from other people or Obsidian still appear within a second or two.

### Fixed

- On a board, a change held back while you were busy (for example typing in search) now applies as soon as you finish, instead of waiting for the next change.
- On phones, closing board search with Escape returns focus to the board instead of leaving it in the hidden search field, which held back later updates.
- Ctrl/⌘ shortcuts such as Ctrl+K (search and commands) work while a header menu button has focus, for example New right after closing a new card.
- **Update plan** on a project frame no longer fails now and then with "Tasks changed" when nothing had changed.
- Board search results with long titles no longer overlap, so choosing one selects that object rather than the one below it.
- An open attachment preview is no longer closed by a change arriving from elsewhere, and toolbar buttons such as Board settings keep keyboard focus when the board refreshes.
- **Invite everyone to my view** works straight after opening a board; an invitation sent while the board was still loading was dropped.

## 0.19.28 — 2026-10-29

### Fixed

- Edits made in Obsidian (or any editor that saves in place) to a note Pencils had already saved now show up in open browsers. Previously such a file stopped being watched on Linux, including in the Docker image.
- Keyboard focus stays on the selected board object, or on the board, when the board refreshes after a save, so Delete, arrow keys and shortcuts keep working.
- Closing the card editor returns focus to the task even when its save finishes just after the editor closes.
- A new project appears in the sidebar as soon as it opens.
- A project moved to another organisation reopens when you switch to that organisation.
- An open New menu no longer closes when the page refreshes in the background.
- Text alignment is back in the toolbar while editing frame titles, live task views and other plain-text board objects.
- After choosing a board search result, the next results stay clickable: the search panel now sits above the selection toolbar.
- Board search has a Close button, so phones can close it without tapping the board.
- On desktop with the sidebar open, the header shows **Update available** when a newer version is deployed.
- The formatting toolbar's scroll arrows are full 44px touch targets.

## 0.19.27 — 2026-10-28

### Changed

- Documents no longer has its own second sidebar. On iPad and desktop, the document list (search, folders, New document, New folder and Import Markdown) sits in the main sidebar under the projects while Documents is open, and the editor uses the full width.
- On phones there is a single menu button. Its Documents tile shows the document list inside the menu, with a back arrow to return. Opening the menu while in Documents goes straight to the list, and choosing or creating a document closes it.
- The document heading no longer has its own menu button.

## 0.19.26 — 2026-10-28

### Changed

- The phone menu fits on one screen. It opens on a switcher naming the current project and its organisation, followed by New, the views as compact tiles grouped under Workspace, Tasks and Planning, and one row for project settings, help, your settings and feature requests.
- Tapping the switcher shows the organisation, projects and teams, with New project offered once. While it is open, the views are hidden. Opening the menu without a project shows the projects straight away.
- Menu text uses the app's touch sizes, with one left edge for rows and section labels.

## 0.19.25 — 2026-10-28

### Fixed

- Pressing Back, or swiping back on iPhone, while a board's comments panel is open now closes the panel instead of leaving it over the previous view.
- In a document, Ctrl+Home and Ctrl+End (Cmd+Up and Cmd+Down on Mac) inside a code block, table cell or callout move to the start or end of that block. Previously the next typing went to the start of the document. Holding Shift selects to the start or end of the block.
- On iPad and desktop, the fold arrows beside document headings line up with their headings, and clicking or tapping one folds or unfolds the section. Before, the arrows sat below their headings and did nothing.

## 0.19.24 — 2026-10-28

### Fixed

- On iPhone and iPad, tapping Fit width, Scroll, Add row or Add column under a document table no longer opens the keyboard. The same applies to any button inside a document block. On touch screens, Add row and Add column no longer put the cursor in the new cell; with a keyboard and mouse they still do.

## 0.19.23 — 2026-10-28

### Changed

- On phones, documents no longer show the fold column on the left. Text has the same 16px margin on both sides, in live preview and reading mode. iPad and desktop keep the fold arrows.

### Fixed

- Headings in live preview no longer start one space to the right of paragraph text.

## 0.19.22 — 2026-10-28

### Added

- Each table in a document has a Fit width / Scroll switch next to Add row and Add column. Fit width, the default, wraps the table to the page. Scroll keeps whole words on one line and lets the table scroll sideways. The choice is saved in the document as an invisible comment before the table, so it also applies in reading mode and stays hidden in other Markdown apps.

## 0.19.21 — 2026-10-28

### Fixed

- A code block written as "javascript", "py", "sh" or another alias now shows its language in the menu, for example JavaScript, instead of an extra lowercase entry. The block's text is left as written until you choose a language.

## 0.19.20 — 2026-10-28

### Added

- Code blocks in documents show syntax colours in live preview and reading mode, in light and dark themes. Keywords, strings, comments, numbers, names and types each have their own colour, and the code stays plain editable text.
- Each code block has a language menu. Choose JavaScript, Python, SQL, Shell and 20 more, or Plain text, without editing the block's text. The colours update straight away.

## 0.19.19 — 2026-10-28

### Added

- Type "/" at the start of a line or after a space in a document to insert an element, as in Obsidian. The menu offers the Insert panel's elements in the same groups, plus Heading 2 and Heading 3. Keep typing to filter, then press Enter or tap an item. Escape closes the menu and keeps what you typed.

### Changed

- Document link suggestions (after "[[") use the app's font and icons.

### Fixed

- Turning an empty line into a heading, list item, checklist item or quote now leaves the cursor after the new marker, so typing continues in the right place.

## 0.19.18 — 2026-10-28

### Fixed

- On iPhone and iPad, tapping a checklist box in a document ticks it without opening the keyboard.
- A document keeps its scroll position when the app refreshes after a save, for example after ticking a box and closing the keyboard, instead of jumping to the top.

## 0.19.17 — 2026-10-28

### Changed

- On phones and iPad, each swipe in the Table scrolls either sideways or up and down, never diagonally. The first movement picks the direction, and a flick keeps its momentum in that direction. A sideways swipe that starts on a title cell now scrolls the table. Mouse, trackpad and wheel scrolling are unchanged.

## 0.19.16 — 2026-10-28

### Fixed

- Relationship and dependency labels on a vertical arrow now sit beside the line instead of having it run through the words.

## 0.19.15 — 2026-10-28

### Changed

- Relationship arrows on boards read from start to end: "parent of", or "child of" when an arrow is drawn from the child, instead of "parent / child".
- Arrows of the same kind that fan out from one card now share a single label on their common line, instead of repeating it on every arrow. Hover the label to see every card it points to.
- With a board or document open, the top bar shows its name instead of the project's. On phones the second line shows the view and the project, for example "Boards · Project name". Wide desktop windows show Organisation / Project / Board.
- The comment box's send button now sits to the right of the text box, as tall as the box and slim, and shows a send icon. Its name changes to "Send reply" while you reply.

### Fixed

- Long titles on board task cards now end in an ellipsis instead of being cut off mid-word on iPhone and iPad.

## 0.19.14 — 2026-10-28

### Fixed

- On iPhone and iPad, a pinch no longer zooms the whole app. This covers pinches inside a dialog or the card editor's description, and pinches with one finger on a dialog and one on the board.
- The board now pans and zooms only while every finger is on it. A finger on a dialog, the card panel or other controls stops the board following the other finger until both lift. Pinching with both fingers on the board works as before, even while the card panel is open.

## 0.19.13 — 2026-10-28

### Fixed

- On phones, the List and Tree summary line now shows assignee, status and priority with the same bordered chips as every other list, and cards without an assignee show the empty avatar.

## 0.19.12 — 2026-10-28

### Changed

- Assignee, status and priority no longer use tinted backgrounds. Each value shows its colour on the border and text only, on the same neutral fill, in every view and in both themes. Borders use a little more of the colour so values stay easy to tell apart.
- Assignee avatars are now rounded squares with the same corners as the status box, everywhere tasks show an assignee.
- List and Tree rows lose the empty space on their left. List no longer reserves a column for the tree toggle, and on desktop the drag handle and tree toggle are narrower. On iPad and narrow windows the second line of each row now starts at the left edge. Touch targets stay 44px.

## 0.19.11 — 2026-10-28

### Changed

- Assignee, status and priority are smaller in lists: List and Tree rows, relationships, Table cells and Kanban cards share one compact size (24px, 32px on touch) with room above and below, while the card editor keeps its full-size fields. Tap targets stay 44px on touch, and Table rows are back to their compact height.

## 0.19.10 — 2026-10-28

### Changed

- Assignee, status and priority now look the same in every view, matching the card editor: the same avatar size, a tinted status box of one shared width, and a bordered priority tile. This covers List and Tree rows, relationship rows and search results, Table cells, Kanban cards and board task cards.
- In List and Tree rows the title now follows the ID, ahead of the fields.
- Relationship rows give every status the same width, and on narrow screens place the fields on a second line instead of shrinking them.
- Kanban cards show the assignee as an avatar and the priority as an icon tile; names and labels stay in tooltips. Table rows are slightly taller to fit the card-sized fields, and their status, priority and assignee cells no longer show dropdown arrows.

## 0.19.9 — 2026-10-28

### Changed

- Task fields appear in one order everywhere: card type, ID, assignee, status, priority. This applies to List and Tree rows, phone summaries, the card's fields, relationship rows and search results, board task cards, the relationship sort menu and the default Table columns. Saved Table column layouts are kept.
- Relationship rows show the assignee as an avatar only; the name stays in its tooltip.
- The Add relationship panel puts the relationship type, search and close button on one row, without the Relationship caption.

## 0.19.8 — 2026-10-28

### Changed

- The card popup and the Table view share one type scale. Section headings (Relationships, Documents, Comments, Version history) now match, as do subheadings (Children and the history months). Card body text, dates, status, relationship titles and posted comments use one size. Keys, times and badges use one smaller size that never drops below 11px, or 12px on touch.
- On iPad and phones the card title is now larger than its body text, and Table cells read at the same 16px as their editable fields. Column headers are no longer smaller than the cells on desktop.
- On phones the card key at the start of each Table row opens the card, so the separate open button is gone and titles get more room.

### Fixed

- History entries no longer use 10px timestamps and labels, and the Documents heading is no longer larger than Relationships.

## 0.19.7 — 2026-10-28

### Changed

- List and Tree rows no longer carry a completion checkbox or a separate open button. The card type icon and the ID open the card; narrow and phone layouts reflow accordingly.
- The card view no longer shows the Assignee, Priority, Status, Dates and Description captions. The controls keep their accessible names for screen readers.

### Fixed

- On iPad the card header showed both the More button and the inline Duplicate, Archive and Delete actions, stacked on two lines. It now matches desktop with the actions inline.

## 0.19.6 — 2026-10-27

### Added

- Formatting controls now include Highlight, Inline code, Checklist, Code block, Divider and three heading levels, in the description, comments and documents alike.

### Changed

- One formatting toolbar everywhere: the description, comment composers, board text and the document editor share the same grouped controls (text style, emphasis, lists, insert). Documents keep their own view modes and Insert menu; rich text surfaces keep Markdown and Preview.
- On narrow screens the toolbar scrolls sideways as one line, snaps so no control is cut off, and shows a chevron at an edge with more tools. The More menu that hid tools is gone.

## 0.19.5 — 2026-10-27

### Changed

- Version history rows are left-aligned (date line, then the change summary) and grouped under a heading per month, newest first.
- The comment composer uses the same collapsing formatting toolbar as the description: on narrow screens the extra tools move into a More menu so the controls stay on one line.

## 0.19.4 — 2026-10-27

### Changed

- Phone card page: the Details, History and Comments switcher is icon-only, Details has its own icon (info) instead of the card icon, the switcher lines up with the card type icon, and the More control is drawn in the ink colour with solid dots. The More icon is bolder everywhere.
- The card editor's Status control no longer shows a dropdown arrow; it opens the app menu on tap.

### Fixed

- Double-tapping a dropdown on iOS no longer opens the native picker: a handled tap cancels the platform activation and double-clicks on selects are swallowed.

## 0.19.3 — 2026-10-27

### Fixed

- Choosing an option from a dropdown by touch no longer hands focus back to the select, so iOS no longer opens its native picker right after the app menu closes. Keyboard and mouse users still get focus back.

## 0.19.2 — 2026-10-27

Resolves the owner's Pencils project cards PEN-1 and PEN-4 to PEN-10 (mobile layout, scrolling and zoom, the New control, document links).

### Added

- Cards link to project documents from a Documents section in the card editor, and a document lists the cards that link to it (PEN-7).
- The header New control offers a card or a document everywhere, including the phone header and drawer (PEN-6).
- A new card accepts relationships (parent, child, blocked by, blocks, related) before it is saved; links to other cards apply once the card exists (PEN-4).
- Phones show a Sort icon button beside the view options; the filters list opens directly without a Filters dropdown (PEN-9).

### Changed

- The phone drawer is compact: the close button sits beside the logo, every section label shares one style, New sits under the project name and rows are tighter (PEN-1).
- The card key (for example PEN-4) follows the title instead of sitting under the type button; icon-only type and priority pickers lose their dropdown arrows (PEN-4).
- Attached images and files are cached by the browser instead of being downloaded on every preview (PEN-4).

### Fixed

- The phone card page no longer draws the Details, History and Comments labels over each other (PEN-5).
- Text fields on touch devices are at least 16px, so iOS no longer zooms when the search box or other fields are focused (PEN-8).
- On phones the app shell no longer scrolls; lists, boards and panels scroll inside the view (PEN-10).

## 0.19.1 — 2026-10-27

Resolves the 27 October controls audit (`reports/2026-10-27-controls-audit.md`): one look and one behaviour for buttons, fields, dropdowns, sliders, popovers and feedback.

### Added

- The task picker (type, priority, status, assignee) supports type-ahead: typing a letter focuses the first matching option, and its caret turns while the list is open.
- Toasts carry a close control and dismiss with Escape; messages announce as status or alert for screen readers.
- Sliders announce their value (`aria-valuetext`) and the board pattern spacing shows a live readout.
- The dates editor popover has a title.

### Changed

- Every `<select>` opens the shared app menu on every device, including when its label is clicked or tapped; the native iOS picker no longer appears.
- Focus rings follow `:focus-visible` with one width everywhere; text fields show focus through their border instead of a second ring.
- Board tools and card checkboxes expose `aria-pressed`; the current directory page uses `aria-current` instead of a styled button. Segmented controls share one active treatment.
- Disabled controls share one treatment (45% opacity, not-allowed cursor); checkboxes, radios and sliders use the green accent.
- Fields share one border, radius and placeholder token; textareas use the same 13px text as inputs (16px on touch). Invalid fields show a red border and form errors announce as alerts.
- The header search is a real search field and other search inputs carry the magnifier.
- Counts, tab badges, directory counts and tags share one 11px size; assignee chips are 24px in lists.
- Icons inside controls are 16px, including the selection toolbar; text glyphs (⛶ ‹ › ↶ ↷ ← → ⠿) are replaced by icons in the board controls, date picker, pager, table and pen tools, reorder handles and the offline drawing view.
- Popovers share one padding and radius token.
- Remove team and remove person are trash icon buttons labelled Delete; Full screen, Board settings and the date picker arrows are icon buttons; Clear column filters is a soft button; the Recovery and Personal settings footers use a plain Close.
- Empty states share one component: Documents uses it with a soft call to action and the timeline says "No cards yet" with an icon.
- Dropped the dead `.button.small` size and the unused Markdown tab styles.

## 0.19.0 — 2026-10-27

Resolves the 36 findings of the 27 October UI/UX assessment (`reports/2026-10-27-ui-ux-assessment.md`).

### Added

- Destructive actions (delete task, board, view or project, bulk status and archive, restores, discards) confirm in a small popover beside the control instead of the browser dialog. It closes with Escape, Cancel or a tap outside and returns focus.
- One date format everywhere: days read "14 Oct" (with the year when it differs) on dashboards, lists and relationships; history shows "14 Oct 2026, 19:18".
- Types & hierarchy edits task types as chips with Add and Remove.
- The phone task editor labels its Details, History and Comments tabs. The shortcut guide explains that N adds a card everywhere except on a board, where it selects the sticky-note tool.
- Shared tokens for borders, danger text, popover shadows and radii, with dark values.

### Changed

- Tablet layouts follow the width of the workspace column, so an open sidebar counts: List and Tree rows, the Calendar month grid, the Documents explorer and the settings navigation adapt on iPad landscape and portrait.
- One vocabulary for creation: New card, Add card, Add a card, Create card and Quick capture. Boards are called boards in the gallery, selector and board actions; Delete task confirms as a delete; Remove connector is Delete connector; the pen panel is Pen settings.
- Calendar and Timeline share the same Hide/Show weekends button. Planning views hide the task sort and group controls, and the sort control keeps its full label on tablets.
- Table keeps Advanced filters inside the Column filters menu and Export matching CSV inside the Columns menu. Open, column-menu, caret, remove and add glyphs are icons.
- List and Tree group counts show the total across pages.
- The board More menu is grouped into Insert, Navigate, Collaborate and Tools. Save view describes what it saves.
- Filter fields line up with the other menu controls and fill the menu; on phones the filters list opens inside View options.
- Comments and History are panes of the task panel without a second close button; on wide screens they align with the panel and stay clear of the sidebar. New and existing task headers keep the close button in the same corner. Escape in the comments pane returns to Details first.
- New board, embed note, layers, bulk notes, quick capture, save view, display name and frame link open in a compact dialog.
- Secondary text is at least 12px on phones and tablets. Kanban column add, card titles, timeline milestone toggles, comment formatting, People remove, disclosure summaries and checkbox labels reach 44px on touch; table row checkboxes offer a 24px target.
- Dark theme: the minimap, error toasts, calendar cards and timeline bars use theme colours. Muted, kicker and count text meet 4.5:1 contrast.
- Presence shows the signed-in name. Browser titles include the current view. Overview no longer repeats its label and the version appears once while the sidebar is open.
- Zoom to selection is Shift+2 only.
- Board gallery drops the saved-view controls, labels empty boards and styles the offline pad link as a button.

### Fixed

- Safe-area insets apply on iOS (`viewport-fit=cover`) and heights use the dynamic viewport.
- Table shows source-owned statuses by name and the source badge no longer overflows the title cell.
- Phone Kanban shows the edge of the next column.
- The word-count chip no longer covers document text.
- Date picker and board settings use the shared popover positioning.
- Timeline copy no longer says "Click".
- Unused code removed: the node dialog, board rename action, task-dialog outside-click handler and duplicate sizing rules.

## 0.18.43 — 2026-10-26

### Changed

- Removed the matching/total/archived task summary footer from project views.

## 0.18.42 — 2026-10-26

### Added

- Calendar cards span their scheduled dates. Drag a card to move it, or drag its start/end handles to resize its date range, with touch and keyboard support. Unscheduled cards can be dropped onto a day or scheduled using the shared date editor.
- Calendar has a remembered Show/Hide weekends button.

### Changed

- Status and type are grouped inside the shared Filters menu for task and planning views.
- Removed the calendar's “tasks have no due date” footer message.

### Fixed

- Agenda and unscheduled lists keep readable titles and compact date controls. Agenda includes cards spanning the selected period, including cards with only a start date, and keeps the same date when switching layouts.
- Timeline dependencies appear as directional arrows above the row backgrounds, follow moved/resized bars and remain aligned with custom date ranges and hidden weekends.

## 0.18.41 — 2026-10-26

### Fixed

- Table view stays anchored on iPad: rows and columns scroll inside the grid without moving or bouncing the surrounding page. Column headers stay visible, and other views retain their normal scrolling.

## 0.18.40 — 2026-10-26

### Changed

- Pen pressure and shape recognition use icon toggles with clear on/off states, and More settings uses the shared settings icon.
- Pen settings have full-width Stabilisation and Pressure response sliders with live values. Adjusting sliders keeps the panel open; explanatory text has been removed, and the panel supports Close, Escape and outside-tap dismissal.

## 0.18.39 — 2026-10-26

### Fixed

- With the Select tool on iPad and other touch devices, hold empty board space or a frame interior briefly, then drag to box-select objects. Quick swipes still pan, pinch zoom takes over cleanly, and holding the board no longer starts browser text selection.
- Newly placed notes show the text cursor at the note's text alignment from the first edit, instead of displaying it at the top before typing in the middle.

## 0.18.38 — 2026-10-26

### Changed

- iPad task and planning layout controls use icons for List, Tree, Table, Kanban, Calendar, Timeline and Capacity, with accessible labels and full-size touch targets.
- Removed saved-view lists and Save view actions from Overview, Planning and Tasks, including their phone menus. Filters, sorting and grouping remain available.

## 0.18.37 — 2026-10-26

### Changed

- On iPad and other touch tablets, List, Tree, Table and Kanban layout buttons show icons only, with accessible labels and full-size touch targets.

## 0.18.36 — 2026-10-26

### Fixed

- Edge swipes in the mobile page gutter no longer trigger browser Back/Forward. Normal scrolling, direct control taps and Board pan/zoom remain available.
- Scrolling over a card editor on iPad stays inside the editor, including its title, footer and scroll boundaries, instead of moving the workspace behind it.

### Changed

- Card editors use a single Close button; the redundant Back button has been removed.

## 0.18.35 — 2026-10-25

### Changed

- Desktop and iPad project navigation uses icons with hover labels. The creation action is now called New card, including the phone sidebar, command menu and shortcut guide.
- Document view modes, outline, width, search and file actions share the title bar. The second bar contains only text formatting and Insert; narrow editors keep additional document actions in the tools menu.
- Shared buttons and fields are 32px high on desktop, or 28px in Compact mode. Headers and toolbars use tighter spacing throughout the app, while touch controls retain 44px targets.

## 0.18.34 — 2026-10-25

### Changed

- On phones, tasks open as full pages with one scroll area and a pinned header. Back and Close return to the previous list position; wider screens keep the contextual task panel.

### Fixed

- Swiping the task title or reaching the top or bottom of the editor no longer scrolls the workspace behind it. Task page scrolling stays separate from keyboard viewport adjustments.

## 0.18.33 — 2026-10-25

### Fixed

- Add relationship opens a contextual picker beside its button, even with a long relationship list, and stays within the visible screen above the phone keyboard.
- Phone task descriptions and text fields use readable text sizing to prevent focus magnification; task panels resize with the visible viewport when the keyboard opens.

### Changed

- Task editors have a clear Add attachments button with a paperclip icon, including on iPhone.

## 0.18.32 — 2026-10-25

### Changed

- Document editing no longer draws a green frame around the page or inline components. Text areas and rich-text editors use neutral focus borders in light and dark themes.

## 0.18.31 — 2026-10-25

### Added

- Activity card type with its own icon throughout task editors, filters and project views. New projects and existing projects using the standard type list include Activity; custom lists remain unchanged. Existing hierarchy rules give Activity the same placement options as Task.

## 0.18.30 — 2026-10-25

### Changed

- Task editors use one grouped Details, History and Comments control in the header. On phones, the type and ID sit before a smaller title, with secondary actions in More.
- Phone task formatting stays on one line with full touch targets; More formatting contains strikethrough, numbered lists, Markdown and preview.
- Relationships have single-line rows and icon-only sort/add controls alongside their heading. Sorting and direction share a contextual menu; compact rows retain linked-task access and show assignee, priority and status indicators.

### Fixed

- Task panels fit beside the navigation sidebar on tablets. Escape closes a formatting menu before closing the task, and relationship pickers avoid opening the touch keyboard automatically.

## 0.18.29 — 2026-10-23

### Added

- Feature requests in Help and the navigation sidebar: submit descriptions with screenshots or files, search/filter the queue, change priorities and statuses, and follow progress. Requests and attachments live in the vault’s `feature-requests` folder, with a Markdown index.
- An optional host worker picks up requests one at a time through a scoped authenticated queue. It uses isolated source copies, checks for concurrent workspace edits, runs checks, retains a rollback image and verifies deployments. The inbox shows setup requirements, connection status and a pause/resume control; interrupted work is retained for review.

## 0.18.28 — 2026-10-23

### Fixed

- Opening tasks, comments and document navigation on touch devices no longer focuses text fields automatically. Switching between rich text and Markdown also waits for a tap before editing, keeping the software keyboard out of the way while browsing.

## 0.18.27 — 2026-10-23

### Changed

- Touch devices no longer pinch or double-tap to zoom the whole page. Scrolling and the Board’s own pan and zoom gestures remain available.

## 0.18.26 — 2026-10-23

### Changed

- Phone Table puts the task title first, with its ID underneath, while retaining desktop column preferences and access to the remaining fields.
- Phone Board uses a compact bottom dock with selection, panning, fit and zoom information. A labelled tools panel contains creation, search, history and additional view controls; the minimap starts hidden on phones.
- Calendar and Capacity keep period navigation on one line. Secondary planning controls, Timeline options and Board settings share the phone View options panel.

## 0.18.25 — 2026-10-23

### Changed

- Kanban fits a whole number of columns across the available width and snaps horizontal scrolling to column boundaries. Columns resize with the window, sidebar and device orientation, including boards with swimlanes.

## 0.18.24 — 2026-10-23

### Changed

- Kanban cards hide their IDs by default. Enable Show card IDs in the Kanban controls (View options on phones) to display them; the preference is remembered for each project in this browser.

## 0.18.23 — 2026-10-23

### Changed

- Phones use a single compact header and a navigation drawer for project views, settings and Help. New task stays within reach, and navigation closes with Escape, an outside tap or a selected destination.
- Documents on phones use an overlaid file sidebar, a compact view menu and optional single-line formatting tools. Search stays available; versions, export, width and deletion move into Document tools.
- Phone List and Tree rows show a title and a small metadata line, with completion, hierarchy and reorder controls beside them. Tap a title to edit its fields. Touch rows shrink from 145px to 69px while controls retain shared touch targets.

### Fixed

- Narrow tablet headers scroll their navigation tabs instead of pushing actions outside the viewport.
- Task focus returns to a visible opener after editing or autosave, including the phone row.

## 0.18.22 — 2026-10-22

### Fixed

- Board task cards use smaller, aligned assignee, priority, status and date controls on touch devices. Their menus and the surrounding toolbar retain full touch targets; Compact mode also reduces card fields.
- Bitmap objects and connectors follow two-finger pan and pinch immediately, with a reusable overscanned preview instead of waiting for fingers to lift. Detail settles after the gesture.
- Safari can reuse the visible board layer while zooming. Grid control sizes update when the gesture finishes instead of repeatedly reflowing and repainting the board during contact.
- Pinching a large board below 8% no longer jumps to 8%; touch now supports the same zoom range as the other controls.

## 0.18.21 — 2026-10-22

### Added

- Optional single-user mode opens directly as the configured owner on every connection, including Tailscale, without a password or login screen. Integrations and background sync retain the same owner; password accounts remain available if required authentication is restored.

## 0.18.20 — 2026-10-21

### Fixed

- Help opened from a project retains its project name, navigation, New task and Settings controls, including after reload and browser Back/Forward. Standalone Help uses the shared header height and padding. New task opens within the Help viewport.
- Board card controls scale with the card on touch devices instead of growing inside it as you zoom out, keeping titles and metadata visible and avoiding repeated layout changes.
- Touch pan and pinch apply the latest camera once per display frame, reuse the gesture's starting bounds and save the camera when contact ends. Gesture cancellation, one-finger continuation and Pencil input retain their existing behavior.

## 0.18.19 — 2026-10-21

### Added

- Help now includes a searchable “Import from Miro” guide, linked from the Help home page. It covers where to find the importer, account or token connection, preview options, supported content, limits and troubleshooting.

## 0.18.18 — 2026-10-21

### Changed

- Board detail uses a gentler 220 ms entrance and faster 160 ms exit. Reversing zoom continues the same fade from its current position instead of restarting a full animation.
- Bitmap previews retain card colours, rounded corners, shape silhouettes and rotation, reducing the visual jump when detail appears or disappears. Previews follow the current light or dark surface colour.
- Changing the system's reduced-motion preference immediately settles active fades. Transitions retain the existing rendering limits and use no duplicate cards or continuous JavaScript animation loop.

## 0.18.17 — 2026-10-21

### Fixed

- Large board selections use one set of group resize handles. Individual connection and resize handles appear only when editing a single object, avoiding hundreds of redundant controls as selected cards become detailed during zoom.
- Selected detailed arrows share one highlight path; their hit targets, styles and individual editing controls remain available. Group outlines and single-object handles are reused instead of being recreated during detail updates.
- Cards in a group selection can finish their transitions back to bitmap previews without repeated selection updates cancelling the fade.

## 0.18.16 — 2026-10-21

### Fixed

- Pasting large selections at low zoom keeps cards, grids and connectors in bitmap form. Selecting thousands of connectors no longer bypasses the rendering budget or displays oversized grid controls; a single active object still opens its editing controls.
- Selected bitmap connectors are highlighted, and detailed connectors retain a fixed rendering budget as you zoom in.
- Large mixed selections position their toolbar using indexed objects instead of repeated board scans and SVG queries. Grid drop detection skips hierarchy calculations when an object is outside every candidate grid.
- Recent undo history has a larger, bounded allowance so a large paste followed by group movement does not immediately lose its undo entry.

## 0.18.15 — 2026-10-21

### Fixed

- Dragging a selection box includes bitmap board objects at low zoom. Selected groups move together without changing zoom or rendering every object in detail; Shift-drag adds to the selection.
- Selection respects collapsed frames and hidden layers. The group outline follows movement, and large drags reuse indexed original positions.
- Ctrl+Tab and Ctrl+Shift+Tab remain available to the browser on boards, in grid editors and in document/task tables. Plain Tab still navigates objects and cells.

## 0.18.14 — 2026-10-21

### Changed

- Boards now allow 10,000 frames, with the capacity gauge showing the updated limit. Presentation ordering supports the same frame count.
- Detailed board objects briefly crossfade into bitmap previews and back as zoom changes. Reversing zoom interrupts the transition smoothly; reduced motion skips the animation.

### Fixed

- Large frame outlines render 50 rows at a time with smaller previews and indexed descendant counts, keeping every frame reachable through page controls.
- Large selections use indexed membership checks and update only mounted controls. Frame visibility and server hierarchy validation reuse resolved parent chains.
- Deeply nested frames stay behind their contained cards.

## 0.18.13 — 2026-10-21

### Added

- The board capacity gauge now shows a frame counter out of 500 alongside the object counter. Collapsed frames are included, and both counts update as the board changes.

## 0.18.12 — 2026-10-21

### Changed

- Save errors appear as a compact warning icon beside the app version. Hover, focus or tap to see the cause, recovery steps and a direct link to Recovery & backups; warnings stay available on small screens.
- Bitmap board objects can be selected and dragged at the current zoom, including frames and grids. Shift/Ctrl/Cmd selection, moving multiple objects and touch dragging use the normal board controls.

### Fixed

- Correcting a rejected board save, including exceeding 500 frames, sends the corrected draft instead of repeating the invalid operation. Uncertain deliveries still retain their operation identity for safe retries.
- Browser drafts remain exportable from Recovery & backups when server backups cannot be loaded.
- Selecting bitmap objects no longer unexpectedly zooms into them or clears an additive selection. Moving containers also updates their bitmap contents during the drag.

## 0.18.11 — 2026-10-21

### Changed

- Project navigation and New task are centred together in the header. Narrower windows with the sidebar open place navigation on a centred second row to keep the side controls accessible.

### Fixed

- Zooming between bitmap previews and detailed board objects creates cards and connectors in small batches, with previews kept visible until details are ready. Nearby zoom reversals reuse rendered cards, and separate entry/exit thresholds prevent repeated switching at the boundary.
- Zoom-dependent grid sizes update only grids; desktop zooming no longer recalculates unused touch-target sizes across every card. Touch controls retain their screen-sized targets.

## 0.18.10 — 2026-10-21

### Fixed

- Panning rich task boards at lower zoom levels no longer triggers page-wide style recalculations. Layout now follows explicit view state, while unchanged zoom and participant controls stay intact.
- Expanded boards continue to restore normal page scrolling when navigating away.

## 0.18.9 — 2026-10-21

### Changed

- Overdue board cards show their end date in red instead of a separate “Overdue” label. The date tooltip and accessible label still identify overdue dates; completed tasks keep the normal date color.

## 0.18.8 — 2026-10-21

### Changed

- Board cards have more space between their type/ID and title, with the decorative bottom-right overflow dots removed.
- Card scrollbars are slim, rounded and themed. Scrolling overflowing card content no longer zooms the board.
- The capacity popup shows only the object count out of 80,000.
- Comments place compact timestamps at the bottom right, with the full date and time on hover. Author names share assignee colors.
- Replies are grouped in collapsible threads with a quoted preview that jumps to the original comment. Nested replies stay readable without progressively narrowing the conversation.

## 0.18.7 — 2026-10-21

### Changed

- Task cards stack their ID beneath the card type and keep assignee, priority, status and end date together on one row.
- Assignee avatars match the height of the other card controls, including touch targets.
- End dates use the task's due date and open the shared date editor. Narrow cards use a calendar icon with the date available in its tooltip.

## 0.18.6 — 2026-10-21

### Changed

- Relationship rows align assignee, priority and status in consistent columns. Priorities use icons with hover labels and accessible names.
- Narrow relationship panels place metadata on a second aligned row; long names and statuses stay within their columns.

## 0.18.5 — 2026-10-21

### Changed

- Expand board uses a compact icon button with matching expand/restore icons, tooltips and accessible labels.

## 0.18.4 — 2026-10-21

### Changed

- Board comments can be resized with the bottom-right grip or its arrow-key controls. The size is remembered, drafts survive closing, and the redundant task-name row is removed.
- Comment formatting uses smaller icons on a single row, including on narrow screens.
- Expanded task cards display document-style headings, emphasis, highlights, checklists, tables, quotes and code.

### Fixed

- Pasting Markdown into a rich text editor keeps its formatting instead of escaping its syntax. Typed headings, quotes and inline formatting also become rich text; explicitly escaped text and code stay literal.
- Rich clipboard content retains formatting after sanitization, and highlights survive Markdown round trips.

## 0.18.3 — 2026-10-21

### Changed

- Removed the board's bottom-left shortcut hints and rendering statistics.
- Added a circular object-capacity gauge beside zoom controls, showing usage against 80,000 objects. Clicking it shows the exact count and distinguishes the gauge target from the existing 100,000-object maximum.
- The gauge includes objects inside collapsed frames, updates after edits and undo, and supports keyboard and touch input. The minimap stays above navigation controls on small screens.

## 0.18.2 — 2026-10-21

### Changed

- Task editors are wider, with actions above the title, an assignee avatar and paired start/due dates beside priority and status. Dividers separate metadata and description; the formatting toolbar fits one row at desktop width.
- Board task cards use a single-line title above ID, assignee avatar, priority and status.
- Comments support rich text formatting and Markdown, with reply and emoji picker icons beside a red delete button. Existing plain-text comments keep their original text.
- Task history names changed fields and shows highlighted “− Before” and “+ After” values, including comments and reactions, without decorative dividers.
- The header shows the app version and an update indicator when a newer deployment is available, replacing the local-server connection message.

### Fixed

- Frame expand and collapse controls use matching icons and equal square sizes.

## 0.18.1 — 2026-10-21

### Changed

- Live preview reveals Markdown around the selected or hovered inline span, keeping the rest of the line rendered.
- Document formatting sits on the left; Outline, grouped view modes, page width and Search sit on the right. Insert options have categories and icons.
- Document search uses a compact panel on the right, with icon controls, matching close-button sizing, optional replacement controls and search options. Reading search stays in Reading mode.
- Page versions is an icon in the document header before Document tools. The footer is a small corner word and character count; save problems still appear when action is needed.

## 0.18.0 — 2026-10-21

### Added

- Boards accept 100,000 objects and 200,000 connectors, with larger native Canvas imports and a wider coordinate range.

### Changed

- Board navigation reuses spatial indexes and connector geometry. Dense and zoomed-out views use a lightweight overview with editable detail for selected objects; Fit can show much larger boards.
- Board saves send guarded field changes, retaining concurrent-edit conflict handling, undo and compact browser recovery drafts. The vault continues to store portable JSON Canvas files.
- Large operation bodies remain in vault history while activity responses show their metadata. Local undo snapshots are bounded by board size.


## 0.17.0 — 2026-10-20

### Added

- Edit callout titles and content, table cells, quotes and code directly in Live preview without opening their Markdown source. Tables support adding rows and columns; math and diagrams have inline formula/code fields. Edits retain autosave and undo.

### Changed

- The backend now uses Fastify with a TypeScript HTTP layer and separate task, document and board services. Existing Markdown vaults and canvas files keep their formats.
- Search and table queries run in a worker thread and update their index incrementally. Shared project reads reuse recent data, and ordinary task edits avoid unnecessary full-project scans.

### Fixed

- Slow provider fetches no longer hold up unrelated task saves. Source changes are still applied transactionally after fetching.
- Successful saves preserve unrelated parsed-file caches, reducing delays when many people save at once.

## 0.16.13 — 2026-10-20

### Fixed

- Find in document stays in Reading mode, highlighting rendered text with a match count and Previous/Next controls. Ctrl/⌘ F opens Reading search; Enter/Shift+Enter navigate matches and Escape closes search without changing the document.

## 0.16.12 — 2026-10-20

### Fixed

- Press the Documents Outline button again to close its panel. Its active state stays in sync when closing with Escape, the close button or a click outside.

## 0.16.11 — 2026-10-20

### Added

- Drag folders in the Documents explorer into other folders, or onto the Documents heading to move them to the root. Moves keep all nested folders and documents together, highlight valid destinations and prevent dropping a folder inside itself or its descendants.

## 0.16.10 — 2026-10-20

### Added

- Documents have a Page width / Full width toggle beside the editor modes. The setting applies to Live preview, Source and Reading and is remembered on this device.

### Fixed

- Live preview and Reading share the same page column, heading styles and paragraph rhythm. Live preview renders dividers and hides escape backslashes outside the line being edited.

## 0.16.9 — 2026-10-20

### Added

- Board task cards have a description collapse/expand button before Comments. Expanding fits the full description; each card remembers its state, and generated plan rows make room.
- Documents have automatic numbered versions, with previews and restoration of earlier saves.
- The Documents sidebar can be collapsed. Create nested folders, rename or move them, and organise documents with drag and drop or Move to folder.

### Changed

- Document outlines show a collapsible heading tree before the editor mode controls. Live preview, Source and Reading use icons with labels and tooltips.

### Fixed

- Generated project plans indent children beyond their parent's connector port so parent/child arrows continue to the right.

## 0.16.8 — 2026-10-20

### Added

- One-time Miro import in Board settings, with a layout preview, selected frames, draft cards or project tasks, assignee matching and a conversion report. Imports copy supported images/files locally, preserve editable objects and connectors, and can create a canvas or add only new objects to the current one. Miro connections are temporary and do not sync subsequent edits.

### Changed

- Phone task and planning toolbars keep search and layout switching visible, with saved views, filters, grouping and other options together in View options.
- List and Tree rows reflow on narrow screens so titles and task actions stay visible. Desktop rows retain their compact layout. Comments and History replace the Details pane on smaller screens, with a shared switch to return.
- Production assets are bundled, compressed and cached by content hash. Board, drawing and Documents controllers load when first opened; development and the prepared offline drawing shell remain available.

### Fixed

- Board text chooses a readable colour over custom frame or canvas backgrounds, including light-coloured Miro frames in dark mode.
- Board task cards and task editors share one comment conversation. Opening an older card preserves and imports its legacy comments, replies and reactions without duplicating them.
- Closing task details returns keyboard focus to the original task, including after autosave refreshes its row. Invalid edits stay open with options to keep editing or keep a browser draft and close.
- Closing a task's date popup retains keyboard focus on its date button when autosave refreshes the view.
- Board priority controls keep their keyboard focus ring visible when zoomed.
- The attachment drop instruction also opens a file chooser for keyboard and touch users.
- Table task IDs remain visible on phones. Table open actions, Calendar agenda tasks and zoomed Board card controls have full touch targets.
- Board cards expose their individual controls correctly to assistive technology. Markdown checklists have accessible names, task date buttons include their visible date, and Timeline's Today marker has a valid semantic role.
- Sticky notes and shapes choose readable text for custom fills in either theme and in image/PDF exports.
- Kanban supports Alt+Up/Down to reorder tasks within a column or swimlane, with focus retained and the move announced.
- Overdue dates have sufficient text contrast in the light theme.

## 0.16.7 — 2026-10-20

### Added

- Documents now has Markdown-native Live preview, Source and Reading views, with formatting shortcuts, find/replace, folding, an outline, document links and embeds, backlinks, checklists, tables, callouts, footnotes, highlights, math and Mermaid diagrams. Attach files from Insert or by dropping them into the editor. Switching views preserves the Markdown source and undo history.
- Open in Obsidian opens the same document in a configured local vault for Obsidian's native features and plugins. Vault settings are stored per browser/device.

## 0.16.6 — 2026-10-20

### Changed

- Removed Task scope and its explanatory text from the Board toolbar.

## 0.16.5 — 2026-10-20

### Changed

- Removed the introductory help text from Table's Sort and Column filters dropdowns. Dropdown contents use smaller 28px desktop controls, tighter spacing and shared styling; touch controls retain 44px targets.
- Added more space between the Documents welcome text and New document button.

## 0.16.4 — 2026-10-20

### Added

- Reset grouping inside the Table Group dropdown clears both grouping levels while preserving sorting, filters and column settings.

## 0.16.3 — 2026-10-20

### Fixed

- Task and Planning toolbar controls now share the same outer height, including the view switcher. Search icons stay vertically centered in standard, Compact and touch layouts.

## 0.16.2 — 2026-10-20

### Fixed

- List and Tree place the drag handle directly beside the checkbox. Tree's expand/collapse control sits before the drag handle, keeping task columns aligned between views.

## 0.16.1 — 2026-10-20

### Changed

- List, Tree and Table use smaller 13px checkboxes, including Table’s select-all checkbox. Keyboard access and generous touch targets are preserved.

## 0.16.0 — 2026-10-20

### Added

- Documents sits between Overview and Planning, with a searchable explorer and rich text/Markdown editor. Documents save automatically, support Markdown import/export, retain offline edits and can be restored from Trash.
- Relationship rows show assignee, priority and status with the same colours as other task views. Sort each relationship group by these fields, in either direction.

### Changed

- Buttons, fields, dropdown options and editor controls now use shared sizing throughout the workspace: 36px normally, 32px in Compact mode and 44px on touch screens.

## 0.15.55 — 2026-10-20

### Added

- Table view has a Description column beside Title, with compact text previews. Click a description to edit it in the task editor. The column supports hiding, resizing, reordering, saved views, filtering, sorting and CSV export; existing descriptions and attachments are preserved.

### Changed

- Removed the grouping summary text (such as “Assignee → Title”) beside Reset table view.

## 0.15.54 — 2026-10-20

### Changed

- Table rows, headers, group headings and toolbar gaps are more compact. Desktop rows are approximately 32px high, with tighter cell padding and row controls; touch controls keep 44px targets. Font sizes and configured column widths are preserved.

## 0.15.53 — 2026-10-20

### Changed

- Removed the visible selection count and keyboard-help text from the Table toolbar. Selection actions, screen-reader announcements and keyboard shortcuts remain available.

## 0.15.52 — 2026-10-20

### Changed

- Table column drag and menu icons appear only on the hovered header, without shifting its title. They remain visible during keyboard focus, dragging or an open menu, and on touch screens.

## 0.15.51 — 2026-10-20

### Changed

- Table columns have visible drag handles, a preview of their cell values and clearer placement feedback. Dragging highlights the whole column, scrolls smoothly near either edge and keeps the moved column in view. Touch users can swipe column titles to scroll; use the grip to reorder. Sorting, widths, hidden fields and saved layouts are preserved.

## 0.15.50 — 2026-10-20

### Changed

- Table cells show task types as icons and assignees as colored avatars. All editable dropdown cells share the same arrow, spacing and menu behavior; full names remain available in tooltips and menus.

## 0.15.49 — 2026-10-20

### Changed

- List and Tree show the assignee as a compact avatar, with the name available on hover and in the selection menu. Drag handles come first, the open button sits between completion and task type, and clicking the task type or ID also opens the task editor.

## 0.15.48 — 2026-10-20

### Changed

- Task date popups save valid date changes automatically and keep the popup open while editing. Removed the heading, task title and Save dates button; Clear dates now sits beside Close and clears both dates immediately across List, Tree and Timeline.

## 0.15.47 — 2026-10-20

### Changed

- Lowest priority uses two downward chevrons, mirroring Urgent's two upward chevrons, consistently across task menus and views.

## 0.15.46 — 2026-10-20

### Fixed

- List and Tree share the same heading height and root-row column positions, so switching views no longer shifts tasks down or sideways. Child tasks retain their indentation, and row controls stay aligned on desktop and touch screens.

## 0.15.45 — 2026-10-19

### Added

- Edit assignee, priority, status and title directly in compact List and Tree rows. Click the date to edit start and due dates in a small popup, or use the left-hand open icon for the task side panel. Titles save on Enter or when leaving the field; Escape cancels unfinished edits.

### Fixed

- Shared dropdown menus now respond reliably to taps in WebKit when the browser omits the click event after cancelling its native picker.

## 0.15.44 — 2026-10-19

### Changed

- Renamed the lowest priority from None to Lowest across task editors, cards, groups, filters and automation menus. New local tasks and Board drafts default to Medium; existing priorities and saved choices are preserved.

## 0.15.43 — 2026-10-19

### Added

- Task attachments appear in a compact list beneath the description. Click a file to open a nearby preview with a download action; images, text, Markdown, CSV and supported browser PDF viewers display in the popup. Drag-and-drop uploads, existing attachments and portable Markdown links are preserved across task and Board editors.

### Fixed

- CSV attachments now return the correct content type so they can be opened and downloaded.

## 0.15.42 — 2026-10-19

### Changed

- Status settings now use a compact list with one column header, smaller editable rows and no repeated status labels, internal IDs or help text. Completed, default, reorder and remove controls remain available, with compact wrapping on smaller screens.

## 0.15.41 — 2026-10-19

### Changed

- Priority menus now list Urgent, High, Medium, Low and None, consistently across task editors, Board cards, Table cells, filters and automation settings.

## 0.15.40 — 2026-10-19

### Added

- Consistent assignee, priority and status colors in task editors, selection menus, List, Tree, Table, Kanban and Board cards. People keep a stable color; priorities run from blue through amber and orange to red, with neutral unassigned/no-priority values. Status colors also carry into Overview, Calendar and Timeline, and assignee colors into Capacity.

## 0.15.39 — 2026-10-19

### Changed

- Added more space above and below Description in the shared task editor, separating it from task fields and Relationships on desktop and mobile.

## 0.15.38 — 2026-10-19

### Added

- A compact Relationships section in the task editor brings parent, child, blocked-by, blocks and related-task links together. Search by task ID or title, open linked tasks and remove links; hierarchy and blocker changes also update Tree and Board. Invalid hierarchy and blocking cycles are prevented.

## 0.15.37 — 2026-10-19

### Changed

- Comments and version history open to the left of a right-docked task editor, keeping the editor anchored to the right. Compact board editors retain their existing placement and narrow screens keep panels within the viewport.

## 0.15.36 — 2026-10-19

### Changed

- Removed Parent task, Dependencies and the Markdown file path from the shared task editor. Existing parent links and dependencies are preserved when editing tasks or board drafts.

## 0.15.35 — 2026-10-19

### Changed

- Removed the Planning section from the task editor. Existing estimates, recurrence settings and custom-field values are preserved when editing tasks.

## 0.15.34 — 2026-10-19

### Changed

- The shared task editor shows card type, ID and title together, followed by assignee, priority, status, start date and due date, then the description. Narrow panels wrap the metadata without changing its order.
- Removed Save as template, Attach file, Related records and Subtasks from the task editor. Existing relationships and saved draft subtasks are preserved.

### Added

- Drop files onto the task editor to attach them to the description as image previews or file links. Multiple uploads show progress and errors, preserve ongoing edits and save automatically with existing tasks and board drafts.

## 0.15.33 — 2026-10-19

### Changed

- Table parent/child outlines are always enabled, including existing saved views. The Group menu now shows just the grouping fields and expand/collapse actions, without the checkbox or explanatory text.
- Tree's empty area matches the List page background. List and Tree use the shared New task button in the header instead of duplicate add-task links below their rows or in empty states.

## 0.15.32 — 2026-10-19

### Changed

- List and Tree use slimmer, single-line task rows: type icon, ID, assignee, priority icon, due date and title. Desktop rows are roughly half their previous height; touch controls retain their larger targets and narrow views scroll to keep every field accessible.

## 0.15.31 — 2026-10-19

### Changed

- Scrollbars appear only when content overflows in Kanban, swimlanes, Table, Tree and Timeline. Views still fill the available space, without empty scrollbar tracks or reserved gutters.

## 0.15.30 — 2026-10-19

### Added

- Group Kanban tasks into collapsible swimlanes by assignee, priority or task type, with status columns aligned across lanes. Grouping is remembered per project and included in saved views. Dragging between lanes updates the matching field, and Add task inherits its lane and status.

## 0.15.29 — 2026-10-19

### Changed

- Kanban cards use a compact two-row layout: task icon, ID and title above assignee and priority. Reduced padding keeps more cards visible, while other details remain available in the full task editor.

### Fixed

- Tapping Kanban card metadata or padding opens the task editor on Safari as well as tapping the title.

## 0.15.28 — 2026-10-18

### Added

- Schedule tasks directly on Timeline with two clicks or taps: choose the start day, then the end day. A preview follows the chosen dates; Escape cancels before saving.
- Set a custom start/end range for the Timeline, or return to Automatic range. The setting also works in embedded Board timelines and does not change task dates.

## 0.15.27 — 2026-10-18

### Added

- Reorder tasks in Table, List and Tree using row drag handles or Alt + Up/Down. Manual order saves automatically and carries between views; Tree keeps children with their parents. Moving across groups clears grouping without changing task fields.

## 0.15.26 — 2026-10-18

### Added

- Set and edit task dates directly from Timeline using a compact panel beside the row. Set dates, the row's calendar button or a task bar opens the shared start/due calendar controls, including timelines embedded in Boards.

## 0.15.25 — 2026-10-18

### Added

- Timeline has a Show weekends option that remembers your choice. Hiding Saturday and Sunday compresses the timeline without changing task dates, including timelines embedded in boards.

### Changed

- Timeline uses a two-row date header with month bands, Monday-aligned weekly labels, week-range tooltips and a today marker. Date dragging, resizing and scheduling follow the visible date columns.

## 0.15.24 — 2026-10-18

### Changed

- Board tools are grouped into Navigate, Tasks, Create, Arrange and History, with labelled sections and scrolling on smaller screens.
- Timeline fills its available height and width, keeps scrolling inside the view and shows unplanned tasks as full-width rows with access to their date editor. Date labels extend across the available timeline width.

## 0.15.23 — 2026-10-18

### Fixed

- Updating a project frame with existing positions preserved places new dependent cards to the right of their prerequisites' actual positions and widths. New chains and child trees follow the initial layout spacing, avoid occupied cards and expand the frame as needed.

## 0.15.22 — 2026-10-18

### Changed

- Simplified the Update project frame panel to the rearrange option, its hint and Update frame. Removed change counts, explanatory copy, expandable card lists and the duplicate Cancel button; the close button, Escape and outside taps still dismiss it.

## 0.15.21 — 2026-10-18

### Changed

- Update plan opens a compact panel beside its project frame, matching board comments and draft review. The board stays visible and usable; Escape, Cancel or an outside click/tap dismisses the preview without changing the frame.
- Small contextual panels are now the project-wide default for routine actions, with blocking or fullscreen dialogs reserved for warnings and major workflows.

## 0.15.20 — 2026-10-18

### Fixed

- Project frames update successfully on iPads and other devices using local-network HTTP, where the browser's `randomUUID` API is unavailable. Shared ID generation also covers new board cards, task drafts, comments, saved views, custom fields, automation rules and offline strokes.

## 0.15.19 — 2026-10-17

### Changed

- Removed the filter icon from table column headers. Filtering remains available in each column's actions menu and the Column Filters toolbar; the actions button indicates an active filter.

## 0.15.18 — 2026-10-17

### Changed

- Project Settings uses a grouped left sidebar with dedicated General, Organisation & teams, Statuses & workflow, Types & hierarchy, Custom fields, Data sources & sync, Import notes, Automation, Diagnostics and Archive & recovery pages. Templates and duplicate workflow controls are removed from the settings menu.
- Settings pages and source/rule editors have their own URLs with Back, Forward and reload support. Pages save independently, retain edits when a conflicting save fails and warn before discarding unsaved changes. Small screens use a section selector.
- Automation uses valid priority, status and assignee choices, supports editing rules and saves changes disabled for review. Import notes shows selected files before creating tasks; diagnostics presents readable health metrics with optional technical details.

### Fixed

- Shared form labels use the theme's readable text colour instead of a faint fixed green.

## 0.15.17 — 2026-10-17

### Changed

- Removed the sidebar's organisation overview, search, recovery, archived-project controls and vault information panel. Search, recovery, archived projects and account actions are available in Personal settings; the organisation breadcrumb and Help retain overview and vault guidance.

## 0.15.16 — 2026-10-17

### Added

- Local automatic sign-in opens the workspace as George with administrator access, including project data sources and background sync. This single-user mode removes the password prompt for local/LAN access and shows the active identity in the profile menu.

## 0.15.15 — 2026-10-17

### Changed

- Removed the task-count footer from List, Tree, Table and Kanban. Clear filters is available in the Filters menu; pagination and task-creation controls remain in place.

## 0.15.14 — 2026-10-17

### Changed

- Tree fills the available width and height, even with few tasks or no results. Scrollbars stay at the viewport edges while the heading, Add a root task and task count remain visible. Expanding branches and browser Back preserve the tree's scroll position; nested tasks remain reachable on smaller screens.

## 0.15.13 — 2026-10-17

### Added

- Help now opens a searchable wiki page with article navigation, contents links and browser Back/Forward support. Step-by-step guides cover combining project sources, Obsidian, Jira Cloud and SharePoint Excel, including setup, permissions, mapping, sync and troubleshooting. Existing local-access and keyboard-shortcut help remains available.

### Changed

- Kanban fills the available view height even with few or no tasks. Columns scroll independently beneath fixed headers, with the horizontal scrollbar along the bottom; dragging scrolls the target column and Back restores the previous scroll positions.

## 0.15.12 — 2026-10-17

### Added

- Browser Back and Forward now navigate throughout the workspace: project views, Overview shortcuts, canvases, project settings, projects and organisation pages. Returning restores the view's filters, sorting and table layout; refreshing keeps the current location.

### Changed

- The table fills the available width and height, keeping its scrollbars at the bottom and right edges even with few tasks or visible columns. Column widths remain adjustable without stretching to fill empty space.

## 0.15.11 — 2026-10-17

### Changed

- New task uses the same compact floating panel in Overview, Tasks, Planning and Boards, with consistent field spacing, a scrollable form and an always-visible Create task footer. The panel opens beneath the view toolbar and fits smaller screens.

## 0.15.10 — 2026-10-17

### Changed

- Project navigation is ordered Overview, Planning, Tasks, Boards in the desktop header and mobile view selector.

## 0.15.9 — 2026-10-17

### Fixed

- Dropdown action rows now respond to hover, press and keyboard focus across the shared menus. Column action menus are compact, include icons and applied-state indicators, and preserve focus after sorting, grouping or hiding columns. Arrow keys navigate actions; Escape returns to the trigger. Touch targets remain comfortably sized.
- Column filters focus the chosen field when other filters already exist, and open column menu buttons stay visibly highlighted.

## 0.15.8 — 2026-10-17

### Changed

- Project navigation now sits in the centre of the top header, followed by New task, with Project settings on the right. The Project dropdown is removed; workflow, import and template tools live in Project settings and remain available in the command menu. Saved views stay accessible from the view toolbar or the board’s More menu.

### Fixed

- Table headers use one consistent background, including pinned ID and Title columns and their action buttons, in both light and dark themes.

## 0.15.7 — 2026-10-17

### Fixed

- Table columns respect their chosen widths after reordering, including Type in the first position. Narrow tables no longer stretch columns to fill the viewport, and keyboard resizing keeps focus on the column edge.

### Changed

- Column drag handles appear when hovering over a header, using keyboard focus or dragging, keeping the table header uncluttered at rest. Narrow headers keep labels readable and retain filtering in the column actions menu.

## 0.15.6 — 2026-10-17

### Fixed

- Project navigation tabs stay in the same positions when switching views. Selecting a tab no longer changes its text width or shifts neighbouring buttons.

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
