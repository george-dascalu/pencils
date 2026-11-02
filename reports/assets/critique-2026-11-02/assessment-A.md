# Assessment A — independent design review

Target: `/run/media/george/Work/Projects/pencils/public/index.html` and its rendered application, Pencils 0.20.129. Reviewed 2026-11-02. Assessor: `/root/critique_design`. Mode: Operate / Read. This assessment was completed without reading past critique reports, detector output, or Assessment B.

## Method and limits

Read `AGENTS.md`, `PRODUCT.md`, the critique reference, the relevant current implementation, and fixture setup. Used new Chromium contexts against `startApp()` disposable vaults. Rendered desktop 1440×900, iPad 1024×768 with coarse pointer, and phone 390×844 in light and dark themes. Main sweep captured 110 screens: Home, Overview, Documents, document list, List, Tree, Table, Kanban, Calendar, Timeline, Capacity, Board, board list, card editor, Settings, sidebar, Help, empty List, and phone View options. Follow-up captured configured Home cards and Breakdown with custom workflow labels, filtered planning views, Help with no results, and stable phone View options / Board options.

Evidence: `/tmp/pencils-critique-A/`; principal logs: `evidence.json` and `focus-evidence.json`. Reproduction scripts: `/tmp/pencils-critique-A-run.mjs` and `/tmp/pencils-critique-A-focus.mjs`.

Stop method recorded in both scripts: `finally` closes desktop/touch browsers, calls `app.close()`, closes server/store, and removes the disposable vault. Completed runs printed cleanup confirmation. No production data or product/test files were changed. The main sweep recorded no page errors. This is browser emulation, not a physical-device, screen-reader, slow-network, large-data or multi-user validation. Destructive/recovery workflows were assessed from available UI and current code, not exhaustively fault-injected.

## Design specificity verdict

Pencils feels authored for its purpose. The warm paper-like light theme, muted green dark theme, narrow task rows, document-first reading width, and shared card language make documents, planning and boards feel like one personal workspace. This is an operating surface with a clear compact identity, not interchangeable dashboard decoration. Preserve that identity.

The largest opportunity is finishing the shared behavior at the edges: Home still formats records differently, a phone Timeline recovery message sits outside the viewport, and phone Board tools have drifted from the documented placement. None justifies a broad visual redesign.

## Nielsen scores

| # | Heuristic | Score / 4 | Evidence / limit |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Autosave, counts, active tabs and selected tools provide useful feedback. Filtered Calendar can look like an actually empty schedule. |
| 2 | Match between system and real world | 3 | Most labels are direct and consistent. Home leaks `in-progress`, `todo` and ISO dates despite custom workflow names. |
| 3 | User control and freedom | 3 | Editors and lists have close / Escape routes; surrounding context stays visible on larger screens. Phone Timeline's recovery action is offscreen. |
| 4 | Consistency and standards | 2 | Strong shared shell; Home metadata, Table's default order, and phone Board tools are concrete remaining exceptions. |
| 5 | Error prevention | 3 | Separate controls, predictable target sizes, contextual editing, autosave and recovery infrastructure reduce mistakes. Not a fault-injection assessment. |
| 6 | Recognition rather than recall | 3 | Labels, named icon buttons and grouped controls support recognition. Table's changed order and the extra phone Board menu level add recall work. |
| 7 | Flexibility and efficiency | 3 | Keyboard / direct manipulation paths and compact shared controls support regular use. Phone Board actions take an avoidable extra step. |
| 8 | Aesthetic and minimalist design | 4 | The compact composition, restrained colors and document reading width serve the work; sanctioned icon navigation is appropriate. |
| 9 | Error recovery | 3 | Empty List and Help give next steps; phone Timeline hides its recovery text/button, and Calendar does not distinguish filtered results well enough. |
| 10 | Help and documentation | 3 | Help is searchable and has a clear no-results suggestion; tooltips and contextual hints cover routine actions. |
| | **Total** | **30 / 40** | **Good — a coherent foundation with narrow corrective work.** |

## What works

1. **The shared card language is legible and compact.** List and Tree keep titles prominent while the combined field box aligns owner, status, priority and date. Touch controls are larger without inflating desktop rows. Evidence: `desktop-light-list.png`, `ipad-light-list.png`, `phone-light-list.png`, `phone-dark-list.png`.
2. **Documents retain a calm reading surface while keeping editing nearby.** Formatting stays in one bar, document content has a sensible reading width, and the same typography/theme carries into cards and boards. Evidence: `desktop-light-documents.png`, `desktop-dark-documents.png`, `phone-light-documents.png`.
3. **Navigation adapts without inventing another app.** The same views move into the touch tray; the sidebar overlays the page; document/board lists and card editors retain context on larger screens. Phone card opening focused the Close card button, not a text field. Evidence: `ipad-light-list.png`, `phone-light-sidebar.png`, `phone-light-document-list.png`, `focus-evidence.json`.

## Confirmed priority issues

### A1 — P2: Home shows storage values instead of the project's visible card language

