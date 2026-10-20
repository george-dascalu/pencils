# Implementation of the app review

Started 2026-10-17. Source: [app review](reports/2026-10-16-app-review.md).

This checklist tracks all 60 requested improvements. Implementation and verification limits are separate: a row describes the local code scope, not a claim that it has been deployed or external accounts and hardware have been tested. Existing changes are preserved. Integration choices follow the confirmed Jira Cloud, personal-use and iPad Pro 2021/Pencil 2 setup.

| ID | Improvement | Status | Evidence or remaining work |
| --- | --- | --- | --- |
| A1 | Explain why tasks are hidden | Implemented | Shared task visibility totals and clear-filter actions; Board explains card/draft/archive/unavailable scope; Overview declares its project scope. |
| A2 | Reduce toolbar duplication | Implemented | Saved views sit with the shared query controls; project commands and view-specific tools remain separate. Desktop/mobile layout checks. |
| A3 | Give task details one responsive shell | Implemented | One compact, resizable task editor across views; desktop/mobile, light/dark and autosave browser checks. |
| A4 | Make autosave state understandable | Implemented | Shared save-state language distinguishes pending, saved, offline and conflicting drafts; task editor focus remains intact. |
| A5 | Offer comfortable and compact density | Implemented | Personal density tokens and touch targets. |
| A6 | Improve current-view navigation on phones | Implemented | Shared mobile view switcher, all ten views checked. |
| A7 | Make empty states actionable | Implemented | No-data/no-match actions, team/people setup links, unscheduled trays and revoked-access handling. |
| A8 | Add a command menu | Implemented | Ctrl/Cmd+K actions, view/settings navigation and task search; keyboard browser regression. |
| A9 | Make Overview metrics useful entry points | Implemented | Overview metric drilldowns use matching task queries. |
| A10 | Treat overlays as shared components | Implemented | Shared viewport/keyboard-aware placement for selects, colours, task pickers and project/table menus; Escape/click-away/focus return retained. |
| B1 | Remove Timeline's silent task loss | Implemented | Explicit 200-row pages; 205-task regression passes. |
| B2 | Make Kanban columns complete | Implemented | Full per-column counts and incremental cards; 205-task regression passes. |
| B3 | Preserve Tree ancestry | Implemented | Ancestor context and root/subtree pagination; model/browser regressions pass. |
| B4 | Clarify dependency semantics | Implemented | Blocked by/Blocks lists include keys, status and source; keyboard/board arrows update the same task dependency model. |
| B5 | Preview scheduling consequences | Implemented | Explicit schedule preview with cycles/missing dates, stale-preview checks and per-task application; model tests. |
| B6 | Add effort-based capacity | Implemented | Task/hour capacity, working days, time off and cross-project scope; model and browser tests. |
| B7 | Add a mobile calendar agenda | Implemented | Day/week/month agenda, unscheduled tray and date edits; phones default to agenda. |
| B8 | Strengthen draft finalization | Implemented | Finalisation review checks required fields, current types/statuses, parent/hierarchy rules and local destination; browser checks preserve card geometry/comments and retry identity. |
| B9 | Improve recurring task controls | Implemented | Next occurrence and lineage controls explain completion scheduling and edits to future repeats; model tests cover month ends, restart and duplicate prevention. |
| B10 | Add restrained project automation | Implemented | Disabled rules, manual/status/due triggers, preview/stale guards, bounded actions, loop protection, ownership checks and logs; model and browser tests. |
| C1 | Make saved-view ownership explicit | Implemented | Personal/browser versus shared/project views, Save as and unsaved-change labels. |
| C2 | Add expressive filter groups | Implemented | Validated nested AND/OR query model, relative dates and current-user token; model tests. |
| C3 | Filter from column headers | Implemented | Column menus provide sort, filter, group, hide and type context. |
| C4 | Add meaningful group summaries | Implemented | Full-query/group counts, estimate sums and completion totals. |
| C5 | Combine hierarchy with grouping | Implemented | Optional parent-first outline inside groups, context badges and cycle handling; model tests. |
| C6 | Improve spreadsheet navigation | Implemented | Roving cells, arrows, Enter, Escape, Tab and keyboard ranges; browser regression. |
| C7 | Make bulk scope explicit | Implemented | Selected/page/all-matching bulk scope with count preview and 500-row bound. |
| C8 | Add pinned identity columns and density | Implemented | Pinned ID/title, density and retained column widths. |
| C9 | Add validated paste and export | Implemented | Mapped paste preview with validation, bounded batch edits and formula-safe full-query CSV export. |
| C10 | Scale the query engine | Implemented with scale limits | Compiled queries, Map lookups, bounded table pages, SQLite search and a paged server query endpoint. 1k/10k/50k query benchmark; initial project snapshots still load all records. |
| D1 | Make frame updates predictable | Implemented | Preview changes; preserve placement by default, explicit relayout, stale checks and stable camera; model/browser tests. |
| D2 | Improve relationship routing | Implemented | Deterministic obstacle-aware orthogonal routing, port spacing and stable longest-segment label anchors; manual bends retained. Dense/rotated cases use the existing fallback. |
| D3 | Make connectors accessible | Implemented | Keyboard object/port selection, relationship labels and textual list; real dependency creation and cycle rollback tests. |
| D4 | Add a useful object navigator | Implemented | Object navigator states, search paging and return to previous viewport; Chromium/Firefox browser checks. |
| D5 | Strengthen board recovery | Implemented | Deleted/archived/unavailable states, restore/unarchive, undoable detach-as-note and source links; browser/model checks. |
| D6 | Create a dedicated Drawing view | Implemented | Drawing gallery, dedicated shared canvas, task links and copyable board-note links with lightweight gallery previews. |
| D7 | Replace the active ink rendering path | Implemented; device check pending | Incremental Canvas2D active ink, append-only adaptive smoothing, preserved raw samples/pressure/time/tilt and existing viewport caches. Pen/browser/model checks; physical iPad latency unmeasured. |
| D8 | Improve pen and touch ergonomics | Implemented; device check pending | Pencil drawing/finger navigation, palm exclusion during pen input, movable tools, left/right layout, pressure response and cancellation handling. |
| D9 | Add drawing layers and references | Implemented | Drawing reuses editable board layers, locked image references, vector/raster exports and master canvas files. Pen export regression verifies retained stroke styling. |
| D10 | Make drawing locally durable | Implemented | IndexedDB checkpoints, offline ink shell, per-drawing pending records, guarded three-way reconnect and restore-as-copy. Offline reload/reconnect browser regression. |
| E1 | Add project data-source configuration | Implemented; live setup pending | Source configuration, mappings and preview, capabilities, polling, pause and reversible disconnect; authenticated browser journey. |
| E2 | Preserve source identity | Implemented | Stable provider IDs, badges/Open in source, separate provider descriptions/local annotations and no title deduplication. |
| E3 | Extend Obsidian interoperability | Implemented | Selected Obsidian folder, frontmatter mappings, stable note/block IDs, conservative version-guarded writes and backups; real temporary-file tests. |
| E4 | Add Jira read mode first | Implemented; live OAuth pending | Jira Cloud 3LO, scoped JQL, paginated read, field mapping, polling, token rotation and preserved raw ADF; mocked provider coverage. |
| E5 | Add SharePoint Excel read mode first | Implemented; tenant check pending | Delegated Microsoft OAuth and selected workbook/named-table read with stable row IDs and bounded XLSX parsing. Files.Read.All is supported; selected-resource grant variants are not implemented. |
| E6 | Make writeback a capability | Implemented within stated capabilities | Explicit Jira create/title edit/assign/transition/comment; Obsidian title/assignee/status publication. Provider guards and durable outcome logs. Excel remains read-only; Jira custom required-field creation is limited. |
| E7 | Match local and source audiences | Implemented for personal use | Source projects restricted server-side to owner/workspace admins, including search/history/exports. Negative tests. Provider revocation stops sync, but cannot revoke existing Markdown/backups/device caches. |
| E8 | Handle conflicts visibly | Implemented | Durable source bases and versions, three-way field conflicts and explicit local/source resolution; tests preserve rejected edits/local notes. |
| E9 | Add a sync operations screen | Implemented | Sync operations, last success, reauthentication/retry state, polling/pause, publication outcomes and redacted diagnostic export. |
| E10 | Link records across sources | Implemented | Explicit related-record links and local cross-source dependencies; remote relationships are not inferred or silently published. |
| F1 | Align backup and restore capabilities | Implemented | Bounded 220 MB ZIP upload and verification, expanded-size/count safeguards; >10 MB roundtrip regression passes. |
| F2 | Define complete recovery | Implemented | Installation recovery guide and isolated full-vault restore drill including account/history/trash. |
| F3 | Harden multi-writer persistence | Implemented | Journaled local writes/moves, process lock, interrupted-write rollback, external-change preservation and post-commit notifications; failure/restart tests. |
| F4 | Introduce a rebuildable index | Implemented | Rebuildable SQLite FTS search/query index; Markdown remains authoritative, CLI/UI rebuild and stale-index tests. |
| F5 | Send narrower updates | Implemented | Project-scoped SSE, record deltas, batched transaction notifications and full-refresh fallback; scoped delta and browser checks. |
| F6 | Test real access boundaries | Implemented; provider checks pending | Required-auth negative tests cover source/project snapshots, search, query, events, attachments, history, backup/trash and revoked sessions. |
| F7 | Consolidate shared components | Implemented incrementally | Shared query, paste, schedule, recurrence, visibility, source, ink, save-state and popover modules. Existing global-state architecture is retained rather than rewritten wholesale. |
| F8 | Establish a browser release gate | Implemented | Expanded maintained gate covers 12 journeys in each of Chromium, Firefox and WebKit; offline tests stop the temporary origin. Physical iPad testing remains separate. |
| F9 | Audit accessibility and motion | Implemented; manual check pending | Automated axe WCAG 2.1 AA checks pass in all ten views/light/dark; repaired contrast/ARIA, reduced motion and keyboard journeys. Manual screen-reader/device audit remains. |
| F10 | Add operational diagnostics and accurate docs | Implemented | Aggregate timings/errors, journal/index diagnostics, redacted sync export and accurate integration/drawing/recovery/test documentation. |

