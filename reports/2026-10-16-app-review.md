# Pencils app review and development plan

Reviewed on 16 October 2026 against the local 0.14.45 working tree, including its existing uncommitted feature changes. Companion reports: [Integrations](2026-10-16-integrations.md) and [iPad drawing](2026-10-16-ipad-drawing.md).

# Main recommendation

Keep Pencils focused on its strongest combination: **portable Markdown tasks, structured project views and a visual board**. The app already has considerable feature breadth. The next step should be making task visibility, recovery, permissions and interaction quality dependable before adding more large systems.

I would prioritize three outcomes:

1. Every view gives a trustworthy account of the project's tasks, including filtered, archived, deleted and inaccessible records.
2. One project can show Obsidian, Jira and SharePoint Excel records together while preserving ownership and permissions.
3. A dedicated iPad Drawing view feels immediate, saves locally and connects drawings to the rest of the project.

The report contains **60 recommendations in six categories**, followed by a delivery order. Recommendations extend existing features where possible; they do not assume recent work is missing.

# Scope and verification

I inspected the frontend, backend, task model, persistence, authentication, recovery, table query model, board and pen implementation, deployment configuration, documentation and test scripts. I also inspected desktop and mobile browser screenshots and compared relevant current official documentation for Jira, Miro, Trello, ClickUp, monday.com, JXL, Obsidian, Microsoft Graph and Concepts.

| Check | Result | Limit of the evidence |
| --- | --- | --- |
| Automated unit and model suite | **135 passed, 0 failed** | Does not establish complete UI or security coverage |
| JavaScript syntax checks | Passed | Does not establish runtime correctness |
| Shared project layout browser test | Passed across all nine views at 1440×900 and 390×844 | Chromium viewport simulation, not physical mobile or tablet testing |
| Temporary 205-task fixture | Confirmed Timeline and paged Kanban visibility issues below | Synthetic data, not a diagnosis of your actual Argus records |
| Existing 3,001-task performance script | Cold snapshot 2,722 ms; cached 285 ms; payload 1,419 KiB; external edit detected | One local run; measures the script's snapshot path, not end-to-end interaction latency |
| Integration research | Official API and product documentation reviewed | No authenticated Jira or Microsoft tenant calls |
| Drawing research | Existing code plus browser/native documentation | No Apple Pencil latency or palm-rejection measurement |

Tests used temporary vaults. Production task data was not changed. The working tree contains substantial earlier changes, so these findings describe the local code, not a clean release tag. This report does not implement the proposed changes or claim a comprehensive penetration test.

# What is already working well

The app already provides Overview, List, Tree, Table, Kanban, Board, Calendar, Timeline and Capacity views, with shared project navigation. Tasks support hierarchy, dates, estimates, dependencies, recurrence, comments, attachments, custom fields and templates. The task editor has autosave, and the board now includes draft tasks, note conversion, project frames, dependency styling and recovery states.

The latest Table work already adds two-level grouping, three sort criteria, typed column filters and saved views. Board tools already include note styles, grids, rich text, connectors, pressure-aware drawing and selection tools. These should be refined instead of replaced with competing versions.

The storage implementation preserves unknown YAML, uses revisions and atomic file replacement, and supplies history, trash and backups. Security foundations include password hashing, session cookies, origin checks, a content security policy and path/symlink protections. Those are valuable foundations to retain.

# Confirmed findings and implications

File locations are relative to the repository. Line numbers describe the audited working tree and may move.