**Observed:** A configured Home Card list and Breakdown show `in-progress` and `todo` even when those statuses are named “Making progress” and “Ready to start.” Card dates show `2026-11-05`; on phone, the raw metadata squeezes “Share the research notes” down to “Share the research …”. The normal List shows translated/project-specific labels and concise dates.

**Why it matters:** The landing surface contradicts the user's workflow language and makes the same cards harder to scan. A custom status name is user configuration, so showing its internal identifier is a real inconsistency, not a stylistic preference.

**Source:** `public/home.js:146` emits `t.status` and `t.due`; `public/home.js:156` emits the raw Breakdown key. `public/home.css:56` keeps these metadata spans inflexible. The existing `statusLabel(config, status)` in `public/workflow-model.js:18` already handles custom labels. Use the snapshot's project configuration, not whichever project happens to be open elsewhere.

**Rendered evidence:** `focus-desktop-light-configured-home.png`, `focus-phone-light-configured-home.png`, corresponding dark/iPad captures; seed records custom labels in the focus script.

**Narrow fix:** Reuse the shared workflow labels and date formatting in Home lists and Breakdown, retaining raw keys for filtering. Fit the card identity/title and metadata at phone width using the existing row conventions; don't add a new metadata system or truncate more of the title to accommodate a long custom label. Respect the project's field visibility when rendering these fields. Add a case with custom labels and a long title.

**Suggested command:** `/impeccable clarify` then `/impeccable polish`.

### A2 — P2: Empty planning states lose the recovery path on phone or misdescribe filtered results

**Observed:** Search for an unmatched string in Timeline on a 390px phone. The sheet shows a blank bordered region: “No matching cards” and Clear filters are centered in the wide timeline sheet, outside the initial visible width. Desktop displays them correctly. Calendar's phone agenda says “No cards scheduled in this period” although the seeded project has scheduled cards and only the search has excluded them; desktop Calendar shows an empty month with no matching-state explanation.

**Why it matters:** The person cannot immediately distinguish a filter from missing work or a failed view. Timeline's intended recovery control is present in the DOM but visually unavailable until sideways scrolling. Clearing the search remains a workaround, so this is P2 rather than a blocker.

**Source:** `public/task-timeline.js:58` creates the wide `.timeline-sheet`; its centered `.empty` is inserted inside that sheet at line 63. `public/calendar.js:39` always uses the same empty agenda copy; the month branch at line 42 has no filtered-result explanation.

**Rendered evidence:** `focus-phone-light-filtered-timeline.png` versus `focus-desktop-light-filtered-timeline.png`; `focus-phone-light-filtered-calendar.png` and `focus-desktop-light-filtered-calendar.png`, plus corresponding dark captures.

**Narrow fix:** Put the Timeline empty message and existing action in the visible viewport width, outside the wide date sheet or in a viewport-width/sticky empty state. In Calendar distinguish no matching results from no scheduled cards, and expose the existing Clear filters action when the current filter/query causes the empty result. Keep the calendar grid usable for adding dated work. Verify both genuinely empty and filtered states at phone width without horizontal scrolling.

**Suggested command:** `/impeccable harden` then `/impeccable polish`.

### A3 — P2: Phone Board tools and bookmark are nested inside View options

**Observed:** The phone board bar exposes presence and View options. The bookmark star and Board tools ⋯ do not appear beside them. Opening View options reveals a Bookmark row and another Board tools disclosure. Documents expose their star and ⋯ directly in their bar.

**Why it matters:** This adds a menu level to routine board actions and contradicts the explicit shared placement in `AGENTS.md`: the board bar should end with Board tools after the star on phones. This is a concrete regression from the desired interface, not a request for more labels or a second toolbar.

**Source:** `public/project-layout.js:121–128` moves every direct `.board-menu` and `.bookmark-button` in the board toolbar into the phone View options panel.

**Rendered evidence:** `phone-light-board.png`, `phone-dark-board.png`, `focus-phone-light-board-options.png`, `focus-phone-dark-board-options.png`. The main sweep's visible-control metrics list View options but no visible Bookmark or Board tools in the closed board bar.

**Narrow fix:** In the shared toolbar transformation retain the board's bookmark and Board tools at the trailing end of the phone bar, in the documented order; move only options that belong in View options. Give each action one home. Preserve the presence position, 44px targets, and phone document/board alignment.

**Suggested command:** `/impeccable adapt` then `/impeccable polish`.

### A4 — P2: Table's fresh default order breaks the common task-field order

**Observed:** A fresh Table starts ID, Title, Description, Type, Assignee, Status, Priority, Parent. On iPad, the 300px Description column pushes Status and Priority entirely beyond the initial view. List/Tree establish Type, ID, Title, then the common fields. `AGENTS.md` explicitly includes default Table columns in that common order.

**Why it matters:** Switching views requires relearning where the same values live, and secondary description content crowds the fields most useful to triage a row.

**Source:** `public/grid.js:42–54` defines the default order. `public/table-model.js:6–19` defines another order (Status/Priority before Assignee), so update both default paths consistently while preserving existing saved customization.