## Verification and limits

- Syntax checks and **168 model/server tests passed** on Node 22.22.1. Tests use isolated temporary vaults, not the live Argus project.
- Automated accessibility: all ten main views in light/dark pass the configured axe WCAG 2.1 AA rules. This is not a full manual accessibility certification.
- Query benchmark: 1,000 / 10,000 / 50,000 records in 8 / 37 / 152 ms in the final local run. These numbers exclude HTTP transfer, snapshot construction and DOM rendering. The initial project snapshot still contains all project records.
- The maintained browser gate includes visibility/navigation, shared layout/editor, table operations, project frames, capacity, source configuration, offline drawing, accessibility, drafts, board navigation and keyboard connectors/automation. Results are recorded below.
- During initial verification, no deployment, live Jira/SharePoint consent or physical iPad/Pencil test was performed. Cloud applications/consent and trusted HTTPS must be configured by the account owner. The requested initial single-user source audience is supported; team-wide provider ACL mirroring is not.
- Excel is read-only; selected-resource consent variants and arbitrary Excel writeback are outside this implementation. Jira publication supports the stated basic fields/actions and can be rejected when a project requires additional fields.
- The offline drawing pad renders ink only while retaining other master-document objects. Browser eviction can remove local data; exports/server backups are still required.
- Journal recovery covers local vault files. Remote publication and OAuth/source-cache updates are not a distributed atomic transaction. External filesystem readers and existing exports cannot be revoked by app permissions.

## Final browser results

Verified on 2026-10-17 using Playwright 1.61.1:

| Engine | Journeys | Result |
| --- | --- | --- |
| Chromium | 12 | Passed after the project-loading navigation fix and a complete Chromium rerun |
| Firefox | 12 | Passed |
| WebKit | 12 | Passed |

The combined release run first exposed a lost tab click while a project snapshot was loading. View buttons now wait for loading to finish; the subsequent complete Chromium gate passed. Earlier runs also prompted fixes for WebKit sidebar shrinking, native select sizing, pending drawing links and redundant refreshes. Geometry assertions now measure connected controls atomically instead of holding detached elements across a rerender.

