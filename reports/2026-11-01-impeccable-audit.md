# Impeccable technical UI audit — 2026-11-01

Pencils **v0.20.121**, commit **a335baa**. Audit only: no application changes or deployment.

## Implementation integrity verdict: pass, with specific gaps

Pencils has a coherent implementation for a working application: shared control sizes, one navigation system, reusable field boxes and menus, Markdown editing and consistent light/dark surfaces. The fresh rendered captures do not support a redesign. The main gaps are large-board interaction cost, one undersized editing target, an interrupted gesture that stays active, and outdated audit checks.

The detector returned **15 findings**. Context checks identified functional canvas grids, status indicators, drag markers, a resize grip, an indeterminate loading indicator, user-selectable fonts and the existing palette. These are not counted as product defects. No detector ignores or design settings were changed.

## Executive summary

**Health: 15/20 — Good; address the weak dimensions.** Scores apply to the sampled surfaces, not formal WCAG certification.

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 3/4 | No contrast or naming violations in the sampled screens; the separate callout-title editor is only 21–22px high. |
| Performance | 2/4 | Closed-board loading is bounded, but an active 100,000-node board sends a 25.9MiB save response and dense panning still produces long tasks. |
| Theming | 4/4 | Reviewed light/dark screens and interactions remain readable and consistent; no verified theme defect in this sample. |
| Responsive design | 3/4 | All 78 base captures fit; the callout target and Home gesture interruption need work. |
| Implementation integrity | 3/4 | Shared components are consistent; seven older audit checks use obsolete assumptions and a global reduced-motion reset remains. |
| **Total** | **15/20** | **Good** |

**Six findings: P0: 0 · P1: 1 · P2: 4 · P3: 1.** Prioritize the active-board save response. Then address dense drawing, the callout editing target, gesture cleanup and audit coverage. Preserve the current compact interface.

## Scope and evidence

- Production assets, temporary seeded vaults, desktop **1440×900**, phone **390×844**, iPad portrait **820×1180**. Thirteen routes in both light and dark: **78 captures**, all loaded without errors or page-width overflow. Routes: Home, Overview, List, Tree, Table, Kanban, Calendar, Timeline, Capacity, Documents, Board, Settings and Help.
- Axe WCAG 2.0/2.1/2.2 AA scans on the 52 desktop/phone base states. Follow-up card editor, comments, callout editing and settings checks in **Chromium and WebKit**, including hit testing outside small-looking controls.
- Additional 320×640 layouts and a **720×450 CSS viewport at 2× density**, representing the layout space of a 1440×900 viewport at 200% zoom. This is a reflow proxy, not a native browser text-resize test. No page-width overflow in the four sampled routes. Closed off-canvas navigation and intentionally scrollable formatting tools are not defects.
- Two actual synthesized-touch browser tests passed: iPad pinch coalescing/control sizing, and overview pinch/cancellation. These use Chromium's input pipeline. WebKit follow-ups exercised clicks, focus and editing; they do not establish physical iPad gesture performance.
- Large-board benchmark: **one Playwright worker**, Chromium **149.0.7827.55**, **AMD Ryzen 9 9950X3D**, 1440×1050, production assets. Values below are samples, not device-independent limits.
- Current verification: `npm run check` passed and all **414 unit tests** passed. The server-based tests required local network access outside the restricted sandbox.
- Existing diagnostic audit: **37 passed, 7 failed**. All seven failures were traced to obsolete assertions/selectors, described in finding 5. They are not seven new app regressions. The immediately preceding release batch passed 414 unit tests, 2,414 browser tests and four Docker tests, with 61 browser skips; that batch excludes `@audit` diagnostics.

Evidence: [screen measurements](assets/impeccable-2026-11-01/screens.json), [interaction measurements](assets/impeccable-2026-11-01/details.json), [edge cases](assets/impeccable-2026-11-01/edgecases.json), [performance](assets/impeccable-2026-11-01/performance.json), [detector output](assets/impeccable-2026-11-01/detector.json).

## Findings

### 1. [P1] A small active-board edit receives the entire large board back

**Category:** Performance. **Location:** `server/http/routes/records.ts:48–59`, `public/sync.js:271–291`, `public/app.js:446`.

Moving one node in the 100,000-node/200,000-connector fixture sends **206 bytes**, but the response contains **26,478 KiB** of JSON. The end-to-end save took **3,315ms** on this desktop. Even the 10,000-node/20,000-connector case returns **2,583 KiB** for a 207-byte request, taking **288ms**. The client parses the response and uses it as the next saved/merge state.

**Impact:** Frequent tiny edits retain a large response and parsing cost, especially over slower Wi-Fi and on mobile. The recently fixed summaries reduce *closed-board* transfers; this is a separate *active-board save* path. The timing includes validation, file writes and JSON processing; it cannot all be attributed to transfer size.

