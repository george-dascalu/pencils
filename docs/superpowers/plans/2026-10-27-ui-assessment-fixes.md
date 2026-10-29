# UI assessment fixes — implementation plan

> **For agentic workers:** executed inline in this session (superpowers:executing-plans). Each group starts with failing checks in `test/ui-assessment.mjs`, then the smallest change that makes them pass, then the existing suites.

**Goal:** Resolve the 36 findings in `reports/2026-10-27-ui-ux-assessment.md` and release them as 0.19.0.

**Architecture:** Vanilla JS/CSS under `public/`; container queries on `.main` for width-dependent content; one shared `layout-width.js` for JS thresholds; one `format-date.js`; one shared confirm popover; tokens added to `styles.css` `:root` with dark values in `appearance.css`.

**Tech stack:** Node 22, Playwright (Chromium) browser tests, `node --test` unit tests, esbuild bundle (`npm run build`).

**Check commands:** `node test/ui-assessment.mjs` (new), `node test/check.mjs`, `npm test`, the browser suites touched by each group, finally `npm run test:release`.

---

### Group 1 — tablet layout (findings 1–7)

Files: `public/project-layout.css`, `public/task-tools.css:196-235`, `public/calendar.css:9-13`, `public/project-documents.css:340-380`, `public/project-settings.css:233-281`, `public/project-documents.js:357,597`, `public/help.js:18`, `public/enhancements.css:630`, `public/styles.css:114,1105,1175,1359,1666,2232,2491,2662,2946`, `public/index.html:5`, `public/kanban-layout.js:38-45`, new `public/layout-width.js`.

- [ ] Failing checks: list at 1024 touch has no horizontal overflow in `#view-content`; calendar month at 1024 fits `.calendar-scroll`; documents at 820 give the editor ≥ 500 px; settings at 820 give `.settings-content` ≥ 480 px; viewport meta contains `viewport-fit=cover`; settings footer never covers the last control on phone; phone kanban shows the second column's left edge.
- [ ] `.main.project-main { container: main / inline-size; }`; convert the ≤900 and ≤600 `.task-row` blocks, the documents ≤780 blocks, the settings ≤1050/≤780 blocks to `@container main (...)`.
- [ ] Calendar `min-width: calc(var(--calendar-columns) * 80px)`.
- [ ] `layout-width.js` exports `mainQuery(max)` with `matches` + change listeners (window resize, `pencils-appearance`); use it in `project-documents.js` and `help.js` (780).
- [ ] 800 → 780 in `enhancements.css` and `styles.css`; `vh` → `dvh` in the listed rules; `viewport-fit=cover`.
- [ ] Settings footer: `#settings-panel` gets `padding-bottom` equal to the footer height when the footer is sticky/fixed.
- [ ] Kanban peek: subtract 36 px from the column width when more columns exist than fit.

### Group 2 — dark theme and tokens (8–12, 15)

Files: `public/canvas-pro.js:1143,1153`, `public/appearance.css`, `public/styles.css:1304`, `public/enhancements.css:453`, `public/task-colors.css:3-13`, `public/task-tools.css:1198-1206`, `public/in-place-editing.css:281`, `public/selection-toolbar.css:279`, `public/task-tools.css:593`, `public/project-documents.css:197`, shadow sites (`select-menu.css`, `date-picker.css`, `project-layout.css`, …), `public/controls.css` (type floor).

- [ ] Failing checks: dark board minimap canvas pixel is dark; `.toast.error` background differs from `.toast` in dark; `--border` and `--danger` resolve on `:root`; dark calendar card washes differ between two statuses; on phone no element in list/table/kanban renders text under 12 px except `.task-assignee` (≥10 px).
- [ ] Minimap reads `--surface`/`--line` from `getComputedStyle(document.documentElement)`.
- [ ] Add `[data-theme="dark"] .toast.error` and `[data-theme="dark"] .timeline-bar.complete` overrides; raise dark `--task-color-wash` mix share.
- [ ] Define `--border`, `--danger`, `--shadow-popover`, `--radius-*` in `:root` and dark; replace literal `#0002/#0003` shadows with `var(--shadow-popover)`; replace `#fff` on green with `var(--paper)`.
- [ ] `@media (pointer: coarse)` floor: the identified classes use 12 px; `.task-assignee` 10 px.

### Group 3 — targets and axe (13–14)

Files: `public/app.js:1141`, `public/styles.css:952`, `public/board-comments.css:257-266`, `public/task-timeline.js:59`, `public/board-upgrades.css:383`, `public/teams.js:51`, `public/capacity.js`, `public/workflow-editor.js`, `public/project-automations.js`, `public/controls.css` (checkbox target 24 px desktop), `.eyebrow`/`.count` colours.

