# Changelog

User-facing additions, changes and fixes, newest first. Dates use Europe/London and `YYYY-MM-DD`.

## 0.22.55 — 2026-11-07

### Changed
- Feature F0.22-55: Week board cards no longer show their date: the day they sit under names it, and the status has more room.
- Feature F0.22-54: The Week board's Unscheduled cards sit on one board of their own, docked under the week instead of in a row tied to the days. A card goes where you drop it, to the nearest 8 px, and may overlap others, the one moved last on top; everyone sees the same places, and places from the old row carry over. Alt and an arrow key moves a card 8 px (with Shift, 64 px). Drag the board's head, or press Up and Down on it, to make it taller or shorter; the height is kept in this browser.

## 0.22.53 — 2026-11-07

### Added
- Feature F0.22-53: The Week board has an Unscheduled row at the bottom for the backlog: the cards with no dates that aren't done (and not archived), on a grid under the days, in the order they were made until you place them. Put a card anywhere there and it stays, for everyone; drop it on another card to swap them, or move it with Alt and the arrow keys. A card dropped in the row loses its dates, and one dragged to a day is scheduled and gets its place back if it's unscheduled again. Filters apply, and the toolbar's list of unscheduled cards stays.

## 0.22.52 — 2026-11-07

### Added
- Feature F0.22-52: The Week board's bar has a Tags | Time of day switch, so its rows change between tags and parts of the day in one click instead of through Filters. Phones have it in View options; Group by in Filters still offers every field.

### Changed
- Feature F0.22-51: New cards are as quick to make in a big project as in a small one. In a project of 3,000 cards a new card took up to a fifth of a second, mostly spent rereading the list of card numbers and every card; it now takes under 10 ms, and making 1,000 cards one after another takes about 2 seconds instead of 30.

### Fixed
- Feature F0.22-51: Completing a recurring card made in the app now makes its next card. The card was taken for its own next one, so no new card appeared.
- Feature F0.22-51: After a backup is put back, changes made in other apps (Obsidian, sync) show in Pencils again without a restart.
- Feature F0.22-51: Putting a card back to an earlier version keeps its current ID. A version from before the project key changed used to bring back the old ID.

## 0.22.50 — 2026-11-07

### Changed
- Feature F0.22-50: The search, filters and sorts of List, Tree, Table and Kanban have their own tests, so a mistake in them is caught before release.

## 0.22.49 — 2026-11-07

### Changed
- Feature F0.22-49: The app starts with less to load: Help's guides and the Roadmap, an eighth of its code, now load when you first open them.

## 0.22.48 — 2026-11-07

### Added
- Feature F0.22-48: Split the Week board into the morning, afternoon and evening: choose Time of day in its Group by. Morning is before 12:00, afternoon until 17:00, and cards without times show under Any time. Dragging a card into another part of the day starts it at 9:00, 13:00 or 18:00 and keeps its length (an hour for a card without times); dragging it into Any time removes its times.

## 0.22.47 — 2026-11-07

### Added
- Feature F0.22-47: Put the Week board's rows in your own order: drag a row by the handle before its name, or press Alt + Up or Down on it, as with List groups. Each Group by field keeps its own order.

## 0.22.46 — 2026-11-07

### Added
- Feature F0.22-45: Put the cards in each Week board cell in your own order: drag a card up or down within its cell, or to a place in another cell. As in Kanban, the board then shows the manual order.

### Changed
- Feature F0.22-41: Changes made elsewhere show sooner, in about a third of a second instead of one to four seconds in big projects, and List, Tree and Kanban update in place: the rows that didn't change stay as they were, so the scroll position and focus stay put. Home no longer redraws itself just after opening.
- Feature F0.22-42: Changes from elsewhere wait while a tab is hidden and show when it's back, and wait for the same things (an edit, a drag, an open menu) whether they arrive at once or with the 30-second check.
- Feature F0.22-43: The rules for workflows, card fields, hierarchies, sources, recurrence and document properties are now type-checked with the server, so a mistake in them is caught before release.
- Feature F0.22-44: Tree and Table open quickly in big projects. A Tree page holds whole hierarchies up to 100 rows rather than 100 of them (a project of epics drew every card on one page), and a Table row's Parent menu lists the cards when it's opened rather than in every row. In a 1,000-card project, Tree opens in 0.1 s instead of 1.5 s and Table in 0.25 s instead of 2 s.

### Fixed
- Feature F0.22-46: Choosing a Settings section right after scrolling the list of sections keeps the list where you scrolled it, instead of jumping back to where it was before.

## 0.22.40 — 2026-11-07

### Fixed
- Feature F0.22-40: Changing a card's status or priority on the Calendar's Week board saves it and shows it. The choice used to show in the menu only and was never saved.

## 0.22.39 — 2026-11-07

### Changed
- Feature F0.22-39: Pages load faster over slow connections. The server compresses its answers, so a big project's cards download at about an eighth of their size, and Home loads every project's cards once and again only after a change, instead of on every redraw (three times on opening).

## 0.22.38 — 2026-11-06

### Changed
- Feature F0.22-38: Earlier versions of cards, documents and boards no longer pile up forever. Every version from the last day stays, then the last of each hour for a week and the last of each day up to 90 days; older ones are removed. One board's history had grown to 5.7 GB.

## 0.22.37 — 2026-11-06

### Changed
- Feature F0.22-37: While you edit a note, its Finish editing button is a tick filled with the accent colour.

### Fixed
- Feature F0.22-36: The Bold button no longer lights up whenever the cursor is in a heading, only in bold text.
- Feature F0.22-35: Typing "#" or "##" and a space in an empty note or description starts the heading on the line you're on. The placeholder no longer pushes it onto the next line.

## 0.22.34 — 2026-11-06

### Added
- Feature F0.22-33: Each attachment of a card or note has a remove button. It asks first, then takes the file's links out of the description or note. Earlier versions of the card still have it.

### Changed
- Feature F0.22-34: Attaching files no longer leaves "Files attached." under the description or note; the list shows the files, and screen readers still hear it.
- Feature F0.22-32: A card's Notes bar has a smaller New right after its title, with the note's actions at the end of the bar.

### Fixed
- Feature F0.22-31: Closing the file browser without choosing a file, from Add attachments or Attach files, no longer closes the card too.

## 0.22.30 — 2026-11-06

### Added
- Feature F0.22-30: Pasting an image into a card's description or a note, even one you're reading, attaches it there as "Pasted image" with the date and time, as Obsidian names them. A paste that also holds text, such as cells from a spreadsheet, stays a text paste. An image dragged from a web page without a file extension takes one from its type, so it uploads instead of being refused.

## 0.22.29 — 2026-11-06

### Changed
- Feature F0.22-29: Week board shows its Unassigned row (or No tag, No type) only while a card that week sits in it, unless it is the board's only row.
- Feature F0.22-28: A card's Notes bar has New in the middle, styled like the top bar's New, and Attach files after Edit, which adds files to the note shown. A note's attachment list shows only once it holds files.
- Feature F0.22-27: Paging through a card's notes keeps them in edit mode or reading mode, as they were.

## 0.22.26 — 2026-11-06

### Added
- Feature F0.22-26: Each relationship group in a card (Children, Blocked by, Blocks, Related to) has its own + that opens the add menu on that kind, ready to find or create the next one. Parent has none, as a card has one parent.

## 0.22.25 — 2026-11-06

### Added
- Feature F0.22-25: Projects can auto-assign new cards. In Settings → People, Auto-assign new cards chooses one of the project's people: new cards start assigned to them, in the new card form (where you can still change it) and when made without it, such as a quick child card. Nobody turns it off.

## 0.22.24 — 2026-11-06

### Changed
- Feature F0.22-24: Tree has no "The big picture" title. The row above the tree holds only the Subtasks button, and goes when there is nothing to expand.

### Added
- Feature F0.22-23: A card can create its own children. In Relationships, choose Child in the + menu and type a title: Create child (or Enter) adds a new card under this one, in the usual card type when the card hierarchy allows it, and lists it under Children. A new card can hold children once it is saved.

## 0.22.22 — 2026-11-05

### Changed
- Feature F0.22-22: Releases run the browser tests left after the changed ones by importance, critical first, then important, then peripheral, so a broken core journey stops a release sooner.
- Feature F0.22-21: The 25 test files flagged as low value were checked one by one. Three were fixed: a Home phone test merged into the Home bar test, a duplicated board link check removed, and the document phone margins check now allows a pixel of rounding. The other 22 stay, because each checks something no other test does. Seven files that mixed tiers were split so each test runs in its own tier.

## 0.22.20 — 2026-11-05

### Fixed
- Feature F0.22-20: A Kanban card that moves only with its lane while another card is dragged no longer starts a slide of its own of a fraction of a pixel, which made a browser test fail now and then.

### Added
- Feature F0.22-19: Every test file has an importance tier (critical, important or peripheral), from how often people use what it guards and what a failure would cost, and `node scripts/tiers.mjs` runs the tests tier by tier, most important first, stopping after a tier that fails.

## 0.22.18 — 2026-11-05

### Changed
- Feature F0.22-18: A board card's description button is a small round arrow across the card's bottom edge, half outside it, like Miro's, and the card no longer keeps room for it. On a selected card the bottom connection point sits just below it, and a selection toolbar below the card clears both.

## 0.22.17 — 2026-11-05

### Changed
- Feature F0.22-17: A board card's description button is a small rounded pill that reads Expand or Collapse beside its arrow, with a light fill that brightens on hover, instead of a bare arrow tab.

## 0.22.16 — 2026-11-04

### Fixed
- Feature F0.22-16: Browser tests keep their screenshots with their own results instead of writing them to the temporary folder.

## 0.22.15 — 2026-11-04

### Fixed
- Feature F0.22-15: The Home unit tests remove their test vaults when they finish, instead of leaving four folders in the temporary folder on every test run.

## 0.22.14 — 2026-11-04

### Fixed
- Feature F0.22-14: The browser test for personal hotkeys waits for Settings to finish showing a reset before it measures the shortcut buttons, instead of sometimes measuring a button that was just being replaced.

## 0.22.13 — 2026-11-04

### Fixed
- Feature F0.22-13: A browser test that draws on a newly created board waits for that board to open before choosing the pen, so a click can no longer start on the previous board's tool bar as it is replaced (seen in Safari's engine, WebKit, under load).

## 0.22.12 — 2026-11-04

### Fixed
- Feature F0.22-12: In a spreadsheet, a cell's editor no longer closes by itself just after it opens in Safari (WebKit), which can send a scroll event that moves nothing; only a scroll that moves the grid ends the edit. Browser tests also wait for a last save to land before removing their test vault.

## 0.22.11 — 2026-11-04

### Fixed
- Feature F0.22-11: A board note deleted just after it was placed, while its first save was still being answered, is deleted on the server too. Before, the board showed "Conflicting edits need review" and the server kept the note, because the server's copy of the same note, with its fields in another order, was taken for a change.

## 0.22.10 — 2026-11-04

### Fixed
- Feature F0.22-10: A button added to the bottom bar right after opening Settings → You stays, instead of disappearing when Settings finished loading the saved bar (the next change then saved the bar without it). A browser test that measured the selection toolbar on a huge board before the phone layout applied now waits for it.

## 0.22.9 — 2026-11-04

### Fixed
- Feature F0.22-9: Dragging a card in Kanban and on the Week board is smooth. The dashed outline where the card will land stays in place while the pointer crosses the gaps between columns, lanes or day names, so the board no longer jumps and flickers; letting go there drops the card where the outline shows. Over a column the card can't enter, the outline goes back to the card's own place, and letting go changes nothing. Cards and lanes that make room slide into place instead of jumping.

## 0.22.8 — 2026-11-04

### Fixed
- Feature F0.22-8: A save that fails no longer undoes another change saved at the same moment. Before, a card created or edited elsewhere just then could disappear with the failed save, and the failed save could end in a server error.

## 0.22.7 — 2026-11-04

### Fixed
- Feature F0.22-7: A pencil stroke drawn just after opening or creating a board is no longer lost. A background refresh sent before the switch could briefly unload the new board, so the stroke stayed on this device instead of reaching the server, with an error in the console.

## 0.22.6 — 2026-11-04

### Changed
- Feature F0.22-5: Browser test runs are faster with every test kept. Traces are recorded only when a failed test is retried, which removes a fifth of each run's time; runs use 12 workers; and the Firefox and WebKit checks no longer repeat the phone and iPad tests, which already run in WebKit. Tests in six files that passed only while tracing slowed them down now wait for what they check.
- Feature F0.22-6: The longest test file, Table tools, is split in two, and its longest test into one test per theme, so they run side by side instead of holding up the end of a run.

