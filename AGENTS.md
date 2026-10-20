# Project rules

## Consistency

Keep the interface consistent across all project views: Overview, Documents, List, Tree, Table, Kanban, Board, Calendar, Timeline and Capacity.

- Reuse shared components and styles for headers, navigation, menus and common actions. Improve the shared implementation instead of creating a separate version for one view.
- Keep common actions in the same positions, with the same names, icons and keyboard behaviour. Only view-specific tools should vary.
- Use the same spacing, typography, colours and interaction patterns, including light/dark themes and responsive layouts.
- Check affected views on desktop and mobile when changing shared UI. Preserve access to existing actions and settings.
- Use the shared sizing tokens in `public/controls.css` for buttons, fields and menu controls. Preserve Compact mode and 44px touch targets instead of introducing local heights.

- Use the shared colour picker from `public/color-picker.js` for every colour field: circular swatch, dropdown palette and custom hex editor.

## Dialogs and contextual panels

- Prefer small, contextual panels near the component or action that opened them. Reuse the shared panel styles, positioning and keyboard behaviour.
- Keep the surrounding page usable for routine actions; support dismissal with Escape, a close button and clicking or tapping outside.
- Use blocking or fullscreen dialogs only when interaction must be stopped for a warning, a major action or another substantial workflow. Do not default to a large centered modal for a small operation.
- Keep panels within the viewport on desktop, iPad and mobile, with scrolling inside the panel when needed.

## Changelog

- Update `CHANGELOG.md` in the same change as every user-facing addition, change or fix.
- Keep newest entries first, grouped by version and date (`YYYY-MM-DD`, Europe/London). Describe the user-visible result under Added, Changed or Fixed as appropriate.
- Put work not yet released under Unreleased; assign its release date when deployed. Keep the version consistent with `package.json`.
- Preserve historical entries. If backfilling history, distinguish the date recorded from the actual release date; do not invent dates or version mappings.

## Deployment

- Deploy each completed new feature as soon as its relevant checks pass, within the same task.
- This is standing authorization to deploy to the existing Pencils environment; do not wait for a separate deployment request or confirmation unless the user explicitly asks to hold deployment.
- Update the release version and changelog, preserve the existing vault and retain a rollback image.
- Verify the running version and application health after deployment. Report any blocker clearly and distinguish local changes from changes that are live.