- [ ] Failing checks: on phone every visible button/summary in kanban, timeline, people, capacity, workflow and task comments is ≥ 44 px on both axes except `.calendar-resize`; on desktop table row checkboxes have a ≥ 24 px target; axe reports no `color-contrast`, `target-size` or `scrollable-region-focusable` on list/table/kanban/documents/home/org-home.
- [ ] Column "+" becomes `.icon-button`; card title gets `min-height: var(--control-height)` on coarse; move the 24 px comment-tools rule above the coarse block; summaries and milestone toggles get `min-height: var(--control-height)`; "×" text buttons become `.icon-button` with the close icon.
- [ ] `--task-checkbox-target: 24px` on desktop; `.eyebrow` and `.count` colours pass 4.5:1 in both themes; `.cm-scroller` tabindex removed in reading mode.

### Group 4 — vocabulary and controls (17–22)

Files: `public/app.js`, `public/grid.js`, `public/features.js`, `public/calendar.js`, `public/task-timeline.js`, `public/canvas-pro.js`, `public/canvas.js`, `public/board-background.js`, `public/project-layout.js`, `public/table-tools.js`, `public/planning.js`, `public/help-content.js`, `public/pen-tools.js`, `public/connector-toolbar.js`, `README.md`, `AGENTS.md`, new `public/format-date.js`.

- [ ] Failing checks: no visible text matches /New row|Add task|Add a task|Create task|Quick capture task|Canvas gallery|New canvas|Delete canvas/; Timeline and Calendar both render a `[data-weekends-toggle]` button; the sort select is absent on Calendar/Timeline/Capacity; the Table second toolbar has ≤ 4 controls; List group badge equals the true count and a "Show 100 more" button exists for 1,134 tasks; dashboard `<time>` text matches /\d{1,2} \w{3}/; no "↗"/"×"/"⌄"/"⋯" text nodes inside buttons.
- [ ] Rename labels; replace glyphs with `icon()`; shared weekends toggle; hide sort/group on planning; move Advanced filters into Column filters and Export into Columns; List/Tree "Show 100 more"; `format-date.js` used by `planning.js`, history and relationship rows.

### Group 5 — dialog contract (23–26)

Files: `public/app.js:1159-1300,2073`, `public/features.js:373,759-790,909,924`, `public/grid.js:603,663`, `public/project-settings.js:111,187`, `public/recovery-ui.js`, `public/canvas.js:353`, `public/project-documents.js:585`, `public/board-task-editor.js:44-60`, `public/task-tools.css:554,1112,1185`, `public/board-comments.js`, `public/task-history.js`, `public/canvas-pro.js:1971,2288`, `public/board-layout-tools.js:48`, new `public/confirm-popover.js`.

- [ ] Failing checks: no `window.confirm` call during task delete (stub `confirm` to throw); the comments pane has no close button of its own; on desktop the aux pane top equals the task panel top and its left ≥ sidebar right; new-task and edit headers place the close button in the same corner; Save view opens an anchored popover; the Board More menu has ≥ 3 group headings; Filters popover labels are left-aligned.
- [ ] `confirm-popover.js` generalised from the Documents confirm; replace all 13 `confirm()` calls; project delete confirms once.
- [ ] Aux pane: same top as panel, clamped inside `.main`, no inner close; phone keeps tab switching.
- [ ] Header parity, compact dialog width class, Save view popover, More menu groups, Filters layout.

### Group 6 — keyboard, copy, identity (27–31)

Files: `public/canvas-controls.js:453`, `public/board-comments.js` (key swallowing), `public/task-timeline.js:55,60`, `public/planning.js:43`, `public/features.js:628`, `public/app.js:356,728`, `public/canvas-pro.js:141`, `public/navigation.js` / `public/app.js` (document.title), `public/project-documents.css` (`.document-save`), `public/board-task-editor.js` (phone tab labels), `public/help-content.js` (shortcuts).

- [ ] Failing checks: presence name equals the signed-in user's name; `document.title` contains the view name on List; timeline copy contains no "Click"; palette has no "Workflow & fields"; `.document-save` does not intersect the last `.cm-line`; phone editor tabs expose visible text labels.

### Group 7 — polish and dead code (32–36)

Files: `public/project-settings.js` (task types editor), `public/app.js` (gallery, overview label, nodeDialog, board-rename, outside-click), `public/board-preview.js` (empty thumbnail), `public/date-picker.js:24`, `public/board-background.js:83`, `public/index.html:41-42`, `public/styles.css:2946`, `public/controls.css:186-259`, `public/appearance.css:561`, `public/calendar.js:10`.

- [ ] Failing checks: Types & hierarchy renders a chip editor with Add/Remove; gallery has no saved-view select; empty boards show an "Empty board" placeholder; topbar has no `.app-version`; `controls.css` is the last stylesheet; `nodeDialog`/`board-rename` absent from `app.js`.

### Release

- [ ] `npm run test:release`; bump `package.json` to 0.19.0; `CHANGELOG.md` entry dated 2026-10-27; build image, tag rollback `pencils:rollback-before-0.19.0`, `docker compose up -d --build`, verify `/api/health` version and a smoke page load.