| Finding | Evidence | Why it matters | Priority |
| --- | --- | --- | --- |
| Timeline silently caps dated tasks at 200 | `public/task-timeline.js:6`; browser fixture rendered 200 while the footer said 205 of 205 | A user cannot tell that scheduled work is absent | P0 |
| Kanban counts describe a page, not the whole project | `public/app.js:736`; fixture with 103 To do and 102 Done displayed To do 100 and Done 0 on page 1 | A populated workflow column can appear empty | P0 |
| Tree receives a 100-task slice before building the hierarchy | `public/app.js:736` | A parent and child can fall on different pages; hierarchy context needs preservation | P0 |
| Backup creation and upload limits differ | `server/recovery.js:158` creates unrestricted-size ZIPs; import rejects compressed files over 10 MB | The app can generate a backup its upload flow will not accept | P0 |
| Backup scope is narrower than a complete installation | Backup collection includes Projects and Organisations | Accounts, history, trash and unrelated vault content need a separate documented recovery policy | P1 |
| Shared mode acts as administrator | `server/auth.js:144`; default deployment supports trusted-LAN shared use | Importing restricted cloud data requires explicit authentication and audience controls | P0 before integrations |
| Capacity currently measures task counts | `public/capacity.js:1–58`; UI discloses estimates and cross-project work are excluded | It should not be interpreted as hours of available capacity | P1 |
| Snapshot transfer grows with the workspace | Performance result above; change notifications trigger snapshot-oriented refresh | Larger projects and sources need narrower queries and updates | P1 |
| Drawing preview work grows with stroke length | `public/pen-model.js:12–46`, `public/canvas.js:375–385` | SVG segment count and rebuilding the active stroke are likely bottlenecks; hardware profiling is still needed | P1 |
| Offline support is partial | Durable mutation queue exists; no service worker or IndexedDB found | A loaded app can retain pending work, but that is not a fully offline-startable drawing app | P1 |
| Mobile layout passes structural checks but remains dense | Inspected Calendar, Board and Capacity screenshots at 390 px | Horizontal scrolling and long control surfaces still need mobile-specific interaction design | P1 |
| Major modules carry many responsibilities | `app.js` about 2,481 lines, `canvas-pro.js` 3,156 and `store.js` 1,476 | Increasing change coupling; size alone is not a defect, but clear module boundaries will help | P1 |

Your earlier board-versus-list screenshot alone does not establish that a task was deleted. Filtering, archive state and view pagination can explain discrepancies. The current board code already distinguishes confirmed deletion, archive and unavailable records. A project-wide explanation of hidden tasks would make that distinction easier to discover.

# Comparison with similar apps

This is a workflow comparison, not a claim that every feature is available on every product plan. Subscription and tenant restrictions should be checked when evaluating a purchase.

