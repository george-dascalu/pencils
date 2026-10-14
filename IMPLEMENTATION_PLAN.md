# Current implementation work

Requested 2026-10-14: implement all recommendations from the Miro component review, plus a dedicated Project settings page, workspace-unique project keys and sequential KEY-ID task identities, and task cards that visualise existing project tasks.

Completed and deployed as v0.12.0 on 2026-10-14 (Europe/London). All 101 unit/API tests passed, along with focused Chromium/Firefox and mobile/dark browser checks. Docker write/read checks passed with networking disabled. The deployed application passed a read-only smoke check across all eight project views, settings, task identities and arrow selection.

- [x] Project keys, stable non-recycled task numbers, backwards-compatible migration, aliases and tests.
- [x] Project settings page, task IDs throughout views, searchable board task picker and board-created tasks in project list.
- [x] Shared object text controls: font size, vertical alignment, optional auto-fit, copy/paste style; bulk sticky creation.
- [x] Connectors: manual bends, automatic attachment, movable/multiple labels, line jumps and connected-object creation.
- [x] Grid: merge/unmerge preserving data, auto/manual sizing, fit contents, vertical alignment and inline insertion controls.
- [x] Frames: thumbnails, deep links, relative paste, selected-frame PDF export.
- [x] Selection/layout: multiselection resizing, rotation, match dimensions, tidy layout and named hideable/lockable layers.
- [x] Live task views: switch embedded Table/Kanban/Timeline, filters/fields and shared task mutations.
- [x] Timeline: direct date drag/resize, scales, milestones, dependency lines and unscheduled tasks.
- [x] Navigation/accessibility: personal mouse/trackpad mode, object/container keyboard navigation, keyboard resizing, disable single-key shortcuts.
- [x] Shapes/images: flowchart shapes, borders, rotation, reversible crop and replacement preserving identity/geometry/connections.
- [x] Pen: partial eraser, lasso, separate presets, simple shape recognition.
- [x] Collaboration: opt-in presenter follow, bring everyone here, timer and voting over local server.
- [x] Arrow multiselection, mixed selection filtering, shared arrow styles, copy/duplicate, Delete/Undo and graph movement.
- [x] Focused model/browser tests; syntax and regression checks; changelog/docs.
- [x] Offline Docker validation; deploy and read-only production smoke.

Constraints: retain offline operation, Markdown and Obsidian compatibility, shared controls, safe undo, current scroll-to-zoom default, and Shift axis-constrained resizing. Do not spawn agents. Preserve pre-existing uncommitted work.
