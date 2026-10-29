# Pencils controls and components audit — 27 October 2026

Working tree at package version 0.19.0 (after the UI/UX assessment fixes of the same day). Scope: every interactive control family (buttons, inputs, selects, checkboxes, toggles, sliders, segmented controls, chips and badges, menus and popovers, feedback, icons) and the layout between and around them. The question asked was: do controls of the same kind look, lay out and behave the same, and use the same icons?

## Method

- **Measured.** A Playwright probe (`reports/assets/ui-ux-2026-10-27/scripts/probe-controls.mjs`, tallies in `controls-tallies.txt`) rendered 16 pages and 6 opened panels at 1440 px desktop and 390 px phone and recorded, for every visible control, its height, padding, radius, font, border, background, icon size and accessible name. Variants were tallied per family.
- **Reviewed.** A read-only source pass over `public/*.js` and `public/*.css` traced each family's CSS sources, hover/active/focus/disabled rules, keyboard handling, ARIA state attributes and the controls used for the same intent in different views. Claims below marked (source) come from that pass; claims marked (measured) come from the probe.

## What is consistent already

- Control heights are uniform: 32 px desktop, 44 px touch, 28 px inside menus, on every page measured (measured).
- Header actions, the layout switcher and search sit at identical coordinates across views (measured in the earlier assessment).
- Dialog footers always order secondary before primary; no footer carries two primaries (source).
- All but one icon-only control have an accessible name (measured: capacity toggle has a `title` only).
- Dropdown panels, pickers and popovers now share the shadow token; most share a 10 px radius (measured).

## Findings by family

### Buttons

| Variant | Where | What differs |
| --- | --- | --- |
| `.button` vs `.button.small` | about 60 render sites use `small` | Identical on screen: the sizing contract overrides the small padding and 11 px font with `!important`, so `small` is a dead modifier (measured: same 32 px / 8 px / 13 px signature). |
| `.icon-button` | everywhere | Font size inside varies (10, 11, 12, 13, 14 px) because it inherits from the parent; icons inside are 16 px except 13 px in comment tools and 14 px in editor footers (measured). |
| `.selection-action` | board toolbars | 18 px icons where the contract says 16: an ID selector in `selection-toolbar.css:52` wins (source). |
| `.add-row`, `.text-link` | tables, dates | Outside the contract: 11 px text, 14 px icon; `.text-link` is an unstyled 11 px action ("Clear dates", "Automatic range") (source). |
| Bare `<button>` | sidebar, dashboards, calendar days | No class, sized by context: 44 × 10 px sidebar entries, 63–71 px dashboard rows (measured). |

Behaviour and state (source):

- `button:focus` in `enhancements.css:12` draws a ring on mouse click; elsewhere `:focus-visible` is used. Ring widths mix 1 px `--focus-ring` with 2 px green (project-layout, task-colors, table-tools, task-tools, help).
- Disabled controls use `cursor: wait` at 0.45 opacity (`styles.css:59`), 0.35 in pen and selection toolbars, 0.65 in task relationships.
- Hover is `#ecefe5` on icon buttons, `--surface-soft` on rows and buttons, none on bare buttons.
- Same intent, different control: remove-a-row is an icon-button × (People), a text `.button.small` (Teams), an icon-button trash (workflow) or a `.button.small` with a close icon (rule diagram). Board settings is a labelled `.button.small` in the toolbar, an icon-only `.button.small` beside zoom and a `.selection-action` in pen tools. Full screen is a `.button.small` showing "⛶" next to an `.icon-button` expand. Clear filters is `.button.soft` in List and `.button.small` in Table. Close in dialog footers is `.button`, `.button.primary` ("Done") or `.button.small`.
- Primary and soft used as state: the pen tool button turns `primary` when active; People/Teams marks the current page with `.soft`.
- About 15 local size rules no longer apply because of the contract's `!important` (canvas-pro, board-comments, project-layout, task-tools, table-tools, task-attachments, styles).

### Text inputs and textareas

- Three text sizes in one form: textareas 12 px (outside the contract), title inputs 14 px, other inputs 13 px (source; measured 12/13/14/16 px inputs on settings and documents).
- Borders: base `#dce0d5`, search/filter `#e3e6dc`, toolbar and custom-field inputs `#c7d0bf`, `#bac6ad`, `#bcc8b3`; radii 7, 6 and 5 px (source).
- Focus: inputs get a green border plus the 1 px ring from `enhancements.css`, so the ring is doubled; textareas use the grey `--text-focus-color` (source).
- Placeholder colour is set only for `.search`; all others use the browser default (source).
- Labels: 99 fields label above; Priority and Dates use a `div.field > span` that is not associated with the control; some fields carry only an `aria-label`; the main `#search` lacks `type="search"` and only 2 of 13 search fields show the magnifier (source).
- Validation: `aria-invalid` is styled only for list titles; `.form-error` has `role="alert"` in two popovers and none in dialogs; its position is top of body in some forms and after the fields in others (source).
- Saving models differ between near-identical forms: task dates autosave, timeline range needs "Apply range"; settings pages show Discard/Save/status, People/Teams show Save plus a hint; board settings autosave; new tasks need Create card while existing ones autosave (source).