**Recommendation:** Add a versioned, opt-in compact board acknowledgement carrying the accepted revision, operation identity and canonical changes. Update SaveQueue's merge/retry logic and conflict tests together; retain full-record resynchronization for conflicts or unsupported callers. Measure response size and time separately from storage work. Do not simply omit fields from the current response: the client relies on them.

**Standard:** Performance engineering; no WCAG violation asserted. **Command:** `/impeccable optimize`.

### 2. [P2] The callout-title editing target is only 21–22px high

**Category:** Accessibility / Responsive design. **Location:** `public/document-components.js:418–424`, `public/project-documents.css:318–322`.

The separate `span[contenteditable][aria-label="Callout title"]` measures **21px** high on desktop and **22px** on phone in Chromium and WebKit. Clicking just below it hits the callout container, not its title editor. Unlike the phone card title, it has no enlarged pseudo-element hit area. Axe flags it in both themes and both engines.

**Impact:** A user must hit a thin text strip to edit the title, making this supported inline-editing feature unnecessarily difficult on touch screens.

**Recommendation:** Give this independent editor an actual padded hit area: at least 24px on desktop and the project's 44px touch target, while preserving the visible text size and compact surrounding content. Keep the disclosure button separate. Verify title/body focus, editing, saved Markdown and keyboard navigation.

**Standard:** The project requires 44px touch targets. This is a verified gap against that touch policy, **not a confirmed WCAG AA violation**: WCAG 2.2 SC 2.5.8 allows spacing and other exceptions to its 24×24 minimum. Callout spacing and nested-editor geometry need explicit manual review before accepting axe's violation classification. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

**Command:** `/impeccable adapt`. [Phone editor capture](assets/impeccable-2026-11-01/chromium-phone-callout-edit.png).

### 3. [P2] Dense large boards still produce long drawing tasks

**Category:** Performance. **Location:** `public/canvas-pro.js:983–1042`, `public/canvas-pro.js:1148–1200`; measured by `e2e/platform/canvas-capacity.spec.mjs:56–145`.

| Workload | Initial load | Pan median / p95 | Fit | Initial longest task |
|---|---:|---:|---:|---:|
| 10,000 nodes, 20,000 connectors; spread out | 502ms | 33 / 43ms | 105ms | 113ms |
| 100,000 nodes, 200,000 connectors; heavily overlapping | 2,857ms | 155 / 175ms | 1,361ms | 637ms |

The pan measurement runs a wheel event followed by two animation frames; it is **not** a direct FPS measurement. The dense case recorded repeated roughly 75–95ms long tasks despite a 240-element detailed DOM cap. Its reported JS heap sample was 561MiB, not a steady-state retained-memory measurement.

One concrete inefficiency is at `canvas-pro.js:1194–1195`: a minimap rebuild calls `themeColor("--green", ...)`, and therefore `getComputedStyle`, once for every node even though the fallback colour is constant. That affects rebuilds, not every pan, because the minimap is cached.

**Impact:** Object count alone is not a useful promise of smoothness; overlapping content and connector density still matter. The extreme fixture works but is visibly outside a smooth direct-manipulation budget.

**Recommendation:** Cache the minimap fallback colour once per rebuild. Profile a dense pan separately to divide scene queries, connector work, overview painting and DOM hydration. Continue compositing a cached overview during movement, and budget deferred repaint/hydration by elapsed frame time. Preserve hit testing and selection in the overview. Repeat on the physical iPad before setting a device-specific supported workload.

**Standard:** Performance engineering; no WCAG violation asserted. **Command:** `/impeccable optimize`.

### 4. [P2] Home resizing remains active after window focus loss

**Category:** Responsive interaction / Implementation integrity. **Location:** `public/home.js:199–243`.

In Edit layout, begin resizing a Home panel, dispatch window `blur`, then move the pointer. The panel stays marked `moving` and continues changing height: the reproduced grid height changed from **5 to 7** after blur. The handler finishes on `pointerup` and `pointercancel`, but does not handle window blur or lost pointer capture.

**Impact:** An interrupted drag can continue altering the layout when interaction resumes, until the release event arrives. This was reproduced with a synthesized blur during a Chromium mouse gesture; physical OS app switching was not tested.

**Recommendation:** Centralize gesture termination and handle blur/lost capture as well as pointer cancellation. Decide explicitly whether interruption commits the last visible position or restores the starting position, and ensure it clears state, releases capture where applicable, saves at most once and allows the next gesture.

**Standard:** Robust pointer cancellation; no standalone WCAG violation asserted. **Command:** `/impeccable harden`.

### 5. [P2] The older audit suite reports obsolete interfaces

**Category:** Implementation integrity / Verification. **Location:** `e2e/ui/ui-assessment.spec.mjs:182,187,229,245,322,337,349`; current release a11y gate `e2e/ui/accessibility.spec.mjs:37`.

The seven failing diagnostic checks expect:

