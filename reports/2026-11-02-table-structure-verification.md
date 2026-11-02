# Table structure and document Properties — 2026-11-02

New worksheets start with 100 rows. Existing workbooks and the 1,000-row performance target retain their size. Header menus provide names (aliases beside A1-style coordinates), hiding/showing, deletion, movement and worksheet dimensions. Desktop drags immediately; touch holds before dragging. The native pinned spreadsheet commands update formulas, cross-sheet references, metadata and sizes, with undo/redo. Hidden tracks keep their cells; reducing worksheet dimensions deletes cropped cells through undoable row/column removal.

Properties has one toolbar button for Markdown and Table documents and uses the shared contextual panel. The editor contains no Properties block. Existing property/tag validation, conflict detection and saving remain in place. Adding a property returns to the dropdown.

Focused browser checks: 70 passed and one Chromium-protocol test skipped in WebKit. These cover all three engines, iPhone/iPad emulation, a real Chromium touch sequence, aliases, hidden tracks, persistence, deletion, cancellation, Properties geometry and 1,000-row virtual scrolling. WebKit's scroll-anchor reset on virtual redraw is fixed by explicitly retaining both offsets. The 1,000-row test still mounts a bounded number of rows. This is browser emulation on Ubuntu, not a physical iPad measurement.

Data mutation checks: model 242 mutants, 241 caught; engine 124 mutants, 116 caught plus one timeout, seven equivalent survivors. Every non-equivalent fault is caught. Equivalent cases:

- The model's 1,200,000-node equality boundary is already beyond its 1.5 MB JSON guard.
- Assigning the existing Rendered lifecycle stage again has no effect.
- Univer's saved worksheet always supplies rowData/columnData objects, so the empty-map fallback is unreachable.
- The two count equality mutations cannot reach their branch because the equal-count no-op returns first.
- Removing the three explicit command/calculation disposals duplicates the subsequent Univer disposal. Explicit cleanup remains for clarity and future SDK changes.

Column moves and truncating filtered columns request clearing filters first. This avoids silently moving a filter onto a different column in the native Pencils filtering layer. Custom names are display aliases, not named formula ranges.
