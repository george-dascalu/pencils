# Pencils UI/UX consistency assessment

17 October 2026 · Local working tree, package version 0.14.45 with unreleased changes

Pencils has a recognisable visual identity and a useful shared interface foundation. Its biggest remaining consistency problems concern **what happens when a user opens, edits, comments on or closes something**. Shared code has reduced duplication, but it has not yet established one predictable interaction contract across the app.

The next improvement should be a consolidation pass: unify task panels, comment ownership, save/close behaviour and responsive controls. Preserve the specialised interactions that make Table, Board and Drawing useful.

During this assessment, the requested **Columns popover was implemented**. It opens beneath Columns, applies visibility and ordering immediately, and supports Escape, outside click and keyboard focus restoration. Other changes below are recommendations, not completed fixes.

## Scope and evidence

The assessment combines source inspection with browser interaction using an isolated sample project. It covers all ten project views at desktop and phone sizes, with selected tablet checks; task creation and editing; comments and history; project, board, workflow and personal settings; People, Teams, Recovery, and source configuration. Drawing was checked both as a gallery and an open drawing.

Browser observations used Chromium at 1440 × 960, 390 × 844 with touch emulation, and selected 1024 × 768 touch layouts. Representative light and dark screenshots were inspected. Twelve targeted axe scans covered open editors and settings, including populated content behind nonmodal panels. These found issues that the existing primary-view smoke tests do not cover.

Physical iPad/Pencil behaviour, the software keyboard on an actual iPad, screen-reader operation and live Jira/Microsoft OAuth journeys were not exercised. Integration publishing, account administration, some recovery actions and automation configuration were reviewed in code rather than against live accounts. This is a usability assessment, not an accessibility conformance certification.

## What already works well

- Project navigation, Project settings and New task occupy a shared header across the ten views.
- Task creation and task details reuse their core fields and rich-text editor. Most views already open the same nonmodal task panel.
- Dropdowns, the Monday-first date picker and the colour picker have shared implementations. Extend these rather than introducing another family of controls.
- Existing tasks have automatic saving with pending/error states; new tasks have an explicit creation step and Create another.
- Comments and version history reuse an auxiliary panel area within task details.
- Task counts, archive information and hierarchy context are clearer than a bare row count. Calendar has a useful phone agenda mode; Capacity explains missing team setup.
- Light and dark themes retain a recognisable palette. Table grouping, sorting, column filtering and saved views provide a strong foundation for richer work.

## First priorities

| Priority | Change | Why first |
| --- | --- | --- |
| P1 | Unify comments on a task and its board cards | The same-looking action currently opens different conversations. |
| P1 | Correct unsupported draft-recovery promises | A source form can be discarded after being told its draft will remain available. |
| P1 | Restore task-opening focus on close | Keyboard users lose their place after dismissing task details. |
| P1 | Fix mobile Table and Calendar layouts | Task IDs disappear; calendar controls extend beyond the viewport. |
| P1 | Fix populated-panel contrast and board semantics | Actual task and settings content exposes accessibility failures. |
| P2 | Standardise task panel and auxiliary panel layouts | The same task moves between different sides, widths and responsive behaviours. |
| P2 | Consolidate filters, saved views and settings entry points | Users should not have to relearn where the same operation lives. |

P1 means a task-completion, trust or accessibility problem worth addressing before more features. P2 means a recurring usability inconsistency. P3 means refinement. These are product priorities, not security severity ratings.

## 1. Task panels and object identity

**01 · P2 · One task has two panel layouts.** At 1440 × 960, the List editor measured 560 × 936 at the right edge. Board used a 400 × 760 panel on the left beside its tools. The former has a resize grip; the latter does not. On a 390 px phone, List fills the screen, while Board creation starts around y=204 and measures 354 × 618. Fields are shared, but their presentation changes significantly. Use one panel shell, one width preference and one mobile breakpoint. My recommendation is a consistent right-hand dock on desktop and full-screen task details on phones; if left docking is important for Board, expose it as an explicit remembered preference. [List example](assets/ui-ux-2026-10-17/desktop-list-task.png), [Board example](assets/ui-ux-2026-10-17/desktop-board-task.png). Implementation: `public/board-task-editor.js`.

