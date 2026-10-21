# Backend changes and board capacity

Assessed on 2026-10-20 for fewer than 100 concurrent users, a few projects, and hundreds of tasks and documents per project.

## Decision and implemented changes

Keep Node.js and the Markdown vault. This workload does not currently justify changing language, introducing a separate database as the source of truth, or rewriting the frontend. The measurements below support this direction, subject to testing on the actual deployment hardware and network.

1. **Separate backend domains.** HTTP routes now live in `server/http/routes/`, grouped into authentication, workspace, projects, imports, documents, boards, attachments and records. Task, document and board operations are extracted into `server/services/`. `Store` continues to own safe vault access, revisions, journal transactions and change notifications.
2. **Introduce TypeScript and Fastify incrementally.** The HTTP application, route modules, request context, shared access checks and helpers are TypeScript. Fastify owns routing, bounded request parsing and initial request validation. Existing domain validation, permissions, response shapes, SSE, backups and APIs remain. Existing domain/storage modules are still JavaScript, with an explicit typed compatibility boundary; this is not a claim that the entire backend has been converted.
3. **Reduce work in the writer queue and HTTP event loop.** Provider fetches and previews run outside vault transactions, with per-project source-operation serialization. Local sync application remains transactional and checks the project schema again before writing. SQLite search and table queries run in a worker thread. Normal task changes update only affected index rows. Unrelated document, board or project changes do not rebuild that task index.

Additional measured improvements:

- Normal task text/status/date edits no longer scan the complete hierarchy and dependency graph when those relationships have not changed.
- Concurrent project snapshots share in-flight reads. File reads use bounded concurrency.
- Watched project rows use a short projection cache, capped at one second and invalidated by external changes. Successful local writes update their own projection. File revision checks still use the actual file. Platforms without filesystem watchers do not use this cache.
- A successful transaction no longer discards every parsed record. Rollback still invalidates caches.

Markdown/YAML task and document files and JSON `.canvas` boards remain authoritative. SQLite remains disposable and rebuildable. No vault format migration or document conversion is required.

## Backend measurements

`test/backend-capacity.mjs` creates an isolated temporary vault with three projects, each containing 301 tasks and 101 documents. It opens 100 authenticated sessions and 100 SSE connections, then performs 1,200 requests: 200 task reads, 200 task saves, 300 table queries, 200 searches and 300 snapshots. Saves use distinct tasks so they measure throughput rather than intentional edit conflicts.

Environment: Node 22.22.1, AMD Ryzen 9 9950X3D, 32 logical processors, local `/tmp` storage. Client and server use loopback in the same test process; indexes and caches are warmed first. These are local synthetic measurements, not production latency guarantees, physical-device measurements, or 100 people editing the same board.

| Operation | Staggered median / p95 | Synchronized burst median / p95 |
| --- | ---: | ---: |
| Task read | 1 / 3 ms | 21 / 123 ms |
| Task save | 5 / 13 ms | 1,352 / 1,766 ms |
| Table query | 3 / 5 ms | 6 / 14 ms |
| Search | 3 / 8 ms | 9 / 19 ms |
| Project snapshot | 6 / 17 ms | 13 / 92 ms |

Both runs completed without request errors. The staggered run starts users 100 ms apart with one second between actions: 60 requests/second over 20 seconds. The burst uses 25 ms between actions: 325 requests/second over 3.7 seconds. HTTP event-loop p95 was 11–12 ms; process RSS was 259–337 MiB.

The initial implementation tested during this work had approximately 14-second p95 saves under a synchronized burst. Removing unnecessary scans and global parse-cache invalidation reduced that measured queue delay substantially. This is a comparison between intermediate implementations on this machine, not a controlled comparison against the previous production release.

**Interpretation:** the requested scale is credible for one Node process on a reliable local SSD, with warmed indexes and ordinary staggered activity. The single writer intentionally remains the consistency boundary; synchronized writes queue. Provider network delays no longer occupy it. This does not certify cheap hosting, network-mounted vaults, cold-start performance, sustained bulk imports, multi-process writers or simultaneous collaborative typing. Measure those separately if required. Do not run multiple independent writer processes over the same vault.

## Board capacity today

Enforced limits:

- 10,000 objects and 20,000 connectors per board.
- 500 frames and a 16 MB board API request limit.
- 12 MB for a native canvas import.
- Up to 650 detailed object DOM elements chosen by the viewport renderer. Each object can itself contain many elements.
- Presence tracks up to 100 active participants per board; this is a presence cap, not a tested collaboration capacity.

Object count is a poor predictor of responsiveness. Visible connector count, object complexity, overlap, frame nesting and zoom matter more.

`test/canvas-capacity.mjs` uses production assets, Chromium 149.0.7827.55, a 1440 × 1050 viewport and the same local host. Pan timings measure an input followed by browser frames, so they are interaction samples rather than a direct FPS benchmark. Results:

| Board fixture | Initial load | Pan median / p95 | One-object save | Save request |
| --- | ---: | ---: | ---: | ---: |
| 1,000 spaced objects, 400 connectors | 212 ms | 33 / 35 ms | 45 ms | 279 KiB |
| 5,000 spaced objects, 2,000 connectors | 281 ms | 33 / 37 ms | 138 ms | 1,426 KiB |
| 10,000 spaced objects, 20,000 connectors | 1,685 ms | 47 / 54 ms | 434 ms | 5,166 KiB |
| 2,500 densely overlapping objects, 5,000 connectors | 3,379 ms | 826 / 988 ms | 198 ms | 1,262 KiB |
| 650 rich task cards, 200 connectors | 410 ms | 33 / 182 ms | 56 ms | 159 KiB |