### Selects and dropdowns

| Mechanism | Trigger | Keyboard | Panel |
| --- | --- | --- | --- |
| Native select + `select-menu.js` | browser caret, or a 12 px custom caret in toolbars | arrows, Home/End, Escape, type-ahead | 6 px padding, 16 px icons |
| Task picker (`task-modal.js`) | 12 px chevron that does not rotate | arrows, Home/End, Escape, no type-ahead | 6 px padding, 18 px icons |
| `details.board-menu` | caret icon that rotates | arrows, Home/End, Escape | 8 px padding; width 320 in JS but 260 in CSS, max height 560 vs 540 |
| Date field | calendar button | opens with Alt+ArrowDown only | 12 px padding |

- The task editor uses the task picker for Type and Priority but select-menu for Status and Assignee in the same row; list rows use select-menu for Priority (source).
- Native selects render in 16–17 visual variants across pages: bordered form selects, borderless table-cell selects with tinted backgrounds, the borderless organisation crumb, and the toolbar `.filter` (measured).
- `.filter` selects shrink to a 110–150 px max width and their 11 px font no longer applies (source).

### Checkboxes, radios, toggles and sliders

- Native checkboxes are 13 px with the label after the box in all 24 cases; the green `accent-color` is applied in board settings, task tools and the selection toolbar but not in personal settings, filters, workflow or teams (source; measured 13 px boxes in 8 contexts).
- Completion boxes (`.check-button`) and selection boxes (`.task-checkbox`) share a 13 px box but show checked state differently (green outline with soft fill versus solid green with a white tick); `.check-button` has no `aria-pressed` (source).
- Toggles: weekends, snapping and formatting use `aria-pressed` buttons; "Show card IDs" and "All links" use checkboxes; the board tools use a bare `.active` class with no ARIA state (source).
- Sliders: pen sliders show an output and `aria-valuetext` with a green accent; pattern spacing shows an inline value without `aria-valuetext`; crop sliders keep the base input border and padding and show no value; the offline pad slider has neither output nor accent (source).

### Segmented controls and tabs

Seven segmented controls, seven active treatments (source): project tabs use a 2 px underline with `aria-current`; the layout switcher a soft fill with green border and `aria-pressed`; document modes a surface fill with green border; the task pane switcher green text with an inset ring; pen presets an inset ring identical to hover; People/Teams `.button.soft` with `aria-current`; the selection toolbar a fill only. `.md-tabs` has CSS and JS but no markup renders it.

### Chips, badges, counts and avatars

- Counts: section badges 10 px with background, tab counts 9 px, column counts 10 px without background, table group counts 11 px, directory counts 11 px, People/Teams counts unstyled (source).
- Tags are 9 px with radius 4 and hard-coded hex colours; status/priority badges are radius 5 with colour-mix tokens (source).
- Avatars are 29 px forced to 32 px; assignee chips are 24 px, or 22 px in rows. Priority icons appear at 12, 15, 16 and 18 px depending on the surface (source; measured 13/14/15/16/17/18 px icons inside buttons).

### Menus, popovers and panels

- Padding differs per panel: 6 px (select menu, task picker), 8 px (board menus), 10 px (selection popover, colour picker), 12 px (date picker, mobile view options), 14/16 px (confirm popover), 0 with a 12–16 px header (board settings, document panels). Radii are 8, 10 or 12 px; the radius tokens introduced today are used twice (source).
- Headers: board settings uses a 16 px h2 with Reset and close; document panels a 15 px h2; the confirm popover a 14 px strong; the task-dates popover has no title (source).
- Focus: only the confirm popover keeps Tab inside; other popovers close when focus leaves (source).

### Feedback

- Save status is rendered five ways: topbar 10 px text with a 13 px icon, task footer 11 px, board 10 px "Saved automatically", documents only on problems, settings a 12 px status line, plus "Changes save automatically" hints in two forms (source).
- Empty states use two systems: `.empty` (dashed box, 25 px serif heading, 28 px icon) and `.document-empty` (no box, 20 px heading, 32 px icon); the timeline empty state has neither icon nor text; the call-to-action is soft, primary, plain or small depending on the view (source).
- Loading text uses `role="status"` inconsistently; toasts cannot be dismissed (source).

### Icons

- The base icon is 18 px, the contract sets 16 px, and exceptions produce 13, 14, 15, 17 and 18 px icons inside the same kinds of control (measured).
- Remaining Unicode glyphs used as icons: ⛶ (full screen), ‹ › (date picker months), ↶ ↷ ← (offline pad), "← Previous / Next →" (pagination), ⠿ (drag handles in pen tools, task reorder and grid) while the calendar uses `icon("drag")`. Inline SVGs bypass `icon()` in five files (source).
- Duplicate icon paths: `documents` equals `file`, `priority-low` equals `down` (source).

### Spacing between and around controls