**02 · P2 · Comments/history cover fields at smaller widths.** At desktop widths the auxiliary panel sits alongside task details. Below 1100 px it overlays the form; on a phone, comments leave a narrow strip of task fields visible underneath. Use task-level tabs such as Details, Comments and History when there is insufficient room for two panels. Preserve form state and scroll position when switching. Keep the wide-screen side-by-side layout. [Phone example](assets/ui-ux-2026-10-17/phone-list-task-comments.png). Implementation: `public/task-tools.css`, `public/board-comments.js`, `public/task-modal.js`.

**03 · P1 · Board-card comments and task comments are separate conversations.** This was reproduced: adding “Board conversation” through a task card’s comment icon left task details showing “No comments yet”. A comment added in task details was stored on the task; the first remained on the board node. Both actions use a comment icon and similar wording. Make comments on real task cards resolve to the task conversation. Retain object comments for notes, frames and other board-only objects. If card-specific discussion is valuable, make it an explicitly labelled second scope. Migrate existing node comments without losing IDs, replies or reactions. Implementation: `public/canvas-pro.js` around the task-card renderer and comment controller; `public/features.js` task-comments adapter.

**04 · P2 · Opening details uses inconsistent affordances.** Task titles open details in List/Kanban; Table and Board use expand arrows; List’s ellipsis also opens the editor rather than an action menu. Keep title/identity activation as the common way to open a task where the view allows it. Use the same Open task icon for supplemental entry points. Reserve ellipsis for an actual actions menu. Clearly distinguish Remove card from board from Delete task wherever a trash icon appears. Implementation: `public/app.js` task rows and board nodes; `public/grid.js`; `public/canvas-pro.js`.

## 2. Saving, closing and feedback

**05 · P1 · A close prompt promises recovery that some forms do not provide.** Entering a name in Add project source, closing it, and accepting “Your draft will remain available in this browser” produced an empty form on reopening, with no restore action. The generic close prompt is broader than the draft implementation: draft persistence is installed for task, project and organisation forms, not every dialog. Either register every draft-capable form with a shared draft manager or use an accurate Discard changes prompt for unsupported forms. Never imply recovery unless it has actually been stored. Implementation: `public/app.js:988`, `public/features.js` draft handling, `public/project-sources.js`.

**06 · P2 · Closing an invalid autosave form hides its unsaved state.** Clearing an existing task title produces a validation message. Closing still dismisses the editor; reopening shows the old saved title plus a browser-draft notice. Recovery exists, but it is easy to mistake dismissal for a successful save. Make close depend on the save result: save valid changes; for invalid changes, offer Keep editing or Keep draft and close. For offline changes, state that they are safely queued locally. Implementation: `public/task-autosave.js`, `public/app.js` close handling.

**07 · P2 · Save behaviour needs an explicit policy.** Tasks autosave; board settings auto-apply with board undo; existing draft-task editors still have Save draft; Project/People/Teams and workflow use explicit saves; source publication is reviewed separately. Some differences are appropriate. Standardise by operation: autosave existing content and appearance; explicit Create for new records; explicit Save/Review for structural configuration; explicit Publish for remote changes. Put the current state in the same location within each surface and make undo scope visible. Implementation spans the shared form shell, `public/save-state.js` and settings controllers.

**08 · P2 · Field presentation changes between surfaces.** Board cards tint priority/status, task details use an icon priority trigger and plain status field, and Table presents priority as text. The menu infrastructure is shared, but selected-value styling is not. Introduce shared PriorityField, StatusField and AssigneeField renderers with compact and regular density variants. Keep the same icon, colour meaning, selected state, empty label and keyboard behaviour. An inline cell may be smaller without changing the field’s identity. Implementation: `public/task-modal.js`, `public/grid.js`, `public/canvas-pro.js`.

## 3. Navigation, filtering and settings placement

**09 · P2 · Saved views move between locations.** In task views, saved-view controls sit beside search. In Overview, Board and Drawing they move into Project. Keep a stable View configuration entry point. Its contents can vary by view, but its location should not. Separate project-wide configuration from personal view layout. Implementation: `public/project-layout.js:36` onward.

**10 · P2 · Table has several filtering entry points and reset scopes.** Users encounter shared Filters, Column filters, Advanced filters, and per-column filter controls. List grouping is also located inside Filters while Table grouping has its own button. Keep column shortcuts, but have them open the same filter editor. Show all active conditions as readable chips with a unified Clear all and separately labelled section resets. Put grouping under Group consistently. Existing distinct scopes should remain explicit rather than silently overriding one another. Implementation: `public/table-tools.js`, `public/query-editor.js`, `public/features.js`.

