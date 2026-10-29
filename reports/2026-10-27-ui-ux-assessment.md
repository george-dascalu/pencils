# Pencils UI/UX assessment — 27 October 2026

Working tree at package version **0.18.43** (deployed container reports the same version). This is an assessment, not a fix: nothing in the product was changed.

## Scope and method

- **Browser evidence.** A local server (`AUTH_MODE=single-user`) ran against a copy of the live vault without `.history`/`.backups`. Chromium captured 302 states: every project view (Overview, Documents, List, Tree, Table, Kanban, Board, Board gallery, Calendar, Timeline, Capacity), Project settings (all ten sections), Help, Home, Organisation home/People/Teams, the 1,134-task Jira project in List/Table/Kanban, and interactions (new task, open task, comments, history, relationship picker, filters, drawer, personal settings, board More/settings/project tasks, command palette, new project/organisation).
- **Viewports.** Phone 390×844; iPad 768×1024, 820×1180, 1024×768, 1180×820 (touch emulation with a real `pointer: coarse` media state via Blink flags); laptop 1280×720; desktop 1440×900. Light and dark on phone, iPad portrait and desktop; light elsewhere.
- **Automated checks per state.** Page overflow, partially clipped interactive elements, interactive targets under 44 px (touch) / 24 px (desktop), clipped text, control-height distribution in the chrome, header landmark positions across views, overlay geometry, visible font sizes, console/network errors, and axe-core WCAG 2.2 AA scans on phone and desktop in both themes.
- **Source audit.** Three read-only passes over `public/` covering breakpoints and device detection, control sizing and dark-theme overrides, and dialog/naming/keyboard patterns. Every source claim quoted below was re-checked by hand before inclusion.
- **Not covered.** Physical iPad/Pencil, iOS software keyboard, screen readers, Jira/SharePoint/Miro live flows, drawing view, account administration.

Evidence: screenshots and JSON under [assets/ui-ux-2026-10-27](assets/ui-ux-2026-10-27); scripts in `assets/ui-ux-2026-10-27/scripts` reproduce the capture against any running instance.

## What holds up well

- Header actions keep the same position on every view: New card, Project settings, Help, avatar, layout switcher and search measured at identical coordinates across all project views at each width.
- The sizing contract in `controls.css` works: every chrome control measured 44 px on touch, 32 px on desktop, 28 px inside menus. No page produced horizontal document overflow.
- No JavaScript errors or failed requests in 302 captures.
- The same full-screen task editor opens from List, Kanban, Table, Calendar and Timeline on phones; dark mode is coherent on List, Table, Kanban, Documents and Settings.
- Phone agenda calendar, phone list rows, the settings page structure and the command palette are clear.

## Priorities

P1 = broken or misleading on a supported device; P2 = recurring inconsistency users must relearn; P3 = polish and dead code.

### P1 — layout breaks on iPad

1. **List and Tree overflow sideways on iPad landscape 1024 with the sidebar open.** Rows carry `min-width: 884px` on touch and only reflow at `max-width: 900px` (viewport, not container), so titles are cut at the right edge while space sits empty between the ID and assignee. `public/task-tools.css:178-195`, `public/task-tools.css:70`. [ipad-1024-list.png](assets/ui-ux-2026-10-27/ipad-1024-list.png). The same metadata-first row order truncates titles at 1180 as well.
2. **Calendar month grid overflows at 1024 and 1180 with the sidebar open**: Sunday is cut and multi-day bars run off the edge. [ipad-1024-calendar.png](assets/ui-ux-2026-10-27/ipad-1024-calendar.png).
3. **Documents at iPad portrait 820 with the sidebar open leaves ~326 px for the editor**: title truncated without ellipsis, the formatting toolbar's Insert button clipped, and the word-count chip overlapping the last line. The 260 px explorer never collapses because every breakpoint keys on the viewport, not `.main`. `public/project-documents.css:12`. [ipad-portrait-documents.png](assets/ui-ux-2026-10-27/ipad-portrait-documents.png).
4. **Two width tiers, no tablet tier.** Shell switches at 780, content at 600, help at 800, with one-offs at 480/520/700/900/950/1000/1050/1099/1150/1600 and JS thresholds that disagree (780: `app.js:792`, `personal-settings.js:6`, `project-documents.js:357`, `calendar.js:10`; 600: `project-layout.js:6`, `phone-board-tools.js:5`, `grid.js:33`, `board-task-editor.js:53`; 800: `help.js:18`). Between 601–780 the drawer has no project navigation while the topbar keeps desktop tabs; at 781–800 the sidebar stays but help/avatar/editor go compact; at 810–834 content is narrower than at 768. Fix direction: container queries on `.main` plus one shared set of constants.
5. **Safe-area rules are no-ops on iOS.** `index.html:5` has no `viewport-fit=cover`, so every `env(safe-area-inset-*)` in `task-tools.css:1151/1158`, `controls.css:67` and `canvas-pro.css:908/940` evaluates to 0. `.shell` also uses `100vh` while `.main` uses `100dvh` (`styles.css:114`, `project-layout.css:31`); dialogs mix `90vh`/`94vh` with `dvh` children.
6. **Settings save footer covers content.** The sticky "No unsaved changes / Discard / Save" bar overlays the last fields on phone, iPad and desktop (the Statuses table header on Statuses & workflow is hidden behind it). `public/project-settings.css:12` is sticky; the scroll container needs matching bottom padding. [phone-settings-workflow-full.png](assets/ui-ux-2026-10-27/phone-settings-workflow-full.png).
7. **Phone Kanban shows one column per screen with no peek or indicator**, so the other four statuses are undiscoverable (`scroll-snap-type: x mandatory`, `project-layout.css:401-420`). [phone-kanban.png](assets/ui-ux-2026-10-27/phone-kanban.png).

