# Tables documents — approved design and implementation

Owner request, 2 November 2026: add Tables as a document type, with a spreadsheet experience similar to Google Sheets. Design and review the sketch before implementing the product feature.

## Confirmed choices

- First release: editable cells, formulas, formatting, sorting, filtering, CSV import and export.
- Uses include project budgets, structured lists, calculations and data brought from Excel or Google Sheets.
- A readable Markdown document stays in the vault, with spreadsheet data beside it.
- Multiple worksheet tabs are approved for the first release.
- The approved performance target is up to **1,000 rows** per worksheet.
- Existing Pencils principles apply: compact controls, desktop/iPad/phone support, explicit touch editing, shared navigation and portable files.

## Review artifacts

- Interactive sketch: `assets/table-documents-2026-11-02/index.html`.
- Desktop, iPad, 390px phone and 320px phone screenshots, including dark theme variants, are in the same directory.
- The sketch uses sample data and a small demonstration calculator. It is a design artifact, not the production spreadsheet engine. CSV export works for the sample; import, history and some formatting controls illustrate their intended locations.

## Proposed interface

1. **A document type within Documents.** New → Table creates it in the current document folder. Tables have a grid icon in the same document list, tabs, links and bookmarks as notes. The existing Table layout of project cards remains a separate view of those cards.
2. **One compact formatting bar.** Undo/redo, number format, text styling, fill/borders, alignment/wrap, filter/sort and freeze. Document tools stays at the right and holds rename, import/export, history and Trash. A command appears once at each device size.
3. **Formula bar.** A small address box, `fx` and the selected cell's literal value/formula. The cell itself displays the calculated, formatted result. Enter applies; Escape cancels. Formulas use familiar cell references.
4. **The grid owns scrolling.** Column letters, row numbers, fixed headers and optionally frozen rows/columns stay aligned. The surrounding app page stays still. Mouse selection, keyboard movement, copy/paste and cell editing operate in the grid.
5. **Touch selection and editing are separate.** A tap selects. A second tap on the selected cell or an explicit tap on the formula field edits it. Opening a Table or selecting a range does not open the keyboard. Editing text uses at least 16px to avoid iOS input zoom. Buttons retain 44px touch targets.
6. **Phone controls remain quiet.** Menu and New float at the sides of the compact action row. Formatting options move into the Format panel, with bookmark and Document tools available. Worksheet controls sit above the existing bottom navigation.
7. **Multiple worksheet tabs.** The sketch shows Budget and Assumptions with a single Add worksheet control. Normal document tabs stay at the top; worksheet tabs navigate inside one Table document. A small footer shows selection count/sum.

## First-release behavior

- Text, numbers, dates, booleans, formulas and empty cells remain distinct values.
- Single-cell and rectangular range selection; arrow/Tab/Enter movement, F2 or double-click editing, undo/redo, rectangular clipboard paste, add/delete/resize rows and columns.
- Familiar arithmetic and a defined set of spreadsheet functions, with readable cell errors for invalid references, cyclic formulas and division by zero. The supported list must be documented and tested against the selected engine.
- Bold/italic, alignment, wrap, text and fill colours, borders and number/date/currency/percentage formats. Reuse Pencils' colour picker and control tokens around the engine.
- Sort/filter keeps row contents together. Destructive structural changes must preserve formula reference semantics through the selected spreadsheet engine.
- CSV import previews delimiter, headers and values before creating/replacing data. Excel and Google Sheets data can enter through CSV in this scope. Native XLSX conversion and a live Google connection need separate scope decisions.
- CSV exports the active worksheet; distinguish displayed values from formula source where offered. CSV cannot preserve styling or multiple worksheets in one file.

## Storage and integration

- Keep document identity, folder, title, links and project ownership in the existing Markdown document model.
- The spreadsheet's versioned JSON is authoritative for cells, formulas, formatting and worksheet structure. Markdown links to that data and provides a bounded readable preview. Editing the Markdown preview alone is not bidirectional spreadsheet editing.
- Prefer immutable data snapshots referenced by Markdown revisions, so restoring a document version also restores its spreadsheet data. Reuse existing transaction, revision, history, Trash and audit mechanisms. A restore must retain the current folder as existing document restores do.
- Normal text saves must not replace spreadsheet data. Renaming/moving/linking a Table must preserve its identity and sidecar references. Old plain documents remain plain documents.
- Fetch spreadsheet data only when its document is open. Load the spreadsheet engine lazily. Project snapshots and document lists must not preload workbook JSON or the engine.
- Use the app's durable save and conflict workflow. Save failures retain pending edits; concurrent changes must not silently overwrite another user's workbook. Live simultaneous cell collaboration is a separate capability from revision-safe document saving.
- Do not rewrite the entire workbook for every pointer move or selection. Persist real content changes after coalescing edits; measure snapshot sizes and the cost of recalculating formulas.

## Engine selection checkpoint

Use an established spreadsheet engine rather than expanding the prototype calculator into production. Check formula correctness, reference updates, clipboard behavior, accessibility, self-hosted operation, licence requirements and bundle/runtime costs before selecting it.

Univer is a candidate: its open-source core is Apache-2.0 and supports spreadsheet formulas and UI components. Its own installation documentation calls mobile support experimental, so the prototype's mobile design is not proof of the engine's touch behavior. A short device-focused spike is required before committing to it. Keep commercial modules out of the first-release dependency set unless explicitly chosen.

Sources inspected:

- Google touch editing: https://support.google.com/docs/answer/46973?co=GENIE.Platform%3DiOS&hl=en
- Google touch formula editing: https://support.google.com/docs/answer/46977?co=GENIE.Platform%3DiOS&hl=en
- Univer installation and mobile plugins: https://docs.univer.ai/guides/sheets/getting-started/installation
- Univer source licence: https://github.com/dream-num/univer/blob/dev/LICENSE
- Univer open-source/commercial boundary: https://univer.ai/pricing/

## Verification before release

- Persistence, atomic saves, revision conflicts, failed writes, recovery, Trash and version restore for both the Markdown record and spreadsheet data.
- Formula/reference fixtures, range paste, Unicode, embedded quotes/newlines and CSV round trips.
- Grid scrolling, frozen header alignment, selection versus text editing, formula focus and keyboard dismissal on desktop, iPad and phone widths.
- Actual touch-engine checks in WebKit; physical iPad behavior still needs device validation.
- Benchmark representative imported data and formula-heavy workbooks before setting or publishing size limits. The approved workload is 1,000 rows × 26 columns, including 1,000 formulas. See the implementation verification report for measured results.
- Existing check/unit/affected browser checks, then the required complete release batch and container health verification.

## Design review outcome

The owner approved this layout with multiple worksheet tabs and a target of up to 1,000 rows.

The implementation uses pinned Univer 1.3.1 open-source core, formula, number-format and sort packages for data and calculations. Pencils owns the native DOM grid, compact menus, touch editing and shared document navigation. No vendor UI or commercial module is mounted. The engine loads only when a Table opens; plain documents do not request it. Bundled third-party licences are shipped beside the engine.
