# Project rules

## Consistency

Keep the interface consistent across all project views: Overview, Documents, List, Tree, Table, Kanban, Board, Calendar, Timeline and Capacity.

- Reuse shared components and styles for headers, navigation, menus and common actions. Improve the shared implementation instead of creating a separate version for one view.
- Keep common actions in the same positions, with the same names, icons and keyboard behaviour. Only view-specific tools should vary.
- Use the same spacing, typography, colours and interaction patterns, including light/dark themes and responsive layouts.
- Check affected views on desktop and mobile when changing shared UI. Preserve access to existing actions and settings.
- Use the shared sizing tokens in `public/controls.css` for buttons, fields and menu controls. Preserve Compact mode and 44px touch targets instead of introducing local heights.

- Use the shared colour picker from `public/color-picker.js` for every colour field: circular swatch, dropdown palette and custom hex editor.
- The top bar names only the open board or document, or the project when nothing is open, with no organisation or project crumbs (`public/topbar-title.js`, synced on navigation and renames).
- Settings live on one page (`public/project-settings.js`) with You, Project and Organisation sections, opened from the single Settings button in the top bar. Don't add settings dialogs or more settings buttons.
- In the toolbar row, the view switcher, search and filters sit on the left and the view's own controls on the right: a view's renderer returns `{ controls, html }` and `renderView` puts the controls in the toolbar's `.view-controls` slot; phones put them in View options. Don't add a second bar for a view's controls.
- Documents have one bar: formatting on the left, the document's controls on the right; the document name shows in the top bar.
- Use one sidebar. View-specific navigation, such as the document list, goes in the main sidebar's section for the open view on iPad and desktop, and in a drawer level with a back arrow on phones (`#sidebar-documents`, `data-drawer-level`). Don't add a second sidebar or menu button for one view. On phones the top bar's view tabs become a floating, rounded bottom bar of icons (Overview, Documents, Planning, Tasks, Boards, then a divider and Search, which opens the search dialog; iPad and desktop show the same Search button after the view tabs in the top bar) that hides while typing; tapping the open Tasks, Planning or Documents tab again shows a tray above the bar (`.layout-tray`, mounted with `public/layout-tray.js`): the Tasks or Planning layouts, or Documents (the document list) and the document views (Live preview, Source, Reading). With no document open, tapping Documents lists documents. The sidebar (and the phone drawer) starts with Personal and Today, then the organisation, projects and teams, with Settings and Help at the bottom in the drawer; don't put views back in it. The personal space is a documents-only project (`personal: <username>`): it shows only the Documents view and the You settings.
- On touch screens, only a tap on a text field may open the keyboard. Move focus into text with `focusOnOpen` (`public/open-focus.js`), which leaves it on the control on touch. Controls placed inside an editable area rely on `public/editable-controls.js`, because iOS Safari focuses the editor when such a button is tapped. `reports/assets/ui-ux-2026-10-27/scripts/keyboard-audit.mjs` checks every view.
- Show task fields in one order in every component: card type, ID, assignee, status, priority (then dates). This covers List/Tree rows, phone summaries, the card editor, relationship rows and pickers, board task cards and default Table columns. Where space is tight, show the assignee as an avatar only and keep the name in its accessible label and tooltip.
- Wherever assignee, status and priority appear together they sit in one box (`field-box`, with `fieldBoxStyle` from `public/task-colors.js`): a neutral surface fill, a 1px border in the priority's colour and the shared `--field-radius` corners. Priority colours are a project setting (Settings → Workflow), with the defaults in `task-colors.js`. Fields inside the box have no border or fill of their own and show their value's colour on the text (assignee avatars are rounded squares, not circles). Table cells, which hold one field each, keep a single-field chip with the value's colour on its border and text. The card editor shows the fields at control height. Lists (List and Tree rows, relationships, Table, Kanban) use the smaller list chip from `--list-field-*` (24px, 32px on touch), centred inside a full-height 32px/44px target so there is room above and below. List and Tree rows draw their box at list-chip height behind the full-height targets. Use the `field-chip` and `field-box` classes and the shared rules at the end of `public/controls.css` instead of styling these fields per view. Board cards keep their document-scale size with the same shape. In List and Tree rows the title follows the ID.

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

## Testing

- `npm run check` (syntax, types) and `npm test` (unit) take seconds; run them on every change. Browser tests are Playwright Test specs in `e2e/<area>/` (`npm run e2e`, or a folder, file or `-g` title filter).
- `npm run release` runs the browser tests a change needs: `scripts/affected.mjs` maps the files changed since the last release commit to areas (a module counts for every area whose code imports it), adding `e2e/ui` (sizing, visual rules, accessibility) for any change to `public/`. Shared code and shared styling (`controls.css`, `styles.css`, `appearance.css`, `enhancements.css`, `project-layout.*`, `app.js`, `features.js`, `server/`) run every test, and so does a file the map doesn't know. `npm run e2e:affected` runs the same selection while you work. Add new source files to the map. The map works by file, so a component stylesheet edit that changes `:root` tokens or element-wide selectors needs `npm run e2e` instead.
- The `@heavy` scale tests (100,000-object boards, thousands of pasted objects, 100 members) run in the batch check, or with `HEAVY=1`; the map adds them when board data, selection or server code changes.
- Judge a run by Playwright's summary (its failed and flaky counts) or the test command's own exit status, never by the exit status of a pipeline that ends in `tail` or `grep`.
- Keep every test passing. When a change in intended behaviour breaks a test, update it in the same change. Never leave a test failing; a known bug may be marked `test.fail()` with its reason until fixed.
- Write tests with `e2e/fixtures.mjs` (`useApp`, `onDevices`, device presets) as described in `e2e/README.md`. Wait for page state with web-first assertions instead of fixed delays.
- Audits, which report findings instead of guarding a change (such as `ui-assessment`), are tagged `@audit` and run only with `--project=audit`.

## Deployment

- Deploy each completed new feature as soon as its relevant checks pass, within the same task.
- This is standing authorization to deploy to the existing Pencils environment; do not wait for a separate deployment request or confirmation unless the user explicitly asks to hold deployment.
- Write the user-visible changes under `## Unreleased` in `CHANGELOG.md`, then release with `npm run release -- patch`. It runs the checks, unit tests and the browser tests the change needs, sets the version everywhere, dates the changelog, keeps the vault and container settings, tags `pencils:rollback-before-<version>`, waits for `/api/health` to report the new version (restoring the previous image if it doesn't) and tags `pencils:release-<version>`.
- When the queue of requested changes is empty, run the batch check before the final report: `GATE_BROWSERS=<installed engines> npm run test:release` (every test including `@heavy`, the `@gate` tests in Firefox/WebKit and the Docker check). Fix any failure with a patch release.
- Verify the running version and application health after deployment. Report any blocker clearly and distinguish local changes from changes that are live.
- When a new version is released, commit it and push it to the remote (`origin`).