- Table row checkboxes, which no longer exist.
- An already-visible document list before clicking its document row.
- A weekends *button*, although the agreed shared control is now a checkbox.
- A maximum of five Table tools rather than checking current controls for fit/access.
- A Board **More** menu and group headings, replaced by Board tools and dividers.
- Visible **Clear filters** text, now an icon in the View options header.
- The full presence name in page text, where the compact avatar uses an accessible name/tooltip.

**Impact:** False alarms make the audit unreliable, and its combined axe test times out before finishing the document scan. The passing release gate uses WCAG 2.1 AA tags, so it does not automatically include the newer target-size rule that surfaced the callout for manual review.

**Recommendation:** Update diagnostics to current actions and accessible names, reuse menu helpers, and replace arbitrary tool counts with geometry/interaction checks. Add WCAG 2.2 target checks with manual handling of real hit-area extensions and native-label exceptions. Keep diagnostic audits distinct from release regression tests.

**Standard:** Test integrity, not a user-facing WCAG failure. **Command:** `/impeccable harden`.

### 6. [P3] Reduced motion still uses a global near-zero-duration override

**Category:** Accessibility / Implementation integrity. **Location:** `public/task-tools.css:1184–1192`.

A component stylesheet applies `animation-duration: 0.01ms !important`, one iteration and `transition-duration: 0.01ms !important` to every element and pseudo-element in the app. Components already contain intentional reduced-motion alternatives, including the loading indicator and navigation trays.

**Impact:** This is a maintenance hazard: new state feedback can be overridden far from its implementation. No broken reduced-motion workflow was reproduced in this audit, so this is polish, not a release blocker.

**Recommendation:** Consolidate reduced-motion policy in shared styling, preserving component-specific static/progress feedback. Replace the blanket timer override with explicit alternatives and rerun both motion-enabled and reduced-motion flows.

**Standard:** Reduced-motion robustness; no WCAG violation asserted. **Command:** `/impeccable animate`.

## False positives and sanctioned choices

- **Phone List/Tree title buttons:** axe sees the 20.8px text box. Their `::after` actually spans a **328×66.8px** summary. Hit testing 22px below the text still resolves to the open-card button in Chromium and WebKit. Not counted as undersized targets.
- **Show card IDs / Show weekends:** native checkboxes are 12–13px, but the associated clickable label is at least 32px high on desktop (measured 97×32 for IDs) and uses touch sizing on touch screens. Clicking label space toggles the value. Do not enlarge only the checkbox based on axe's element box.
- **Detector grids/stripes:** actual board background choices, not decorative page filler.
- **Detector marquee:** an indeterminate loading indicator with a static reduced-motion alternative, not auto-scrolling content.
- **Detector side accents:** blocked-state indicator, drag insertion marker, quoted comment context and calendar/timeline status colour. These carry information. The Home corner border is a resize grip.
- **Fonts, warm palette and tray easing:** existing/user-selectable visual choices. No verified technical defect warrants changing them in this audit.
- **Mobile page zoom:** intentionally disabled at the owner's request in `public/scroll-gestures.js:49–65` and the shared touch rules. This remains an accessibility tradeoff, not an accidental regression. Consider an explicit text-size preference while retaining Board zoom and the requested page-gesture behaviour. Native browser text enlargement and physical iOS magnification were not verified; WCAG 1.4.4 requires a supported way to enlarge text to 200%. [W3C resize-text guidance](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

## Patterns and strengths

The interface is more consistent than the diagnostic noise suggests. Shared control tokens, menu placement, compact card fields, phone navigation and light/dark treatments work across the sampled routes. The phone comments editor fits on one screen without a second navigation bar. Core labels, contrast and form semantics passed the sampled axe checks. The renderer already caps detailed DOM and supports selection and pinching in overview mode; the next performance work should preserve that architecture.

The remaining weaknesses cluster around **large-record response contracts**, **rare interruption paths**, and **test assumptions drifting from the current interface**. These need focused changes, not a new framework or visual redesign.

## Recommended order

1. **P1 — `/impeccable optimize`**: compact active-board save acknowledgements and safe reconciliation; then profile dense rendering (findings 1 and 3).
2. **P2 — `/impeccable adapt`**: callout-title hit areas (finding 2).
3. **P2 — `/impeccable harden`**: Home gesture cleanup and refreshed audit coverage (findings 4 and 5).
4. **P3 — `/impeccable animate`**: scoped reduced-motion alternatives (finding 6).
5. **`/impeccable polish`**: final consistency and cross-device verification after the fixes.

These can be run one at a time, all at once, or in any order. Re-run `/impeccable audit` after fixes.

Not checked: a physical iPad/iPhone, a live screen-reader session, native 200% text resizing, every custom theme/font combination, every optional integration, or concurrent-user performance. No application code, vault data, detector suppressions or deployed version changed.


## Resolution — 0.20.122

The six findings were addressed in the follow-up requested by the owner. See [implementation and measured results](2026-11-01-impeccable-fixes.md). The findings above preserve the original audit evidence.