| Product | Relevant documented capability | What Pencils should learn |
| --- | --- | --- |
| Jira | Plans has dependency visualization, filtering and off-track indications, with plan restrictions | Make dependencies explain schedule impact and blocked work, beyond drawing arrows. [Jira dependencies](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-dependencies-report-in-advanced-roadmaps/) |
| Miro | Frames organize and present board content; Jira cards can connect structured work to a canvas | Preserve the spatial workspace while keeping task identity and navigation clear. [Frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames), [Jira Cards](https://help.miro.com/hc/en-us/articles/360017572434-Jira-Cards) |
| Trello | Rules, buttons and scheduled or due-date automations simplify repeated actions | Add a small, understandable automation system with logs after core behavior is stable. [Automation overview](https://support.atlassian.com/trello/docs/automation-overview/) |
| ClickUp | Relationships expose blocking, blocked-by and related-item context around tasks | Give relationships a focused panel with useful context rather than a long generic form. [Task relationships](https://help.clickup.com/hc/en-us/articles/29728065999383-Relationships-on-tasks) |
| monday.com | Advanced filters support combined conditions; grouping changes the way a board is organized | Build visible, reusable query controls and preserve context when filtering. [Advanced filters](https://support.monday.com/hc/en-us/articles/25722908508946-Advanced-board-filters), [Grouping](https://support.monday.com/hc/en-us/articles/4452237638546-Group-your-board-by-anything) |
| JXL for Jira | Spreadsheet workflows combine table operations with hierarchy and grouping | Extend the new table model with rollups, hierarchy context and deliberate bulk operations. [Table features](https://www.jxl.app/docs/guide/table-features/), [Working in sheets](https://www.jxl.app/docs/guide/working-in-sheets/) |
| Concepts | A focused drawing workspace combines editable strokes, tools, layers and precision aids | Separate ink interaction from board management and benchmark the physical drawing experience. [Concepts manual](https://concepts.app/en/manual) |

Pencils does not need the full configuration burden of these products. Its advantage is being understandable, local and portable while letting the same task appear in several useful views.

# Priorities and effort notation

**P0** means a correctness or access boundary to address before expanding the affected feature. **P1** is the next product iteration. **P2** follows after the foundations are sound.

Effort assumes one developer familiar with this app, including implementation and targeted tests: **XS** 0.5–1 day, **S** 2–3 days, **M** 4–8 days, **L** 9–15 days, **XL** 16–30 days. These are planning ranges, not commitments. Recommendations share infrastructure, so adding every row would double-count work. Integration and drawing packages have separate estimates in their reports.

# Category A Interface and navigation

| # | Change | How I would implement it | Priority and effort |
| --- | --- | --- | --- |
| A1 | Explain why tasks are hidden | A shared count summary shows total, matching, archived and page-visible tasks; open active filters directly from it. Use the same definitions in all views. | P0 · M |
| A2 | Reduce toolbar duplication | One shared query bar for search, filters, sort and saved view; keep table grouping and board tools in a clearly separate view-specific area. | P1 · M |
| A3 | Give task details one responsive shell | Reuse one editor model; desktop side panel, tablet resizable panel and mobile full-height sheet. Keep actions and field order consistent. | P1 · M |
| A4 | Make autosave state understandable | Use consistent Saving, Saved, Pending offline and Conflict messages; preserve field focus and drafts during refreshes. | P1 · S |
| A5 | Offer comfortable and compact density | Shared spacing tokens with touch-friendly minimum targets; compact tables without making icons difficult to activate. | P1 · M |
| A6 | Improve current-view navigation on phones | Keep the current view visible, with a compact view switcher instead of relying only on horizontally hidden tabs. | P1 · S |
| A7 | Make empty states actionable | Distinguish no project data, no matches, no team and no permission. Offer the specific next action rather than generic empty copy. | P1 · S |
| A8 | Add a command menu | Search task actions, views and project settings with keyboard access; reuse existing action handlers and expose shortcuts. | P2 · M |
| A9 | Make Overview metrics useful entry points | Clicking overdue or blocked counts opens the matching task query; show the metric's scope and freshness. | P1 · S |
| A10 | Treat overlays as shared components | Standardize popover placement, Escape, focus return, click-away and viewport clamping. Reuse the existing color picker and select implementation. | P1 · M |

Success criterion: a user can explain why a task is or is not visible and can perform the same common action without relearning its placement in another view.

# Category B Tasks and planning

| # | Change | How I would implement it | Priority and effort |
| --- | --- | --- | --- |
| B1 | Remove Timeline's silent task loss | Replace the 200-task slice with windowed rows or explicit paging; calculate counts from the same result set. Add a 205-task regression case. | P0 · M |
| B2 | Make Kanban columns complete | Compute full filtered column counts and load cards per column or virtualize them; do not page the whole task array before grouping. | P0 · M |
| B3 | Preserve Tree ancestry | Filter matches first, then include ancestor context and show why context rows are present; page roots/subtrees rather than arbitrary task slices. | P0 · M |
| B4 | Clarify dependency semantics | Use separate Blocked by and Blocks lists with task keys, status, search and source. Keep board arrows and task relationships backed by the same model. | P1 · M |
| B5 | Preview scheduling consequences | Show dependency/date conflicts and proposed downstream moves before applying them; no silent cascade when dragging a date. | P2 · L |
| B6 | Add effort-based capacity | Offer hours alongside task count, working days, individual availability and cross-project allocation; make unknown estimates explicit. | P1 · L |
| B7 | Add a mobile calendar agenda | Day/week agenda with an unscheduled tray and quick date editing; keep the month grid for suitable screen widths. | P1 · M |
| B8 | Strengthen draft finalization | Preview required fields, allowed type/parent choices and destination source. Preserve board identity and comments after finalization. | P1 · M |
| B9 | Improve recurring task controls | Explain the next occurrence, completion versus calendar scheduling and edit-this versus future instances. Preserve lineage and prevent duplicate generation. | P2 · M |
| B10 | Add restrained project automation | Start with status-change, due-date and manual triggers plus a few actions. Include dry-run, logs, loop protection and an obvious disable switch. | P2 · L |

The existing hierarchy editor, workflow restrictions, recurrence and dependency arrows remain foundations. These recommendations improve their consequences and clarity rather than introduce parallel systems.

# Category C Table and reporting

| # | Change | How I would implement it | Priority and effort |
| --- | --- | --- | --- |
| C1 | Make saved-view ownership explicit | Label Personal versus Project views, show unsaved changes and provide Save as. Store shared definitions separately from local presentation preferences. | P1 · M |
| C2 | Add expressive filter groups | Build AND/OR groups, relative dates and a current-user token on a shared query model; retain simple quick filters. | P1 · L |
| C3 | Filter from column headers | One header menu with sort, filter, group, hide and data-type context. Show active criteria without requiring several toolbar rows. | P1 · M |
| C4 | Add meaningful group summaries | Count tasks and sum estimates; compute completion from a declared rule. Distinguish current-page summaries from full-query totals. | P1 · M |
| C5 | Combine hierarchy with grouping | Support an optional parent/child outline inside groups, with consistent handling when parent and child group values differ. | P2 · L |
| C6 | Improve spreadsheet navigation | Roving cell focus, arrow keys, Enter to edit, Escape to cancel, range selection and predictable Tab movement; preserve accessible semantics. | P1 · L |
| C7 | Make bulk scope explicit | Offer Selected rows, This page and All matching where safe; preview count and field changes before large updates. Show tools when selection exists. | P1 · M |
| C8 | Add pinned identity columns and density | Keep task ID/title visible during horizontal scrolling; distinguish row height from text size and preserve custom column widths. | P1 · M |
| C9 | Add validated paste and export | Preview pasted data, map columns and report invalid cells. Export the current query with a stated scope; protect spreadsheet exports from formula injection. | P2 · L |
| C10 | Scale the query engine | Index lookup values, cache derived fields, virtualize rows and eventually run filtered queries server-side. Benchmark 1k, 10k and 50k tasks. | P1 · L |

The current model's two grouping levels and three sort criteria are reasonable starting limits. Do not raise them merely to advertise a number; first make group scope, ordering, saved state and keyboard editing dependable.

# Category D Board and drawing

| # | Change | How I would implement it | Priority and effort |
| --- | --- | --- | --- |
| D1 | Make frame updates predictable | Preview added, removed and repositioned cards; preserve manual placement where requested and keep the camera stable. Offer relayout as a separate action. | P1 · M |
| D2 | Improve relationship routing | Use obstacle-aware orthogonal routes, stable ports, minimum spacing and deterministic label anchors. Separate logical dependencies from visual bends. | P1 · L |
| D3 | Make connectors accessible | Provide keyboard port selection and a textual relationship list. Show labels and patterns as well as color for dependency types. | P1 · M |
| D4 | Add a useful object navigator | Search and select cards, frames and drawings; show hidden/locked/deleted states and jump without losing the previous viewport. | P1 · M |
| D5 | Strengthen board recovery | Reuse existing deleted-task states; expose restore, detach and source navigation consistently, with an explanation for unavailable data. | P1 · M |
| D6 | Create a dedicated Drawing view | Gallery plus focused canvas linked to tasks and boards; share project UI and keep board previews lightweight. | P1 · XL |
| D7 | Replace the active ink rendering path | Incremental local ink, preserved pressure/time data, adaptive smoothing and viewport caches; test on the actual iPad. | P1 · L |
| D8 | Improve pen and touch ergonomics | Pencil draws, fingers navigate; movable tools, left-handed layout, calibration and explicit gesture state handling. | P1 · M |
| D9 | Add drawing layers and references | Lock image references, manage layers and export editable/vector and raster forms without flattening the master document. | P2 · L |
| D10 | Make drawing locally durable | IndexedDB checkpoints, offline app shell and a per-drawing outbox; distinguish local save from server sync and test interruptions. | P1 · L |

The drawing effort bands overlap heavily; use the staged estimate in the drawing report rather than summing D6 through D10. Prioritize the physical feel and preservation of strokes before adding advanced brush libraries.

# Category E Integrations and permissions

| # | Change | How I would implement it | Priority and effort |
| --- | --- | --- | --- |
| E1 | Add project data-source configuration | A source wizard with scope, direction, mapping preview, capability summary and a reversible disconnect policy. | P1 · M |
| E2 | Preserve source identity | Stable external IDs, source badges and Open in source; separate provider fields from local annotations. Never deduplicate by title alone. | P0 · M |
| E3 | Extend Obsidian interoperability | Selected-folder access, frontmatter mappings, stable block IDs for opted-in checklists and conservative file updates. | P1 · L |
| E4 | Add Jira read mode first | OAuth, selected project/JQL, allowed records, field mappings and polling; keep unsupported rich text intact. | P1 · L |
| E5 | Add SharePoint Excel read mode first | Download a selected `.xlsx`, map a named table and require stable row IDs; verify selected-resource permissions in the tenant. | P1 · L |
| E6 | Make writeback a capability | Enable create, edit, assign, transition or comment individually, respecting provider permissions and required fields. | P1 · XL |
| E7 | Match local and source audiences | Project roles plus per-user or explicitly approved shared sources; enforce cached-data access and export policy on the server. | P0 · L |
| E8 | Handle conflicts visibly | Durable base snapshots and field-level comparison; show local/remote values and preserve rejected edits. | P0 · L |
| E9 | Add a sync operations screen | Pending jobs, last success, reauthentication, retry, pause and safe diagnostic export without tokens. | P1 · M |
| E10 | Link records across sources | Explicit related-record links and local cross-source dependencies; publish remote equivalents only where a source supports the semantics. | P2 · L |

The detailed integration report includes permissions and ten achievable features per source. It also explains why unattended Excel workbook editing cannot be assumed to work with application credentials.

# Category F Reliability and maintainability

| # | Change | How I would implement it | Priority and effort |
| --- | --- | --- | --- |
| F1 | Align backup and restore capabilities | Stream or chunk larger archives, publish limits, and ensure every generated backup can be validated and restored through a supported route. | P0 · M |
| F2 | Define complete recovery | Separate project backup from installation backup; include account/config recovery instructions, retention, off-device copies and a practiced restore drill. | P1 · M |
| F3 | Harden multi-writer persistence | Add a journal for related mutations and a recoverable commit protocol; handle external file changes deliberately instead of assuming one process owns the files. | P1 · L |
| F4 | Introduce a rebuildable index | Keep Markdown authoritative, but consider a SQLite query/index layer with migration and rebuild tools for fast search and scoped sync. | P1 · L |
| F5 | Send narrower updates | Per-project subscriptions, record deltas and batched changes instead of repeatedly refreshing a whole-workspace snapshot. | P1 · L |
| F6 | Test real access boundaries | Required-auth deployment path, project/source ACLs and negative tests for search, exports, attachments, caches and revoked users. | P0 before cloud data · L |
| F7 | Consolidate shared components | Extract menu, overlay, task-field and action modules with explicit interfaces; reduce global state and layered CSS overrides incrementally. | P1 · L |
| F8 | Establish a browser release gate | Run a maintained smoke suite for all views, plus Firefox and WebKit for shared interactions. Repair stale selectors instead of leaving obsolete browser scripts. | P1 · M |
| F9 | Audit accessibility and motion | Keyboard-only journeys, screen-reader names, contrast in both themes, touch targets and reduced-motion behavior. Keep focus indicators visible without clipping. | P1 · M |
| F10 | Add operational diagnostics and accurate docs | Track snapshot/render/save timings and error categories; redact logs; consolidate README instructions and document known limits with each release. | P1 · M |

Do this incrementally. A wholesale frontend rewrite or replacement of Markdown storage would create migration risk without automatically fixing the observed problems.

# Delivery order

| Order | Work package | Completion evidence |
| --- | --- | --- |
| 1 | Task visibility and counts: A1, B1–B3 | A 205-task project shows complete and correctly scoped counts in every view; hierarchy context survives filtering |
| 2 | Recovery limits: F1–F2 | Restore a generated backup above the current upload boundary; document excluded data and test a complete installation recovery |
| 3 | Shared UI and mobile workflows: A2–A7, B7 | Consistent task editing and query controls on desktop, phone and tablet; no hidden active-filter ambiguity |
| 4 | Table refinement: C1, C3, C4, C7, C8 | Saved-view ownership, useful summaries and explicit bulk scope work on realistic projects |
| 5 | Access and connector foundation: E1, E2, E7–E9, F6 | Restricted source records cannot leak through another user's cache, search or export; retries and conflicts are recoverable |
| 6 | Three read-only sources: E3–E5 | Obsidian, Jira and Excel records appear together with source links, identity and sync health |
| 7 | Drawing feasibility prototype: D7–D8 | Physical iPad comparison establishes whether browser ink meets the user's expectations |
| 8 | Drawing MVP: D6, D9–D10 | Local drawing, layers, images, offline recovery and board previews pass interruption tests |
| 9 | Selected source writeback: E6 | Provider-permitted operations succeed; unsupported changes are explained; ambiguous retries do not duplicate records |
| 10 | Advanced planning and automation: B5, B6, B9–B10, E10 | Schedule effects are previewed and automation has audit logs, guardrails and clear ownership |

Start with an approximately **2–3 week reliability and interface iteration**, selecting the highest-risk items rather than committing to every P1 row. The read-only multi-source milestone is estimated at **33–52 person-days before contingency**. The drawing prototype is **3–5 days**; a polished browser drawing release is estimated at **38–65 person-days** including that prototype. These are separate scopes and must be scheduled against the available development capacity.

# Decisions to validate during implementation

The highest-impact unknowns are the exact iPad/Pencil models, whether Jira is Cloud or Data Center, Microsoft tenant consent policy, the structure of the real Excel workbook, the task conventions in the Obsidian vault, and whether sources are personal or shared with a team. These do not block the design, but they materially change connector and drawing estimates.

Keep source-authoritative data distinct from local planning data. Keep the drawing renderer independent from network sync. Keep Markdown and exportability central. Those three boundaries make the proposed features easier to add without compromising the qualities that already make Pencils useful.
