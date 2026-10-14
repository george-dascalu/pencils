# Project rules

## Consistency

Keep the interface consistent across all project views: Overview, List, Tree, Table, Kanban, Board, Calendar, Timeline and Capacity.

- Reuse shared components and styles for headers, navigation, menus and common actions. Improve the shared implementation instead of creating a separate version for one view.
- Keep common actions in the same positions, with the same names, icons and keyboard behaviour. Only view-specific tools should vary.
- Use the same spacing, typography, colours and interaction patterns, including light/dark themes and responsive layouts.
- Check affected views on desktop and mobile when changing shared UI. Preserve access to existing actions and settings.

- Use the shared colour picker from `public/color-picker.js` for every colour field: circular swatch, dropdown palette and custom hex editor.

## Changelog

- Update `CHANGELOG.md` in the same change as every user-facing addition, change or fix.
- Keep newest entries first, grouped by version and date (`YYYY-MM-DD`, Europe/London). Describe the user-visible result under Added, Changed or Fixed as appropriate.
- Put work not yet released under Unreleased; assign its release date when deployed. Keep the version consistent with `package.json`.
- Preserve historical entries. If backfilling history, distinguish the date recorded from the actual release date; do not invent dates or version mappings.
