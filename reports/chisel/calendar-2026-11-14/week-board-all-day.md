# week-board-all-day

Task: Place all-day activities above the days in Week board grouped by Time of day.

Implementation status: implemented in the calendar source and regression specs for release 0.23.32. The original marker receipts are retained here as planning history; the paired source markers have been removed.

| Item | File and line | Concern |
| --- | --- | --- |
| item-1 | `public/calendar.js:470` | All day row and dock membership |
| item-2 | `public/calendar.js:470` | Closing the emptied dock |
| item-3 | `public/calendar.css:289` | Content-sized All day track |
| item-4 | `e2e/planning/week-board-daypart.spec.mjs:56` | Daypart behavior coverage |
| item-5 | `e2e/planning/week-board-narrow.spec.mjs:50` | Narrow layout coverage |
| item-6 | `e2e/planning/week-board-arrange.spec.mjs:33` | Dock arrangement scope |
| item-7 | `e2e/planning/week-board.spec.mjs:185` | Row label and ordering coverage |

Skipped items: none.

Original marker verification: `chisel verify week-board-all-day` reports `markers: 7`, `files: 6`, `result: PASS`. The CLI skips syntax checks for CSS and the four `.mjs` specs; all four specs passed a separate `node --check`. `npm run check` passed for 824 JavaScript modules and types, and `npm test` passed all 749 unit tests.

All seven source changes are two-line comment blocks; removing the paired markers restores the original source exactly.

Implementation: All day stays first in Time of day grouping; the dock contains only undated cards. Week has a local-time marker updated without redrawing the grid, fixed corner resize handles with active-event ownership and long-press touch selection, and quieter status-tinted event tiles. Dedicated tests cover touching and narrow overlapping events, all-day creation and reordering, dock membership, the clock, midnight and navigation.

Implementation verification (2026-11-14): syntax and type checks, all 749 unit tests, focused regressions in Chromium, Firefox, WebKit and touch presets, and 385 UI checks passed without retries. Raw touch movement is exercised through Chromium DevTools; WebKit covers the touch geometry and keyboard/pointer interactions.