**11 · P2 · Project configuration is split across unrelated surfaces.** Project settings is a page, Workflow & fields is reached from Project and opens a large modal, sources/automation open more dialogs, and board settings is an anchored popover. The board-specific popover is sensible; project-level configuration needs one home. Use a Project settings page with General, Workflow, Card hierarchy, Fields, Teams, Sources and Automation sections. Keep common section headers, save controls and return behaviour. Implementation: `public/app.js` project settings, `public/features.js`, `public/workflow-editor.js`.

**12 · P2 · Navigation links do not cover the full project UI.** The boot route parser recognises settings, board and drawing project routes, but not a general route for every view or task. State also relies on browser-local view preferences. Introduce one route model for all views plus task identity and auxiliary tab. Links should restore the same project/view/task, and Back should return to the previous meaningful location. Preserve unsaved drafts when navigating. This is a code-confirmed limitation, not a claim that every current link is broken. Implementation: `public/app.js` boot route parsing around line 2470 and navigation handlers.

## 4. Phone and tablet layouts

**13 · P1 · Table keeps a blank ID column on phones.** The mobile `.task-id { display: none; }` rule hides all eight sample IDs, while the ID header and column retain their width. The first data row began around y=500, and the title was largely beyond the initial horizontal viewport. Scope the hiding rule to the intended List layout; keep Table identity visible. On narrow screens, use a compact combined ID/title region and expose other columns through horizontal scrolling or row details. [Screenshot](assets/ui-ux-2026-10-17/phone-table.png). Implementation: `public/styles.css:1817`, `public/grid.js:122`.

**14 · P1 · Calendar agenda controls extend beyond the phone viewport.** At 390 px, the Period control extended to x=460 and the agenda-date input to x=523. The date-range heading wrapped into a 165 px tall block. The document itself did not report horizontal overflow, demonstrating why a page-width check alone misses this. Reflow previous/range/next onto one row and layout/period/date onto a second responsive row. Check individual control bounds and keyboard visibility. [Screenshot](assets/ui-ux-2026-10-17/phone-calendar.png). Implementation: `public/planning.js`, `.planning-head` styling in `public/enhancements.css`.

**15 · P2 · Touch sizing increases height more consistently than width.** Phone task-header actions measured 24 × 44 px; date-picker buttons measured 30 × 32 px. Some canvas controls also scale down with board zoom. Use a 44 × 44 CSS-pixel product target for frequent touch actions, with overflow menus when space runs out. This is a comfort recommendation: WCAG 2.2’s AA minimum target criterion uses 24 × 24 px with exceptions, so these measurements alone do not establish a failure. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

**16 · P2 · Mobile toolbars consume too much of the task area.** Table stacks saved views, search, shared filters, grouping, sorting, column filtering, advanced filters, column tools and desktop keyboard guidance before the rows. Use a compact mobile toolbar with Search and a View options control, plus active-filter chips. Show bulk actions only when a selection exists and move keyboard instructions to Help on touch devices. Keep desktop’s richer toolbar. Implementation: `public/project-layout.css`, `public/table-tools.css`, `public/grid.js`.

## 5. Accessibility and visual clarity

