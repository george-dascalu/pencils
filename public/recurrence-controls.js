import { nextDate } from "./recurrence-model.js";
export function recurrenceControls(form, current, tasks, esc) {
  const unit = form.elements["recurrence-unit"],
    interval = form.elements["recurrence-interval"];
  if (!unit || !interval) return;
  const host = document.createElement("div");
  host.className = "recurrence-explanation field-hint";
  host.setAttribute("aria-live", "polite");
  unit.closest(".field-row").after(host);
  const link = (id, label) => {
    const task = tasks.find((t) => t.id === id);
    return task
      ? `<button type="button" class="button small" data-action="wiki-open" data-id="${esc(id)}">${label}: ${esc(task.key || task.title)}</button>`
      : "";
  };
  function paint() {
    const rule = { unit: unit.value, interval: Number(interval.value) },
      due = form.elements.due.value;
    const lineage =
      link(current.recurrence_source, "Previous occurrence") +
      link(
        current.recurrence_next,
        "Edit next occurrence and its future repeats",
      );
    if (!unit.value) {
      host.innerHTML = `<p>This occurrence will not generate another task.${current.recurrence_next ? " Its already-created successor remains unchanged; open it to change or stop its repeats." : ""}</p>${lineage}`;
      return;
    }
    if (
      !Number.isInteger(rule.interval) ||
      rule.interval < 1 ||
      rule.interval > 365
    ) {
      host.textContent = "Choose an interval from 1 to 365.";
      return;
    }
    let predicted;
    try {
      predicted = nextDate(due, rule);
    } catch {
      return;
    }
    host.innerHTML = `<p>${current.recurrence_next ? "The next occurrence has already been created." : `Completing this task creates one next occurrence, due ${esc(predicted)}.`} Dates advance from this occurrence’s due date, or the UTC completion date when no due date is set. Repeats are created on completion, not by a calendar timer.</p><p>Edits apply to this occurrence and seed any successor that has not yet been created. Existing successors are separate tasks; open the next occurrence to change its future repeats. Reopening and completing this task again does not create a duplicate.</p>${lineage}`;
  }
  form.addEventListener("input", (event) => {
    if (
      ["recurrence-unit", "recurrence-interval", "due"].includes(
        event.target.name,
      )
    )
      paint();
  });
  form.addEventListener("change", (event) => {
    if (
      ["recurrence-unit", "recurrence-interval", "due"].includes(
        event.target.name,
      )
    )
      paint();
  });
  paint();
}
