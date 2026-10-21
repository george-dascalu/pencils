# Board zoom transitions — 2026-10-21

Release: 0.18.11. Also centres the shared project navigation, including New task.

## Reproduction

The deployed Test Project canvas contains 288 objects and 132 connectors, including 240 task placements. A read-only Chromium 149 session at 1500 × 1000 repeatedly zoomed from 10% to approximately 24% and back, using three cycles of four wheel events in each direction. Each event was separated by 70 ms, with 450 ms settling between directions. The same board, camera, browser and wheel sequence were used for the comparison. Initial presence updates were allowed to settle before measurement.

Baseline used deployed 0.18.10 assets. The local comparison substituted the production build of 0.18.11 while retaining the same live API and board data. Browser frame intervals, long tasks, DOM mutations and Chrome DevTools performance metrics were recorded. No board content was changed.

## Findings and changes

- Crossing the old 12% boundary created up to 80 rich card elements together. Cards now hydrate in batches of four; remaining objects stay visible in the bitmap layer. Visible and selected objects have priority, while DOM order preserves the board's stacking order.
- Precise connector routing and SVG labels now hydrate in batches of eight. Remaining connectors stay visible as bitmap previews.
- A bounded cache retains up to 80 detached card elements for nearby zoom reversals. Content updates invalidate cached cards so edits cannot reappear stale.
- Separate thresholds enter medium detail at 14% and return to bitmap overview at 10.5%. This avoids repeated switching when zoom fluctuates near 12%. The higher detail tier uses the same approach around 40%.
- Zoom previously changed inherited sizing variables across the entire board. Grid handle sizing now updates only grids, and touch target sizing updates only for coarse pointers. Touch targets retain their screen size.

## Measured results

| Measurement | 0.18.10 | 0.18.11 production assets |
| --- | ---: | ---: |
| Median frame interval | 16.7 ms | 16.7 ms |
| 95th percentile frame interval | 50.0 ms | 16.8 ms |
| Longest frame interval | 116.6 ms | 33.4 ms |
| Frames longer than 34 ms | 37 | 0 |
| Long tasks of at least 50 ms | 5 | 0 |
| Style recalculation time | 2340.2 ms | 413.9 ms |
| Script time | 418.9 ms | 626.2 ms |
| Layout time | 159.3 ms | 288.9 ms |
| Main-thread task time | 3436.3 ms | 2001.1 ms |

Work is distributed across more frames, so script and layout totals increase while the large pauses and inherited style recalculations decrease. Fully hydrating 80 cards takes about 20 animation frames; their bitmap representations remain visible in the meantime. DOM mutation totals include moves that preserve stacking order and are not counts of newly constructed cards.

These are single-machine desktop measurements, not guaranteed frame rates on all hardware. Large boards, unusually complex descriptions and coarse-pointer devices need separate representative measurements. The 100,000-object regression validates functional scale, not a universal interactive frame-rate guarantee.

## Verification

- Chromium and Firefox transition regressions: at most four distinct card promotions and eight connector promotions per frame, stacking order, cached DOM reuse, threshold stability, fresh content after remote updates, bitmap selection and grid sizing.
- Unit coverage for zoom-detail thresholds, board changes and camera motion.
- Board performance, 100,000-object / 200,000-connector regression, canvas browser workflows, grid controls and pointer/touch controls passed.
- Project layout checks cover all shared views, desktop/mobile widths, sidebar states and navigation centring. Screenshots checked at 1440 px with the sidebar collapsed and 1280 px with it open.
- Syntax/build checks and whitespace validation passed.

Benchmark artifacts: `/tmp/pencils-zoom-transition-before.{json,cpuprofile,log}` and `/tmp/pencils-zoom-transition-final.{json,cpuprofile,log}`. The repeatable regression is `npm run test:board-zoom-transition`.

## Deployment verification

Deployed 0.18.11 to the existing Pencils service with the vault backed up and `pencils:rollback-before-0.18.11` retained. The health endpoint and running package version confirmed 0.18.11.

A fresh browser session using the deployed assets confirmed the navigation centre exactly matches the header centre, and the displayed version is v0.18.11. The same zoom sequence measured a 16.8 ms 95th percentile and 33.3 ms longest frame interval, with no frames over 34 ms, no long tasks and no browser errors. Main-thread task time was 1935.6 ms, including 407.0 ms of style recalculation. Artifacts: `/tmp/pencils-zoom-transition-deployed.{json,cpuprofile,log}`.