**17 · P1 · Dismissing task details can lose keyboard position.** Escape from the title field returned focus to `BODY` in the checked Overview, Tree, Table, Kanban, Calendar, Timeline and Capacity entry points. Closing an auxiliary history panel correctly returned to its trigger in the observed case; preserve that behaviour. Store the task opener and restore focus to it, or to the equivalent task after a rerender. Use the same rule for X and Escape. The shared panel currently attempts to focus a Board-specific control even outside Board. Modal-dialog guidance likewise calls for focus to return to the invoker or a logical replacement. [W3C dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Implementation: `public/board-task-editor.js`, `public/app.js`.

**18 · P1 · Secondary text still fails contrast in populated forms.** Targeted scans reported light-theme task labels at approximately 3.37:1 on white, completed task text at 2.83:1 and file-path text at 2.73:1. These are different contexts from the previously passing primary-view checks. Consolidate text tokens and remove component-specific muted-colour overrides. Cover real labels, selected values, completed tasks, tags and settings in both themes. Preserve reduced emphasis through weight and placement as well as colour. Evidence is in the accompanying observation file; implementation spans `public/styles.css`, `public/appearance.css` and `public/task-tools.css`.

**19 · P1 · Interactive task cards are nested inside button semantics.** Board nodes expose `role="button"` while task cards contain their own buttons and selects. Axe reported nested-interactive on the populated task card, including when it was behind a nonmodal panel. Represent the card as a labelled group with a separate selectable/focusable handle, and leave embedded fields independently operable. Preserve keyboard selection, movement and editing. Implementation: `public/app.js:1266` and the live task-card renderer.

**20 · P3 · Some empty error regions look like active warnings.** The workflow form shows a coloured error strip even when no error text is present. Hide empty error regions and reveal them with a specific message, field association and focus policy when needed. Apply the same validation presentation across creation, settings, imports and publishing. Avoid making a normal empty form look broken. [Workflow example](assets/ui-ux-2026-10-17/phone-workflow.png). Implementation: workflow form markup and shared `.form-error` styles.

## 6. Specialist tools and progressive disclosure

**21 · Addressed · Columns should be a local adjustment.** The previous large Table columns modal interrupted the table just to show/hide or reorder fields. It is now a compact anchored popover using the shared menu infrastructure. Changes apply immediately; the table remains visible. Focus and list scroll survive updates. Column widths remain adjustable at table headers, and named views retain the layout. [Updated component](assets/ui-ux-2026-10-17/desktop-columns.png).

**22 · P2 · Workflow and hierarchy deserve focused sections.** A long Workflow & custom fields dialog combines comma-separated task types, custom fields, status configuration, visual diagrams and hierarchy rules. Retain the visual editors and their table alternatives, but place Workflow and Card hierarchy in separate settings sections with a consistent diagram toolbar and inspector. Use a real type list with add/rename/remove controls instead of comma-separated text. Make structural validation and the Save step obvious. Implementation: `public/workflow-editor.js`, `public/rule-diagram.js`.

**23 · P2 · Sources and automation expose implementation details as routine inputs.** Source configuration asks for Cloud IDs, SharePoint drive/item IDs and JSON value mappings; remote publishing asks for Jira transition/account/type IDs; automation values can require internal status IDs. These are functional setup surfaces but cognitively different from the rest of the product. Introduce provider-specific steps, searchable choices, mapping rows, permission explanations and a preview. Keep raw IDs/JSON in Advanced settings. Closing a child configuration should return to the source list. Live-provider usability remains to be tested. Implementation: `public/project-sources.js`, `public/project-automations.js`.

**24 · P2 · Drawing and recovery need clearer context.** An open Drawing reuses labels such as Board, Board settings and Expand board, alongside separate device/server checkpoint status. Its gallery links to Local checkpoints and a separate offline pad; Recovery & backups is elsewhere. Reuse the canvas engine but give Drawing an appropriate toolbar and a single status control that expands into device/server detail. Give Recovery one landing point for pending edits, editor drafts, trash, history and drawing checkpoints, with scope labels and links back to the affected item. This should clarify existing safeguards, not remove the offline pad or make local-only data appear server-saved. Implementation: `public/drawing-view.js`, `public/recovery-ui.js`, `public/drawing-offline.js`.

## Cross-view assessment

| Area | Keep | Main change |
| --- | --- | --- |
| Overview | Clickable metrics; explicit all-project scope | Stable view configuration and common task-opening behaviour |
| List | Readable grouped rows; shared task editor | Real action menu; consistent field styling; clearer mobile identity |
| Tree | Ancestor context and complete subtrees | Same task actions and focus restoration as List |
| Table | Grouping, sorting, filter model, keyboard editing | Unified filter entry point; mobile identity and toolbar; compact Columns is now done |
| Kanban | Status columns and common task data | Common task-card actions and field appearance |
| Board | Spatial tools, selection toolbar, project frames | Common task conversation; panel contract; card semantics |
| Drawing | Shared canvas engine, pen tools, checkpoints | Drawing-specific control labels and understandable offline/save state |
| Calendar | Agenda mode, date editing, unscheduled tasks | Responsive control rows and stable date-field layout |
| Timeline | Unscheduled work, schedule preview, explicit paging | Common task actions; improve narrow-layout labels and controls |
| Capacity | Scope explanation, hours/count modes, setup actions | Shared scheduling toolbar and direct links to the right team/person settings |
| Project settings | Dedicated page and project-level scope | Group workflow, hierarchy, fields, teams, sources and automation in one settings navigation |
| People / Teams | Dedicated organisation pages | Consistent section headers, save/dirty behaviour and return paths |
| Sources / Automation | Previews, explicit remote actions, capability limits | Guided choices, reliable draft handling and parent/child navigation |
| Recovery / History | Recoverable drafts, versions and trash | One discoverable recovery hub with clear item and storage scope |

## Proposed shared interaction contract

Use four predictable surface types:

| Surface | Use it for | Behaviour |
| --- | --- | --- |
| Anchored popover | Columns, filter controls, colour, small appearance changes | Open beside the trigger, prefer below, clamp/flip at viewport edges; apply local adjustments immediately; Escape/outside click closes; return focus appropriately |
| Task detail panel | Create, inspect or edit a task from any view | Same field order, action order, dock preference, sizing, autosave and close rules; full-screen on phones |
| Settings page | Project/organisation/workflow/source configuration | Stable section navigation; explicit scope; consistent Save/Discard policy for structural changes |
| Confirmation or review dialog | Delete, restore, import, finalise or publish | Explain affected items and consequences; clear primary/cancel actions; proper focus containment and return |

Comments and History are auxiliary views of the same task panel. Wide layouts show them alongside Details; narrow layouts replace Details with a clearly labelled tab and a return action. Nested pickers close before the containing panel when Escape is pressed.

Common actions should have one name and icon: New task, Open task, Duplicate, Archive, Comments, Version history and Close. Context-specific actions should say what they affect: Remove card from board, Delete task, Restore task, Publish to Jira. Consistent identification helps users recognise repeated operations; it does not require unrelated operations to look identical. [W3C consistent-identification guidance](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html).

For saving, distinguish four states in a stable location: Unsaved, Saving, Saved on server, and Saved locally/pending sync. Give failed validation and conflicts an actionable state. Keep Publish separate from local autosave. Provide contextual undo for operations that support it and say whether undo affects the field, task or board.

## Implementation sequence and acceptance checks

1. **Restore trust and access:** fix comment ownership, unsupported recovery prompts, focus return, mobile IDs/calendar controls, contrast and nested card semantics. These are independent fixes suitable for small changes. Comment migration needs careful handling of existing threads.
2. **Unify shared components:** task-panel shell, auxiliary tabs, field renderers, overlay lifecycle and save-state presentation. Validate entry points across every view before adding more view-specific styling.
3. **Simplify navigation:** stable view configuration, one filter editor with multiple shortcuts, settings sections and complete routes. Preserve saved views and existing shortcuts.
4. **Refine specialist workflows:** source setup, automation choices, drawing context and recovery navigation. Validate provider choices against real accounts and touch interactions on the actual iPad.

The acceptance suite should exercise the **same operation from different places**, not only individual pages:

- Open the same task from each supported view: identical field/action order and save behaviour, documented docking rules, and correct focus on close.
- Comment from a task card, open task details, switch views and reload: the same thread remains visible.
- Edit a field, clear a required value, lose connectivity, close and reopen: no lost input or inaccurate saved/recovery message.
- Open a picker inside a panel: Escape closes the picker first, then the auxiliary view, then the task panel, restoring focus at each step.
- At desktop, tablet and phone sizes: every interactive control is visible or intentionally scrollable, including with a software keyboard. Measure control bounds, not just document overflow. Focus must not be entirely hidden by author-created overlays. [W3C focus-not-obscured guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- Check light/dark and comfortable/compact density with populated tasks, completed items, long names, custom fields, errors and read-only source records.
- Verify Columns, grouping, sorting and filtering with mouse, touch and keyboard. Named views must retain the resulting layout.

## Artifacts and validation

Selected screenshots are under [assets/ui-ux-2026-10-17](assets/ui-ux-2026-10-17). [Evidence summary](assets/ui-ux-2026-10-17/observations.json) records measured panel sizes, focus outcomes, comment separation, the source-draft reproduction, mobile clipping and accessibility scan results. Browser automation selector/navigation failures were excluded from product findings; the reported issues have successful observations or explicit source evidence.

The Columns change passed JavaScript syntax checks, the existing Table browser suite, and the shared project-layout browser suite across all ten views at desktop/mobile sizes. Focused browser checks covered immediate visibility/reordering, retained menu state, Escape, outside click, close-button focus, light/dark appearance and touch layout. These checks establish the scope of this change; they do not resolve the remaining assessment findings.