**Rendered evidence:** `desktop-light-table.png`, `ipad-light-table.png`, corresponding dark captures; fresh contexts had no saved column preferences.

**Narrow fix:** Use Type, ID, Title, Assignee, Status, Priority, then dates as the standard leading columns; put Description and other secondary fields afterward. Preserve saved user column order and widths. Verify the fresh default and a customized saved order.

**Suggested command:** `/impeccable polish`.

## Smaller confirmed copy fixes

- **A5 — P3: Empty List/Tree refers to a button that is not named that way.** `public/app.js:1170` says “Use New card above,” but the visible control is New and its menu item is Card (`public/app.js:943–949`); phones show the named New icon. Change the instruction to “Choose New → Card to add your first card.” Do not add a duplicate creation button. Evidence: `desktop-light-empty-list.png`, `phone-light-empty-list.png`.
- **A6 — P2: The entry page metadata promises an offline application.** `public/index.html:9` describes “An offline, Markdown-powered project workspace.” `PRODUCT.md` explicitly says the application requires a reachable server and must not be described as fully usable offline on every device. Change this metadata to a portable/Markdown workspace description. This is source/DOM metadata evidence, not an on-screen layout defect. No new offline feature is implied.

## Cognitive load

**Overall: low in routine editing; moderate in configuration.** The working surface is restrained and the app reveals tools when needed. There is no case for replacing the sanctioned icon navigation or adding a second sidebar.

| Checklist item | Result |
|---|---|
| Single focus | Pass: document, card and list editing have clear primary content. |
| Chunking | Partial: View options has seven field rows plus checks; Settings has more than four destinations, although headings group them. |
| Grouping | Pass: shared field boxes, separators and toolbar groups give useful boundaries. |
| Visual hierarchy | Pass: title/content first, metadata and actions secondary. |
| One decision at a time | Pass: contextual editors and menus support focused changes. |
| Minimal choices | Partial: task/planning toolbars, the six-view touch bar plus Search, and editing toolbar exceed four options. They are expert tools and deliberately grouped; this is not automatically a defect. |
| Working memory | Pass in the core flow; Home's different status vocabulary and Table order introduce unnecessary translation (A1/A4). |
| Progressive disclosure | Pass overall; Board tools is over-nested on phone (A3). |

Two partial checklist failures yield a moderate strict checklist reading. The concrete remediation is A1–A4, not indiscriminate menu consolidation.

## Emotional journey

Arrival is quiet and controllable. A populated Home gives a useful sense of ownership; empty panels explain what belongs there. Switching from notes to cards works because the same visual language survives the change. Opening a card on touch avoids a sudden keyboard, which is reassuring. Autosave messages and the lack of a forced save step keep routine work flowing.

The valley is a search that appears to make work disappear in planning: phone Timeline leaves a blank area and Calendar reports an empty period. A second, smaller valley is opening Board actions on phone and discovering another nested menu. Correcting those transitions preserves confidence. No decorative delight is needed to compensate for them.

## Persona red flags

- **Alex — regular power user:** Table's default field order disrupts scanning learned in List/Tree; phone Board tools requires an extra disclosure. Otherwise compact controls and contextual panels reward familiarity. No forced onboarding was encountered.
- **Sam — keyboard / accessibility dependent:** Phone Timeline's recovery action is outside the initial visible viewport; a keyboard may scroll it into view, but low-vision users should not have to discover that. Core icon controls have accessible names; the phone List title's small text box is **not** a tiny target: its `::after` covers the row, so do not “fix” it by bloating the row. Native checkboxes similarly have full label targets.
- **Casey — distracted phone user:** Home's raw status/date metadata crowds the title; a failed Timeline search looks blank; Board tools moves to a second menu level. Card opening correctly leaves focus on a non-text control, and the normal field targets measured 44px high.

## Excluded / nonissues

- The first immediate screenshots of phone View options caught the instant before the disclosure's positioning handler. Stable follow-up measured `x:22, y:52, width:360, height:542, right:382, bottom:594` on a 390×844 phone in both themes, above the bottom bar. Do not report the first-frame image as persistent offscreen placement.
- A 20.8px phone title text box has a full-row pseudo-element hit target. A 13px checkbox has its enclosing full-size label. Neither establishes a small-target defect.
- Icon-only navigation, hidden phone title, one sidebar, touch layout trays and internal horizontal scrolling for Table/Timeline/Capacity are explicit product choices.
- Large empty areas in a user-resizable Home panel are not enough evidence for a design defect.
- Board objects clipped by the current pan/zoom viewport are expected; the board is a navigable canvas.

## Questions / stop condition

Questions skipped: the user has already requested every confirmed issue to be fixed; no new product decision is needed for A1–A6. Preserve the compact identity, correct the existing shared paths, and verify the affected states rather than adding options or navigation.

Skipped physical hardware, screen-reader sessions, network-loss fault injection, and scale/load tests. These captures establish layout/behavior on emulated Chromium only; they do not certify physical iPad or WebKit performance.