All fixtures completed without browser errors. The existing 5,000-object performance test also passed, including viewport retention, touch pinch and pen pressure.

The spaced fixtures initially mounted only 56 detailed objects. Zooming out mounted up to 650. The maximum fixture reached about 49,000 DOM elements and 5,806 visible connectors; the dense fixture reached 43,000 DOM elements and all 5,000 connectors. Rich task cards caused individual main-thread tasks over one second when zooming out. The maximum board cannot necessarily fit entirely at the current minimum zoom.

The original recorded `fitMs` values included the subsequent save. That instrumentation was corrected; those values are excluded here. Load, pan, save and payload measurements use independent timing boundaries.

**Practical limit:** several thousand spaced, simple objects are workable in this desktop fixture. Dense boards can become unpleasant at only 2,500 objects, and hundreds of fully rendered rich cards can stall when zoomed out. There is no defensible universal “smooth up to N objects” claim from these tests, especially for phones. The 10,000-object limit is a storage/validation ceiling, not a performance promise.

## Comparison with Miro: theoretical capacity

Scope clarified on 2026-10-20: compare published/enforced maximum capacity. A live Miro board benchmark is not required, and there is no outstanding request for Miro access.

| Measure | Pencils today | Miro published guidance |
| --- | --- | --- |
| Maximum board content | 10,000 nodes plus 20,000 connectors; also bounded by 500 frames and a 16 MB API request | 100,000 board objects |
| Practical working size | Depends on content: spaced 5,000-node fixture worked well locally; dense 2,500-node fixture was slow | Recommends fewer than 5,000 objects; slowdowns can start around 1,000 |
| Meaning of the maximum | Application validation ceiling, not a smooth-rendering guarantee | Published capacity ceiling, not a smooth-rendering guarantee |

Miro's figures come from its [board performance guidance](https://help.miro.com/hc/en-us/articles/360013588560-Board-performance-and-loading-issues), verified 2026-10-20. Miro describes a total object limit; Pencils separately limits nodes and connectors. This comparison does not establish an exact speed ratio or identical counting rules.

### Implications for Pencils

There is no evidence that Markdown storage or Node.js inherently imposes the current 10,000-node limit. It is an explicit application limit. However, removing it alone would leave the measured rendering and whole-board save costs in place. Content size can also hit the request-byte limit before the object-count limits.

A future 100,000-object capacity target is an engineering goal, not a capability demonstrated by this implementation. It would require the improvements below: spatial indexing, cached connector routing, adaptive rendering detail, incremental saves and loading board regions on demand. The public Miro maximum can serve as a capacity reference while each Pencils increase is validated locally.

For the stated product workload, prioritize reliable interaction with hundreds of rich task cards and several thousand simple objects, then increase the cap in measured stages. A universal maximum that remains smooth cannot be inferred from either product's object ceiling; visible complexity, media, connector density and device capabilities still determine responsiveness.

## Why the board slows down

Code inspection in `public/canvas-pro.js`, `public/viewport-cache.js` and the canvas renderer found:

- Camera changes rebuild node/frame lookup structures and scan/rank nodes to choose visible DOM objects.
- Connector visibility and routing still scan large edge sets. Obstacle routing inspects board nodes; optional crossing jumps compare routes against other connectors, adding an expensive near-quadratic path.
- Camera reconciliation rebuilds SVG connector paths and redraws the minimap/bitmap instead of invalidating only changed geometry.
- A bounded count of rich cards can still produce tens of thousands of DOM elements, controls and Markdown nodes.
- A small object movement still serializes a whole board and sends both base and current board state for merging. The maximum fixture sent about 5 MB for a 10-pixel movement. Serialization, local draft persistence, parsing, history and network traffic all grow with total board size.

The backend improvements above help shared reads, saves and search. They do **not** fix the dense-board rendering bottleneck.

## How to raise the useful limit

Implement and benchmark in this order:

1. **Cache connector geometry and cull edges spatially.** Recompute a route only when its endpoints or relevant obstacles change. Defer crossing jumps while dragging. Draw inactive connectors on a canvas layer, retaining accessible DOM/SVG controls for selected connectors and labels.
2. **Index node geometry and frame membership.** Maintain a spatial index and parent lookup incrementally. Panning should primarily update transforms and entering/leaving objects. Redraw the minimap only when board geometry changes.
3. **Adapt detail to zoom and device.** At overview zoom, render task title/status summaries rather than every editor, dropdown and description. Use an element-cost budget instead of only an object-count budget; retain selected and focused controls.
4. **Send operations rather than whole boards.** Introduce revisioned object/connector deltas, merge them transactionally, and distribute deltas over live updates. Continue writing portable `.canvas` snapshots. Preserve offline recovery and explicit conflicts.
5. **Load large boards in sections.** Page frames/regions and attachments, then evaluate a higher object cap. Splitting very large work into separate boards is the immediate workaround.

Suggested acceptance targets for the next optimization work: p95 pan samples below 50 ms in both spaced and dense fixtures; no repeated interaction tasks over 100 ms; ordinary single-object saves below 250 ms on the deployment network; payload size proportional to the edit. These are targets, not results already achieved. Only raise the hard caps after desktop, tablet and phone tests meet the agreed targets.

## Reproduce

```bash
npm ci
npm run check
npm test
npm run build
node test/backend-capacity.mjs
PACED=1 node test/backend-capacity.mjs
node test/canvas-capacity.mjs
node test/canvas-performance.mjs
PRODUCTION_ASSETS=1 node test/document-components.mjs
PRODUCTION_ASSETS=1 BROWSER=webkit node test/document-components.mjs
```

All benchmark fixtures are temporary. Run performance suites sequentially on an otherwise idle machine. Generated JSON results are written under `artifacts/`; they are intentionally not version-controlled.