- `.field` bottom margins are 17, 11, 5, 20, 12 or 0 px; label gaps 7, 4 or 3 px (source).
- Dialog footer padding is 17/25, 12/18, 16/24, 12/16 or 10/12 px with gaps of 8, 9 or 10 px (source).
- Toolbar gaps: project toolbars use the 4 px token, table view tools 6–7 px, grid tools 6–8 px, feature toolbar 8 px, canvas extra tools 5 px, document toolbars 2 px (source; measured container gaps in `controls-tallies.txt`).
- Icon-to-label gap is 4, 5, 6, 7, 8, 9 or 12 px depending on the control (source).

## Prioritised list

P1 (behaviour or accessibility), P2 (visible inconsistency), P3 (polish).

1. P1 · Replace `button:focus` with `:focus-visible` and unify the ring (1 px `--focus-ring`); remove the doubled ring on inputs.
2. P1 · Give board tools and `.check-button` an `aria-pressed` state; use one ARIA pattern per segmented control (`aria-pressed` for toggles, `aria-current` for navigation).
3. P1 · Add type-ahead to the task picker and make Type/Priority/Status/Assignee use one dropdown mechanism in the task editor.
4. P1 · Style `aria-invalid` for all inputs; give every `.form-error` `role="alert"` and one position (below the field it concerns).
5. P1 · Add `type="search"` to `#search`, the magnifier icon to all search fields and an associated label to Priority and Dates.
6. P2 · Remove the dead `.button.small` modifier (or define a real small size) and delete the ~15 local size rules the contract overrides.
7. P2 · One text size per form: textareas and title inputs join the 13 px contract (16 px on touch).
8. P2 · One input border colour and radius token; placeholder colour from a token.
9. P2 · One control per intent: remove-a-row (icon-button with the close icon), Board settings (labelled button everywhere), Full screen and Expand (icon buttons with icons), Clear filters (`.button.soft`), footer Close (`.button`).
10. P2 · Stop using `primary` and `soft` as state: active tools and the current directory tab use `aria-pressed`/`aria-current` styling instead.
11. P2 · Disabled state: one opacity (0.45) and `cursor: not-allowed`.
12. P2 · Checkboxes: green `accent-color` everywhere; one checked look for completion and selection boxes.
13. P2 · Sliders: shared `.range` styling with output and `aria-valuetext`; crop sliders drop the input border.
14. P2 · Segmented controls: one active treatment (soft fill + green border, as the layout switcher) and distinct hover.
15. P2 · Counts and badges: one size (11 px) and one radius for `.count`, `.tab-count`, `.directory-count`, `.tag` and status badges; tags move to colour tokens.
16. P2 · Icons: one size inside controls (16 px) with the 18 px exception removed from the selection toolbar; replace the remaining glyphs (⛶ ‹ › ↶ ↷ ← → ⠿) with `icon()`; delete the duplicate paths.
17. P2 · Popovers: one padding (10 px), one radius token, one header pattern (title + close) and keep Tab inside every popover.
18. P2 · Save status: one component (icon + "Saved automatically" / "Saving…" / "Waiting to save" / "Saved locally") at one size, used by the topbar, task footer, board and documents.
19. P2 · Empty states: one component (`.empty`) with one call-to-action class; the timeline gets text and an icon.
20. P2 · Date popovers: task dates and timeline range share one save model (autosave with Undo) and one header.
21. P3 · Spacing tokens: field margin, label gap, dialog padding, toolbar gap and icon-label gap each get one value.
22. P3 · Toasts: dismissible with Escape or a close control.
23. P3 · Loading: `role="status"` on every loading message.
24. P3 · Remove `.md-tabs` CSS and JS.
25. P3 · Avatars and assignee chips: 24 px everywhere except the 32 px header avatar.

## Resolution (0.19.1, 2026-10-27)

Regression checks: `node test/ui-controls.mjs` (16 checks). Items 1, 2, 4, 5 (search type and magnifier), 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 (sizes), 16, 17 (padding and radius token; dates editor title), 19, 21 (field, dialog and icon-gap tokens), 22, 24 and 25 are done. Item 3: type-ahead and the caret are done; the picker and the shared select menu already share one stylesheet and now one behaviour on touch, but remain two surfaces. Partial or remaining:

- 5 · Priority and Dates triggers in the task editor still rely on `aria-label` rather than a visible associated label.
- 15 · Status badges and tags keep their literal colours; only sizes and radius were unified.
- 17 · Popover headers are not yet one shared pattern and Tab is not trapped in every popover.
- 18 · Save status: the sizes match (12 px) but the topbar, task footer, board and documents still render separate markup.
- 20 · Task dates and the timeline range keep their separate save models.
- 23 · Loading messages: Miro import and the attachment preview announce; the task date editor and main view use `aria-busy` only.

## Artifacts

- `reports/assets/ui-ux-2026-10-27/scripts/probe-controls.mjs` renders the pages and writes `controls.json`; `controls-tallies.txt` holds the per-family variant tallies, icon sizes, unlabeled icon buttons, layout container spacing and badge variants for desktop and phone.