### P1 — dark theme and data display bugs

8. **Minimap is painted light in JS** (`canvas-pro.js:1143` `#fafbf7`, `:1153` `#35553d`), so it is a white box on a dark board. [desktop-dark-board.png](assets/ui-ux-2026-10-27/desktop-dark-board.png).
9. **Dark error toasts are not red**: `[data-theme="dark"] .toast` (`appearance.css:476`) has the same specificity as `.toast.error` (`styles.css:1304`) and loads later.
10. **Completed timeline bars look like open ones in dark** (`enhancements.css:453` overridden by `appearance.css:353`), and **calendar cards lose their status tints in dark** (the `color-mix` washes in `task-colors.css:3-13` converge on the dark surface) — compare [desktop-calendar.png](assets/ui-ux-2026-10-27/desktop-calendar.png) with [desktop-dark-calendar.png](assets/ui-ux-2026-10-27/desktop-dark-calendar.png).
11. **Table shows source-owned Jira statuses as the raw id** ("todo") while List shows "To do": `grid.js:193` prints `value` instead of `ctx.statusNames[value]`. The inline source badge in the same cell overflows into the Description column; `.source-badge` and `.source-card` borders use `var(--border)`, which is never defined (`task-tools.css:1198-1206`). [desktop-big-table.png](assets/ui-ux-2026-10-27/desktop-big-table.png).
12. **Undefined/scoped tokens.** `--danger` exists only inside `.board-comments` and `.task-history-panel` with three different fallbacks elsewhere (#bd4940, #b34438, #b64132) and none at `in-place-editing.css:281`; ~35 popover shadows are literal `#0002/#0003`; white text on `var(--green)` turns low-contrast in dark (`selection-toolbar.css:279`, `task-tools.css:593`, `project-documents.css:197`).

### P1 — touch targets and accessibility

13. **Small touch targets measured on phone/iPad**: Kanban column "+" is 14×14 (`app.js:1141`, `.column-header button` has no size); Kanban card title (the open-task target) is 17 px tall; comment formatting buttons are 24×24 because the 44 px coarse rule (`board-comments.css:257`) is overridden by the unconditional 24 px rule at `:266`; Timeline milestone toggle 23×21; `<summary>` rows 19 px tall (People "Availability", Capacity "0 tasks unscheduled", workflow "Statuses", Automation "Run history"); People "Remove" × 24 px wide; Table "↗" open glyph and ⋯ header menus. Relationship-picker row "+" is ~24 px.
14. **axe (WCAG 2.2 AA)**: 176 `target-size` nodes on Table row checkboxes at 13 px on desktop; `color-contrast` 3.06:1 on `.eyebrow` kickers and 2.68:1 on `.count` badges; `.cm-scroller` scrollable region not focusable.
15. **Text under 12 px is the norm for secondary content on touch**: 9 px avatar initials, sidebar "ORGANISATION", board tool group labels; 10 px task IDs, phone statuses, table column names, kanban assignee/priority labels, counts, due dates, version; 11 px table cell values and sidebar nav. 41 distinct `font-size` values and 19 `border-radius` values exist with no scale tokens.
16. **Compact density is ignored on touch** (`controls.css:33-41` overrides `:root[data-density]`), and `touch-action: pan-x pan-y` on `html` disables page pinch-zoom on every touch device (`controls.css:36`).

### P2 — one app, several vocabularies

17. **Card vs task.** Header/command/drawer say "New card" (renamed in 0.18.x), but the editor submits "Create task", Kanban says "Add task" / "Add task to {status}", Table "+ New row", empty state "+ Add a task", Calendar "Add card on {date}", Board "New project task" / "New draft task", palette "Quick capture task"; README and AGENTS.md still say "New task". Likewise "Boards" tab vs "Canvas gallery", "New canvas", "Delete canvas", "Select canvas" vs "Board settings"; the "Delete task" button confirms "Remove this task?" (`app.js:1585`, `:2073`); "Remove connector" vs "Delete connector" for the same action; "Pen preferences" / "More pen settings" / "Close pen settings" in one panel.
18. **Text glyphs vs icons.** "↗", "+ New row", "+ Add source", "×", "⌄", "⋯" sit beside SVG icons for the same intents. The `pencil` icon means Pen tool, draft task, edit grid title, Draft and document edit mode; the close icon also means Remove (relationships, dependencies, feature requests) where other places use trash; the folder icon is both Archive and Organisation/Project.
19. **Planning toolbars disagree.** Calendar has a "Hide weekends" button, Timeline a "Show weekends" checkbox; Capacity uses three selects on a separate row that wraps unevenly at 820. The sort select ("Manual order") renders on Calendar, Timeline and Capacity where it has no visible effect and truncates to "Manual orde" at ≤1024; the shared Filters menu on planning views still contains Group.
20. **Table has four filter entry points** (Filters, Column filters, Advanced filters modal, per-column ⋯) and a six-control second toolbar that wraps to three rows at ≤1180. Merge into one filter editor with chips; move Export matching CSV under Columns or More.
21. **Three large-list strategies.** Table paginates ("Page 1 of 12"), List caps each group at 100 and the badge then reads "To do 100" for 1,134 tasks, Kanban shows "Show 100 more". Pick one and always show true counts.
22. **Dates.** Organisation and Overview dashboards print raw ISO (`planning.js:43`, `:64` `<time>${t.due}`); views show "14 Oct"; inputs show dd/mm/yyyy (and clip to "dd/mm/y" at ≤820); history shows "14/10/2026, 19:18:33". One formatter.
23. **Dialog families.** Settings use four patterns (project page, organisation modal that is also inline on the directory page, personal modal, board popover). Small operations open large centred modals: Save view, Quick capture, New/rename canvas, Display name, Embed note, Object appearance, Frame link, Layers, Advanced filters, Jira sites. Native `confirm()` in 13 places vs an in-app confirm for Documents; project delete asks twice. Comments and History each add a second close button inside the task panel on phone; on desktop and iPad landscape they float as a detached card misaligned with the panel top and overlapping the sidebar. [ipad-landscape-task-comments.png](assets/ui-ux-2026-10-27/ipad-landscape-task-comments.png).
24. **New task vs edit task headers differ**: the new-task panel puts a "New" label and the close button at the top-left beside the type picker; the edit panel puts close top-right with Duplicate/Archive/Delete. [ipad-portrait-new-task.png](assets/ui-ux-2026-10-27/ipad-portrait-new-task.png).
25. **Filters popover layout** centres Status/Type with labels above and left-aligns everything else; on phone it opens as a second popover inside the View options panel and clips "Clear filters" at the bottom. [phone-list-filters.png](assets/ui-ux-2026-10-27/phone-list-filters.png).
26. **Board More menu** is a flat list of 17+ items with saved-view controls at the top; group it (Insert / View / Collaborate / Tools) and give saved views a stable home. The Save view dialog copy still says "includes filters, grouping, sorting and columns" although Save view now exists only on Board (`features.js:204`, `:760`).
27. **Keyboard.** `N` creates a card everywhere but selects the sticky tool on Board (`canvas-controls.js:460`); search is `/`, Ctrl+F (Board, Documents) or Ctrl+K depending on view; zoom-to-selection is both Alt+2 and Shift+2; Alt+arrows reorders, moves cells or shifts dates depending on view; Escape order with nested popovers is ambiguous (window-level handlers in `pen-tools.js:83`, `date-picker.js:173`, `project-layout.js:290`).
28. **Copy.** "Click start, then end" and "Click a row…" on touch (`task-timeline.js:55`, `:60`); Overview hint "All 12 active project tasks · 0 archived tasks excluded. Current project data; list filters do not apply." reads like a developer note; the command palette lists "Workflow & fields" (`features.js:628`) although settings now say "Statuses & workflow" and "Custom fields".
29. **Identity.** Presence shows "Guest 4n1g" in single-user/local mode even though the server knows the user (`app.js:356`, `canvas-pro.js:141`). All project views share one `document.title` ("A little more possibility · Pencils") while organisation pages include the page name; include view and task in the title.
30. **Document word-count chip** (`footer.document-save`, `project-documents.js:421`) overlaps body text on every device. [phone-documents.png](assets/ui-ux-2026-10-27/phone-documents.png).
31. **Phone task editor header** uses icon-only Details/History/Comments tabs without labels and prints the task ID at 9–10 px monospace.

### P3 — polish and dead code

32. Comma-separated "Task types" text field in Types & hierarchy (flagged on 17 Oct, still present).
33. Board gallery: saved-view controls on a gallery page, empty white thumbnails for empty canvases, "Open offline pad ↗" styled as a link among buttons, "Copy canvas link" overflowing its card on phone.
34. Overview's "Project overview" label repeats the header subtitle; the version string appears in both the topbar and the sidebar footer.
35. Date picker (`date-picker.js:24`) and Board settings (`board-background.js:83`) clamp with their own `innerWidth` code instead of `popover-position.js`; `calendar.css` loads after `controls.css` (`index.html:41-42`), breaking the "loaded last" assumption.
36. Dead code: `nodeDialog` is never called and `board-rename` has no trigger (`app.js:1882-1889`); the task-dialog outside-click handler requires `:modal` but the panel opens with `dialog.show()` (`app.js:1196`, `board-task-editor.js:177`); `styles.css:2946` is overridden by `task-tools.css:1112`; `--table-selection-width` is set three times (`controls.css:186/236/259`); `appearance.css:561` avatar size is defeated by `!important`; `calendar.js:10` chooses agenda vs month once and then persists it, so the default differs between a 768 and an 820 iPad.

## Suggested order of work

1. Tablet tier: container-query the List/Tree rows, Calendar grid, Documents explorer and Settings nav on `.main` width; add `viewport-fit=cover`; fix the settings footer padding and the phone Kanban peek. (Items 1–7.)
2. Dark/token pass: minimap colours, toast/timeline specificity, calendar tints, define `--border`, `--danger`, radius and shadow tokens; raise the 12 px floor on touch. (Items 8–12, 15.)
3. Touch targets and axe: column "+", comment toolbar, summaries, checkboxes, kicker/count contrast. (Items 13–14, 16.)
4. Vocabulary and controls: one noun for cards/tasks, one weekends control, one date formatter, one filter editor, one large-list strategy, shared close/remove icons. (Items 17–22.)
5. Dialog contract: fold the small modals into anchored panels, align comments/history with the task panel, unify confirms. (Items 23–26.)
6. Keyboard and copy. (Items 27–31.)

## Artifacts

- `assets/ui-ux-2026-10-27/*.png`: selected captures named `<device>-<theme>-<state>`.
- `assets/ui-ux-2026-10-27/audit.json`, `audit-ipad2.json`, `audit-extra.json`: per-state metrics, landmark rectangles, overlay geometry, axe violations.
- `assets/ui-ux-2026-10-27/scripts/audit.mjs`, `analyze.mjs`, `fonts.mjs`: capture, aggregation and small-text scripts. `BASE` selects the server, `CTX`/`PAGES` narrow the run, `REPORT` names the output.

## Resolution — 27 October 2026

All 36 findings above were addressed in **0.19.0** on the same day. `test/ui-assessment.mjs` holds 44 regression checks, one group per section of this report (tablet layout, dark theme and tokens, targets and axe, vocabulary and controls, dialog contract, keyboard/copy/identity, polish and dead code); all pass on Chromium with real coarse-pointer emulation. The design decisions that the findings left open (card as the creation noun, boards not canvases, delete versus remove, the responsive tier mechanism, which confirms stay synchronous, which small operations become compact dialogs) are recorded in `docs/superpowers/specs/2026-10-27-ui-assessment-fixes-design.md`, and the changelog entry for 0.19.0 lists the user-visible results. Finding 16 (Compact density ignored on touch, page pinch-zoom disabled) was confirmed as intentional per `controls.css` and left as is. A follow-up audit of individual controls is in `reports/2026-10-27-controls-audit.md`.
