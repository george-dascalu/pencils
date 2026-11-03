import { Univer, LocaleType, CellValueType, LifecycleService, LifecycleStages } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverSheetsPlugin, SetRowDataCommand, SetColDataCommand } from '@univerjs/sheets';
import { checkRichText } from './document-sheet-richtext.js';
import { TABLE_LIMITS } from './document-sheet-model.js';
import { UniverSheetsFormulaPlugin, CalculationMode, TriggerCalculationController } from '@univerjs/sheets-formula';
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt';
import { UniverSheetsSortPlugin } from '@univerjs/sheets-sort';
import '@univerjs/sheets/facade';
import '@univerjs/engine-formula/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs/sheets-numfmt/facade';
import '@univerjs/sheets-sort/facade';

// Only the spreadsheet model/calculator is used. Pencils owns its DOM, touch input and controls.
export function createSheetEngine(table, { onChange = () => {}, onRefresh = () => {} } = {}) {
  const univer = new Univer({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: {} } });
  for (const plugin of [UniverFormulaEnginePlugin, UniverSheetsPlugin, UniverSheetsFormulaPlugin, UniverSheetsNumfmtPlugin, UniverSheetsSortPlugin]) univer.registerPlugin(plugin);
  const workbook = structuredClone(table.workbook);
  // Imported snapshots can omit t; sorting requires explicit numeric/string types.
  for (const sheet of Object.values(workbook.sheets)) for (const row of Object.values(sheet.cellData || {})) for (const cell of Object.values(row)) {
    if (cell.t == null && cell.v != null) cell.t = typeof cell.v === 'number' ? CellValueType.NUMBER : typeof cell.v === 'boolean' ? CellValueType.BOOLEAN : CellValueType.STRING;
  }
  const api = FUniver.newAPI(univer);
  // A tab can close before asynchronous results reach a saved snapshot. Rebuild
  // calculated values from the formulas and inputs, rather than trusting cached v.
  api.getFormula().setInitialFormulaComputing(CalculationMode.FORCED);
  const book = api.createWorkbook(workbook);
  // The browser UI plugin normally advances this stage. Our native grid owns rendering,
  // so activate the formula controllers after the workbook model is ready.
  const lifecycle = univer.__getInjector().get(LifecycleService);
  if (lifecycle.stage < LifecycleStages.Rendered) lifecycle.stage = LifecycleStages.Rendered;
  let cached = null, timer, pending = false, destroyed = false;
  const filters = structuredClone(table.filters || {});
  const invalidate = () => { cached = null; if (!destroyed) onRefresh(); };
  const commands = book.onCommandExecuted(invalidate);
  const calculatedChanges = api.getFormula().calculationResultApplied(invalidate);
  const sheet = sid => book.getSheetBySheetId(sid);
  function snapshot() { return { format: 1, workbook: cached ||= book.save(), filters: structuredClone(filters) }; }
  function flush() { clearTimeout(timer); if (pending && !destroyed) { pending = false; onChange(snapshot()); } }
  function changed() { invalidate(); pending = true; clearTimeout(timer); timer = setTimeout(flush, 400); }
  function cellValue(raw) {
    const text = String(raw);
    const clear = { f: null, si: null, p: null };
    if (text.startsWith("'")) return { ...clear, v: text.slice(1), t: CellValueType.STRING };
    if (text.startsWith('=')) return { ...clear, f: text, v: null, t: CellValueType.NUMBER };
    if (/^(true|false)$/i.test(text)) return { ...clear, v: /^true$/i.test(text), t: CellValueType.BOOLEAN };
    if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().startsWith(text)) return { ...clear, v: (Date.parse(text) - Date.UTC(1899, 11, 30)) / 86400000, t: CellValueType.NUMBER, s: { n: { pattern: 'yyyy-mm-dd' } } };
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && !/^0\d/.test(text) && Number.isFinite(+text)) return { ...clear, v: +text, t: CellValueType.NUMBER };
    return { ...clear, v: text || null, t: CellValueType.STRING };
  }
  function axisInfo(sid, axis, start = 0, count = 1) {
    if (!['row', 'column'].includes(axis)) throw Error('Choose rows or columns.');
    const target = sheet(sid); if (!target) throw Error('Worksheet not found.');
    const total = axis === 'row' ? target.getMaxRows() : target.getMaxColumns();
    if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 1 || start + count > total) throw Error('Choose rows or columns within this worksheet.');
    return {target, total, field: axis === 'row' ? 'rowData' : 'columnData'};
  }
  return {
    api, book, sheet, filters, snapshot, flush,
    calculated: () => api.getFormula().onCalculationResultApplied(10000),
    setValue(sid, row, column, value) {
      const range = sheet(sid).getRange(row, column, 1, 1);
      range.setValue(cellValue(value)); changed();
    },
    setRichText(sid,row,column,p) { checkRichText(p); sheet(sid).getRange(row,column,1,1).setRichTextValueForCell(p); changed(); },
    setValues(sid, row, column, rows, { literal = false } = {}) {
      const width = Math.max(...rows.map(r => r.length));
      const values = rows.map(r => Array.from({ length: width }, (_, c) => r[c] ?? "").map(v => literal ? { v: String(v), t: CellValueType.STRING, f: null, p: null, si: null } : cellValue(v)));
      sheet(sid).getRange(row, column, rows.length, Math.max(...rows.map(r => r.length))).setValues(values); changed();
    },
    moveAxis(sid, axis, start, count, before) {
      const {target,total} = axisInfo(sid,axis,start,count);
      if (!Number.isInteger(before) || before < 0 || before > total) throw Error('Choose a position within this worksheet.');
      if (before >= start && before <= start + count) return;
      if (axis === 'column' && Object.keys(filters[sid] || {}).length) throw Error('Clear worksheet filters before moving columns.');
      const range = axis === 'row' ? target.getRange(start,0,count,1) : target.getRange(0,start,1,count);
      if (axis === 'row') target.moveRows(range,before); else target.moveColumns(range,before);
      changed();
    },
    setAxisLabel(sid,axis,index,label) {
      const {target,field} = axisInfo(sid,axis,index);
      if (typeof label !== 'string' || label.length > 80 || /[\u0000-\u001f]/.test(label)) throw Error('Use up to 80 characters for the name.');
      const custom = {...snapshot().workbook.sheets[sid][field]?.[index]?.custom,pencilsLabel:label.trim()};
      const command = axis === 'row' ? SetRowDataCommand : SetColDataCommand;
      api.syncExecuteCommand(command.id,{unitId:book.getId(),subUnitId:sid,[field]:{[index]:{custom}}}); changed();
    },
    setAxisHidden(sid,axis,start,count,hidden) {
      const {target,total,field} = axisInfo(sid,axis,start,count);
      const entries = snapshot().workbook.sheets[sid][field] || {};
      if (hidden && !Array.from({length:total},(_,i)=>i).some(i=>(i<start || i>=start+count) && entries[i]?.hd !== 1)) throw Error('Keep at least one visible row or column.');
      if (axis === 'row') { if (hidden) target.hideRows(start,count); else target.showRows(start,count); }
      else { if (hidden) target.hideColumns(start,count); else target.showColumns(start,count); }
      changed();
    },
    setAxisCount(sid,axis,count) {
      const {target,total} = axisInfo(sid,axis);
      const limit=axis === 'row' ? TABLE_LIMITS.rows : TABLE_LIMITS.columns;
      if (!Number.isInteger(count) || count < 1 || count > limit) throw Error(`Use between 1 and ${limit.toLocaleString()} ${axis === 'row' ? 'rows' : 'columns'}.`);
      if (axis === 'column' && Object.keys(filters[sid] || {}).some(c=>+c>=count)) throw Error('Clear worksheet filters before removing their columns.');
      if (count === total) return;
      if (axis === 'row') {if(count<total)target.deleteRows(count,total-count);else target.insertRowsAfter(total-1,count-total);}
      else {if(count<total)target.deleteColumns(count,total-count);else target.insertColumnsAfter(total-1,count-total);}
      changed();
    },
    mutate(action) { const result = action(); changed(); return result; },
    async undo() { book.undo(); changed(); },
    async redo() { book.redo(); changed(); },
    destroy() {
      if (destroyed) return;
      flush(); destroyed = true; commands.dispose(); calculatedChanges.dispose();
      // Univer 1.3.1 leaves its delayed progress callback alive after disposal.
      // We mount no vendor progress UI; silence that callback before its locale
      // service is torn down. Calculation/notifications remain unmodified.
      univer.__getInjector().get(TriggerCalculationController)._startProgress = () => {};
      api.getFormula().stopCalculation(); univer.dispose();
    },
  };
}
