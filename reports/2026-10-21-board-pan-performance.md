# Board panning at 35% zoom

Measured 2026-10-21 against “Test Project canvas”, using production assets in Chromium 149 at a 1500 × 1000 viewport. Release 0.18.10 addresses the measured bottleneck.

## Reproduction

The board contained 288 objects: 240 task placements, 24 frames, 12 sticky notes and 12 grids, with 132 connectors. At 35% zoom, 67 detailed objects produced 2,203 elements inside the canvas world. The underlying tasks and their descriptions were small; server requests were not on the panning path.

Each run used the same camera and 40 vertical pan steps, waiting two animation frames after each wheel event. The sample time includes that deliberate wait and is **not** an input-latency or FPS measurement. Frame intervals were collected separately. Results are local headless-browser measurements, not a guarantee for other devices or larger boards.

## Cause

Broad ancestor `:has()` selectors on the page, shell, main area and view content caused small board DOM changes to invalidate styles across thousands of elements. A trace recorded 19 style passes over roughly 3,500–3,700 elements during six pan steps.

Panning also replaced the unchanged zoom label and participant markup. Those unnecessary mutations repeatedly triggered the expensive selectors. At lower zoom, more rich task cards were present, increasing the cost of each pass.

## Change

- Record layout state when navigating instead of deriving page layout from arbitrary descendant changes.
- Set expanded-board scroll locking explicitly and clear it when leaving the board.
- Update the zoom label only when its displayed percentage changes.
- Keep participant and cursor markup when its content is unchanged, with caches tied to their actual container elements so rerendered boards initialize correctly.

Detailed card rendering and object limits are unchanged.

## Before / after at 35%

| Measurement | 0.18.9 | 0.18.10 local production build |
| --- | ---: | ---: |
| Total style recalculation, 40 pans | 1,188.8 ms | 12.2 ms |
| Total browser main-thread work, 40 pans | 1,605.4 ms | 338.2 ms |
| Pan sample median, including two-frame wait | 39.3 ms | 33.3 ms |
| Pan sample p95, including two-frame wait | 52.6 ms | 33.4 ms |
| Frame interval p95 | 33.4 ms | 16.7 ms |

Style work decreased about 99%; total browser work decreased about 79%. Checks at 100%, 50%, 40%, 25% and 10% also completed at a steady frame cadence after the change.

## Verification

The existing 5,000-object performance regression checks stable toolbar DOM, continuous culling, zoom, touch and pen input. Shared layout coverage checks all nine task/planning/board views on desktop and mobile. Expanded-view coverage checks page scrolling, navigation away and return, persisted preferences, and Escape. Multi-tab presence coverage checks that participant and selection changes remain live.

An outdated navigation-centering assertion was corrected to match the existing version-indicator layout; the layout itself was preserved.

The comment test now uses the existing rich-text composer, and the document-width test selects an escaped token instead of expecting line-wide source reveal. Initial presence refreshes are allowed to settle before assertions about retained DOM and open menus.

## Deployment verification

Release 0.18.10 is deployed and healthy, with a vault backup and rollback image retained. The final live-board run at 35% recorded 11.5 ms of style work and 335.6 ms of total main-thread work across 40 pans, with a 16.7 ms frame-interval p95 and no browser errors. The board still contained 288 objects. The only write requests from profiling were normal presence heartbeats; board content was unchanged.

Passing checks: type/syntax checks, production build, 5,000-object performance, board controls in Chromium and Firefox, nine-view desktop/mobile layout, document widths, and board editing/multi-tab presence. After the layout attribute was renamed to avoid navigation-control collisions, the affected Chromium navigation, presence, shared-layout and document checks were rerun successfully.

Local diagnostic artifacts: `/tmp/pencils-board-zoom-before.json`, `/tmp/pencils-board-zoom-after.json`, `/tmp/pencils-board-style.trace.json` and `/tmp/pencils-board-35-before.cpuprofile`.
