# week-time-resize-design

Task: Add a current-time line to Week, fix stacked-event resize ownership with consistently placed handles, and refine the event card design using research.

Implementation status: implemented in the calendar source and regression specs for release 0.23.32. The original marker receipts are retained here as planning history; the paired source markers have been removed.

| Item | File and line | Concern |
| --- | --- | --- |
| item-1 | `public/calendar-hours.js:8` | Current-time indicator rendering |
| item-2 | `public/calendar.js:35` | Current-time update lifecycle |
| item-3 | `public/calendar.css:172` | Current-time indicator styling |
| item-4 | `public/calendar.js:517` | Active-event resize ownership |
| item-5 | `public/calendar.css:230` | Consistent accessible resize handles |
| item-6 | `public/calendar.css:219` | Cohesive event card visual refinement |
| item-7 | `e2e/planning/calendar-hours.spec.mjs:15` | Clock and event design regression coverage |
| item-8 | `e2e/planning/calendar-resize.spec.mjs:31` | Stacked-event hit testing and stable handle coverage |

Skipped items: none.

Research basis:

- [Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout.md): align related content, prioritize important information and keep interactions familiar across sizes.
- [Apple colour guidance](https://developer.apple.com/design/human-interface-guidelines/color.md): preserve semantic colours and readable contrast in light and dark appearances.
- [FullCalendar short-event styling](https://fullcalendar.io/docs/eventShortHeight): small event rectangles can use a condensed content treatment.
- [Fantastical desktop editing](https://flexibits.com/fantastical/help/editing-events-and-tasks): top and bottom edges change the start and end times.
- [Fantastical touch editing](https://flexibits.com/fantastical-ios/help/editing-events-and-tasks): long-press selects the event before moving or resizing it.
- [FullCalendar current-time indicator](https://fullcalendar.io/docs/nowIndicator): the indicator repositions as time advances.

The chosen stripe, spacing, corner handles and emphasis are recommendations for Pencils using its existing tokens, not measurements copied from those apps. Official reference image downloads returned HTTP 403; the research relies on the published documentation, the user's screenshots and inspection of Pencils itself.

Existing defect reproduced in a disposable fixture: First 10:30-11:00, Middle 11:00-12:00, Last 12:00-13:00. The middle card's bottom-handle centre hit Last's start handle; the drag preview resized Last to 12:15-13:00. The drag was cancelled and the temporary vault removed.

Original marker verification: `chisel verify week-time-resize-design` reports `markers: 8`, `files: 5`, `result: PASS`; `week-board-all-day` still reports seven markers and PASS. CLI syntax checks skip CSS and `.mjs`; both newly marked specs passed separate `node --check` runs. `npm run check` passed for 824 JavaScript modules and types; all 749 unit tests passed. Removing the fifteen paired marker blocks restores the original source exactly.

Implementation: All day stays first in Time of day grouping; the dock contains only undated cards. Week has a local-time marker updated without redrawing the grid, fixed corner resize handles with active-event ownership and long-press touch selection, and quieter status-tinted event tiles. Dedicated tests cover touching and narrow overlapping events, all-day creation and reordering, dock membership, the clock, midnight and navigation.

Implementation verification (2026-11-14): syntax and type checks, all 749 unit tests, focused regressions in Chromium, Firefox, WebKit and touch presets, and 385 UI checks passed without retries. Raw touch movement is exercised through Chromium DevTools; WebKit covers the touch geometry and keyboard/pointer interactions.
