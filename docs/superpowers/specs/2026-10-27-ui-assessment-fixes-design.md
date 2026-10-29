# UI assessment fixes — design

Date: 2026-10-27. Source spec: `reports/2026-10-27-ui-ux-assessment.md` (36 numbered findings). The owner asked for all of them to be fixed. This document records only the decisions that the report left open.

## Decisions

1. **Noun for creation actions is "card"**, matching the deliberate 0.18.x rename of the header action. Every creation entry point says card: New card, Add card, Add card to {status}, Create card, Add a card, New project card, New draft card, Quick capture. The entity keeps the name "task" where it already describes the record (task editor, Delete task, Project tasks, task IDs). README and AGENTS.md follow.
2. **Boards, not canvases, in the UI.** Gallery heading, New/Delete/Select/Name/Copy link actions say board. The `.canvas` file format keeps its name in help text.
3. **Delete versus remove.** Deleting a record (task, board, view, project, connector) says Delete and confirms with the same word. Unlinking from a list (relationship, dependency, feature request attachment) says Remove and uses the close icon; deletion uses the trash icon. Archive uses a dedicated archive icon.
4. **Responsive tiers.** Two shared thresholds remain: 600 (phone content) and 780 (phone shell, drawer). Content that depends on the available width of `.main` (list/tree rows, calendar grid, documents explorer, settings navigation, table toolbar) uses viewport media queries combined with the sidebar state on `:root` (an expanded sidebar is 210 px up to 1150 px and 236 px above; a collapsed one is 0), so the sidebar's presence is accounted for while style changes stay synchronous with resizes. Container queries were rejected because `container-type` applies layout containment, which re-roots `position: fixed` popovers inside `.main`; JS-driven width tokens were rejected because they race the resize event. JavaScript reads the same thresholds through one helper (`public/layout-width.js`). The 800 px rules move to 780.
5. **Touch keeps 44 px controls and keeps page pinch-zoom disabled** (both documented as intentional in `controls.css`). Compact density on touch is therefore a no-op by design; no change.
6. **Keyboard.** `N` stays the sticky-note tool on Board (Miro convention) and New card elsewhere; the shortcuts guide states both. Zoom to selection keeps Shift+2 only; Alt+2 is removed. Inside the task panel, Escape closes the innermost open surface first (picker, then comments/history pane, then the panel).
7. **Large lists.** Table, List and Tree keep the shared pager (selection scope is per page) and Kanban keeps "Show 100 more"; group badges show the true total across pages.
8. **Dates.** One formatter (`public/format-date.js`) renders day dates as "14 Oct" (with the year when it differs from the current year) and timestamps as "14 Oct 2026, 19:18". Native date inputs keep the browser locale.
9. **Confirmations.** One shared in-app confirm popover anchored to the trigger replaces native `confirm()` for destructive and irreversible actions. The two synchronous navigation guards (closing a dirty editor, leaving dirty settings) keep `window.confirm` because callers need an immediate answer.
10. **Small modals.** Save view, Display name, Frame link, Layers, Bulk notes, Embed note, New board and Quick capture open in a compact dialog sized to their content. Advanced filters stays a review dialog because it is a query editor.
11. **Typography floor on touch**: secondary text is at least 12 px and avatar initials 10 px under `pointer: coarse`. Desktop sizes are unchanged.
12. **Deployment.** One release (0.19.0) at the end with changelog, rollback image and health check, as AGENTS.md requires.

## Testing

A new browser test `test/ui-assessment.mjs` holds one check per finding group and is written before each group is implemented. Existing browser and unit suites must stay green; label changes update the affected tests.
