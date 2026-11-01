# Impeccable audit fixes — 2026-11-01

Follow-up to the [technical audit](2026-11-01-impeccable-audit.md), released in Pencils **0.20.122** on 2026-11-01.

## Changes

1. Exact-base board edits opt into compact, versioned acknowledgements. The reply identifies the operation and base revision, carries canonical changed objects and ordering/settings changes, and includes lightweight operation metadata for undo controls. Older clients, stale bases and repeated operations retain full authoritative replies. The client retains drafts on a mismatched acknowledgement and merges edits made during delivery. Background refreshes recognize an acknowledged board revision without rebuilding the page or stealing focus.
2. Callout-title editors use the shared control height (44px on touch), preserving the text size, disclosure button and Markdown. The refreshed audit also caught Table open-card targets narrower than their allocated slot; they now use that slot's width.
3. Wheel/trackpad navigation reuses the existing overview and defers detailed reconciliation until movement settles. Empty selections no longer scan every node and connector. Detail hydration reuses the scene index. Minimap rebuilds read the fallback colour once rather than once per node.
4. Home moves/resizes finish on blur, lost capture and pointer cancellation. They keep the last visible layout, release capture and save once. A subsequent gesture works normally.
5. The seven obsolete audit checks now test current controls, accessible names, menu groups and geometry. The release accessibility suite includes WCAG 2.2, document editors and touch layouts. Associated checkbox labels and enlarged phone-title hit areas are verified explicitly; other target-size findings remain failures.
6. Blanket animation/transition overrides were removed. Shared navigation and cursors stop moving under reduced motion; existing component-specific loading/drag alternatives remain. Formatting-strip buttons also avoid smooth scrolling under reduced motion.

## Measured performance

Same production fixture, Chromium, 1440×1050, Ryzen 9 9950X3D, one worker. These are individual desktop samples, not a physical iPad benchmark. Pan samples include a wheel event and two animation frames and must not be interpreted as FPS.

| Dense board: 100,000 nodes + 200,000 connectors | Audit baseline | After |
|---|---:|---:|
| Pan median / p95 | 155 / 175ms | 33 / 33ms |
| Save reply | 26,478 KiB | approximately 1 KiB |
| Save request | 206 bytes | 225 bytes |
| End-to-end save | 3,315ms | 2,357ms |
| Fit view | 1,361ms | 641ms |
| Initial load | 2,857ms | 2,737ms |

The spread 10,000-node/20,000-connector fixture measured 33/33ms pan median/p95 and a 249ms save, with a reply around 1 KiB. Full-board storage, initial loading and cold overview/fit work still scale with content. The dense case still recorded a 551ms initial long task and two later 265/297ms long tasks across pan/fit; this change does not promise frame-perfect interaction for every dense scene.

Evidence: [before](assets/impeccable-2026-11-01/performance.json), [after](assets/impeccable-2026-11-01/performance-after.json), [phone callout](assets/impeccable-2026-11-01/phone-callout-fixed.png).

## Verification

- Updated diagnostic audit: 44 passed.
- Release checks: 2,094 browser tests passed, 61 skipped, no failures or flaky tests. The existing container was upgraded to 0.20.122 and `/api/health` confirmed the version; Docker reports healthy.
- Unit suite: 416 passed, including canonical rounding, additions/removals, ordering, connectors/settings, legacy clients, conflicts, lost acknowledgements, edits during delivery and mismatched operation identity.
- Focused Chromium, Firefox and WebKit checks cover actual phone/iPad sizing, document editing, gesture cleanup, motion-enabled/reduced-motion flows and overview caching.
- Changed save-protocol lines: all 15 injected faults were caught, with no timeouts or survivors. [Mutation results](assets/impeccable-2026-11-01/save-protocol-mutations.json).
- Visual review confirmed the phone callout's larger hit area retains the existing compact styling.

- Final batch (`GATE_BROWSERS=firefox,webkit npm run test:release`): syntax/types and 416 unit tests passed; 2,450 browser tests passed, 61 skipped, no failures or flaky tests; all four Docker tests passed. This includes heavy board fixtures, phone/iPad flows in WebKit, and the cross-browser gate in Firefox and WebKit.

Physical iPad/iPhone performance, a live screen-reader session and native 200% text resizing remain unverified.
