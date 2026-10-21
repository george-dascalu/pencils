# Frame capacity and detail transitions — 2026-10-21

Release: 0.18.14. The frame cap increases from 500 to **10,000**. The 100,000-object and 200,000-connector limits remain unchanged. Frames also count toward the object limit; the gauge retains its user-requested 80,000-object target.

## Method and limits of the measurements

Isolated temporary vaults, Chromium 149, Node 22, AMD Ryzen 9 9950X3D, 1500 × 1000 desktop viewport. Each synthetic frame contains one sticky note. Flat fixtures space frames 1,000 units apart; nested fixtures use groups of five; dense fixtures use 20-unit spacing and deliberate overlap; deep fixtures put every frame inside the previous frame.

To explore beyond the old cap, validation was temporarily raised to 100,000 frames locally. This exploratory limit was never deployed. The production limit is 10,000. No user board content was modified by the benchmarks.

Pan measurements include a wheel event and two animation frames, so these are interaction samples, **not FPS**. Fit timings include a deliberate 250 ms settling wait. Load times stop at the initial board render, not every possible detail or attachment. Saves move a frame and its child through the guarded-delta API. These tests do not qualify low-end phones or simultaneous editing by 100 people.

## Where performance deteriorated

The original outline opened every frame row and thumbnail and repeatedly scanned the entire board. At 5,000 flat frames it took **3,192 ms**; at 5,000 frames in five-level groups it took **6,452 ms**. Paginating to 50 rows, limiting thumbnail primitives, indexing tree traversal and using spatial thumbnail queries reduced the corresponding exploratory measurements to **32 ms** and **29 ms**.

Higher counts did not produce a single crash boundary. With the optimized outline, 25,000 flat frames / 50,000 objects loaded in 1,008 ms and saved in 491 ms. At 50,000 flat frames / 100,000 objects, load was 1,886 ms and save was 1,184 ms, while pan p95 remained 34 ms. These runs had no connectors or rich task cards.

The selected 10,000-frame cap leaves ordinary spaced-board saves near 200 ms on this machine rather than adopting the largest count that happened to load. Heavy overlap can still be slow well below that cap.

Final production-build measurements:

| Layout | Frames / objects | Initial load | Pan p95 | Open outline | API save |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flat | 10,000 / 20,000 | 465 ms | 33 ms | 47 ms | 214 ms |
| Groups of five nested frames | 10,000 / 20,000 | 431 ms | 33 ms | 42 ms | 213 ms |
| Dense overlapping frames | 10,000 / 20,000 | 2,016 ms | 138 ms | 1,733 ms | 261 ms |
| One deeply nested chain | 5,000 / 10,000 | 318 ms | 61 ms | 47 ms | 106 ms |

Before parent-chain reuse, the deep case loaded in 3,137 ms and saved in 1,359 ms. Dense overlap remains the clearest unresolved bottleneck: spatial queries return many candidates and overlapping rectangles create substantial paint work. A hierarchical spatial index and a cached/worker-rendered overview are future work; increasing a numeric cap alone would not fix this.

## Bulk paste and correctness

An actual keyboard copy/paste duplicated 5,000 frames plus 5,000 children into 10,000 frames and 20,000 objects. An intermediate implementation took **99,685 ms** to render and save. Indexed selection membership, mounted-only control updates, spatial frame lookup and preserving copied-container membership reduced the same workflow to **816 ms**. This comparison includes intermediate fixes, not a claim about the old 500-frame production release.

Pasting no longer repeatedly re-adopts unrelated original children into every copied frame. Existing frames keep their children, copies receive new IDs and maintain their own parent links. Tests verify saving, reloading, native vault contents, frame-page navigation and 10,000 presentation IDs. Ordinary drawing and dragging still adopt contained objects.

Validation and collapsed visibility reuse resolved ancestor chains; server validation still rejects missing parents, non-container parents and cycles. Deep frames remain below their content in the visual and hit-test stacking order. A browser draft rejected by the older frame cap receives a fresh save attempt after reload; current-limit failures and conflicts remain blocked for correction.

## Detail-to-bitmap animation

Detailed objects fade out over 140 ms and in over 180 ms, keeping the bitmap underneath until the detail settles. Zoom reversals continue from the current opacity. The transition reuses mounted DOM and the existing bounded detail cache; it does not capture images, clone the board or run a second canvas animation loop. Reduced motion skips the fade. Selecting an object stops its fade so it remains directly editable and draggable.

A read-only comparison used the same live Test Project canvas (3,456 objects), viewport, camera and repeated 10%–24% zoom sequence as the prior release:

| Measurement | v0.18.13 | Animated build |
| --- | ---: | ---: |
| Median frame interval | 16.7 ms | 16.7 ms |
| 95th percentile frame interval | 16.8 ms | 16.8 ms |
| Longest frame interval | 33.4 ms | 33.4 ms |
| Frames over 34 ms | 0 | 0 |
| Main-thread tasks over 50 ms | 0 | 0 |

## Reproduction

- `node test/frame-capacity.mjs`: isolated stress fixtures. `FRAME_CASES` accepts comma-separated names such as `flat-10000,nested-10000,dense-10000,deep-5000`; `PRODUCTION_ASSETS=1` uses the build. Counts above 10,000 require an explicit local change to the validation cap for exploration.
- `node test/frame-scale.mjs`: real bulk copy/paste, persistence, pagination and presentation checks.
- `node test/board-zoom-transition.mjs`: progressive hydration, crossfade directions, cached content, bitmap selection and reduced motion. Supports `BROWSER=firefox` and `PRODUCTION_ASSETS=1`.
- `test/board-scale.test.js`, `test/frame-limit-recovery.test.js`, `test/frame-model.test.js`, `test/grid-containment.test.js`: scale, hierarchy, recovery and membership regressions.

Raw local measurements: `/tmp/pencils-frames-baseline.json`, `/tmp/pencils-frames-after.json`, `/tmp/pencils-frames-extreme.json`, `/tmp/pencils-frames-release.json`, `/tmp/pencils-frame-scale-final.log`, `/tmp/pencils-zoom-transition-01814-before.json`, `/tmp/pencils-zoom-transition-01814-animated.json`.

## Release verification

Forty relevant model/API tests passed, along with Chromium and Firefox zoom transitions, reduced motion, bitmap mouse/touch interactions, frame workflows, the updated capacity gauge, and browser recovery from a 10,001-frame rejection. The final production bulk-paste rerun saved in 776 ms. Desktop/mobile outline captures, type/syntax checks, build and whitespace checks passed.

Deployed v0.18.14 with the vault backed up and `pencils:rollback-before-0.18.14` retained. Live health and version checks passed; the live board gauge showed `288 / 10,000 frames`. The deployed zoom check again measured 16.8 ms p95, 33.4 ms maximum, no intervals over 34 ms and no tasks over 50 ms. Artifacts: `/tmp/pencils-zoom-transition-01814-deployed.json` and `/tmp/pencils-01814-deployed.log`.
