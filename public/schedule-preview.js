import { schedulePreview } from "./schedule-model.js";
export function showSchedulePreview(ctx) {
  const {
    state,
    esc,
    showDialog,
    dialogHead,
    closeDialog,
    patchTask,
    renderView,
    toast,
  } = ctx;
  const result = schedulePreview(state.tasks);
  showDialog(
    `<dialog class="dialog wide-dialog">${dialogHead("Review dependency schedule")}<div class="dialog-body"><p>Whole project, excluding archived tasks. Each successor starts after its prerequisites finish. Proposed moves preserve duration in calendar days, including weekends. Nothing changes until you apply.</p>${result.warnings.length ? `<ul role="status">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}<div class="table-scroll"><table><thead><tr><th>Task</th><th>Current dates</th><th>Proposed dates</th></tr></thead><tbody>${result.moves.map((m) => `<tr><th>${esc(m.key || "")} ${esc(m.title)}</th><td>${esc(m.before.start || m.before.due)} → ${esc(m.before.due || m.before.start)}</td><td>${esc(m.after.start)} → ${esc(m.after.due)}</td></tr>`).join("")}</tbody></table></div>${!result.moves.length ? "<p>No dated tasks need to move.</p>" : ""}<p data-schedule-error role="alert"></p></div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button><button class="button primary" data-schedule-apply ${!result.moves.length || result.cycle ? "disabled" : ""}>Apply ${result.moves.length} proposed moves</button></div></dialog>`,
    "schedule",
  );
  document.querySelector("[data-schedule-apply]").onclick = async (event) => {
    event.target.disabled = true;
    try {
      // A changed task requires a new preview; queued revision checks still protect disk writes.
      const latest = schedulePreview(state.tasks);
      if (JSON.stringify(latest) !== JSON.stringify(result))
        throw Error(
          "The schedule changed. Close and review the updated proposal.",
        );
      for (const move of result.moves)
        await patchTask(move.id, move.after, false);
      closeDialog(true);
      renderView(true);
      toast("Proposed dates submitted. Any save conflict remains in Recovery.");
    } catch (error) {
      document.querySelector("[data-schedule-error]").textContent =
        error.message;
      event.target.disabled = false;
    }
  };
}
