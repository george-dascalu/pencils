// One pick in a start/due calendar. phase is the field being chosen; done means the range is complete.
export function pickRange({ start, due }, phase, value, dueLocked = false) {
  if (phase === "due" && !dueLocked) {
    if (!start || value >= start) return { start, due: value, phase: "due", done: true };
    return { start: value, due: "", phase: "due", done: false }; // earlier than start: begin again
  }
  return {
    start: value,
    due: due && due < value && !dueLocked ? "" : due,
    phase: "due",
    done: dueLocked,
  };
}
export const inRange = (value, start, due) => !!start && !!due && value >= start && value <= due;
