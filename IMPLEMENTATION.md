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
