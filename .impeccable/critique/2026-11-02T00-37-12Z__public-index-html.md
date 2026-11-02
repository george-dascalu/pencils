---
target: "Pencils application: critique and fix all findings"
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/run/media/george/Work/Projects/pencils/public/index.html"
target_fingerprint: "sha256:a949497571707e762cc88bd36c3e08a714a427c201e2dfbb1868f0745fe11f4a"
target_path: /run/media/george/Work/Projects/pencils/public/index.html
timestamp: 2026-11-02T00-37-12Z
slug: public-index-html
---
# Pencils critique — 2 November 2026

Method: dual-agent (A: `/root/critique_design` · B: `/root/critique_evidence`). Target: `public/index.html`, Pencils 0.20.129. Independent assessments preceded synthesis; A did not read detector results or earlier reports. The owner requested all confirmed fixes.

## Verdict

**30/40 — Good.** Preserve the compact workspace, shared field boxes, document reading width and contextual controls. The interface feels designed for its work. Correct specific inconsistencies and recovery states; no broad redesign is justified.

| Heuristic | Score / 4 |
|---|---:|
| System feedback | 3 |
| Familiar language | 3 |
| User control | 3 |
| Consistency | 2 |
| Error prevention | 3 |
| Recognition | 3 |
| Efficiency | 3 |
| Visual restraint | 4 |
| Error recovery | 3 |
| Help | 3 |

## Confirmed fixes

| Priority | Finding | Correction |
|---|---|---|
| P1 | B1: Bare document checklist targets measure 13px; near taps enter the editor. | Full touch target, compact glyph, preserve scroll gestures and desktop behavior. |
| P2 | A2: Phone Timeline hides empty-state recovery outside the viewport; Calendar misdescribes filtered results. | Visible recovery action and accurate filtered-state copy; retain dated creation. |
| P2 | A1/B4: Home shows status IDs and ISO dates, crowding phone titles. | Snapshot-specific labels, shared dates, field visibility and readable compact rows. |
| P2 | A3: Phone board bookmark and tools are nested inside View options. | Direct trailing star and tools, one home each. |
| P2 | A4: Table defaults put Description before Type and the common fields. | Shared leading order, preserve saved customization. |
| P2 | B2: Light card-search placeholder contrast is only 2.5–2.6:1. | Shared placeholder token. |
| P3 | B5: Save reassurance uses literal 10px type. | Shared metadata type token. |
| P3 | A5: Empty List/Tree refers to “New card above,” unlike the actual control. | “Choose New → Card…” |
| P2 | A6: Entry metadata promises an offline workspace. | Accurate Markdown workspace description. |

No P0; one P1; six P2; two P3. These findings overlap between assessments where noted rather than counting duplicates.

## People and cognitive load

Routine editing has low cognitive load. Settings and expert toolbars have moderately many grouped choices, an intentional tradeoff. Regular users pay an unnecessary translation cost in Home labels and Table order. Distracted phone users can interpret filtered planning as missing work and face an extra board menu level. Keyboard/low-vision users need recovery controls in the visible viewport; touch checklist near-misses should not summon the keyboard. Arrival and ordinary editing are calm; failed search is the confidence-losing transition to correct. The single sidebar, icon navigation, touch trays and compact metadata remain intentional.

## Detector adjudication and limits

The CLI returned three functional patterns: network loading progress, timeline weekend stripes and drawing grids. Keep them. Browser detections included intentional avatar initials, document callouts and free-position board text. The zoom-scaled frame control is intentional world geometry: the existing Frames outline has a verified 44px collapse/expand action at 85% and 50% on phone/iPad. No inverse sizing is warranted. No ignores were added.

A inspected desktop, iPad and phone, both themes, all main views and empty/filter states. B inspected 30 normal samples and 30 actual overlay samples; zero axe violations, normal page overflow, application console or HTTP errors. CSP correctly blocked the first diagnostic injection; a disposable browser-only bypass enabled the overlay, without changing product CSP. Temporary servers and browsers were closed.

Physical hardware, screen-reader sessions and slow networks were not part of the critique. Rendering evidence is Chromium emulation. Implementation validation is recorded separately below after fixes.

Questions skipped: the owner authorized every confirmed fix and the project rules define the design direction.

## Evidence

Independent assessments and reproducible JSON/screenshots: [critique assets](assets/critique-2026-11-02/). Assessment A supplies the design/persona reasoning; Assessment B supplies detector adjudication and computed/real-touch probes.