Offline drawing tests make their temporary origin unreachable, verify that uncached requests fail, reload the cached drawing shell, and reconnect without losing strokes. This avoids a [documented WebKit offline-emulation problem](https://github.com/microsoft/playwright/issues/42775); it does not substitute for a physical Safari/iPad test. Host WebKit dependencies were supplied in a temporary test directory without changing the system installation.

`npm run test:release` is the repeatable syntax/model/36-journey gate. Browser binaries and their platform libraries must be installed. Older focused browser scripts outside this maintained gate were not all rerun. Those test runs used temporary vaults; the subsequent local deployment is recorded below.


## Local deployment — 2026-10-17

Version 0.15.0 was deployed to the local Pencils Docker container. The previous container served the older three-tab navigation despite the workspace implementation being complete. The updated image was checked with an isolated in-memory vault before replacing it.

- All 173 model/server tests and the desktop/mobile navigation suite passed.
- A read-only browser check of Leap / Argus 2.1 confirmed one Tasks tab with working List, Tree and Table layouts on desktop and mobile.
- All 1,026 Markdown/canvas files matched their pre-update hashes after the restart. The existing vault mount and shared access mode were retained.
- A complete vault backup is retained at `artifacts/backups/vault-before-0.15.0-20261017-124022.tar`; the previous image is retained as `pencils:rollback-20261017`.
- Provider consent and physical iPad/Pencil verification remain pending as described above.


## Unified Board deployment — 2026-10-17

Version 0.15.1 was deployed locally. Board now includes the former Drawing gallery, task links, device checkpoints and offline ink tools. All canvases share Pencil/finger input and gesture settings; legacy Drawing links, default views, stored preferences and checkpoint keys remain compatible. Existing canvas files are not migrated.

- Syntax and all 173 model/server tests passed. The unified gallery/offline recovery journey passed in Chromium, Firefox and WebKit, including legacy preferences, task links, selector/direct-link recovery, mixed-content preservation and restore-as-copy.
- Chromium checks passed for pen tools, real pen/touch gestures, object placement, grids, Board interactions and light/dark accessibility. Shared desktop/mobile navigation passed in Chromium and WebKit. Physical iPad/Pencil verification is still separate.
- The pen reload test exposed a stale pending acknowledgement caused by fractional bounds being rounded in JSON Canvas. Checkpoint reconciliation now compares the server's persisted representation before deciding whether recovery is needed.
- A read-only check of the running Leap / Argus 2.1 project confirmed one Board view, all three canvases, gallery/recovery/task-link tools and gesture preferences on desktop and mobile. All 1,065 Markdown/canvas files matched their pre-update hashes.
- Backup: `artifacts/backups/vault-before-0.15.1-20261017.tar`. Previous image: `pencils:rollback-0.15.0`. The existing vault mount and deployment configuration were retained.


## Boards naming update — 2026-10-17

Version 0.15.2 renames the view to Boards using shared display labels for desktop/mobile navigation, the default-view selector, command palette and canvas menu. Internal view identifiers and existing URLs remain compatible. Syntax checks, the shared desktop/mobile navigation suite and read-only checks of these labels in the running Argus 2.1 project passed. The previous image is retained as `pencils:rollback-0.15.1`.

## Typography controls update — 2026-10-17

Version 0.15.3 removes automatic text shrinking and gives font names more width beside a compact size selector across object, grid and inline editors. Legacy fit metadata remains readable; the chosen font size is retained. Syntax checks and the Chromium live-typography and grid-formatting journeys passed, including mobile dark mode, undo and reload. A read-only desktop/mobile check of the deployed Argus 2.1 formatting menu passed. The previous image is retained as `pencils:rollback-0.15.2`.

## Full-size note editor — 2026-10-17

Version 0.15.4 makes the note editor fill the note in rich text, Markdown and preview modes. Padding remains inside the editor; vertical alignment and scrollable overflow are preserved. The existing in-place editing/resize and note-style journeys passed. Focused Chromium and Firefox checks covered editor bounds, all vertical alignments, empty notes, long content, typing in blank space and mobile dark mode. A check of an existing Argus 2.1 note confirmed the deployed editor fills the note without changing board nodes. The previous image is retained as `pencils:rollback-0.15.3`.

## Navigation, draft editing and board images — 2026-10-17

Version 0.15.5 was deployed locally. Tasks contains List, Tree, Table and Kanban; Planning contains Calendar, Timeline and Capacity. Both areas share the same layout selector and remember the last layout per project. Existing view identifiers and links remain compatible.

Draft task fields, descriptions and subtasks now autosave through the durable board queue. The editor's Finalise task icon waits for saving, then opens a compact review panel using the same surface and placement as board comments. Failed saves retain edits and prevent premature finalisation. Images/GIFs can be added from the board sidebar or dropped onto the canvas, with multiple-file import, proportional display and original animated GIF bytes preserved.

- All JavaScript syntax checks and 173 model/server tests passed.
- Chromium and Firefox passed desktop/mobile navigation, image imports and draft autosave/finalisation checks. Coverage includes per-project layout memory, keyboard focus, queued failure recovery, invalid titles, close-before-debounce, failed conversion, reload, undo, image drop coordinates and board-switch protection.
- Existing task autosave, board comment and advanced board image-editing checks passed in Chromium. Mobile dark mode screenshots were inspected.
- WebKit verification was attempted, but its network process failed before loading the app in this environment. Physical iPad/Pencil testing remains separate.
- A read-only check of deployed Leap / Argus 2.1 confirmed four top-level areas, all seven nested layouts and the image toolbar on desktop/mobile. Its task records, board nodes and edges were unchanged by the check.
- Previous image: `pencils:rollback-0.15.4`. The existing vault mount and deployment configuration were retained.

## Stable project navigation — 2026-10-17

Version 0.15.6 keeps project tab typography at the same weight in active and inactive states, preventing labels from changing width and shifting adjacent buttons. The selected view retains its colour, underline and accessible current-page state. Shared navigation checks passed in Chromium and Firefox on desktop/mobile, including exact tab bounds across all views. A read-only check of deployed Argus 2.1 confirmed stable positions in light and dark themes at desktop/mobile widths. The health endpoint passed; the previous image is retained as `pencils:rollback-0.15.5`.

## Table column sizing and hover handles — 2026-10-17

Version 0.15.7 removes the inherited 280px first-data-column minimum from the spreadsheet and sizes its table from the configured field widths. Reordered fields, including Type, can shrink to 90px; hiding fields does not stretch the remaining columns. Keyboard resizing retains focus and respects the same bounds as pointer resizing. Drag handles are hidden at rest and appear on header hover, keyboard focus or active dragging. Narrow headers retain readable labels and expose filtering through column actions.

Chromium and Firefox passed the column reorder/resize checks, including minimum widths, hidden columns, saved layouts, keyboard focus, hover geometry, cancellation and mobile interaction. Chromium also passed the existing table grouping, sorting, filtering, editing and saved-view suite. Desktop and mobile dark screenshots were inspected. The deployed Argus 2.1 table was checked without changing task records or saved layouts. Previous image: `pencils:rollback-0.15.6`.

## Shared top-row project navigation — 2026-10-17

Version 0.15.8 centres Overview, Tasks, Boards and Planning in the top header, followed by New task. Project settings sits on the right. The Project dropdown is removed; its workflow, import and template actions are accessible from Project settings and the command menu. Quick capture remains available through the command menu. Saved views remain in the view toolbar or the board’s More menu. Small screens retain the shared area selector and New task beneath the breadcrumb and settings controls.

Pinned ID and Title headers now match the other table headers, including transparent column action backgrounds and both themes. Chromium and Firefox passed the shared navigation checks across all nine views, fixed button positions, keyboard navigation, saved-view access, quick capture and header colours. Layouts were checked from 390px to 1920px with the sidebar open and closed. Chromium also passed board menus, responsive canvas sizing and the existing workflow/saved-view browser suite. Syntax checks and all 173 model/server tests passed. A read-only check of deployed Argus 2.1 verified the header, nested layouts, board tools and table colours without changing task records or board objects. The health endpoint passed. Previous image: `pencils:rollback-0.15.7`.

## Responsive dropdown actions — 2026-10-17

Version 0.15.9 fixes the bare column-menu buttons that lacked hover and pressed feedback, the transparent trigger style that masked the open state, and focus loss when actions rebuilt the table. Shared dropdown action rows now have full-width hover, immediate pressed feedback, visible keyboard focus and 44px touch targets. Column menus use compact spacing, readable typography independent of table headers, action icons and applied sort/group indicators. Arrow keys, Home/End, Enter, Tab and Escape work with the action rows without taking over native form controls. Sorting/grouping returns focus to the rebuilt trigger; hiding focuses a neighbouring column; filtering focuses the chosen field.

Syntax checks passed. Chromium and Firefox passed the expanded table suite, covering light/dark hover and press feedback, keyboard navigation and activation, row-edge clicks, focus restoration, applied indicators, real touch taps, grouping, sorting, filtering, editing and saved views. The shared board menu regression also passed. A read-only check of deployed Argus 2.1 confirmed menu feedback and responsive placement in both themes, with task and board data unchanged. The health endpoint passed. Previous image: `pencils:rollback-0.15.8`.


## Project navigation order — 2026-10-17

Version 0.15.10 orders both the desktop project header and mobile area selector as Overview, Planning, Tasks, Boards. The existing navigation regression passed across all nine views at desktop/mobile sizes. A read-only check of deployed Argus 2.1 confirmed both orders and a healthy server. Previous image: `pencils:rollback-0.15.9`.

## Consistent New task panel — 2026-10-17

Version 0.15.11 uses the shared compact Boards-style creation panel in Overview, Tasks and Planning. The same controller now anchors new-task forms below the view toolbar, limits their size to 400 × 760px, and keeps the form scrollable with a fixed creation footer. Escape returns focus to New task outside Boards. Existing task editing retains its resizable panel and history/comments layout.

Syntax checks passed. Chromium and Firefox passed the expanded creation journey across all nine project views, desktop/mobile widths and light/dark themes, including keyboard focus, reachable lower fields, failed saves, subtasks and Create another. The existing task-editor regression passed in Chromium. A read-only check of deployed Leap / Argus 2.1 confirmed the compact panel in Boards, Table and Calendar at desktop/mobile sizes in both themes; task records and board data were unchanged. Screenshots were inspected and the health endpoint passed. Previous image: `pencils:rollback-0.15.10`.

## Browser navigation and full-size table — 2026-10-17

Version 0.15.12 adds shared browser history across project views, Overview drilldowns, projects, organisation home/Teams/People, project settings, saved views and canvases/gallery. Entries store location, filters, sorting, table layout and scroll position; they do not store or replay task/board records. Back/Forward loads the current project data, waits for task saves, preserves the current page when navigation cannot complete, and ignores superseded requests. Existing board/drawing/frame links remain supported. Reload can recover the current entry from tab-local storage when browser history state is unavailable.

The table viewport fills the remaining component width and height, with permanent scroll tracks at its bottom/right edges and sticky column headers. Empty space stays inside the viewport; task rows and explicitly sized columns retain their dimensions. The footer and New row action remain visible.

- Syntax checks and all 173 model/server tests passed.
- Chromium and Firefox passed the new navigation and table-viewport journeys, including Overview → Blocked → Back/Forward, all nine views, native reload, filters, project/organisation/settings/canvas navigation, rapid Back presses, unavailable destinations, invalid editors, autosave, empty/small/overflowing tables, scroll restoration and desktop/mobile themes.
- Existing shared navigation, directory drafts/deep links, column reorder/resize, table menus/grouping/filtering/editing and canvas checkpoint/legacy-link regressions passed in Chromium.
- A read-only check of deployed Leap / Argus 2.1 confirmed the requested navigation and table behaviour on desktop/mobile in light/dark themes. Screenshots were inspected; task and board records were unchanged and the health endpoint passed.
- Previous image: `pencils:rollback-0.15.11`. The existing vault mount was retained.

## Full-height Kanban and Help wiki — 2026-10-17

Version 0.15.13 gives Kanban the same available-height layout as Table. Empty and populated columns fill the view, each column scrolls beneath its status header, and the horizontal scrollbar stays at the bottom. Drag auto-scroll now targets the hovered column; browser Back restores horizontal and per-column scroll positions.

The header Help button now opens a local wiki page, with eight bundled articles, full-text article search, grouped navigation, in-page contents and stable `/#help/<article>` links. Browser Back/Forward restores the preceding project and its filters. Guides cover shared-file and imported-folder Obsidian use, Jira Cloud OAuth and publication, SharePoint Excel registration and ID lookup, field mappings, access, sync, troubleshooting, local network access and existing shortcuts. Instructions were checked against the shipped adapters and official provider documentation. Excel remains read-only; no accounts, provider credentials or integrations were configured by this UI/documentation change.

- Syntax checks passed. Chromium and Firefox passed the new Kanban and Help journeys, including sparse/empty/overflowing columns, fixed headers, drag/drop and edge scrolling, article navigation/search, keyboard focus, reload/direct links, desktop/mobile themes and Help accessibility checks.
- Existing table viewport and global-navigation regressions passed in Chromium.
- Read-only checks of deployed Leap / Argus 2.1 passed in both themes on desktop and mobile. Screenshots were inspected, tasks/boards were unchanged and the health endpoint passed.
- The live service uses `pencils:0.15.13`; the existing vault mount was preserved. Previous image: `pencils:rollback-0.15.12`.
- Provider OAuth consent and tenant-specific access still require verification using the user's real accounts; these guides do not imply those connections were completed.

## Full-height Tree — 2026-10-17

Version 0.15.14 extends the shared Table/Kanban viewport layout to Tree. The tree fills the remaining width and height for populated, collapsed, filtered and empty projects. Horizontal and vertical scrolling stay inside its viewport, with the heading, root-task action, pagination and summary outside. Deep nesting remains indented and horizontally reachable on narrow screens. The scroll region is keyboard focusable; expanding/collapsing branches retains focus and scroll position, and browser Back restores both scroll axes.

- Syntax checks passed. Chromium and Firefox passed the Tree viewport journey covering sparse/empty/filtered trees, deep nesting, keyboard scrolling, branch focus and position, task opening, root creation, pagination and Back restoration on desktop/mobile in both themes.
- Existing Table and Kanban viewport regressions passed in Chromium. Screenshots were inspected.
- Read-only checks of deployed Leap / Argus 2.1 passed on desktop/mobile in both themes. Task and board records were unchanged; the health endpoint passed.
- Deployed as `pencils:0.15.14` with the existing vault mount preserved. Previous image: `pencils:rollback-0.15.13`.

## Remove task-layout footers — 2026-10-17

Version 0.15.15 removes the task-count summary footer from List, Tree, Table and Kanban. The shared Filters menu retains Clear filters. Pagination, row creation and the remaining Planning summaries are preserved; the full-height task layouts use the reclaimed space.

- Syntax checks and the existing shared project-layout, Tree, Table and Kanban viewport journeys passed in Chromium, including desktop/mobile layouts and themes. Existing assertions that depended on the removed summary were updated to inspect rows, filters and pagination.
- Read-only verification of deployed Leap / Argus 2.1 passed for all four layouts on desktop/mobile in both themes, including clearing filters through the menu. Screenshots were inspected, task and board records were unchanged, and the health endpoint passed.
- Deployed as `pencils:0.15.15`, preserving the existing vault mount. Previous image: `pencils:rollback-0.15.14`.

## Automatic local administrator — 2026-10-17

Version 0.15.16 adds opt-in `AUTH_MODE=local` with `LOCAL_USER_NAME=George`. Loopback and private-network socket peers automatically receive the named administrator identity; Host and forwarded headers do not grant access. Public socket peers still require a password account. This mode is intended for a trusted local installation and must not be used behind a public proxy that presents requests as private peers.

The configured identity is available to source ownership checks, OAuth callbacks, polling and automations without creating or modifying stored password accounts. It cannot be used for a remote password login or changed through the accounts API. Switching modes preserves existing accounts. Personal settings shows George, Administrator and Automatic local sign-in; automatic sessions omit the account-management and Sign out buttons. Help and setup documentation describe both local mode and password accounts.

- All 176 server/model tests and syntax checks passed, including new tests for local/public boundaries, ignored spoofed headers, preserved password accounts, cross-origin write rejection and mocked Jira configuration/OAuth/background sync.
- Chromium and Firefox passed the automatic-sign-in browser journey, including source configuration, profile identity, fresh browser sessions, reload and desktop/mobile themes. Screenshots were inspected.
- Enabled the requested mode in the private `.env` and recreated the service as `pencils:0.15.16`, retaining the vault and all Jira environment values. Live read-only checks confirmed George administrator access, the Jira configuration hint, reload and server health. All 21 existing project/account files retained their checksums; no live source was created or connected.
- Previous image: `pencils:rollback-0.15.15`. For rollback to that version, also restore `AUTH_MODE=required`; the previous release does not support local mode.

## Sidebar sections removed — 2026-10-17

Version 0.15.17 removes the sidebar workspace tools and vault information sections entirely. Search, recovery, archived projects and password-account controls are available in Personal settings. The organisation breadcrumb and Help retain access to the overview and vault guidance. Unused sidebar styles were removed.

- Syntax checks and Personal settings browser checks passed. Browser inspection covered all nine views, desktop/mobile and light/dark themes, including search, recovery, archived-project toggling and no unsaved-change prompt for that immediate toggle.
- Live verification confirmed removal, relocated controls, Obsidian Help and server health. Project data was not edited.
- The broad legacy browser suite stopped at its older Tree-search assertion (it counts the retained parent context row as a match), before the recovery step. The relevant recovery action was verified separately.
- Deployed as `pencils:0.15.17`; rollback image `pencils:rollback-0.15.16`.

## Project Settings pages and assessment — 2026-10-17

Version 0.15.18 replaces the settings toolbar and mixed form with a grouped left navigation rail and ten dedicated pages. General, organisation/teams, workflow, hierarchy and custom fields have independent saves, visible save state, Discard and unsaved-change protection. Section URLs support Back/Forward and reload; source and automation editors have nested routes. Smaller screens use a labelled section selector. Templates is removed from settings navigation without deleting stored template data.

The shared workflow/hierarchy editor is reused in focused sections; ordinary project saves no longer submit its schema. Saves use the rendered project revision and preserve edits on conflict. Team selection shows the resulting assignees. Custom fields show usage and relevant choice controls. Import previews selected filenames before an explicit import. Automation supports editing, project-valid priority/status/assignee choices and disabled saves for review. Diagnostics shows readable workspace metrics before technical details. Form labels use the shared theme colour for readable contrast.

- Syntax checks, whitespace checks and all 176 unit/API tests passed. Chromium and Firefox passed the new settings journey, including independent saves, conflicts, unsaved sidebar/browser navigation, direct source edit links, local Obsidian sync, import, automation edit/preview/apply, desktop/mobile layouts and both themes.
- Automated accessibility checks passed for all ten settings pages at desktop and phone widths in both themes. Existing navigation, source, visual-rule, workflow, local-sign-in, Personal settings, automation review and shared project-layout checks passed. One shared-layout run encountered an intermittent filter-menu visibility timeout; its repeat passed without a product change. The review test now waits for the preview dialog to close because its underlying settings page remains mounted.
- Read-only live verification passed for all ten pages, Back/Forward, reload, George administrator identity and server health. Screenshots were inspected. Argus 2.1 project settings, tasks and boards were unchanged; no Jira or SharePoint operation was performed.
- Safari/WebKit could not run because that Playwright browser is not installed. Physical iPad and screen-reader checks remain separate.
- Assessment and ten prioritised follow-ups: `reports/2026-10-17-project-settings-assessment.md`.
- Deployed as `pencils:0.15.18`, preserving the existing vault and environment. Previous image: `pencils:rollback-0.15.17`.

## Simpler table headers — 2026-10-17

Version 0.15.19 removes the per-column filter icon and its unused handler/styles. Column actions and the Column Filters toolbar retain filtering; the column actions button indicates active filters at every column width.

- Syntax/whitespace checks and the existing table-tools browser journey passed, covering filtering, grouping, sorting, editing, saved views, keyboard/touch actions and responsive themes. Assertions formerly using the removed button now use the column actions menu.
- Read-only live checks confirmed icon removal and both remaining filtering entry points on desktop/mobile in light/dark themes. Project settings, tasks and boards were unchanged; server health passed.
- Deployed as `pencils:0.15.19`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.18`.

## Project frame IDs over local-network HTTP — 2026-10-18

Version 0.15.20 fixes the iPad Update plan error caused by calling `crypto.randomUUID()` in an insecure context. The same error was reproduced on a real private IPv4 HTTP origin before the fix; localhost tests alone did not reveal it because browsers treat loopback as trustworthy.

The shared `public/uuid.js` uses native UUID generation when available and otherwise builds UUID v4 IDs with `crypto.getRandomValues`, preserving the format and cryptographic randomness. Project frame cards/arrows, board card creation, task creation requests, comments, saved views, custom fields, automation rules and offline strokes use the helper. Existing IDs and relationships are retained. The offline drawing shell includes the new module and advances its cache version.

- All 179 unit/API tests and syntax checks passed. New UUID tests cover native binding, version/variant bits and rapid unique generation without clock or Math.random fallbacks.
- New `test:project-frame-lan` regression passes in Chromium, Firefox and WebKit using touch input over actual local-network HTTP, explicitly asserting that `randomUUID` is absent. It covers preview/cancel, cards and both relationship types, repeated updates, stable IDs, added tasks, Undo, camera preservation and reload. The original Project frame, offline drawing and settings browser journeys also pass.
- WebKit was installed into `/tmp` with its missing libraries extracted locally; inherited Snap GTK/GIO paths were removed from the test process. No system packages or user environment settings were changed. Physical iPad verification remains separate.
- Live read-only WebKit verification over LAN HTTP generated all three Argus 2.1 tasks and its dependency arrow using an in-memory copy. The actual project, tasks and boards were unchanged; server health passed.
- Deployed as `pencils:0.15.20`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.19`.

## Compact project frame update — 2026-10-18

Version 0.15.21 replaces the blocking Update project frame dialog with a 300px contextual panel beside the frame. It reuses the shared board object dialog controller, placement and comments/draft-review surface. There is no blocking backdrop; Escape restores focus to Update plan, and Cancel, Close or an outside click/tap dismisses the preview. Preview options do not trigger a draft-discard warning.

The shared controller exposes its positioning method for board redraws. A dismissed or superseded update cannot apply a pending plan or close a newer panel. Layout options are disabled while the update checks current tasks. Existing frame placement, IDs, Undo and camera behaviour remain intact. `AGENTS.md` now prefers compact contextual panels for routine actions, reserving blocking/fullscreen dialogs for warnings or major workflows.

- Syntax and whitespace checks passed, along with the existing Project frame, draft-task and board-popover browser journeys.
- Extended LAN regression passed in Chromium, Firefox and WebKit with touch input: anchored nonmodal placement, Escape/focus restoration, outside tap activation, cancellation of a pending request, preview options, update/Undo/reload, and narrow-screen dark theme with accessible footer actions. Physical iPad verification remains separate.
- Live WebKit touch verification opened and dismissed the panel on Argus 2.1 over LAN HTTP. The project, tasks and boards were unchanged, and server health passed.
- Deployed as `pencils:0.15.21`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.20`.

## Simplified frame update panel — 2026-10-18

Version 0.15.22 removes the added/removed/repositioned counts, explanatory paragraph, expandable card lists and Cancel button from Update project frame. The rearrange option, placement hint, Update frame and close button remain. Removed the unused change-summary calculations while retaining plan preparation and stale-request guards.

- Syntax/whitespace checks and the existing LAN frame journey passed in Chromium and WebKit with touch input, including update, Undo, dismissal during a pending request and responsive dark theme. Existing dismissal checks now use the close button.
- Live WebKit verification confirmed the simplified panel on Argus 2.1; project, tasks and boards were unchanged and server health passed.
- Deployed as `pencils:0.15.22`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.21`.

## Incremental dependency layout — 2026-10-18

Version 0.15.23 anchors new project-frame dependency cards to the actual positions and widths of retained prerequisites. The earlier update first calculated an ideal layout and then restored existing cards, leaving new dependents in the wrong column and pushing them downward on collision.

The retained cards are now restored before additions are placed. New dependency chains are placed prerequisite-first, using the shared 100px column gap and the prerequisite row where space permits. New child trees keep the initial indentation and row spacing. Occupied space moves additions down within the correct column; existing cards stay fixed and the frame grows to contain additions. Imported cycles terminate safely.

- All 184 unit/API tests and syntax/whitespace checks passed. Five new layout regressions cover retained positions, resized prerequisites, reversed task order, multiple prerequisites, occupied space, child trees and imported cycles.
- The desktop Project frame journey and touch WebKit LAN journey passed, including new placement assertions, updates, Undo, persistence and camera preservation. The desktop camera check now reads the current rendered world rather than a potentially detached element during a save.
- Live WebKit verification recreated a dependent on an in-memory Argus 2.1 board and confirmed its position to the right of its prerequisite, retained cards and frame bounds. Actual project, tasks and boards were unchanged; server health passed.
- Deployed as `pencils:0.15.23`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.22`.

## Tool categories and full-size Timeline — 2026-10-18

Version 0.15.24 groups the board toolbar into Navigate, Tasks, Create, Arrange and History. Existing buttons, shortcuts and drag sources are retained. The toolbar scrolls within the canvas on smaller screens, preserves its scroll position during redraws and excludes category labels and toolbar scrolling from canvas gestures.

Timeline now uses the shared full-height data-view layout, with scrolling at the component edges and rows spanning at least its available width. Unplanned tasks appear as rows in the same sheet, with a Set dates action opening the shared task editor; dragging them onto a date still schedules them. The date ruler adapts to the actual available width without stretching day units. The sticky header and task labels stay visible while scrolling. Pagination includes planned and unplanned tasks, and empty/filtered states retain the full-height viewport. The duplicate generic task footer is removed for Timeline.

- All 184 unit/API tests, syntax and whitespace checks passed.
- The new Timeline viewport journey passed in Chromium, Firefox and WebKit, covering desktop/mobile light and dark themes, full-width rows, internal scrolling, the shared task editor, keyboard date changes, drag scheduling, filtering and pagination. The WebKit run also verified dragging a bar end to resize its dates.
- Existing board layout and grid drag journeys passed, including mobile touch placement, toolbar scroll isolation, retained tool scroll position, drag previews, Undo/Redo and responsive themes. The mobile grid test scrolls its source into view before dispatching touch events.
- Live WebKit verification over LAN HTTP confirmed Argus 2.1's two unplanned task rows, full Timeline viewport, task editor and grouped tools with mobile scrolling. Project, tasks and boards were unchanged; no page errors occurred and health passed. Physical iPad verification remains separate.
- Deployed as `pencils:0.15.24`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.23`.

## Timeline weekends and calendar header — 2026-10-18

Version 0.15.25 adds Show weekends beside the Timeline scale selector. The project preference is remembered in local settings; embedded board timelines save their own preference with the board. Hiding weekends removes Saturday/Sunday date columns without editing tasks. Tasks dated only on weekends retain their row, actual date tooltip and a small marker at the collapsed boundary.

The shared date axis maps bars, dependency paths, drag previews, resize handles, keyboard movements and unplanned-task drops to the same visible columns. Moving a bar keeps its calendar duration; resizing follows the visible weekdays. Calculations use date-only UTC arithmetic to avoid daylight-saving shifts. Weekly headers start on Mondays. Month bands follow actual month boundaries, lower labels sit above their date columns, week tooltips include ISO week numbers and Monday–Sunday ranges, and a today marker indicates the current date. The layout and controls wrap within narrow and embedded views.

- All 188 unit/API tests and syntax/whitespace checks passed. Four date-axis tests cover inclusive ends, weekend compression, inverse mapping, leap days, daylight-saving boundaries and ISO week/year transitions.
- New Timeline weekends browser coverage passed in Chromium, Firefox and WebKit: preferences/reload, unchanged task dates on toggle, desktop/mobile light/dark layouts, weekend-only tasks, date resizing/movement/keyboard/drop and saved embedded-timeline settings. The existing Timeline viewport journey also passed.
- Live WebKit verification on Argus 2.1 over LAN HTTP confirmed the header, week tooltips and persisted toggle; the test restored its original preference and left project, tasks and boards unchanged. No page errors occurred and health passed. Physical iPad verification remains separate.
- Deployed as `pencils:0.15.25`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.24`.

## Direct Timeline date editing — 2026-10-18

Version 0.15.26 changes Set dates to open a compact nonmodal panel beside the Timeline row. Scheduled rows have a calendar button, and clicking a task bar or pressing Enter/Space on it opens the same panel. Task titles still open the full task editor. The shared date controls provide Start date and Due date, Save dates and Clear dates; Escape, Close and outside clicks dismiss unapplied edits. The panel reuses shared popover positioning, surface styles and calendar controls, including nested calendar keyboard handling. It stays inside the visual viewport and works in embedded board timelines without changing the camera.

Dates save through the existing task save queue and update every view. Invalid ranges are rejected inline. Blocked saves retain the entered values and show the error. Imported due dates remain read-only while local start dates remain editable; direct bar movement/drop cannot bypass source ownership. Pointer clicks and actual date drags are distinguished so clicking opens the editor while dragging/resizing continues to adjust the schedule.

- Syntax and whitespace checks passed.
- New direct date-editor browser journey passed in Chromium, Firefox and WebKit: shared calendar selection, validation, save/reload/clear, due-only dates, bar/keyboard entry, focus restoration, nested-calendar Escape, outside dismissal, desktop/mobile light/dark layouts, source due protection, embedded Timeline/camera preservation and server rejection feedback.
- Existing Timeline viewport and weekend journeys passed, covering full-size rows, task-title opening, unplanned-task scheduling, filtering/pagination, weekend compression, dragging/resizing and saved embedded settings.
- Live WebKit verification over LAN HTTP opened and dismissed Argus 2.1's new date panel and nested calendar on desktop and mobile touch layouts. The full task form did not open, project/tasks/boards were unchanged, no page errors occurred and health passed. Physical iPad verification remains separate.
- Deployed as `pencils:0.15.26`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.25`.

## Manual task ordering — 2026-10-18

Version 0.15.27 adds a shared row drag handle to Table, List and Tree. Handles appear on desktop hover/focus and remain visible with 44px touch targets. Pointer dragging shows an insertion line and task label, scrolls at the viewport edges and supports Escape, outside-drop, pointer cancellation and multi-touch cancellation. Alt + Up/Down reorders a focused handle with focus retention and screen-reader announcements. Existing task editing, selection, table column dragging and resizing remain separate.

Moves save the existing task `order` property through the durable save queue and select Manual order. Explicit table sorts clear after a move. Crossing groups removes grouping without changing statuses or other task fields; grouping preferences survive reload. Tree and table outlines restrict movement to siblings and keep branches together. Filtered/archived records retain their relative positions, ordering includes off-page matching tasks, and tied/missing ranks are rebalanced when needed. Imported tasks can be ordered without changing source-owned fields. Filtered ancestor context now observes manual ordering. Direct links restore the remembered sort/group preferences instead of resetting manual order.

- All 191 unit/API tests passed, including new ordering/rank and filtered-hierarchy regressions. Syntax and whitespace checks passed.
- New ordering browser coverage passed in Chromium, Firefox and WebKit: pointer and keyboard movement, persistence/reload, sorting, filters, imported tasks, grouped tables/lists, hierarchy and collapsed branches, cancellation, pagination, edge scrolling, selection/editing and desktop/mobile light/dark layouts. Chromium exercised a real touch stream; Firefox/WebKit exercised pointer input in touch layouts.
- Existing table-column dragging, Tree viewport and global navigation suites passed.
- Live WebKit checks over LAN HTTP verified handles, drag cancellation and mobile targets in Table/List/Tree. Project, tasks and boards stayed unchanged, no browser errors occurred and health passed. Physical iPad testing remains separate.
- Deployed as `pencils:0.15.27`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.26`.

## Two-click Timeline scheduling and date range — 2026-10-18

Version 0.15.28 lets users click or tap a task row to choose a start date, then click again for an inclusive end date. The first click only previews; the second saves through the existing offline-capable task queue. Hover shows the pending range and the toolbar provides date instructions. Escape, outside interaction and leaving the view cancel an unapplied selection. Keyboard users focus a track, press Enter, move with Left/Right and press Enter again. Scrolling gestures do not schedule tasks. Source-managed due dates remain protected. The compact task date editor offers Choose on timeline to select over an existing bar; calendar buttons sit in the fixed task labels so every date cell is available for selection.

Timeline range opens a compact shared-style panel with Start date, End date, Apply range and Automatic range. Project range preferences are remembered per project in the browser; embedded timelines save their own `timelineRange` on the board node. Bounds affect the displayed timeline without changing task dates. Short ranges stretch to the available component width, long ranges scroll, partial bars are clipped and out-of-range tasks keep visible rows and calendar access. Hidden-weekend ranges use the same compressed axis; weekend-only hidden ranges explain why no date is selectable. Date selection, headers, dependencies and bar movement use the effective axis after resizing or board zoom. Invalid/reversed ranges and spans above ten years are rejected, including server-side validation for embedded nodes.

- All 192 unit/API tests passed, including custom inclusive range geometry, partial bars, weekly labels and validation. Syntax/whitespace checks passed.
- New Timeline selection browser coverage passed in Chromium, Firefox and WebKit with touch taps: two-click scheduling and full-bar replacement, keyboard selection, cancellation, invalid dates, source ownership, custom range clipping/fill/reload/reset, hidden weekends, shared calendars, mobile light/dark layout and embedded Board persistence/camera preservation.
- Existing direct date-editor, weekend/header and full-height Timeline viewport journeys passed.
- Live WebKit verification over LAN HTTP checked the compact range panel, shared calendar, safe first-click preview and Escape cancellation, plus mobile placement. Project/tasks/boards were unchanged, no browser errors occurred and health passed. Physical iPad testing remains separate.
- Deployed as `pencils:0.15.28`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.27`.

## Compact Kanban cards — 2026-10-19

Version 0.15.29 uses the requested two-row Kanban layout: task-type icon, ID and title on the first row; assignee avatar/name and priority on the second. Reduced padding and gaps remove the large metadata divider. IDs stay visible on mobile, long titles wrap, and long assignee names truncate with the full name available in a tooltip. Other task details remain in the full task editor. Existing shared metadata styles, whole-card opening and drag/drop are retained.

Safari touch verification exposed a delegated-click limitation on non-button card metadata. Rendered cards now register a local click listener so Safari forwards those taps to the existing shared task-opening handler. The browser regression journey includes a metadata tap.

- Syntax and whitespace checks passed. Chromium and Firefox Kanban checks cover full-height columns, light/dark desktop/mobile layouts, card opening, touch metadata opening, drag/drop, scrolling and Back restoration.
- Live WebKit checks over LAN HTTP verified the two-row geometry, mobile IDs, long-title wrapping, touch and keyboard opening, and light/dark layouts. Project/tasks/boards were unchanged and health passed. Physical iPad testing remains separate.
- An exploratory full WebKit run passed card opening and basic drop checks but timed out in the existing edge auto-scroll test. The viewport suite retains its supported Chromium/Firefox runners; WebKit validation for this change used the focused live checks above.
- Deployed as `pencils:0.15.29`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.28`.

## Kanban swimlanes — 2026-10-19

Version 0.15.30 adds a Swimlanes selector beside Kanban sorting, with None, Assignee, Priority and Task type options. The compact card renderer is shared between grouped and ungrouped Kanban. Each lane has a count and keyboard/touch-accessible collapse control, with aligned status columns and a sticky status header. Grouped Kanban scrolls inside the full-height viewport; ungrouped columns retain independent scrolling. Empty/filter states retain task creation. Grouping and collapsed lanes are remembered per project in the browser, and saved views include grouping. Back navigation restores grouping, collapsed lanes and vertical/horizontal scroll position.

Lane Add task actions prefill their group field and status. Dragging between lanes updates only the moved task's grouping field/status and reorders within the destination lane; other lanes are untouched. Source-owned fields, workflow transitions and type hierarchy rules are checked before allowing a drop. Imported tasks can still be reordered within their existing lane/status. The shared drag controller handles the grouped scroll surface and retains existing drop previews and cancellation.

- All 195 unit/API tests passed, including lane ordering, empty/unassigned groups, drop field changes, source/workflow/hierarchy guards and saved-view validation. Syntax and whitespace checks passed.
- The new swimlane journey passed in Chromium, Firefox and WebKit: grouping, collapse/reload, task creation defaults, field/status drops, protected source tasks, saved views, empty results, full-height aligned rows, sticky headers, Back restoration, touch opening and desktop/mobile light/dark layouts.
- The existing ungrouped Kanban viewport journey passed, including drag/drop and edge scrolling.
- Live WebKit verification over LAN HTTP confirmed all grouping choices, touch collapse/card opening and responsive themes. Project/tasks/boards were unchanged and health passed. Physical iPad testing remains separate.
- Deployed as `pencils:0.15.30`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.29`.

## Scrollbars only on overflow — 2026-10-19

Version 0.15.31 replaces forced scrolling with automatic overflow in the shared Table, Tree and Timeline containers, Kanban's horizontal viewport and vertical columns, and grouped Kanban swimlanes. Removed stable scrollbar gutters so content that fits has no empty scrollbar tracks or reserved space. Existing full-height and full-width sizing remains in place.

- Existing Kanban viewport, swimlane, Table, Tree and Timeline browser journeys passed, covering desktop/mobile layouts, light/dark themes and sparse/overflowing content. Table, Tree and Timeline assertions now expect automatic overflow. Syntax and whitespace checks passed.
- Live Chromium verification enabled native scrollbars and checked their actual geometry: no scrollbar space when content fits, scrolling available for narrow overflowing views, and automatic scrolling in swimlanes. Desktop/mobile screenshots were checked; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.31`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.30`.

## Compact List and Tree rows — 2026-10-19

Version 0.15.32 uses the shared task row renderer for a single-line layout: type icon, task ID, assignee, priority icon, due date and title. List rows decrease from 61px to 32px and Tree rows from 67px to 32px on desktop. Completion, reordering, branch expansion and task editing remain accessible. Type and priority icons have accessible names/tooltips; source information remains on the ID, and missing due dates retain their column. Tree status and subtask details are available through control tooltips instead of a second line. Long titles and names truncate, including inside Tree's shared-width grid.

Touch layouts keep 44px action targets and compact single-line rows. Narrow views scroll horizontally within the component to expose all fields without page overflow. Shared styles preserve themes and Tree indentation.

- Existing Tree viewport and task-reordering journeys passed in Chromium; task reordering also passed in WebKit, including keyboard movement, touch drag, collapsed branches and List/Tree interactions. Tree viewport checks passed again after correcting long-title intrinsic sizing.
- Live read-only checks confirmed the height reduction, field order, icon labels, long-title truncation, task opening, desktop themes and phone/tablet touch geometry. Screenshots were reviewed; project/tasks/boards were unchanged, no browser errors occurred and health passed. Physical iPad verification remains separate.
- Syntax and whitespace checks passed. Deployed as `pencils:0.15.32`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.31`.

## Default Table outline and List/Tree cleanup — 2026-10-19

Version 0.15.33 makes the Table parent/child outline standard. Preference normalization enables it for fresh settings, reset views and legacy saved views with outline disabled. Saved-view comparison normalizes the same way so migration does not falsely mark a view as changed. The Group menu retains its two grouping selectors and expand/collapse actions; the outline checkbox and instructional paragraphs are removed. Reset is offered only for changeable table rules. Manual table ordering retains sibling and family boundaries.

Tree keeps its full-height scrolling area with a transparent background, matching List beneath the rows. List and Tree no longer render duplicate add-task links, including empty states; the shared header New task action remains available and creates root tasks by default. Filtered empty states retain Clear filters.

- Table model and manual-order model tests passed. Existing table-tools, task-reordering and Tree viewport browser journeys passed, including saved views, filters, grouping, family ordering, keyboard/touch actions, empty states and responsive themes. Tree checks now use the shared header action and verify its background.
- Live desktop/mobile checks confirmed legacy preference/saved-view migration, reset behavior, the smaller Group menu, matching List/Tree backgrounds and header task creation. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed. Syntax and whitespace checks passed.
- Deployed as `pencils:0.15.33`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.32`.


## Shared task editor layout and dropped attachments — 2026-10-19

Version 0.15.34 places card type, task ID and title in one header row. Metadata follows in the requested order: assignee, priority, status, start and due dates, then Description. The same editor serves project views, board tasks, new tasks and board drafts. A 720px desktop editing panel fits all five metadata fields; compact creation/board panels and phones wrap them in order. Parent and dependency controls follow Description. The Save as template and Attach file buttons, Related records section and Subtasks section are removed. Existing relationships and legacy draft subtasks remain stored and survive editing/finalisation.

A per-editor attachment controller accepts files dropped anywhere onto the editor, shows drop feedback and upload progress/errors, and adds Markdown links or image previews. Uploads flush current typing before adding links, use the existing autosave flow, and cannot insert content into a different task after closing or switching editors. Creation and draft finalisation wait for pending uploads. The existing attachment endpoint, supported formats and 10 MB limit are reused.

- Task editor, autosave, dependency, board panel, draft conversion, create-another, creation tools and upgrade browser journeys passed. Existing tests now verify legacy draft data retention without the removed subtask controls; settings navigation and the Today date selector were brought up to date.
- New attachment/browser checks passed in Chromium and WebKit: multiple files, valid image decoding, file contents in the Markdown vault, unsupported/oversized files, server failures, ongoing typing, autosave, new-task submission, editor switching and preserved relationships. Desktop/tablet/phone geometry and both themes passed. Physical iPad testing remains separate.
- Live read-only checks covered existing tasks and shared creation in List, Tree, Table, Kanban, Timeline and Board at desktop/mobile widths. Field order, removed sections and drag feedback passed; screenshots were reviewed. Project/tasks/boards stayed unchanged, no browser errors occurred and the health endpoint passed. Syntax and whitespace checks passed.
- Deployed as `pencils:0.15.34`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.33`.


## Remove task editor Planning section — 2026-10-19

Version 0.15.35 removes the Planning accordion from the shared task editor. Estimates, recurrence and custom-field values are read from the current task or creation defaults so other edits preserve them. The top-level Planning area remains available.

- The existing task editor browser journey passed, including autosave preservation of estimates and recurrence, formatting, history and desktop/mobile themes. Syntax and whitespace checks passed.
- Live read-only desktop/mobile checks confirmed the section is absent in existing-task and board creation panels, with remaining fields and file-drop feedback intact. Project/tasks/boards stayed unchanged, no browser errors occurred and the health endpoint passed.
- Deployed as `pencils:0.15.35`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.34`.


## Remove task editor relationship sections and file path — 2026-10-19

Version 0.15.36 removes Parent task, Dependencies (including Review schedule and prerequisite controls), and the Markdown file path from the shared task editor. Parent/dependency values remain in nonvisible form state so editing, task creation with inherited defaults, restored browser drafts and board draft finalisation preserve relationships. The unused dependency controller is no longer mounted, and type/priority picker setup no longer expects a parent picker.

- Existing task editor, create-another, dependency and board-draft browser journeys passed. Checks cover saved parent/dependency links, legacy browser draft restoration, creation defaults, board dependency actions, autosave, finalisation, desktop/mobile layouts and themes. Geometry checks read all field positions together after resize to avoid inconsistent animation frames.
- Live read-only desktop/mobile checks confirmed the sections are absent in existing-task and board creation panels; remaining fields and file-drop feedback work. Screenshots were reviewed, project/tasks/boards stayed unchanged, no browser errors occurred and health passed. Syntax and whitespace checks passed.
- Deployed as `pencils:0.15.36`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.35`.

## Comments beside the right-side task editor — 2026-10-19

Version 0.15.37 opens comments and version history to the left of right-docked task editors without shifting the editor away from the right edge. The shared layout keeps both panels within the viewport and above the navigation sidebar. Compact Board editors retain their existing placement; narrow screens retain the panel overlay inside the editor.

- Existing task autosave and task editor browser journeys passed, including comments, replies, reactions, history, compact Board panels, mobile and themes. Added geometry checks cover a stationary editor, left-side placement and navigation-sidebar overlap at 1100px. Syntax and whitespace checks passed.
- Live read-only checks passed at desktop, smaller desktop and phone widths in both themes. Project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.37`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.36`.

## Task editor relationships — 2026-10-19

Version 0.15.38 adds a compact Relationships section beneath Description for existing tasks, including the shared compact Board editor. The picker supports Parent, Child, Blocked by, Blocks and Related to, with ID/title search, linked-task navigation and removal. Parent and child links use the existing `parent` field; blockers use `dependencies`, preserving their effect on Tree, blocked indicators and Board layouts. Related links are visible from either endpoint and deduplicated. No task records are deleted when removing a relationship.

The relationship model rejects self-links, missing targets, hierarchy violations and cycles. Editing another task's child/blocker link uses the durable save queue after flushing current edits. Queued failures remain visible and can retry; unrelated parent/dependency values are retained. Search and relationship-type controls do not dirty the task. Escape and outside clicks close the picker; unchanged search results retain their DOM nodes during background saves so pointer clicks are not lost.

- Model tests passed for inverse relationships, related-link deduplication/removal, dependency and hierarchy cycles, missing targets and enforced hierarchy rules.
- Chromium and WebKit browser journeys passed: actual dropdown clicks, add/remove in both directions, description preservation, linked-task navigation, save failure/retry, Board editing, narrow layouts and both themes. Existing task editor and autosave journeys passed, including comments and history. Syntax and whitespace checks passed.
- Live read-only desktop/mobile checks passed for all five relationship types, search and dismissal in both themes. Project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.38`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.37`.

## Description section spacing — 2026-10-19

Version 0.15.39 increases the shared Description section's top and bottom margins to 32px, separating it from metadata and Relationships in existing-task, creation and Board editors.

- The existing task editor browser journey passed, including desktop/mobile and both themes. Live read-only checks confirmed spacing and no horizontal overflow in existing-task and Board creation editors at desktop and phone widths. Project data stayed unchanged, no browser errors occurred and health passed. Whitespace checks passed.
- Deployed as `pencils:0.15.39`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.38`.


## Shared task field colors — 2026-10-19

Version 0.15.40 adds one color resolver and shared styles for assignees, priorities and statuses. People use a stable identity-based palette; priorities progress from blue through amber and orange to red. Existing status colors are reused, with To do blue. Colors appear in the task editor and menus, List, Tree, Table, Kanban, Board and relevant Overview, Calendar, Timeline and Capacity displays. Labels and icons remain visible. Native WebKit dropdown appearance is replaced for these fields so dark-theme colors render correctly.

- Chromium and WebKit browser journeys passed for live field changes, menu choices, persistence, cross-view consistency and desktop/mobile light/dark contrast. Shared dropdown and task-editor journeys passed, including keyboard/touch, autosave and draft restoration. Syntax and whitespace checks passed.
- Live read-only desktop/mobile checks passed for existing-task and Board creation panels, menus and all task views. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.40`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.39`.


## Priority menu order — 2026-10-19

Version 0.15.41 centralises the display order of priority choices as Urgent, High, Medium, Low and None. Task editor, Table, Board, column filters and automation controls use the same choices. Existing task sorting and default no-priority selections are preserved.

- The existing task-field browser journey passed, covering menu selection, persistence and all task views. Syntax and whitespace checks passed.
- Live read-only checks confirmed priority option order in desktop/mobile task editors, Board creation, Table cells and Board cards, with shared colors intact in both themes. Project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.41`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.40`.


## Compact status settings — 2026-10-19

Version 0.15.42 replaces the repeated status form blocks with a compact list. One shared header identifies Status, Completed and Default; editable names and existing reorder/remove actions fit on approximately 40px desktop rows. Internal IDs, repeated labels and help paragraphs are removed, while protected-delete reasons remain available on the delete controls. Container-based wrapping puts the name above labelled controls on narrow panels. Allowed transition controls and workflow behaviour are unchanged.

- The existing workflow browser journey passed: labels, defaults, completed states, protected removal, allowed transitions, Kanban behaviour, Table/Board selectors, reload and responsive themes. Syntax and whitespace checks passed.
- Live read-only desktop/tablet/mobile checks verified compact row heights, all controls and accessible names, both themes, transparent name fields and no horizontal overflow. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.42`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.41`.


## Attachment lists and contextual previews — 2026-10-19

Version 0.15.43 presents task attachments in a compact list below Description. Standalone local attachment links and images are projected out of the rich description while their portable Markdown links remain in the saved body. Inline references within prose remain in place; code examples and links to another project's files are not interpreted as local attachments. The Markdown source remains editable. Rich-text changes retain attachment links, and restored drafts refresh the list. The shared controller covers existing tasks, creation and Board draft editors.

Clicking a filename opens a nearby nonblocking popup with filename, preview, file type/size and Download. Images render directly; text, Markdown and CSV use literal text with a bounded preview. PDFs use the browser's native viewer with a download fallback; ZIP files offer download. Escape, outside clicks and Close dismiss the panel; requests and object URLs are cleaned up when closing or switching editors. Existing drag-and-drop upload validation, pending-upload handling and editor isolation are retained.

PDF preview requests alone permit same-origin embedding and inline delivery; other attachment responses and application frame restrictions remain unchanged. CSV responses now have the missing content type.

- Chromium (including its full PDF viewer) and WebKit attachment journeys passed: filenames with brackets, multiple uploads, image/text/CSV previews, PDF response headers, original-name downloads, missing files, invalid/large uploads, description preservation, reference links, code examples, editor switching, pending creation, desktop/tablet/mobile and both themes. Native PDF rendering was visually verified in Chromium; the WebKit test runtime does not paint the PDF, and Download remains available.
- Existing task-editor and Board draft journeys passed, including formatting, draft restore, autosave and conversion. Syntax and whitespace checks passed.
- Live read-only checks confirmed version 0.15.43, shared task/Board creation surfaces and responsive themes. The selected project had no existing attachment links to preview; original Markdown and project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.43`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.42`.


## Lowest priority and Medium defaults — 2026-10-19

Version 0.15.44 centralises priority labels and the new-task default. The former None option is displayed as Lowest in task editors, List/Tree tooltips and groups, Table cells and filters, Kanban cards and swimlanes, Board cards and automation controls. Stored `none` values remain compatible with existing tasks, views, filters and source mappings. New local tasks, Markdown imports without a priority, Board drafts and notes newly converted to drafts default to Medium. Explicit priorities, restored drafts, duplicates and create-another selections are preserved; source-owned values are not remapped.

- Existing task-color, create-another and Board draft browser journeys passed, covering selection/persistence, defaults across all nine creation views, desktop/mobile and both themes. All 27 Store, upgrade and automation regression checks passed. Syntax and whitespace checks passed.
- Live read-only checks verified version 0.15.44, Lowest labels and selected Medium defaults in task/Board creation menus on desktop and mobile in both themes. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.44`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.43`.


## Inline List and Tree editing — 2026-10-19

Version 0.15.45 makes the shared compact task row editable. Assignee, priority and status use the shared themed dropdown menus and value colors. Titles are borderless fields that save on Enter or leaving the field; Escape restores the last committed title. A date button opens the existing contextual start/due editor. A dedicated icon at the left opens the task side panel. Completion, drag handles, hierarchy expansion, contextual ancestors and manual ordering remain available. Desktop rows stay approximately 32px high, while touch controls have 44px targets and horizontal scrolling remains inside the view.

Updates use the existing durable save queue. Repainting preserves focus and scroll, defers while another title or menu is active, and updates status groups and filters. Empty titles and invalid date ranges are rejected. Workflow transitions and source-owned field restrictions remain enforced. Existing task data and relationships are preserved.

Touch checks uncovered that WebKit can omit the synthetic click after cancellation of a native select's pointerdown. The shared menu now opens on a completed tap, excludes moved/cancelled gestures and suppresses a duplicate compatibility click.

- Chromium and WebKit inline-editing journeys passed: field persistence, Enter/blur/Escape, title validation, status regrouping, allowed transitions, date changes/clearing, source restrictions, separate editor action, concurrent typing, offline retry, responsive layouts and touch at phone/tablet widths. Both themes were checked. Existing shared-dropdown, task-reorder and Tree viewport journeys passed. Syntax and whitespace checks passed.
- Live read-only desktop/mobile checks confirmed the new controls, date popups and left-side editor icons in both views and themes. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.45`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.44`.


## Aligned List and Tree layout — 2026-10-20

Version 0.15.46 gives List and Tree the same section-heading height and root-row geometry. List reserves the same noninteractive space as Tree's expand/collapse control, using shared desktop and touch dimensions. Child rows retain their 27px indentation per level. Existing inline editing, completion, opening and reordering controls remain in place.

- Temporary Chromium layout checks confirmed matching heading, row and field coordinates at desktop, tablet and phone widths in both themes, plus child indentation and expand/collapse. The existing Tree viewport journey passed, including nested overflow, keyboard scrolling, pagination and Back restoration. Screenshots were reviewed; JavaScript syntax and whitespace checks passed.
- Live read-only checks confirmed matching List/Tree positions on desktop and mobile in both themes. Project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.46`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.45`.


## Mirrored Lowest priority icon — 2026-10-20

Version 0.15.47 replaces the shared Lowest priority dash with two downward chevrons, vertically mirroring Urgent. All existing priority icon consumers receive the change; priority values, colors and ordering are preserved.

- Syntax and whitespace checks passed. Live read-only browser checks confirmed the icon in shared row menus and task-editor menus at desktop and phone widths in both themes. Project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.47`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.46`.


## Compact date popup with autosave — 2026-10-20

Version 0.15.48 removes the visible Task dates heading, task title and save footer from the shared task date popup. Clear dates sits immediately before Close and saves the cleared dates. Valid field changes save through the existing durable queue while the popup remains open and usable. Closing also captures a typed date before the input is removed. The dialog retains an accessible task-specific name; source-owned due dates remain protected, and invalid ranges and rejected saves show an inline error.

- Chromium and WebKit date-editor journeys passed, covering calendar selection, automatic save/reload/clear, invalid ranges, rapid edits and clearing during a delayed request, closing before change, switching to another task while saving, source restrictions, embedded Timeline camera preservation, failed saves, mobile and both themes. The List/Tree inline-editing journey passed. Syntax and whitespace checks passed.
- Live read-only desktop/mobile checks verified the compact controls and original date values in List, Tree and Timeline in both themes. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.48`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.47`.


## Compact List and Tree row controls — 2026-10-20

Version 0.15.49 shows assignees as colored avatars in List and Tree, retaining names in tooltips and the shared picker. Reorder handles come first, followed by the hierarchy slot, completion checkbox, open button, clickable type and clickable ID. The three open controls reach the same task editor and support keyboard activation. Icon-only controls keep 44px touch targets and both views share the same root-row alignment.

- Updated inline-editing browser checks passed for avatar selection, type/ID/open actions with mouse, keyboard and touch, other inline edits, autosave, source restrictions and desktop/mobile themes. Existing drag and keyboard reorder checks passed, including hierarchy and collapsed branches. Syntax and whitespace checks passed.
- Live read-only checks confirmed control positions, List/Tree alignment and all editor entry points on desktop and mobile in both themes. Project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.49`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.48`.


## Table icons and consistent dropdowns — 2026-10-20

Version 0.15.50 displays task types as their shared icons and assignees as shared colored avatars in Table cells. Native selects retain accessible names, full option labels and the shared menu, while a common value wrapper supplies the same chevron and spacing for type, assignee, status, priority, parent and custom select/checkbox fields. Icons, tooltips and colors update when a selection changes. Source-owned type and assignee cells use read-only icons. Existing column widths and table preferences are retained.

- Chromium and WebKit checks passed for saved/reloaded edits, avatar colors and unassigned state, all dropdown field types, source restrictions, keyboard navigation, full-name clipboard values, mobile touch targets, viewport containment and both themes. Existing Table tools checks passed for grouping, sorting, filtering, editing, saved views and responsive menus. JavaScript syntax and whitespace checks passed.
- Live read-only checks verified the icons and shared dropdown arrows/menus on desktop and mobile in both themes. Screenshots were reviewed; project/tasks/boards stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.50`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.49`.


## Clearer Table column dragging — 2026-10-20

Version 0.15.51 gives every Table column a visible grip, separate from sorting. Mouse users can still drag column titles; touch users can swipe titles to scroll and drag the grip to reorder. The floating preview shows up to three real cell values with their icons and colors, highlights the full source column and labels the proposed placement beside a full-height insertion marker. Edge scrolling accelerates smoothly and tolerates a small pointer overshoot; releasing outside the table cancels. Dropping in the original visible slot leaves hidden-column order intact.

Moves preserve widths, sorting and hidden fields, restore focus to the originating control and keep it visible. Alt + Left/Right works on both grips and titles. Escape restores the original scroll position and focus, and existing pointer-cancel and second-finger cancellation remain supported.

- Extended column-drag journeys passed in Chromium and WebKit: previews, grips, no-op drops, sorting, resizing, narrow labels, cancellation, keyboard visibility, edge scrolling, hidden/custom columns, editing, saved views and responsive themes. Chromium additionally exercised real touch streams for label scrolling, grip dragging and second-finger cancellation. Existing Table tools regression checks passed. Syntax and whitespace checks passed.
- Live checks verified dragging and keyboard moves on desktop and mobile in both themes; screenshots were reviewed. Original column order was restored, project/tasks/boards and saved views stayed unchanged, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.51`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.50`.


## Table header controls on hover — 2026-10-20

Version 0.15.52 hides Table header drag grips and menu icons until that header is hovered. Their space stays reserved so titles do not shift. Keyboard focus, active dragging and an open column menu keep the relevant controls visible; touch screens retain visible actions.

- The existing column-drag browser journey passed with updated hover, focus, per-column visibility and open-menu checks, including resizing, saved layouts and real touch interaction. Syntax and whitespace checks passed.
- Live desktop/mobile checks passed in both themes, with a reviewed desktop screenshot, no project edits, no browser errors and healthy service.
- Deployed as `pencils:0.15.52`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.51`.


## Simpler Table toolbar — 2026-10-20

Version 0.15.53 removes the visible selection count and keyboard-help sentence from the Table toolbar. The selection count remains a screen-reader status announcement; selection, bulk actions and keyboard shortcuts are unchanged.

- Syntax and whitespace checks passed. Live desktop/mobile checks in both themes confirmed the text removal and that selecting/deselecting rows shows/hides bulk actions. The desktop screenshot was reviewed; no task data was changed, no browser errors occurred and health passed.
- Deployed as `pencils:0.15.53`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.52`.


## Compact Table spacing — 2026-10-20

Version 0.15.54 uses shared Table dimensions for shorter rows, cell controls and headers. Desktop rows target 32px with 28px row actions and headers; input padding, group-heading padding and toolbar gaps are reduced. Coarse-pointer layouts retain 44px control targets. Font sizes, column widths, hover controls and editing behavior are preserved.

- Existing viewport checks passed for full-height layout, empty results, overflow, sticky headers and scroll restoration. Cell-control journeys passed in Chromium and WebKit for editing, menus, source restrictions, keyboard/touch interaction and both themes. The overflow fixture now contains enough compact rows to retain its original scroll-distance coverage. Syntax and whitespace checks passed.
- Live checks measured 33px desktop rows and 28.5px headers including borders; touch rows measured 47px with 44px controls. Desktop/mobile menus and themes passed, screenshots were reviewed, project data stayed unchanged and health passed.
- Deployed as `pencils:0.15.54`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.53`.


## Table descriptions and toolbar cleanup — 2026-10-20

Version 0.15.55 adds Description beside Title in Table, including older saved layouts. Previews use the shared Markdown renderer and attachment parser, then display escaped, single-line text so rows stay compact. Click or press Enter on a description cell to open the existing task editor. Existing column widths, order and visibility are retained; Description supports the shared column controls, saved views, filters, sorting, copying and CSV export. Spreadsheet paste directs description edits to the task editor to preserve rich content and attachment links. The grouping summary beside Reset table view is removed.

- Description browser journeys passed in Chromium and WebKit for legacy layouts, empty and long descriptions, rich editor updates, attachment preservation, saved column order, CSV export, keyboard/touch interaction and both themes. Existing Table tools and column-drag journeys passed. Table/query/paste unit checks, JavaScript syntax and whitespace checks passed.
- Live desktop/mobile checks passed in both themes: Description opens the task editor, compact row heights are preserved, and grouped tables no longer show the toolbar summary. The desktop screenshot was reviewed; project data stayed unchanged, browser errors were absent and health passed.
- Deployed as `pencils:0.15.55`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.54`.

## Documents, relationship metadata and shared control sizes — 2026-10-20

Version 0.16.0 adds Documents between Overview and Planning. Each project has a searchable explorer and an editor using the existing rich text/Markdown controls. Documents live in `Projects/<project>/documents/<document>.md`, use the existing revision/history/trash protections and share the durable browser save queue, retries and conflict recovery. Import and export preserve Markdown content. Narrow screens switch between explorer and editor.

Relationships display assignee, priority and status with shared colours. Sorting by those fields, with a reverse-order control, applies within each relationship group and the task picker; the preference is stored per project.

The shared `public/controls.css` sizing contract covers page and sidebar actions, fields, dropdown rows, task editors, rich text controls and Board tools. Controls are 36px normally, 32px with Compact density and 44px for coarse pointers. Multiline content keeps its own dimensions. Calendar controls now wrap on narrow screens.

- Syntax checks, whitespace checks and all 203 backend/model tests passed, including document persistence, revisions, delta updates, trash restore and viewer/editor/project access permissions.
- Documents journeys passed in Chromium and WebKit at desktop, tablet and phone widths, including rich text/Markdown editing, autosave, reload, failed saves, conflicts, search, import/export, trash and project isolation.
- Shared size measurements passed in both browsers across all project views, sidebar, menus, task editors, project/personal settings, density modes and light/dark themes. Existing navigation, table cell editing, relationship editing/sorting and Board formatting/undo journeys passed. Screenshots were reviewed. Touch verification used browser emulation, not a physical iPad.
- Live desktop/mobile checks passed for Documents navigation, consistent control sizes, relationship sorting controls, themes, version and health. Read-only hashes confirmed all three existing projects' records remained unchanged.
- Deployed as `pencils:0.16.0`, retaining the vault and environment. Previous image: `pencils:rollback-0.15.55`.

## Smaller task checkboxes — 2026-10-20

Version 0.16.1 uses a shared 13px checkbox size in List, Tree and Table, including Table's select-all control. List and Tree retain their completion buttons; Table retains native selection inputs. Desktop layout slots are preserved, and touch targets remain 44px. Table's selection column accommodates the larger touch targets without overlapping adjacent actions.

- Chromium and WebKit checks passed for desktop/mobile layouts, both themes, completion/reopening, row/select-all selection, and keyboard interaction. Existing Table tools and column-drag journeys passed, including resizing and saved layouts. Syntax and whitespace checks passed.
- Live checks confirmed checkbox dimensions, touch targets, version and health across all three views in both themes. Screenshots were reviewed; read-only hashes confirmed all three projects' records remained unchanged.
- Deployed as `pencils:0.16.1`, retaining the vault and environment. Previous image: `pencils:rollback-0.16.0`.

## Adjacent row controls — 2026-10-20

Version 0.16.2 places Tree's expand/collapse control before the drag handle in the shared List/Tree row. The drag handle and checkbox now have the normal 8px gap. List retains the hierarchy gutter so its task columns align with Tree roots; child indentation and touch targets are preserved.

- The existing task-reorder browser journey passed for mouse, keyboard, mobile touch, collapsed branches, saved order, editing and selection. Desktop/mobile screenshots were reviewed.
- Live checks confirmed the 8px gap, adjacent controls, matching List/Tree root positions, checkbox/touch sizes and both themes. Version and health passed; all three projects' record hashes were unchanged. Syntax and whitespace checks passed.
- Deployed as `pencils:0.16.2`, retaining the vault and environment. Previous image: `pencils:rollback-0.16.1`.

## Matching toolbar outer heights — 2026-10-20

Version 0.16.3 removes the extra two pixels contributed by the view switcher's wrapper border, drawing that border inside its existing bounds. The visible switcher now matches adjacent buttons, saved-view selectors, search fields and filters at 36px, 32px in Compact mode and 44px for touch. Search icons center against their field at every size.

- Shared control-sizing checks now include the view switcher's outer wrapper and search fields. Chromium and WebKit checks passed across project views, menus, editors, settings, density modes, light/dark themes and desktop/tablet/mobile layouts. Screenshots were reviewed.
- Live checks confirmed matching outer heights and centered search icons in List, Tree, Table, Kanban, Calendar and Timeline on desktop/mobile in both themes. Version and health passed; all three projects' record hashes were unchanged. Syntax and whitespace checks passed.
- Deployed as `pencils:0.16.3`, retaining the vault and environment. Previous image: `pencils:rollback-0.16.2`.

## Reset Table grouping — 2026-10-20

Version 0.16.4 adds Reset grouping beneath Expand all and Collapse all in the Table Group dropdown. It clears both grouping levels and collapsed-group state, persists through the existing table preferences, and focuses the first grouping field. Sorting, filters, advanced queries and column settings are preserved. The button is disabled when there is no grouping.

- The existing Table tools journey passed in Chromium and WebKit, with checks for resetting two collapsed grouping levels, preserving sorting/filter results and column widths, keyboard focus, reload persistence and mobile touch targets. Desktop/mobile screenshots were reviewed. Syntax and whitespace checks passed.
- Live desktop/mobile checks passed in both themes for menu sizing, grouping reset, persistence, version and health. All three projects' record hashes remained unchanged.
- Deployed as `pencils:0.16.4`, retaining the vault and environment. Previous image: `pencils:rollback-0.16.3`.

## Compact dropdowns and Documents spacing — 2026-10-20

Version 0.16.5 removes the introductory paragraphs from Table's Sort and Column filters menus. Shared dropdown contents now use a 28px desktop control height, 12px text and tighter padding through the shared sizing tokens. Menu fields, actions and selection options use the same variant; page triggers retain their existing sizing and touch controls remain 44px. The Documents welcome state has a 20px gap above New document.

- Shared sizing checks passed in Chromium and WebKit across project views, editors, settings, dropdowns, density modes, themes and desktop/tablet/mobile layouts. The existing Table tools journey passed for sorting, filtering, grouping, keyboard and touch interaction. Screenshots were reviewed. Documents spacing measured 20px on desktop/tablet, and mobile creation remained accessible.
- Live checks confirmed compact menu heights, removed help text, Documents spacing, version and health in desktop/mobile layouts and both themes. All three projects' record hashes remained unchanged. Syntax and whitespace checks passed.
- Deployed as `pencils:0.16.5`, retaining the vault and environment. Previous image: `pencils:rollback-0.16.4`.