### Fixed
- Feature F0.22-5: In List, Tree and Table, pressing Alt+Down or Alt+Up twice quickly moves a card two places, and a drag started right after a move works. Before, a new move was ignored until the previous one had saved.

## 0.22.4 — 2026-11-04

### Added
- Feature F0.21-96: Calendar's Month layout scrolls through the months, one after another, with no scroll bar. Each week shows its week number on the left, alternate months are tinted, and the heading follows the month in view; previous and next jump to a month's start.
- Feature F0.21-98: Opening a card from inside the card editor (a relationship, or a recurrence's linked card) shows it in place with a Back button at the top left that returns to the card you came from, one card at a time. Edits are saved first, a double click goes back one card, a card deleted meanwhile is skipped, and closing the editor forgets the trail.
- Feature F0.21-99: The card editor's description can be resized: drag the grip at its bottom edge (mouse, pen or finger) or press Arrow Up/Down on it. The height is remembered in this browser, up to most of the screen's height. The card board's fixed description panel is unchanged.

### Changed
- Feature F0.21-95: The item you drag looks the same in every view. Calendar, List, Tree, Table, Kanban, the Documents list and the Board grid show a copy of the item itself, with the same shadow and slight transparency, dimmed where it can't be dropped. Calendar's copy keeps the dates you are choosing under it, and where an item will land is outlined with a dashed line.
- Feature F0.21-97: Week board has no card counts or drag handles: drag a card by any part of it (on touch, press and hold). Titles stay on one line, row names have their own shade, and days have dividers. Clicking the period heading in Month, Week and Week board opens a small calendar: choosing a day always shows it, and Month scrolls to that day's week.
- Feature F0.21-100: A board card's Expand/Collapse description button sits at the bottom edge of the card, centred and small like Miro's, instead of in the card's header.
- Feature F0.22-1: A card's tags are one field in the card editor: chips in their colours with × to remove them, a place to type that filters the list or creates a tag, a clear-all button and a chevron that opens the project's tags. Backspace removes the last chip.
- Feature F0.22-3: Fields in the field box keep a minimum width: on narrow cards a long date is cut short with an ellipsis (its full range stays in the tooltip) before the status is squeezed, and a cut status shows an ellipsis too, so the status always shows a few letters. This covers List, Tree, Kanban, Agenda, Week board, board cards and Calendar cards.

### Fixed
- Feature F0.22-2: A frame's title no longer moves when the frame is collapsed or expanded; it stays level with the frame's buttons.
- Feature F0.22-4: In dark mode the card ID no longer has a background of its own in List, Tree and Table.

## 0.21.94 — 2026-11-04

### Changed
- Feature F0.21-94: Releases are faster. One release ships every feature finished since the last one in a single test run; it runs from a snapshot, so work on the next feature carries on meanwhile; its browser tests fail fast (the changed tests and the app-wide checks first, stopping at the first failure); WebKit runs only for touch and phone changes; and a scoped change to shared styling runs only the tests that use it. Releases commit and push themselves.

### Fixed
- Feature F0.21-94: A Week board drag test no longer fails now and then in WebKit when the board repaints between two drags.

## 0.21.93 — 2026-11-04

### Changed
- Feature F0.21-93: The new card popup puts its close button at the right of the title, with no empty row above it.

### Fixed
- Feature F0.21-93: In projects that turn off assignee, status and priority, the new card popup's start and due dates sit on one line again instead of stacking.

## 0.21.92 — 2026-11-04

### Changed
- Feature F0.21-92: In List, Tree, Table and Kanban, Sort sits right after Filters and has the same bordered look (on phones, right after View options).
- Feature F0.21-92: Kanban cards leave out the field their swimlanes group by: grouped by assignee, cards no longer show the assignee; by priority, the priority; by card type, the type icon.

## 0.21.91 — 2026-11-04

### Added
- Feature F0.21-91: List, Table, Kanban swimlanes, Week board and Timeline can group cards by tag. A card with several tags shows under each, one with none under No tag, and moving a card from one tag's group to another swaps that tag (onto No tag clears its tags).
- Feature F0.21-91: Timeline can group its rows by status, card type, assignee, priority or tag, with Group by in Filters (View options on phones).

### Changed
- Feature F0.21-91: Week board's Rows is now Group by and sits in Filters, like List's grouping (View options on phones).

## 0.21.90 — 2026-11-04

### Added
- Feature F0.21-90: Timeline bars show grips at both ends when you point at them, and always on touch screens; drag one to change the start or end date.
- Feature F0.21-90: When the mouse comes close to a Timeline bar, a dot appears at each end. Drag the end dot onto another card to make that card wait for this one, or the start dot to make this card wait for it. Links that would make a loop are refused, and Escape cancels.

## 0.21.89 — 2026-11-04

### Changed
- Feature F0.21-89: Timeline's range is a menu like Agenda's, with dates on one side and quick ranges on the other: All cards, this or next week or month, or the next 7, 14, 30 or 90 days. Quick ranges move with today, on a board's Timeline too.
- Feature F0.21-89: Timeline no longer has a Day, Week or Month choice. It shows days for a month or less, weeks up to half a year and months beyond.
- Feature F0.21-89: Timeline's toolbar no longer has Review schedule. It is still in a card's Dependencies.
- Feature F0.21-89: Weekends stand out a little more on Timeline, in the header and down the rows, and Week board and Week shade their weekend days the same way.
- Feature F0.21-89: A Week board card's field box sits evenly inside the card, with more room at the sides and less below.

## 0.21.88 — 2026-11-04

### Added
- Feature F0.21-88: Spreadsheets have a document's views. Live preview is the grid as before; Source shows what each cell holds, such as its formula, and edits it; Reading shows the values without the formatting bar, the formula bar or anything that edits them. Choose them from Document tools or the Documents tab's tray, or switch Source with Ctrl/⌘ E; the view is the same one documents use.

## 0.21.87 — 2026-11-04

### Changed
- Feature F0.21-87: On phones an open document or spreadsheet shows its title in the top bar, between the menu and New buttons, with its bookmark star before it. Properties and Focus mode move from the document's bar into Document tools (⋯), as they do on any screen less than 500px tall; in Focus mode its exit icon still shows. Desktop and iPad are otherwise unchanged.

## 0.21.86 — 2026-11-04

### Changed
- Feature F0.21-86: Timeline's card list no longer slides sideways when a drag reaches the timeline's edge on iPhone. A new Card list option shows the list in full, as card numbers only (without the project key), or hides it so the timeline has the whole width (unscheduled rows then name their card in their track); it is remembered, and a board's Timeline keeps its own. Phones show it in View options; desktop and iPad keep it in Filters so the toolbar stays one row.

## 0.21.85 — 2026-11-04

### Added
- Feature F0.21-85: In Search, drag Bookmarks and Commands by their handle into any order within their own list (or move one with Alt+Up/Down), and remove an item from Search with its hide button. Settings → You lists the removed items under Search, each with Bring back. Your order and removed items are saved for you on every device.

## 0.21.84 — 2026-11-04

### Changed
- Feature F0.21-84: Settings has a back button in the top bar, next to the menu button (round, like it, on phones), that returns to the page you had open: the board, document or view inside a project, or Home. It replaces the Back to project button at the bottom of the section list.

## 0.21.83 — 2026-11-04

### Added
- Feature F0.21-83: The board's pen bar is one line, grouped as tools, presets, colour and width, then Draw with and Pen settings, then Done; it fits an iPad in either orientation and scrolls sideways on a phone. Draw with chooses what draws: the pen (fingers select, move, pan and pinch, as before), a finger (one finger draws, two pan or pinch, and the pen selects) or both. Your choice is remembered. Pressure sensitivity and Recognise shapes moved into Pen settings as checkboxes.

## 0.21.82 — 2026-11-04

### Changed
- Feature F0.21-82: The arrows at the ends of horizontally scrolling rows (toolbars, tabs, the board's tools) are subtler: a small muted arrow on a soft fade instead of a bordered button. They fade and slide in when there is more to scroll and ease out when you reach an end, including after a fling; with reduced motion they appear and go at once.

## 0.21.81 — 2026-11-04

### Changed
- Feature F0.21-81: In Tree and List, a card with subtasks shows its expand arrow as a round button with a bold chevron in the text colour, so it stands out from the rows around it. Cards without subtasks keep an empty space.

## 0.21.80 — 2026-11-03

### Fixed
- Feature F0.21-80: A card ID that would be cut short now shows only its number (12 rather than "TEST…"), everywhere IDs appear: List, Tree and phone rows, card editors, relationships, documents, Home and boards. The full ID stays in its tooltip. On phones, field boxes show the assignee in its short form so "In progress" fits, and a date that would touch the box's border wraps onto two lines instead of being cut. A document's card list on a phone puts the field box on its own line, so it no longer covers the card ID and title.

## 0.21.79 — 2026-11-03

### Changed
- Feature F0.21-79: Home keeps the view tabs (the bottom bar on phones and iPad) of the last project you chose, or the first project when you haven't chosen one, and each tab opens that project at its view. The sidebar's Projects dropdown always shows a project, never "Choose a project". On phones, Home's row shows Homepage (Home when there's little room) in the middle with Edit at the right edge, and the floating menu button's shadow is no longer cut off on Home and Settings.

## 0.21.78 — 2026-11-03

### Fixed
- Feature F0.21-78: On iPhone and iPad, dragging a spreadsheet document to its edge no longer pulls the table away from its frame; it stops at its edges, like the Table view.

## 0.21.77 — 2026-11-03

### Fixed
- Feature F0.21-77: On iPhone and iPad, tapping a board's search field (or its owner and status filters) no longer zooms the page in: the board's panels use the 16px text other fields use on touch screens, while cards on the board keep their own size.

## 0.21.76 — 2026-11-03

### Added
- Feature F0.21-76: Every card has a board, a section of the card beside Details, Versions and Comments (the Card board button on wide screens, Board in Card section on phones and narrow panels). It opens over the whole app: the card's title and fields at the top, then its description (with attachments), notes, relationships, linked documents and linked boards as panels on the board's dots, in columns that wrap to the screen. Nothing on it is placed by hand; each panel edits the card as the editor does. Choosing it again, another section or Close leaves it. It is part of the card, so it never appears in the Boards list.

## 0.21.75 — 2026-11-03

### Fixed
- Feature F0.21-75: On phones, dragging the search sheet (with the keyboard open, say) no longer scrolls the page behind it. The results still scroll under the finger.

## 0.21.74 — 2026-11-03

### Fixed
- Feature F0.21-74: On phones, a full-screen board covered the menu button, so the sidebar couldn't be opened. The menu button now floats over the board in full screen, where it always sits, and the sidebar opens above the board.

## 0.21.73 — 2026-11-03

### Added
- Feature F0.21-73: Each project has its own tags. Settings → Tags lists them (starting with the tags its cards already use, with how many cards have each): add a tag, choose its colour with the colour picker, rename it or delete it; renaming or deleting asks first, says how many cards change, and changes every one of them. The card editor shows a card's tags as chips in their colour, with Add tag to pick one of the project's other tags or create a new one into the list, and a remove button on each. Filters offer the project's tags. Tags from other projects are never offered.

## 0.21.72 — 2026-11-03

### Changed
- Feature F0.21-72: Projects have people instead of teams. Project settings → People (and the new-project dialog) lists the organisation's people to tick one by one, with no team needed; Add a team's people ticks a team's members in one go. Teams are now optional groups of people. Existing projects keep the people of the teams they had. Only a project's people can be assigned its cards, and Capacity's Team filter offers every team with someone from the project, under Everyone.

## 0.21.71 — 2026-11-03

### Added
- Feature F0.21-71: Calendar has a Week board layout: the week's days as columns without hours, and a row for each assignee, status, priority or card type (or no rows), chosen with its Rows menu and remembered. A card shows once, on its first day in the week, with its dates; drag it by its handle to another day to move its dates (keeping their length) or to another row to change that field, within the workflow's rules. The row's own field is left out of each card's field box.

## 0.21.70 — 2026-11-03

### Changed
- Feature F0.21-70: Agenda picks its range from one menu: dates (From and To) on one side and quick ranges on the other (Today, Tomorrow, This week, Next week, This month, Next month, Next 7, 14 or 30 days). It replaces the Period menu and the date field. Quick ranges are remembered; previous and next keep the range's length, and whole months move by month. Agenda now keeps its own range instead of sharing a date with Month and Week.
- In Month, Week and Agenda the controls they share (weekends and Layout) stay last on the right, after the layout's own controls and a divider.
- Field boxes in List, Tree and Agenda rows and phone summaries are as wide as the fields the project shows, so a project with fields turned off no longer leaves an empty box beside them.

### Fixed
- Choosing a day in a date picker opened from a menu no longer closes that menu.

## 0.21.69 — 2026-11-03

### Added
- Feature F0.21-69: List groups can be reordered. A toggle beside Group by reverses the groups, and a handle on each group heading drags it to a new place (or Alt + Up/Down moves it). The order is kept per project and grouping field and survives reloads. Groups now have a fixed natural order: the workflow for Status, the project's order for Type, Urgent to None for Priority, and people A to Z with Unassigned last for Assignee, instead of following whichever card came first.

## 0.21.68 — 2026-11-03

### Changed
- Feature F0.21-68: Backfilled Requested, Started, Done, Took and primary model/effort for 13 more historical Roadmap entries from archived requests, coding responses and release records. Removed older model attributions that could only be traced to settings saved before a gap in the work logs; those details remain unknown.

### Fixed
- The grouped List drag check compares saved card records by ID and independently checks visible row order, so unordered storage enumeration cannot falsely report a rejected workflow move as a card change.

## 0.21.67 — 2026-11-03

### Changed
- Feature F0.21-67: Roadmap IDs stay on one line in a wider column. Requested, Started and Done show recorded times in Europe/London, Took shows elapsed time, and a Model / effort column records the primary coding session. Numbered feature history is backfilled from recorded requests, first responses and release commits, with the timing basis on hover; unrecorded historical details stay explicitly unknown. The Roadmap introduction and On this page box are removed. Future releases require timestamps and model/effort metadata.

## 0.21.66 — 2026-11-03

### Changed
- Feature F0.21-66: Card editors, search, document/board panels, date editors, attachment previews and confirmations open and close with a brief fade and small movement. Reduced motion keeps them immediate; edits save before closing and switching cards during an animation safely finishes the previous popup.

## 0.21.65 — 2026-11-03

### Changed
- Feature F0.21-65: Date controls make All day explicit with a filled sun toggle when selected and a clock for timed cards. The date popup names the current mode as All day or Timed, and the hover text explains the switch; all-day boundary hours stay visible and disabled.

## 0.21.64 — 2026-11-03

### Added
- Feature F0.21-64: Cards have Notes with rich text, headings, tables, checklists, quotes and code blocks. Add and delete notes, browse one at a time with Previous/Next, arrow keys or a touch swipe, and attach or preview files on each note. Notes stay with the card in Markdown, history, browser and board drafts, and offline saves; projects can hide Notes in Card fields.

## 0.21.63 — 2026-11-03

### Added
- Feature F0.21-63: Cards have a Boards section beside Documents, with a searchable picker to link, open and remove board links. Links stay in card Markdown, version history, browser drafts and the offline save queue. Older board-to-card links appear in the same section.

## 0.21.62 — 2026-11-03

### Fixed
- Feature F0.21-62: Background saves no longer cancel a file or folder drag in Documents and Boards. The folder tree keeps the dragged item in place until the drop or cancellation, then refreshes with the latest changes.

## 0.21.61 — 2026-11-03

### Changed
- Feature F0.21-61: Card Versions and Comments open on the left when clicked, alongside the details without covering them. Narrower editors use one Details / Versions / Comments picker. The standalone Card details button is removed; resizing preserves edits and comment drafts, and each pane scrolls independently.

## 0.21.60 — 2026-11-03

### Changed
- Feature F0.21-60: Dragging a card into another List group updates its Status, Assignee, Priority or Type and keeps grouping enabled. Empty groups appear as drop targets during a drag. Drops preserve other fields, save locally for connected cards, and respect workflow, hierarchy and source-owned field rules; Escape cancels without changing the card.

## 0.21.59 — 2026-11-03

### Changed
- Feature F0.21-59: Each healthy release automatically keeps only three Pencils Docker images, including the live version and its immediate rollback. Older Pencils images and legacy tags are removed; images in use are skipped and reported, and unrelated applications and vault data stay untouched. The retention rule is recorded in the project instructions.

## 0.21.58 — 2026-11-03

### Changed
- Feature F0.21-58: Board object and connector toolbars stay on one line on desktop, iPad and phones. Controls scroll sideways with directional hints when needed, preserving touch targets, keyboard navigation and contextual menus.

## 0.21.57 — 2026-11-03

### Changed
- Feature F0.21-57: Board cards omit the Blocked text badge. The shared date picker labels its All day icon; clicking or tapping the label toggles it, with aligned controls on desktop and touch layouts.

## 0.21.56 — 2026-11-03

### Added
- Feature F0.21-56: Horizontally scrolling toolbars show directional arrow buttons and faded edges wherever more controls are available, including table formatting, document tabs, board tools and the touch navigation bar. The hints disappear when everything fits and retain compact sizing and touch targets.

### Fixed
- Keyboard focus keeps a toolbar control fully visible during smooth scrolling. Indicators follow their toolbar, stay with its dialog or contextual panel and disappear when it closes.
- Large code blocks keep syntax colours with bounded text nodes, avoiding WebKit's expensive highlight repaints while scrolling. Unicode, the editing caret and source Undo remain intact.

## 0.21.55 — 2026-11-03

### Changed
- Feature F0.21-55: Markdown documents support up to 1,000,000 characters and inline tables up to 100,000 cells. Large tables show bounded pages in Live preview and Reading, with all rows available for search, editing, selection and formatting; Undo/Redo keeps the current page.

### Fixed
- Code syntax colours use a bounded window of immutable highlights, avoiding the large-code typing and Reading-search stalls in WebKit. Reading releases hidden Live components. Unchanged images, tables and code blocks stay mounted while typing nearby; images load lazily and decode asynchronously.
- Live preview caches block parsing and indexes formatting ranges, so caret movement, hovering and component edits avoid reparsing unchanged content. Word and character counts update incrementally, and document network saves are coalesced while every edit is retained immediately for browser recovery. Oversized files changed outside Pencils remain selectable and can be reduced to the supported limit.

## 0.21.54 — 2026-11-03

### Added
- Feature F0.21-54: Both document panes have matching file pickers. Search by name, folder or tag, see file-type icons and folder paths, and filter to Markdown documents, Tables, open files or bookmarks. Keyboard navigation, clear search and empty results work in the shared dropdown. Touch pickers keep the keyboard closed until the search field is tapped.

### Fixed
- Choosing a different file in the first pane preserves the second pane's mounted editor, pending edits and Undo history. The same picker is available in side-by-side and top-and-bottom layouts; closing the split removes it.

## 0.21.53 — 2026-11-03

### Fixed
- Feature F0.21-53: Ctrl-click (Cmd-click on Mac) opens web URLs in a new browser tab from document text, Markdown links, Source, Reading, callouts, table cells and code blocks, without changing the document. Ordinary clicks on editable URL text still position the cursor for writing.

## 0.21.52 — 2026-11-03

### Added
- Feature F0.21-52: Tables inside Markdown documents have selectable, draggable row and column handles, range formatting and deletion, merged cells, and inline checklists, quotes and code blocks. Merging keeps every selected cell's text; Undo restores edits. Save reusable layouts in Templates/Tables and choose them from Insert → Table, with optional body content.

### Changed
- Inline table width uses one toggleable icon. Add column sits at the right edge and Add row at the bottom. Ordinary tables stay as Markdown pipe tables; merged cells and block content use HTML table markup inside the same Markdown file.

## 0.21.51 — 2026-11-03

### Fixed
- Feature F0.21-51: Table embeds stay populated when a source rename or notes change refreshes them in place. Unchanged spreadsheet data reuses its calculated preview instead of leaving an Opening message. Stable references continue to point to the renamed source.

## 0.21.50 — 2026-11-03

### Added
- Feature F0.21-50: Insert → Embed document and `/Embed` place a live, read-only document, heading section or Table worksheet/range inside a Markdown document. Whole Table embeds have worksheet tabs, calculated formulas, shared cell formatting, rich text and merged cells; previews scroll internally and render only visible rows and columns. Press the source name to open the document or selected spreadsheet range. References stay in the Markdown vault, source edits refresh embeds, and Help includes an embedding guide.

### Fixed
- Heading embeds resolve nested section paths, and block embeds omit their IDs and ignore fenced code. Missing sections and circular references show an inline message instead of an empty preview or recursive content.

## 0.21.49 — 2026-11-03

### Fixed
- Feature F0.21-49: Colouring a document selection that crosses bold, italic, strikethrough, highlight or link boundaries preserves both the text colour and the existing formatting in Reading mode. Link destinations, inline code and escaped characters remain intact.

## 0.21.48 — 2026-11-03

### Added
- Feature F0.21-48: Selecting document text highlights the rendered letters without shifting Markdown markers into view. A compact toolbar beside the selection offers bold, italic, strikethrough, highlight, inline code, links and text colours, including a custom colour picker. Works in Focus mode, split documents, callouts and table cells; colours stay in the Markdown vault and survive Reading mode, reopening and undo.

### Fixed
- Applying italic to selected bold text preserves both styles. Colouring a selection across blocks keeps code and table structure intact, and highlighting a coloured callout or table cell preserves its formatting.

## 0.21.47 — 2026-11-03

### Added
- Feature F0.21-47: Focus mode in the document toolbar clears navigation, formatting controls and secondary panes for writing. Press its icon again or Escape to restore the layout. The caret, undo history, document view and split size stay intact, automatic saving continues, and save problems remain visible. Works on desktop, iPad and phone, including Reading and Table documents.

## 0.21.46 — 2026-11-03

### Added
- Feature F0.21-46: Agenda rows show the shared assignee, status, priority and date group on the right. Edit each field directly without opening the card, keep the current scroll position, and see the full schedule range where space allows. Phones place a compact group below the title; disabled project fields stay hidden.

## 0.21.45 — 2026-11-03

### Added
- Feature F0.21-45: Double-click a document or Table file's tab title to rename it inline. Enter or clicking elsewhere saves, Escape cancels, and an empty name keeps the original. F2 also renames a focused tab; document content stays open while its name saves.

## 0.21.44 — 2026-11-03

### Added
- Feature F0.21-44: Split Documents with any pair of Markdown or Table documents, side by side or above and below. Each pane edits and saves independently; resize the remembered divider, swap documents or close either pane. Phones keep one editor visible, and a failed save in the second pane remains recoverable.

### Fixed
- Table cells display the chosen font size consistently on desktop and touch screens; touch text editors retain their readable input size. Cell formatting also applies to text typed after the caret.

## 0.21.43 — 2026-11-03

### Added
- Feature F0.21-43: Table documents support selecting multiple rows or columns, formatting them together, rich text within cells and merging/unmerging cell ranges. A compact toolbar adds fonts, sizes, underline and strikethrough; merge confirmations and undo protect populated cells. Rich text, formulas and merged cells persist in the vault and work with CSV exports.

### Fixed
- Keep the enabled Kanban status and start-date controls visible when assignee, priority and due date are disabled.

## 0.21.42 — 2026-11-03

### Added
- Feature F0.21-42: Edit assignee, status, priority and end dates directly on Kanban cards. The shared field pickers save in place; the card title still opens its editor, and field interactions do not start a card drag.

## 0.21.41 — 2026-11-03

### Added
- Feature F0.21-41: Filters now include an assignee dropdown, tag checkboxes that match any selected tag, priority and the project's custom fields. Number, date, choice and Yes/No fields use their appropriate controls, and active-filter chips identify each selection. Older saved text filters retain their matches.

## 0.21.40 — 2026-11-02

### Changed
- Feature F0.21-40: Reading mode no longer shows a separate Edit button. Document tools keeps all editing modes and its current-mode indicator, while the reading page stays full-height.

## 0.21.39 — 2026-11-02

### Changed
- Feature F0.21-39: The card date popup puts All day at its top-left. All-day schedules show disabled 00:00–23:59 time fields, while switching back restores the previous editable hours. The displayed boundaries do not create a timed schedule.

## 0.21.38 — 2026-11-02

### Changed
- Feature F0.21-38: The board's note-style picker shows only the five shape icons. Style names remain available in tooltips and accessible button names.

## 0.21.37 — 2026-11-02

### Added
- Feature F0.21-37: Active filters appear as named, removable chips beside Filters in Tasks and Planning, including Capacity's scope and team. Long filter sets scroll in place, phones show them beneath the search controls, and removing one filter leaves the others in place.

## 0.21.36 — 2026-11-02

### Changed
- Feature F0.21-36: Table Bulk edit uses compact aligned scope/status rows, shorter scope labels and a full-width Archive action with an icon. Status and archive confirmations replace the menu, show the target count once and return focus to the visible trigger when dismissed; phone confirmations close View options underneath them.

## 0.21.35 — 2026-11-02

### Fixed
- Feature F0.21-35: Field groups use straight vertical dividers without curved ends on board cards, in the card editor, relationships and other shared field groups. Group corners remain rounded, dividers stay contained, and status dropdown arrows retain their own size.

## 0.21.34 — 2026-11-02

### Changed
- Feature F0.21-34: Successful cell and card edits save without routine “saved” popup notifications. Rejected saves, validation errors and edits waiting to sync still show their messages.

## 0.21.33 — 2026-11-02

### Fixed
- Feature F0.21-33: Status and Priority in List and Tree no longer draw rounded separator shadows outside their shared field box. Thin dividers stay inside the box while full-size click and touch targets, hover feedback and keyboard focus remain available.

## 0.21.32 — 2026-11-02

### Added
- Feature F0.21-32: Table documents support dragging row and column headers to reorder them, custom row/column names, header menus to hide/show or delete tracks, and finite worksheet sizing. Moves carry values, formulas, names and sizes with undo/redo; touch uses hold-and-drag. New worksheets start with 100 rows, while existing larger sheets retain their size.

### Changed
- Documents and Tables open Properties from a dedicated toolbar button. Tags and custom fields save in that dropdown, leaving the document and worksheet at full height.

### Fixed
- Virtual table redraws preserve their scroll position in WebKit, including 1,000-row worksheets with interactive headers.

## 0.21.31 — 2026-11-02

### Fixed
- Feature F0.21-31: Desktop sub-category menus centre beneath the navigation icons, using the navigation itself as the anchor. Alignment follows window resizing and keeps the existing single row, opening/closing motion and touch bottom-bar placement.

## 0.21.30 — 2026-11-02

### Added
- Feature F0.21-30: Drag files and folders into folders or between rows to arrange the Documents and Boards lists. Their shared manual order is saved with the project and survives reloads; folders move with their contents. Touch screens support hold-and-drag, insertion lines distinguish reordering from filing, and long lists scroll at the edge while dragging. Invalid destinations, cancelled drags and failed saves leave the saved arrangement intact.

## 0.21.29 — 2026-11-02

### Added
- Feature F0.21-29: Tables documents combine editable spreadsheet cells, formulas, whole-cell formatting, sort/filter, CSV import/export and multiple worksheet tabs with the shared Documents navigation. A virtualised grid supports the approved 1,000-row workload, keyboard/range editing, clipboard references, undo/redo, frozen headers and resizable tracks on desktop and touch screens.
- Tables stay in the Markdown vault, with a readable preview and immutable JSON snapshots beside the document. Revision checks, browser recovery, document versions, Trash and audit history preserve the workbook with its document. The calculation engine loads only when needed. Added a Tables help guide and bundled engine licences.

## 0.21.28 — 2026-11-02

### Fixed
- Feature F0.21-28: Grid titles, row/column labels and resize handles stay at a steady screen size throughout board zooming. Their sizing updates on each camera frame, removing the text jump when zooming stops while keeping style changes scoped to grids.

## 0.21.27 — 2026-11-02

### Changed
- Feature F0.21-27: Date popovers show Start and Due dates on one line, with the All day toggle and Start/End times beneath. Project frame updates place Rearrange generated cards beside Update frame and omit the explanatory text. Inactive scrollbars stay hidden while long content remains scrollable.

### Fixed
- Relationship rows edit assignee, status and priority directly without opening the linked card; its type, ID and title retain navigation. Their name chips fit their available width in phone panels. Untouched empty drafts close immediately without requiring fields or creating a card; edited invalid drafts remain protected.

## 0.21.26 — 2026-11-02

### Changed
- Feature F0.21-26: The selected object's Note/Card type selector sits at the far left of the toolbar, ahead of the editing controls. Delete sits at the end of object and connector toolbars and is consistently red. A Layer order menu groups Bring to front, Bring forward, Send backward and Send to back. Removed the Note/Draft card conversion, Frames reordering and card-placement explanations while retaining their actions.

## 0.21.25 — 2026-11-02

### Added
- Feature F0.21-25: Resize timed calendar cards across days using either handle, with precise previews of each day's occupied time. Both handles can shorten or extend an event while keeping a minimum 15-minute gap. Left/Right changes the endpoint's day, Up/Down adjusts its time, and Escape cancels the drag.

## 0.21.24 — 2026-11-02

### Added
- Feature F0.21-24: Board appearance lets you choose which card details to display on that board: type, ID, title, assignee, status, priority, start/due dates, description, estimate, tags and project custom fields. Choices save with the board, work with undo and Reset, and preserve every card's data. Removed the background, snapping and dependency-arrow explanations to keep the panel compact.

### Fixed
- Grouped card fields use matching assignee, status and date text sizes in lists, trees, Kanban, relationships, planning and board cards. Field dividers no longer replace the board status dropdown arrow with a filled square.

## 0.21.23 — 2026-11-02

### Fixed
- Feature F0.21-23: Reading keeps a full-height document page and its Edit and Document tools buttons on the right. Document tools shows the current Live preview, Source or Reading icon, and Edit returns to the last editing view.

## 0.21.22 — 2026-11-02

### Changed
- Feature F0.21-22: All day is now a sun icon toggle directly after the card editor's date fields, with a tooltip and a highlighted selected state. The compact date editor uses the same toggle. Narrow layouts keep dates readable, and toggling preserves the dates while showing or hiding time fields.

## 0.21.21 — 2026-11-02

### Changed
- Feature F0.21-21: The card editor keeps card type, ID, bookmark and title together in that order on one line, on desktop, iPad and phones. List and Tree field focus outlines now fit the visible field instead of extending above and below it, while preserving full-height touch targets.

## 0.21.20 — 2026-11-02

### Changed
- Feature F0.21-20: Drag timed calendar cards up or down and across days while preserving their duration, with snapping and exact placement previews. Resize using clearer top and bottom grips. Spacious events show the shared assignee, status and priority box beneath the title; compact events keep their title and time. Alt + Up/Down also moves a timed card.

## 0.21.19 — 2026-11-02

### Changed
- Feature F0.21-19: Layout submenus keep their icons on a single horizontal row, centred below the desktop navigation, with the existing opening and closing motion.

## 0.21.18 — 2026-11-02

### Changed
- Feature F0.21-18: Assignee fields show the full name when it fits, the configured short name when space is tighter, and one initial in the smallest slots. Shared field boxes add subtle separators on wider screens; board zoom keeps names stable.

## 0.21.17 — 2026-11-02

### Added
- Feature F0.21-17: Edit imported cards' assignee, status, priority and dates directly in List and Tree, and through the same controls in other views. Edits stay only in Pencils and survive later source syncs. Title and card type still follow the connected source; nothing is published automatically.

## 0.21.16 — 2026-11-02

### Changed
- Feature F0.21-16: Desktop boards put the presence name, Board appearance and Board tools together at the top right, removing the extra toolbar row. Phone and iPad controls keep their existing positions.

## 0.21.15 — 2026-11-02

### Changed
- Feature F0.21-15: Calendar centres its date range and shows weekends with an icon toggle. Unscheduled and layout controls use the active theme's surfaces; shared buttons and fields now follow theme colours instead of hard-coded white fills.

## 0.21.14 — 2026-11-02

### Added
- Feature F0.21-14: Resize timed calendar cards from their start or end grips, with a live time preview and scrolling at the edges. Resizing snaps to 15 minutes at normal zoom, or 30/60 minutes when zoomed out. Drop previews show the card's hour block or month bar instead of highlighting whole days; Escape cancels without changing dates.

## 0.21.13 — 2026-11-02

### Changed
- Feature F0.21-13: Calendar fills its viewport, with aligned day headers and hour columns when scrollbars appear. Unscheduled cards open from a compact button beside Filters; drag a card onto a day or hour while the list steps aside, or drop on Cancel drag to keep it unscheduled.

## 0.21.12 — 2026-11-02

### Added
- Feature F0.21-12: Zoom the Week calendar vertically with minus/plus controls or Shift + scroll over the hours. Zoom out to fit all 24 hours, or in for detailed scheduling. The scale is remembered in this browser; card dates and times stay unchanged.

## 0.21.11 — 2026-11-02

### Changed
- Feature F0.21-11: Hide the Tasks and Planning sub-menu when only one layout is enabled. The category button opens that view directly; enabling another layout brings the sub-menu back on desktop, iPad and phone.

## 0.21.10 — 2026-11-02

### Fixed
- Feature F0.21-10: Stabilise the release check for changing code-block languages on phones. It now waits for Python highlighting to replace JavaScript highlighting; editor behaviour is unchanged.

## 0.21.9 — 2026-11-02

### Changed
- Feature F0.21-9: Remove the default “A little space to turn plans into progress” tagline from Home project cards and project pages. Projects without a description leave out that text row; written descriptions remain visible.

## 0.21.8 — 2026-11-02

### Changed
- Feature F0.21-8: New projects use a wider, three-step dialog: project details and People, card types and hierarchy, then statuses and workflow. Back/Next preserves every entry, each step validates before continuing, and browser drafts restore the complete setup. People uses the organisation's existing teams and shows their members.

## 0.21.7 — 2026-11-02

### Fixed
- Feature F0.21-7: Centre the lower board toolbar controls, including zoom and full screen, on the same line as Undo and Redo in normal and Compact layouts.

## 0.21.6 — 2026-11-02

### Added
- Feature F0.21-6: Settings → You → Hotkeys lets each person assign keyboard shortcuts to commands and bookmarked cards, documents, boards and views. Search actions, record a key combination, clear one or reset all. Shortcuts follow the person's account across devices; duplicate and reserved combinations show an explanation, and shortcuts pause while typing or editing a card.

## 0.21.5 — 2026-11-02

### Changed
- Feature F0.21-5: Removed “Saved automatically” throughout the app. Home's Edit layout button now sits on the left of the top toolbar, freeing the extra row for content. Pending and failed saves still show feedback, including queued Home changes.

## 0.21.4 — 2026-11-02

### Changed
- Feature F0.21-4: Desktop layout submenus use compact, labelled icons centred beneath the navigation toolbar, with a brief opening and closing transition. Reduced-motion preferences are respected.

## 0.21.3 — 2026-11-02

### Changed
- Feature F0.21-3: Project settings has a dedicated Views section for choosing available layouts, whole components and the default view. Turning a view off preserves its cards, documents and boards.

## 0.21.2 — 2026-11-02

### Added
- **F0.21-2:** Week calendar with an hourly scale, separate all-day cards and overlapping timed cards. Drag a time range to open a new card with its dates and times filled in; on touch screens, hold before dragging or tap a time. Keyboard users can activate an hour slot.
- Optional start and end times in the card editor and date picker, saved in the card's Markdown file. Existing date-only cards stay all-day.

### Fixed
- Centre the assignee and status controls when creating cards, remove empty columns for disabled fields, and align dates with the shared field box.

## 0.21.1 — 2026-11-02

### Changed
- **F0.21-1:** Compact settings and desktop controls: align People fields, expand Availability below each person, place Organisation after You, and group appearance controls with their defaults and reset buttons.
- Desktop Tasks, Planning and open Documents tabs reveal their layouts below the top bar when pressed again. Sidebar destinations each have their own row, and available updates use a small icon beside the version.
- Board appearance sits before Board tools on desktop. Selected-object controls share one line when space permits, with at most two scrolling rows on narrower boards.

### Fixed
- Dot grids fade out before low zoom merges their dots into a noisy background.
- Remove the stray top-navigation scrollbar and preserve availability edits made while another setting is saving. Phone settings retain their scroll position after saving.

## 0.21.0 — 2026-11-02

### Changed

- Start the 0.21.0 baseline. Future features are numbered 1–100 within each minor-version cycle, with one patch increment per released feature; feature 100 rolls to the next minor's patch 0 and numbering restarts at 1.
- Feature releases require a matching completed roadmap entry with a cycle-specific ID, such as F0.21-1. Historical feature IDs and release versions remain available.

## 0.20.130 — 2026-11-02

### Fixed

- Document checklist taps have full touch targets, including near the checkbox, without opening the keyboard; swipes still scroll. Document property and task-query checkboxes use the same target.
- Empty Timeline results and their recovery action fit phone screens; Calendar distinguishes filtered results from an empty schedule and offers Clear filters.
- Home uses each project's status names and short dates, respects hidden fields, and gives phone card titles their own line. Breakdown labels have more room.
- Phone boards expose the bookmark star and Board tools directly; save feedback stays in Board tools without an extra View options menu.
- New Table layouts lead with Type, ID, Title, Assignee, Status, Priority and dates. Existing customized columns retain their order and widths.
- Search hints have readable contrast, save feedback uses the shared metadata size, and empty-card guidance names the actual New → Card action.
- The app description accurately describes the Markdown workspace without promising general offline operation.
- The document tag-search check waits for its document to load before opening the list, avoiding an intermittent startup race in verification.

## 0.20.129 — 2026-11-02

### Fixed

- Date-picker verification selects the calendar day explicitly, so a test date that becomes Today no longer produces a false failure.

## 0.20.128 — 2026-11-02

### Fixed

- The card editor's status field uses the available width in narrow desktop windows, keeping priority inside its field box even with a long assignee name.

## 0.20.127 — 2026-11-01

### Fixed

- Card editor controls fit narrow phones and iPad windows: Close stays clear of the other actions, compact field boxes use assignee short names, and full start/due dates stack when space is tight.
- Long assignee names stay within the card's field box, with the full name available in the picker and tooltip.

## 0.20.126 — 2026-11-01

### Fixed

- The style-preference reload check waits for Settings to finish restoring before opening a document, preventing intermittent phone WebKit verification failures.

## 0.20.125 — 2026-11-01

### Changed

- Document and board lists open with a short reveal from the left and a quicker dismissal, with immediate controls, interruption support and a still reduced-motion alternative.

### Fixed

- Closing a document list on touch screens returns keyboard focus to a visible control. Dismissing lists stop accepting input as soon as they close.

## 0.20.124 — 2026-11-01

### Changed

- Recovery names browser and server edits, explains which fields a conflict choice affects, and makes retry, discard and backup actions explicit.
- Offline drawing distinguishes browser-only edits from server saves and explains how to apply them to a board or restore a separate copy. Board terminology is consistent through recovery and linking.

### Fixed

- Backup and draft confirmations stay above the Recovery dialog, with working confirmation, Cancel and Escape controls.
- Long offline board names wrap without hiding their save state or pushing the page sideways.

## 0.20.123 — 2026-11-01

### Changed

- Home's Projects panel shows compact project links directly, with creation actions kept in the empty state and existing panel sizes preserved.
- Overview brings upcoming and overdue cards before project background information, uses smaller metrics and keeps each section at its content height.

### Fixed

- Deadline dates stay on one line beside long titles. Capacity keeps long titles and assignees inside their rows and separates its setup buttons.
- Help keeps its guide navigation collapsed at narrow widths where it sits above the article, including 790–800px windows.

## 0.20.122 — 2026-11-01

### Fixed

- Small edits on large boards receive compact save acknowledgements, preserving server-normalized values, concurrent edits, retry recovery and undo history.
- Wheel and trackpad navigation reuse the board overview while moving, with fewer whole-board selection scans and repeated minimap style reads.
- Callout titles have full-height editing targets on touch screens; Table's open-card buttons fill their reserved desktop target width.
- Home panel moves and resizes end cleanly on focus loss, lost pointer capture or cancellation, saving the last visible layout once.
- Reduced motion uses explicit static feedback for navigation, loading and document controls instead of overriding every animation in the app.
- UI diagnostics follow the current menus and controls, and accessibility checks include WCAG 2.2 target sizing with verified label and enlarged-hit-area exceptions.

## 0.20.121 — 2026-11-01

### Fixed

- Interrupted backup restores recover on restart instead of leaving missing project folders. The vault writer lock now releases when its process dies, including after container replacement.
- Vaults larger than 200 MB or 30,000 files keep saving: automatic backups switch to a restorable directory of files on the server. Smaller backups keep ZIP download and upload.
- Home's web-page check connects only to the address it validated, preventing a DNS change from redirecting the check to a private server.
- Version history loads summaries in pages, fetching a version's full contents when opened, while retaining restore and before/after comparisons.
- Project views and background refreshes transfer summaries of closed boards; full contents load when a board is opened.
- The audit log also records history restores, quick capture, imports and generated changes, with the actor and changed fields, after a successful save.
- Automation controls wait for a rule's enable/disable change before opening its preview, preventing a preview of the previous setting.

## 0.20.120 — 2026-11-01

### Added

- Impeccable project context records Pencils' intended users, Markdown vault commitments, cross-device workflows and scale goals. Future design work defaults to code-first, as confirmed by the owner.

### Fixed

- The date-field keyboard check uses an unambiguous day/month value, so Firefox's native date ordering no longer causes a false failure in the release checks.

## 0.20.119 — 2026-11-01

### Fixed

- A release after the vault’s drive is mounted at a new path uses the vault at its new place, instead of an empty folder Pencils could not start in; when the vault can’t be found or read it stops before deploying.

## 0.20.118 — 2026-11-01

### Changed

- The splash screen shows Pencils’ mark in a ring that fills as the app signs in, loads the workspace and opens your page, with the step it is on beneath it.

## 0.20.117 — 2026-11-01

### Added

- Settings → Debug (formerly Diagnostics) lists what failed, newest first: this browser's failed API calls and errors this session, which Copy and Clear handle, and, for administrators, the server's failed requests with their error messages and its errors and warnings since it started.

## 0.20.116 — 2026-11-01

### Added

- Settings → Trash lists the project's deleted cards, documents and boards with when each is deleted for good, 30 days after it was deleted, and Restore brings one back. Items deleted before today count their 30 days from 1 November 2026. The personal space has its own Trash in Settings.
- Settings → Audit log lists who created, changed, deleted or restored each card, document and board over the last 365 days, with the fields a change touched; filter it by kind or search by item or person.

### Changed

- Deleting a card, document or board says it stays in Trash for 30 days.

## 0.20.115 — 2026-11-01

### Changed

- Select all on a board with arrows keeps the objects' colour, Arrange and Lock; Duplicate and Delete include the arrows.
- The board's tool rail and the selection toolbar's rows show a shadow at an edge where more tools lie beyond.
- Insert › Live note lists the project's documents by title, without the project's own files, and a live note shows its document's title.

### Fixed

- The selection toolbar no longer covers the board's tool rail.
- Arrange's Match width, Match height and Tidy selection wait for two objects, like Align.
- On phones, Project cards fills the screen's width above the tool dock and closes with Escape, and Fit board uses the phone's width.
- A closed tab leaves the board's list of who is here at once instead of after 15 seconds.

## 0.20.114 — 2026-11-01

### Changed

- The board's chosen tool is filled in the accent colour, and on phones the dock's Navigate or Add button shows the tool chosen in its row, such as the hand while panning.
- Connections moved from the selection toolbar to Board tools (⋯).
- The text menu no longer has Copy and Paste formatting buttons; Ctrl/⌘+Alt+C and Ctrl/⌘+Alt+V still copy and paste formatting, and Help lists them.
- A card's Convert menu no longer shows the linked-details hint, and calls the card a card.
- Copy frame link and Fit frame to contents have their own icons.

### Fixed

- On phones and iPad, the selection toolbar's menus (Arrange, colour with the custom picker, and the others), Board tools and other menus end above the bottom bar, so their last rows can be tapped.
- On phones, full screen leaves the board's tool dock where it was instead of moving it behind Safari's bar.
- On a Mac, ⌘+Option+C and ⌘+Option+V copy and paste a board object's formatting.

## 0.20.113 — 2026-11-01

### Added

- Documents in the document list have a ⋯ menu like folders, with Rename, Move to folder and Delete for any document, open or not.
- On iPad and phones, a long press on a document or folder in the list opens its menu, and a long press then a move drags it onto a folder.

### Changed

- Import Markdown is an icon in the document list's header.
- The open document's tab in the top bar is underlined, like the open view's tab.

### Fixed

- On iPad, pressing a folder's ⋯ again closes its panel instead of opening it again.

## 0.20.112 — 2026-11-01

### Changed

- The board's tool rail shows icons only, and the board's empty-state text, zoom level and tool icons are easier to read in the light theme.
- Capacity's toolbar keeps to one row: Measure, Scope and Team are in Filters on desktop and iPad.
- Settings → You starts with Appearance, and its one-line settings sit on one row like the other sections.
- On phones, Help puts Back, search and the guide list in one row above the article, and the guide list opens as a menu.

## 0.20.111 — 2026-11-01

### Changed

- The bookmark star sits before the title on desktop too, as on iPad.
- Table's Sort is an icon with a badge counting its sorts, like the other views' sort.
- Calendar and Timeline show weekends with a Show weekends checkbox, like Kanban's Show card IDs.

### Fixed

- A Settings section opened while a change is still saving waits for the save, so a change made in it is no longer lost and can't undo the save.

## 0.20.110 — 2026-11-01

### Changed

- Settings save as you change them: no save bar and no Save or Discard buttons, with Saving… and Saved beside the page title. Leaving the page saves the field you were typing in, and moving a project to another organisation asks first.
- Document tools and Insert are compact menus like the board's: rows edge to edge with dividers between groups, Insert in one column.

## 0.20.109 — 2026-11-01

### Changed

- Buttons, labels, messages and Help call the work item a card everywhere; the Tasks tab keeps its name.
- Timeline's undated group is called Unscheduled, and its scale options read Day, Week and Month.
- A title too long for its space ends with an ellipsis and shows in full on hover, including Table title cells and the card editor's title.
- Kanban opens on the first column with cards, so phones no longer start on an empty Backlog.
- On phones and iPad the document word count is in Document tools instead of a chip over the text.

## 0.20.108 — 2026-11-01

### Changed

- Task titles are one size in every view: 13px on desktop, 16px on phones and iPad.
- An empty assignee or date shows a faint person or calendar icon instead of a dash, and the card editor shows the assignee's full name.
- Menus on phones and iPad use the body text size.
- Headings follow one type scale: page, dialog and empty-view titles at the title size, section headings at the section size.
- Phones' View options use one text size throughout, with Blocked and Include archived on rows of their own.

## 0.20.107 — 2026-11-01

### Fixed

- The Table refuses a due date before the start date, says why and keeps the saved date; its calendars offer only dates that keep the range in order. A Table edit the server refuses now gives the reason.
- Home's Projects panel shows the organisation dashboard once, and its Bookmarks panel names bookmarked views, such as "Kanban · Website".
- A link to Home opens it in the organisation you last used, not the first one alphabetically.
- Capacity's "Choose project teams" opens the project's Teams settings.
- Pressing a document's Add property, Rename, Move or template button, New folder or Move board again closes its panel instead of failing.
- Escape closes the List, Tree and Timeline date editors and the Timeline range (which now take keyboard focus), a document's formatting menus and the board's Frames panel.
- Keyboard focus returns to the button that opened a dialog such as New project, and stays on Restrict status changes and Hide weekends when the page redraws.
- On phones and iPad, Add person, Add team, Add type, Add field, a description's Link and Clear dates no longer open the keyboard.
- Copy board link shows the link to copy by hand when the browser refuses the clipboard.
- Make a capture token is off while you hold the limit of ten tokens.

## 0.20.106 — 2026-11-01

### Changed

- Dropdown menus open with a short fade, drop and grow, now including the card editor's pickers, comment reactions and document search options. Devices set to reduce motion open them at once.

## 0.20.105 — 2026-11-01

### Fixed

- A Kanban card dragged with a mouse shows where it will land as soon as it enters a column, so holding it near a long column's end scrolls that column in every browser.

## 0.20.104 — 2026-11-01

### Fixed

- Opening comments or a formatting toolbar on a phone or iPad leaves focus where it was instead of moving it to the Markdown button, so in Safari the toolbar starts at its first tools with the arrow to the rest.
- In Safari, the Table's narrow Assignee column fits its heading and names.

## 0.20.103 — 2026-11-01

### Fixed

- In Safari, formatting toolbars (documents, card descriptions and comments) no longer report a resize loop error as they show or hide their scroll chevrons.
- Opening a document, board or view and leaving the page straight away still records the visit for Home.

## 0.20.102 — 2026-11-01

### Fixed

- Kanban on phones no longer lets the page pan sideways or zoom out when cards in later columns show dates.
- A saved Table query's rules on card fields the project turned off no longer filter out of sight; like its saved filters, the open Table leaves them out.

## 0.20.101 — 2026-11-01

### Fixed

- Notes and cards saved with a byte order mark (as some Windows editors do) read as themselves again, instead of as plain notes that dropped out of the project; imported notes, Obsidian sources and notes edited on a board keep their frontmatter with one too.

## 0.20.100 — 2026-10-31

### Added

- Settings → General → Views chooses the views and components each project offers: Tasks (List, Tree, Table, Kanban), Planning (Calendar, Timeline, Capacity), Boards and Documents. Overview always stays. Views that are off leave the tabs, the bottom bar, the layout tray and the New menu; a link or search result for one opens Overview and says why; nothing in the project is deleted.

## 0.20.99 — 2026-10-31

### Changed

- In a board item's toolbar, Up and Down move between its two rows, and touch screens hide the rows' scrollbars like the phone board tools; a mouse shows a thin one.
- Escape in the document or board list clears its search first, then closes the list.
- With estimates turned off, Capacity counts tasks and offers no hours. With Parent turned off, the project's card placement rules wait until it's back, so no card needs a parent you can't set.

### Fixed

- Choosing a board while the current one is still saving keeps the board list open with its message.
- On phones held sideways, the document and board lists fill the page and the page behind them stays in place.
- A write that starts as a save finishes no longer joins that finished save's record, and files saved together keep their own backups.

## 0.20.98 — 2026-10-31

### Changed

- Card fields a project turned off also leave search, document task rows and card chips, the board's Live task view (its layouts, columns and filters, and saved rules on those fields), the Default view setting and the command palette's views. With the due date off, list rows show the start date.
- Phones' View options uses one font size for names, values, checkboxes and Bookmark, and Clear filters is an icon button left of Close.

### Fixed

- On phones, Home has no gap at the top: Edit layout sits beside the menu button.
- A save could fail when another save finished at the same moment.

## 0.20.97 — 2026-10-31

### Added

- Projects can turn off the built-in card fields they don't use in Settings → Statuses & workflow → Card fields: type, assignee, status, priority, start and due dates, estimate, tags and parent. Cards keep their ID and title. A field that's off leaves rows, cards, the card editor, filters, sort and Table columns, and its values stay for when it's turned back on. Views that need it leave the tabs: Kanban without status, Tree without parent, Calendar and Timeline without both dates, Capacity without assignee.

## 0.20.96 — 2026-10-31

### Changed

- The document list and the board list have a page of their own instead of a sidebar section: press the open Documents or Boards tab (on phones and iPad, the Documents tab's tray → Documents). On desktop and iPad the list covers four fifths of the page with the open document or board blurred beside it; phones show it as a full page. Choosing an item, Escape, its close button or a click outside closes it.
- The Documents tray has a divider between Documents and the document views.

## 0.20.95 — 2026-10-31

### Changed

- The Roadmap shows when each request was made, started and done as short times ("31 Oct 20:05") and how long it took ("2h 15m").

## 0.20.94 — 2026-10-31

### Changed

- A popup's own button closes it when pressed again: Document tools (⋯), the sidebar's folder and move panels and a card's date editor.
- The document bar keeps the formatting on screen at every width, except in Reading view, and drops the Reading view and Show formatting buttons; choose Reading view, Live preview or Source in ⋯.
- Board tools (⋯) now holds Present and Board session, then Activity, History and Local checkpoints, ahead of the board's actions; the bar's Session and Version history menus are gone.

## 0.20.93 — 2026-10-31

### Added

- Home: each person's own page of panels, opened at start, from the brand, the Home row at the top of the sidebar and the phone bar's first tab. Panels sit on a 12-column grid; Edit layout drags and resizes them (overlapped panels move down), adds from a catalogue and removes, and every change saves for you on every device. Phones stack the panels in reading order. Panels: Projects, Bookmarks, Commands, Recent, Most visited, Web page (a page that refuses to be embedded shows a link card instead), Task list, Stat, Breakdown, Note and Document.

### Changed

- The app opens on Home instead of the last project; the projects you had are one tap away in Home's Projects panel, the sidebar's Projects dropdown or the bottom bar.

## 0.20.92 — 2026-10-31

### Added

- A Roadmap page, opened from a Roadmap tile between Settings and Help at the bottom of the sidebar: every feature request with its status (in progress, requested, done), when it was requested, started and done, and the release it shipped in. It is updated with every release.

### Changed

- The sidebar's bottom row (Settings, Roadmap, Help) uses the same compact tiles at every width.

## 0.20.91 — 2026-10-31

### Changed

- The selected object's toolbar on a board has two rows at most: common tools (edit, colour, comment, organise, layer order, duplicate, lock, delete) above, and the selected type's own tools below. Each row scrolls sideways instead of wrapping, and the same split applies to a selected connector.

## 0.20.90 — 2026-10-31

### Changed

- Dropdowns open and close with a short fade when the device allows motion: the shared select menu fades in and out, and board menus, View options and selection menus fade in.
- Attachments adds files with a + beside its title, like Relationships and the sidebar's lists, instead of an Add attachments button under the description.

## 0.20.89 — 2026-10-31

### Changed

- Headings in a card's description are smaller and closer to the text's size, with tighter spacing.

## 0.20.88 — 2026-10-31

### Changed

- The calendar's day numbers are a step smaller (12px), with the same tap targets.

## 0.20.87 — 2026-10-31

### Changed

- A tap or click on a date field opens the app's calendar instead of the device's own date picker (iOS wheels, Firefox's popup). The keyboard still types a date.

## 0.20.86 — 2026-10-31

### Changed

- The sidebar's Organisation and Projects dropdowns open their menus in the sidebar's dark colours instead of a light menu.

## 0.20.85 — 2026-10-31

### Changed

- The sidebar's Organisation and Projects share one style: each is a dropdown under its title, with + beside the title to make a new organisation or project. Choosing a project from the dropdown opens it and closes the sidebar.

## 0.20.84 — 2026-10-31

### Changed

- On phones the page behind the open sidebar is blurred a little, as behind dialogs.

## 0.20.83 — 2026-10-31

### Changed

- Who is on a board shows in the board bar as avatars, before Session (beside View options on phones), instead of a name chip floating over the board. Tap them to change your name.

## 0.20.82 — 2026-10-31

### Changed

- The phone board dock offers four categories: Navigate, Add, Pen and Search. Navigate and Add each open one row of their tools above the dock that scrolls sideways, in place of the Canvas tools panel; Pen picks the pen and Search opens board search. Navigate shows when Pan is on.

### Fixed

- On phones, Board appearance stays just above the dock after Reset instead of jumping to fill the screen.

## 0.20.81 — 2026-10-31

### Changed

- The board's capacity gauge shows only once a board passes 80% of its object or frame limit, and then shows the higher share.

## 0.20.80 — 2026-10-31

### Added

- New makes a board in the project, and a document in your personal space from any project. Its choices are grouped by dividers: Card; Document and From template; Board; Personal document. The personal space offers documents only.

### Fixed

- A folder chosen in the Documents or Boards list no longer follows you to another project, where a new document or board then failed to save.

## 0.20.79 — 2026-10-31

### Fixed

- Dragging a Kanban card by touch no longer selects the text underneath: the board's titles and counts can't be selected by a long press, and lifting a card clears any selection.

## 0.20.78 — 2026-10-31

### Changed

- On phones, the View options button looks like the sort button beside it, and counts the active filters in a badge, as the Filters button does on larger screens.

## 0.20.77 — 2026-10-31

### Changed

- On phones, View options is compact: each filter is one row, its name beside its control, with less space between rows.

## 0.20.76 — 2026-10-31

### Changed

- Project settings' Organisation & teams section is called Teams.

## 0.20.75 — 2026-10-31

### Changed

- The organisation's home no longer has its own New project button; the + beside Projects in the sidebar makes projects.

## 0.20.74 — 2026-10-31

### Changed

- Boards sit in the sidebar like documents, in folders you can make, rename, nest and drag boards into, with search. The sidebar's New board menu makes a blank board in the chosen folder or imports an Obsidian .canvas or a Miro board, and Board tools → Move to folder files the open board. The board picker, the bar's Boards menu and its gallery are gone; on phones the menu opens on the board list.

## 0.20.73 — 2026-10-31

### Changed

- The board's zoom level opens a menu: Fit board, 100%, Minimap and Background pattern (double-clicking it still fits the board).
- One Board appearance button, at the foot of the board's tool bar, replaces both Board settings buttons and opens beside the bar with snapping, the background, the dependency arrow style and Reset. The board's name moved to Board tools → Rename, the display toggles to the zoom menu, and Import from Miro to Boards.

## 0.20.72 — 2026-10-31

### Changed

- The board bar has no More menu. Its tools moved where you use them: the left tool bar's Frames opens the outline, now with Layers as a second tab; Live task view sits with Tasks; one Insert button opens beside the bar with Live note, Templates and Bulk notes (phones list them in Canvas tools); Connections opens from the selection toolbar for the selected object; and Import .canvas joins New board in Boards.

### Fixed

- The board's outline and search panels open beside the tool bar instead of over its edge, and Escape closes the outline from inside it.

## 0.20.71 — 2026-10-31

### Changed

- The board bar's right side holds Session (Present and Board session), Version history (Activity, History and Local checkpoints), the bookmark star and Board tools (⋯: Rename, Copy board link, Link tasks, exports, the offline pad and Delete board), each action in one place, with icons and dividers. More keeps the board's inserting and navigating tools. Jump to frame (Outline covers it) and the Keyboard shortcuts entry (Help, or F1, has them) are gone.

### Added

- Board tools → Rename names the board.

## 0.20.70 — 2026-10-31

### Changed

- Board no longer has saved views (the "Unsaved view" picker, Save view, Save as and Delete view): they saved task filters the board doesn't use. Frames, the outline and bookmarks get you around. Live task views that already use a saved view keep it.

## 0.20.69 — 2026-10-31

### Changed

- The app is more compact, like Obsidian: menus and dropdown lists have 4px padding with their rows edge to edge, and settings pages have less padding. On desktop and iPad each project and organisation setting with a one-line control is one row, its name on the left and the control on the right, divided by lines, with any hint under its row; phones still stack them. Setting names read at body size on every screen.

## 0.20.68 — 2026-10-31

### Changed

- Like Obsidian, the document bar holds only the formatting, a Reading view toggle, the bookmark star and ⋯. Everything else (the views, split, width, outline, Undo, Redo, Find, Rename, Move, Page versions, backlinks, comments, export, Obsidian and Delete) is in ⋯, once each, as one compact list split by dividers. Backlinks and unlinked mentions, and comments, open their own panels from it.
- The Properties section shows only once a document has properties or tags; ⋯ → Add property shows it, with its Tags field, and adds the first. After adding a property, the cursor moves to its value.

## 0.20.67 — 2026-10-31

### Changed

- On desktop and iPad, a document's tabs move from their own strip above the document into the top bar, in place of the title and in its type, so the document starts higher. The close button shows on the open tab, or on hover.

## 0.20.66 — 2026-10-31

### Changed

- People and teams have one home, Settings → Organisation: the sidebar's Teams section and the separate People and Teams pages are gone, old links to them open that section, and Capacity's "People and teams" button goes there.

### Fixed

- An unsaved edit to people and teams is offered again in any of the organisation's projects, and once restored, leaving Settings asks before discarding it.

## 0.20.65 — 2026-10-31

### Changed

- One action, one home:
  - The board's More menu no longer repeats Grid, Frame, Project frame, Pen and Images, which stay in the tool bar.
  - The sidebar keeps one New project button, the + beside Projects, now on phones too.
  - The sidebar's organisation settings button is gone; Settings → Organisation is opened from the Settings button.
  - Settings → You no longer repeats Search, which stays in the top bar (the bottom bar on phones and iPad) and on Ctrl/⌘ K.
- Timeline's Range button has its own icon instead of the Weekends calendar.

## 0.20.64 — 2026-10-31

### Changed

- On iPad, Board, Calendar, Timeline, Capacity and an open document put their bookmark star before the title in the top bar, as List, Tree, Table and Kanban do.

## 0.20.63 — 2026-10-31

### Changed

- On desktop and iPad, the board's capacity gauge, zoom level and full-screen toggle move from the right of the board to the foot of the tool bar on the left, together with Undo and Redo. They stay in place while the tools above them scroll. The capacity explanation opens to the right of the gauge, the people on the board move to the top right corner, and presenting hides these controls with the tools.

## 0.20.62 — 2026-10-31

### Added

- People have an optional short name of up to three characters (Settings → Organisation or the People page). Task avatars show it instead of the first three letters of the name, so people whose names start alike can be told apart.

## 0.20.61 — 2026-10-31

### Fixed

- Timeline's "Unplanned" heading stays at the left when the timeline scrolls sideways, as the task names do, instead of scrolling off screen.

## 0.20.60 — 2026-10-31

### Changed

- Table's ID, Type and Assignee columns start narrow, just wide enough for their heading and values (ID widens for long project keys), leaving more room for the rest. Saved views keep their own widths.

## 0.20.59 — 2026-10-31

### Changed

- Table has no row checkboxes. Drag across cells, or Shift-click, to pick rows, then use **Bulk edit** to change their status or archive them; it also applies to the visible rows or every matching task, on phones too. The row actions column is narrower.

## 0.20.58 — 2026-10-31

### Changed

- Assignees show the first three letters of their name, such as Geo for George, instead of initials. The full name stays in the tooltip.

## 0.20.57 — 2026-10-30

### Changed

- Tree's Expand all button is now one icon button that cycles through all expanded, all collapsed and back to normal, the rows you opened and closed yourself. It skips a step that would look the same, and doesn't show when there's nothing to expand.

## 0.20.56 — 2026-10-30

### Changed

- Tree lines its cards up with List when none has subtasks, instead of leaving an empty column for the expand button.

## 0.20.55 — 2026-10-30

### Fixed

- On iPhone and iPad, the layouts tray above the bottom bar (such as Calendar, Timeline and Capacity) shows in front of the page again, instead of behind it.

## 0.20.54 — 2026-10-30

### Added

- Sort cards by Card ID, Parent or Assignee. The Sort menu starts with Manual order, then groups the sorts under Card, Progress and Dates.

## 0.20.53 — 2026-10-30

### Added

- Choose the active sort again to reverse it. The Sort button and its menu show the direction with ↑ or ↓, as Table's column headers do.

## 0.20.52 — 2026-10-30

### Changed

- On iPad, List, Tree, Table and Kanban put their search, filters and sort in the middle of the top bar, and the bookmark star before the title, leaving more room for the cards.

## 0.20.51 — 2026-10-30

### Added

- A Week layout in Calendar, beside Month and Agenda: one week with room for each day's cards; the arrows move a week at a time.

## 0.20.50 — 2026-10-30

### Added

- A thin loading bar at the top of the screen while another project or organisation loads, or Back and Forward take a moment.

## 0.20.49 — 2026-10-30

### Changed

- The top bar no longer shows the version or "Update available"; the sidebar shows the version at its bottom, and flags a newer one there.

## 0.20.48 — 2026-10-30

### Added

- Your own buttons in the bottom bar on phones and iPad, between the views and Search: commands such as New card, Today's note or a view, and your bookmarked cards, documents, boards and views. Add, order and remove them in Settings → You → Bottom bar, or press and hold the bar to change them in place. They're saved for you on every device, and the bar scrolls sideways when they don't fit.

## 0.20.47 — 2026-10-30

### Changed

- The search window has no "Search and commands" title: the search field sits at its top, with a ✕ that clears the text or closes the window.

### Fixed

- On iPad and the web, the search window keeps one size while you type and while results come and go.

## 0.20.46 — 2026-10-30

### Fixed

- On iPad and other touch screens, only the list or page scrolls; the top bar and toolbar stay put instead of the whole app moving up and down.

## 0.20.45 — 2026-10-30

### Changed

- Board cards show both the start and due dates in the field box; tap either to change it in the calendar, right on the card.

## 0.20.44 — 2026-10-30

### Fixed

- Only one picker is open at a time: opening a board card's dates closes its assignee, status or priority menu, and the other way round.
- The date editor, like the other menus and popovers, opens below what you tapped whenever it fits there, instead of above it when there's more room above.

### Changed

- The date editor has no "Dates" title; Clear dates and the close button stay.

## 0.20.43 — 2026-10-30

### Fixed

- Dragging a Kanban card by touch works: a long press lifts the card, a full-size copy follows your finger over a placeholder (also in an empty column) and the card lands where you let go, instead of iOS's tiny framed copy that didn't place it. Moving your finger first still scrolls.

### Added

- A light haptic tick when a Kanban card is lifted and dropped by touch, on Android and on iPhone with iOS 18 or later (where iOS allows it).

## 0.20.42 — 2026-10-30

### Changed

- The Sort button shows the active sort's own icon (a clock for Date created, Aa for Title, a flag for Priority, a calendar for Due date, a status dot for Status) with a small arrow for its ascending direction, tinted. Manual order, which is no sort, keeps the plain icon.

## 0.20.41 — 2026-10-30

### Changed

- On phones the search sheet rises in, follows the keyboard as it opens and closes instead of jumping, and slides away when closed, and the page behind it no longer pans to the search field. With Reduce motion it stays still.

## 0.20.40 — 2026-10-30

### Changed

- When a search finds nothing, "No results. Did you mean …?" reads as one line on phones, and the suggestion prefers a word that starts with the same letter as yours (for "Shocas", *showcase* rather than *thomas*).

## 0.20.39 — 2026-10-30

### Changed

- A card's due date sits inside the assignee, status and priority box, after the priority, in List and Tree rows, phone summaries, relationship rows and Kanban and board cards.
- On phones the field box sits at the end of List and Tree rows (and relationship rows) instead of the middle, so the card ID shows in full.

### Added

- On phones, tapping a List or Tree row's date opens the date editor in place, like its assignee, status and priority.

## 0.20.38 — 2026-10-30

### Added

- **Table options → Copy as CSV** copies a document table for a spreadsheet or another app.

### Changed

- Insert → Table (or `/table`) adds an empty two-column table with the caret in its first cell, instead of placeholder text to replace.

### Fixed

- Inserting a divider, table or other block under a line of text adds a blank line first, so a divider no longer turns that text into a heading.

## 0.20.37 — 2026-10-30

### Added

- Cells copied from a spreadsheet (Excel, Google Sheets, Numbers) paste into a document table from the cell you're in, adding rows and columns as needed. Pasted into the text in Live preview, they become a new table.

### Fixed

- Pasting a single spreadsheet cell into a table cell no longer adds the line break spreadsheets end a copy with.

## 0.20.36 — 2026-10-30

### Added

- Tables in Live preview take spreadsheet keys: Enter moves down a row and adds one after the last, Shift+Enter starts a new line in the cell, Tab past the last cell adds a row, and the arrow keys cross into the next cell at a cell's edges. On phones the keyboard's return key moves down the same way.

### Fixed

- A line break typed in a table cell saves as `<br>` instead of turning into a space.

## 0.20.35 — 2026-10-30

### Added

- Tables in Live preview have **Table options** beside Add row and Add column: insert a row above or below, move a row up or down, delete it, insert a column left or right, move a column, align it left, centre or right, or delete it, at the cell you're in, without switching to Source.

## 0.20.34 — 2026-10-30

### Changed

- On phones the bookmark star for a view or board sits in View options, so the search field shows its whole placeholder, also on 360px screens.

### Fixed

- Editing one cell of a document table no longer rewrites another cell's escaped pipe (`\|`, as in `[[Note\|alias]]`) as a plain `|`, which split that cell into an extra column. An untouched link cell also stays as written, and a backslash typed before a pipe stays in its cell.
- Editing a table cell, quote or callout that holds a `[[wiki link]]` keeps the link instead of saving it as `[alias](#)`.
- With the keyboard put away, the phone search sheet stays above the iPhone's home indicator.
- On phones the plus beside each search result in a card's relationship picker no longer covers the end of the title.
- On touch screens just wider than a phone, the board's left toolbar stops above the bottom bar.

## 0.20.33 — 2026-10-30

### Changed

- On iPad and phones the bottom bar floats over the board and the open document, which now run to the bottom of the screen instead of stopping above a band of page behind the bar. The phone board's tool dock, the minimap, the presentation controls and the word count sit just above the bar, and fitting the board or focusing a frame keeps it clear of the bar.
- On iPad and desktop the board's view controls stand in a vertical bar on the right, level with the tools on the left: board capacity, zoom level and full screen.
- The board's zoom and fit buttons are gone: double-click (or double-tap) the zoom level to fit the board. Pinch, Ctrl/Cmd+wheel, Ctrl/Cmd+−/= and Alt+1 still zoom and fit.
- Expand board and Full screen are one toggle: it fills the window and, where the browser allows (not on iPhone), the whole screen; Escape or the toggle returns. Its corners nudge outwards on hover.
- The board capacity explanation opens beside the gauge.

## 0.20.32 — 2026-10-30

### Fixed

- In Overview's Upcoming and overdue list, each assignee box is as wide as its name instead of stretching to the card's title.

## 0.20.31 — 2026-10-30

### Changed

- Kanban cards show their due date after the assignee and priority, marked when overdue.
- A Kanban column adds cards from the + at the top right of its header only; the Add card button below the cards is gone. Swimlane cells keep theirs, which also sets the lane.

## 0.20.30 — 2026-10-30

### Changed

- Reordering List and Tree rows feels more direct: the row lifts as a copy of itself that moves up and down with the pointer, the insertion line (now with a dot) glides between rows, a drop slides the rows into place and briefly highlights the moved one, and a cancelled drag glides back. Alt+Up/Down moves (also in Table) animate the same way. With reduced motion nothing animates.

## 0.20.29 — 2026-10-30

### Fixed

- A Kanban card being dragged looks like the card, with its light border and text sizes, instead of a copy in a dark frame with larger text (seen on iPhone).

## 0.20.28 — 2026-10-30

### Changed

- On phones Search is a compact sheet like Obsidian's: one-line results above the field at the bottom, kept above the keyboard, without a title or Close bar. Its ✕ clears the text, or closes the sheet when it is empty.
- Search's field takes focus as soon as it opens, so phones and iPad open the keyboard straight away, and a click or tap outside it closes it on every screen.

### Fixed

- In Search, ArrowUp from the field goes to the last result instead of the one before it.

## 0.20.27 — 2026-10-30

### Changed

- On phones the assignee, status and priority box has one width on every List and Tree row and relationship row, centred under the title, so the boxes line up down the list.

## 0.20.26 — 2026-10-30

### Changed

- On phones the view's own row (search or board, star, sort and View options) moves up between the floating menu and New buttons, so lists start higher.

### Fixed

- The shadows of the phone's floating menu and New buttons are round again instead of clipped square.

## 0.20.25 — 2026-10-30

### Changed

- iPad switches views from the same floating bar at the bottom as phones, narrower and centred. Tapping the open Tasks, Planning or Documents tab again shows its layouts, or the document list button and the Live preview, Source and Reading views, in a tray above the bar. New moves to the right of the top bar.

## 0.20.24 — 2026-10-30

### Changed

- The sidebar opens over the page on every device instead of moving it, sliding in from the menu button at the left of the top bar. On iPad it is half as wide again. Escape, its close button, a click outside it or choosing something closes it.
- Settings, Help and the version are at the bottom of the sidebar on iPad and desktop too; the top bar no longer shows them.

## 0.20.23 — 2026-10-30

### Added

- Bookmarks: the star beside a card's ID in the card editor, in the document bar, beside the board name and after a view's filters bookmarks that card, document, board or view. Search lists your bookmarks first, all of them before you type and the matching ones as you do. Bookmarks belong to your account, so every device shows the same ones, with their current names.

## 0.20.22 — 2026-10-30

### Fixed

- Scrolling the Timeline sideways no longer draws task bars over the Task column.
- In List and Tree rows on iPad (Safari) and in Firefox, the assignee, status and priority box has one width on every row and holds the priority, which no longer sits over the due date.

## 0.20.21 — 2026-10-30

### Changed

- On phones, relationship rows in the card editor look like List rows: the title first, then the type, ID, the same-sized field box and the due date.

### Fixed

- Scrolling Board settings or Miro import no longer scrolls the page behind them.

## 0.20.20 — 2026-10-30

### Fixed

- On phones, scrolling the search popup (or any dialog) no longer scrolls the page behind it.

## 0.20.19 — 2026-10-30

### Fixed

- Double-tapping the board no longer opens the pen tools; the double-tap and pen side-button gestures switch between pen and eraser only while a drawing tool is open.

## 0.20.18 — 2026-10-30

### Changed

- On phones the header no longer shows a title or a bar: the menu and New buttons float as round buttons over the page, as in Obsidian.

## 0.20.17 — 2026-10-30

### Changed

- On phones, tapping the open Documents tab shows a tray above the bottom bar with **Documents** (the document list) and the Live preview, Source and Reading views, which leave the document bar. Tray choices stack their icon above the label so four fit across.

### Fixed

- A phone layout tray left open no longer reopens when you come back to its view after leaving it some other way than a tap, such as Back.

## 0.20.16 — 2026-10-30

### Changed

- Document tools group their actions under Document, View, History and Obsidian headings instead of one long list.

## 0.20.15 — 2026-10-30

### Changed

- On phones, pages run behind the floating bottom bar instead of stopping above it; the end of each page, Help and the teams and people pages still scrolls clear of the bar. Boards keep their space above it.

## 0.20.14 — 2026-10-30

### Changed

- Where the card editor shows History and Comments beside the details (the board's panel from 1100px wide, the card editor in other views from 1320px), its pane buttons show only History and Comments; tapping the open pane's button again closes it. Narrower screens keep the Info button to switch back to the details.

## 0.20.13 — 2026-10-30

### Added

- On phones, tapping a List or Tree row's assignee, status or priority opens that field's picker and saves your choice without opening the card; tapping anywhere else on the row still opens the card.

## 0.20.12 — 2026-10-29

### Changed

- A card's assignee, status and priority now sit together in one box whose border takes the priority's colour, in List and Tree rows, phone summaries, relationship rows, the card editor, Kanban and board cards, and task queries in documents. Each project can choose its priority colours in **Settings → Workflow → Priority colours**.

## 0.20.11 — 2026-10-29

### Added

- Document tabs and split view on iPad and desktop: documents you open stay as tabs above the editor, and **Document tools → Split side by side** or **Split top and bottom** shows a second document with its own Live preview, Source or Reading view. Pick the second document from the list at the top of its pane; **Swap documents** exchanges the two, and opening the second document from a tab or link swaps them too. Tabs and the split are remembered per project in this browser. Phones keep one document at a time.

## 0.20.10 — 2026-10-29

### Added

- Themes adapted from Obsidian: **Settings → You → Appearance** offers Minimal (neutral greys, a slate accent, small headings and round checkboxes), Paper (warm cream and gold, with the page as a floating card), Catppuccin (Latte in light, Mocha in dark, with optional rainbow headings) and Typewriter (warm paper, the bundled iA Writer Quattro and Mono fonts, faded Markdown marks and the current line highlighted), beside the original Pencils look. Each works in light and dark, Style settings still apply on top, and text, links and buttons keep at least 4.5:1 contrast.

### Fixed

- A heading colour chosen in Style settings now also colours headings in Live preview, not only in Reading view.

## 0.20.9 — 2026-10-29

### Added

- Style settings, as in Obsidian: **Settings → You → Style** sets the accent colour, document text size, readable line width, line height, document and code fonts, corner roundness, and the colours of headings, callouts and each list callout. Each option shows its default and has a Reset, and **Reset all** restores every default. Your choices apply in light and dark themes and are kept in this browser.

## 0.20.8 — 2026-10-29

### Added

- Sketches in documents: **Insert → Sketch** (or `/sketch`) opens a pen pad over the document, full screen on phones, where a pen, a finger or the mouse draws. Saving embeds the drawing as an SVG that Obsidian shows too, and tapping it opens the pad again to add to it. An unsaved sketch stays in the pad if you close it.

## 0.20.7 — 2026-10-29

### Added

- Capture from your phone: **Settings → You → Capture from your phone** makes a token for a project, and an iPhone Shortcut can then send text there as a new card. The first line becomes the title, the rest the description, and #words become tags, along with inbox. The section shows the Shortcut steps. A token is shown once, can only add cards to its project, stops working if you lose edit access, and can be revoked.

## 0.20.6 — 2026-10-29

### Added

- Comments on document text: select words, then **Insert → Comment on text** (or type `/comment`), to start a thread in the comments panel used for cards, with replies and reactions. The words stay highlighted in Live preview and Source, and clicking them opens the thread. Comments are kept in the document's frontmatter with the quoted words, so the text itself never changes and the quote is found again after edits. **Document tools** lists every thread, and marks one as detached when its words are gone. Adding a comment doesn't make a new page version.

## 0.20.5 — 2026-10-29

### Added

- Document properties and tags, kept as frontmatter that Obsidian reads. **Properties**, at the top of a document, lists them with their tags. Change a value in place, add one as text, a number, a date, a checkbox or a list, or remove it. Values Pencils can't edit, such as nested ones from Obsidian, are left as they are. Type `#tag` in **Find a document** to list documents with that tag, whether it's set as a property or written in the text. Search finds them too.

## 0.20.4 — 2026-10-29

### Added

- Search works like Obsidian's Omnisearch. It returns one ranked list of cards, documents and board text from every project you can open (and your personal space). Titles count most, then headings, then tags, then the text. Results whose title starts with what you typed, and recently changed ones, move up. Words match as you type them, accents don't matter, and each result shows a highlighted excerpt. Use `"a phrase"`, `-word` to leave something out, `#tag`, and `in:cards`, `in:docs` or `in:boards`. When nothing matches, **Did you mean** offers a close spelling. Alt+Enter links the result into the open document.

### Changed

- The Search button now follows the view tabs in the top bar on iPad and desktop too, after a divider, as it already did in the phone bar.

### Fixed

- In a document, Ctrl/⌘ K inserts a link without also opening search.

## 0.20.3 — 2026-10-29

### Added

- A personal space: **Personal** in the sidebar, above the organisation, holds your own documents (with folders, templates and links) outside every project. Only your account can open it; administrators can't open it in Pencils either, though anyone with access to the server's files or backups can still read them.
- **Today** (in the sidebar and in Ctrl/⌘ K) opens today's note, named `YYYY-MM-DD`, in the personal space's Daily folder, and makes it if needed. It uses a template named "Daily" from your Templates folder when there is one. Otherwise the note starts with a task query listing your unfinished cards that are due today or overdue. Task queries in the personal space list cards from every project you can open, and ticking or opening a card works there too.

## 0.20.2 — 2026-10-29

### Added

- Document templates: put documents in a folder named Templates, then choose **New → From template**. Templates can use `{{title}}`, `{{date}}`, `{{time}}`, `{{date:D MMMM YYYY}}`-style formats, `{{project}}`, `{{prompt:Question}}` (asked before the document is made) and `{{cursor}}`, where the caret starts in the new document.

## 0.20.1 — 2026-10-29

### Added

- Live task queries in documents: a ```` ```tasks ```` block lists the project's matching cards, using instructions from the Obsidian Tasks plugin, one per line: `done` or `not done`, `due today`, `due before|after|on <date>` (a date, `today`, `tomorrow` or `yesterday`), `overdue`, `has due date`, `no due date`, `assignee is me|<name>`, `no assignee`, `status is`, `priority is`, `type is`, `tag includes`, `title includes`, `description includes`, `sort by <field> [reverse]` and `limit <n>`. Rows show the card's type, key, title, assignee, status and priority; ticking a row completes the card, and clicking it opens the card. Lines the block doesn't understand are listed in it. Add one with **Insert → Task query** or `/task query`.

## 0.20.0 — 2026-10-29

### Added

- Unlinked mentions, as in Obsidian: **Document tools** lists the other documents that name this one in plain text, and **Link** turns those mentions into links that keep their wording. A card's **Documents** section also lists the documents that mention its key, marking those that don't link it.

## 0.19.44 — 2026-10-29

### Added

- Card mentions in documents: `[[WEB-12]]` shows the card as a chip with its type, key, title and status, and clicking it opens the card. Typing `[[` offers the project's cards after its documents. **Card from text** (in **Insert** and the `/` menu) turns the selected text, or the current line, into a card linked to the document and replaces the text with a mention. Obsidian opens the same links through the cards' aliases.

### Fixed

- `[[…]]` links in Live preview show as links instead of their Markdown, and clicking a link there follows it instead of revealing the Markdown.

## 0.19.43 — 2026-10-29

### Added

- List callouts in documents, as in Obsidian's List Callouts plugin: start a list item with `!`, `?`, `&`, `~`, `@`, `$` or `%` and a space (`- ! Ship on Friday`) and the item is tinted, with an icon for Important, Question, Bookmark, Idea, Person, Cost or Aside. Type `/` and a name (`/important`) to add one. The character stays in the Markdown, so the file reads as a plain list in Obsidian.

### Fixed

- Callout titles in documents show as typed instead of capitalising every word.

## 0.19.42 — 2026-10-29

### Added

- Phones have a **Search** button at the end of the bottom bar, after a divider. It opens search, which now lists the open project's documents and boards as well as tasks from every project and commands.

## 0.19.41 — 2026-10-29

### Changed

- The card editor's relationship sort button lists its options straight away (Relationship order, Assignee, Status, Priority, with a check on the current one) instead of a **Sort by** dropdown inside the menu; arrow keys move between them. **Reverse order** stays underneath.

## 0.19.40 — 2026-10-29

### Changed

- In the card editor, the priority button is a square like the assignee beside it, and the header's button groups and **Close** keep the same 10px spacing as the rows below. On phones the Duplicate/Archive/Delete group ends exactly where the Status field below it ends.

## 0.19.39 — 2026-10-29

### Changed

- The card editor shows **Duplicate**, **Archive** and **Delete** as a group of icons right before **Close**, on phones too, instead of behind a **…** menu. **Close** is red.
- The card type button in the editor is a square that lines up with the buttons above and below it.

### Fixed

- The phone top bar's **+** button centres its icon.

## 0.19.38 — 2026-10-29

### Added

- On phones, swiping in from the left edge of the screen opens the sidebar, where Safari would otherwise go back a page.

## 0.19.37 — 2026-10-29

### Changed

- On phones, Tasks and Planning layouts open from the bottom bar: tap the open **Tasks** or **Planning** tab again and its layouts (List, Tree, Table, Kanban, or Calendar, Timeline, Capacity) rise in a tray just above the bar. Choosing one, tapping the tab again, tapping elsewhere or pressing Escape closes it. A small chevron on the tab shows the tray is there and turns over while it is open. The toolbar loses its layout row, leaving more room for the view.

## 0.19.36 — 2026-10-29

### Fixed

- On the Settings page, the list of sections and the page beside it scroll on their own: scrolling one no longer moves the other, and picking a section keeps the list where it was. Settings opened without a project use the same layout, with the sections beside the page instead of above it.

## 0.19.35 — 2026-10-29

### Changed

- **Filters** and **Sort** are icon buttons on every screen. A badge on the Filters icon counts the active filters; hover or a screen reader gives the current sort.
- The Filters popup names every field above it (Status, Type, Assignee, Tag, Deadline, Completion and, in List, Group by), lines them up at one width, and puts **Clear filters** in its own footer as a proper button.

### Fixed

- Dragging a Kanban card on iPad no longer shows a black box: the preview is now a plain copy of the card, without the tilt and shadow that Safari draws wrongly.

## 0.19.34 — 2026-10-29

### Changed

- The phone's bottom bar shows icons instead of text; each tab keeps its name as a tooltip and for screen readers.

## 0.19.33 — 2026-10-29

### Changed

- On phones, views switch from a floating, rounded bar of text tabs at the bottom of the screen: **Overview**, **Documents**, **Planning**, **Tasks** and **Boards**, each one tap away. Tasks and Planning reopen the layout you used last; choose List, Tree, Table or Kanban (or Calendar, Timeline, Capacity) at the top of the view. Tap **Documents** again to list your documents. The bar steps aside while you type.
- The phone menu now lists the organisation, projects and teams straight away, with **Settings** and **Help** at the bottom within thumb reach, instead of view tiles and a New button (New stays as **+** in the top bar).

## 0.19.32 — 2026-10-29

### Changed

- Calendar, Timeline, Capacity and Table draw their controls straight into the toolbar row instead of moving them there after the view appears. On phones, Calendar and Capacity keep their period arrows in the toolbar row; their other options stay in **View options**.

## 0.19.31 — 2026-10-29

### Changed

- One **Settings** page holds your own settings (appearance, fonts, board controls, recovery and sign-in), the project's and the organisation's, opened from a single Settings button in the top bar (and **Settings** in the phone menu). Personal and organisation settings are no longer dialogs; the profile button is gone.
- The top bar names only the open board or document, or the project when nothing is open, without organisation or project crumbs.
- Documents have one bar: formatting on the left, the document's controls on the right. The name shows in the top bar; rename it from **Document tools → Rename**, which also opens for a new document.
- Calendar, Timeline, Capacity and Table show their own controls on the right of the toolbar row, beside the view switcher, search and filters, instead of in a second bar.
- Undo and redo on a board apply at once instead of reloading the project.

### Removed

- The feature request inbox and its automatic worker.
- The **New card** button at the bottom of the Table (use **New** in the top bar).

### Fixed

- Saving the organisation's name, description or colour no longer clears its people and teams, or fails when a project uses one of its teams.
- On iPad and phones a finger no longer drags the whole app up or down; lists and panels still scroll.
- Scheduling a row on the Timeline works again where its options sit outside the timeline (the toolbar, or View options on phones).

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
