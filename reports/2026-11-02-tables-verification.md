# Tables documents — implementation verification

Approved first release: multiple worksheet tabs; editing, formulas, whole-cell formatting, sorting/filtering and CSV import/export; a Markdown document with spreadsheet data beside it; performance target **1,000 rows**.

## Implementation

Pencils owns the accessible DOM grid, selection, explicit touch editing and shared controls. Pinned Univer 1.3.1 open-source packages supply the workbook model, formula calculation, number formats and sorting. No vendor UI, cloud service or commercial module is used. The calculation bundle loads when a Table opens; plain document tests confirm it stays unloaded. Third-party licences/notices ship at `/vendor/sheets/THIRD_PARTY_LICENSES.txt`.

JSON snapshots are immutable and content-addressed. The existing journal protects writes, and Markdown revisions identify the matching snapshot. Tests cover atomic rollback, fsync/handle cleanup, path/symlink checks, tampering, missing snapshots, historical downloads, restoration and Trash. A missing current snapshot leaves Document tools usable for recovery. Confirmed JSON writes use the shared watcher acknowledgement cache, so saves keep the mounted worksheet and selection; external snapshot edits still trigger detection.

## Measured workload

`e2e/documents/table-capacity.spec.mjs` uses **1,000 rows × 26 columns**, all 26,000 cells populated, including 1,000 SUM formulas. It scrolls through the worksheet, checks the last row, edits a value and verifies its recalculated result and persisted file.

Across desktop, iPad and phone browser presets, the initial calculation/load took approximately **0.8–1.9 seconds** in the focused run. Only **17–32 rows / 416–806 cells** remained mounted at the end, rather than all 26,000 cells. An edit plus calculation and the debounced durable save took approximately **0.55–1.15 seconds**.

The scroll probe waits two animation frames after each scroll step. Its 34–111 ms observations include that deliberate wait and parallel test load; they are not single-frame timings or an FPS claim. Performance measurements come from the Ubuntu host with Chromium, Firefox and WebKit, including touch emulation. Physical iPad/phone performance still needs validation on the owner's devices.

The file guards (20 sheets, 10,000 rows and 200 columns per sheet, 100,000 populated cells and 1.5 MB compact JSON per Table) are protective bounds, not tested capacity claims. The approved first-release target remains 1,000 rows.

## Coverage

- Arithmetic, SUM/AVERAGE/IF, cross-sheet references, absolute/relative clipboard references, formula reference updates on inserted rows, division/reference errors and undo.
- Number/date/currency/percentage formatting, alignment, wrapping, borders, persistent row/column widths, frozen header positioning and worksheet rename/delete/undo.
- CSV quotes, Unicode, delimiters, literal formula import and export; structured clipboard paste.
- Tap selection versus keyboard editing, bounded DOM, no outer page scroll, WCAG checks and viewport geometry across desktop, iPad and phones; computed-style gates in Firefox and WebKit.
- Document tools, metadata/history recovery and the bundled help guide.

Mutation checks caught 230/231 model faults and 33/34 snapshot-storage faults. The remaining two are equivalent under existing guards: reaching exactly 1,200,000 JSON nodes already exceeds the 1.5 MB byte limit, and an end marker's index cannot be zero after it was searched strictly after a non-empty start marker. Neither survivor changes accepted data or behavior. The engine adapter caught 41/45 faults (one by timeout). Its four equivalent survivors assign an already-current lifecycle stage, or remove explicit listener/calculation cleanup which the following Univer disposal repeats. The adapter also guards a pinned 1.3.1 vendor progress callback that otherwise fires after its locale service is disposed; active-edit teardown and reopening cached formulas are covered by regression tests.

Full release/browser/container checks and running-version verification are recorded by the normal release workflow.
