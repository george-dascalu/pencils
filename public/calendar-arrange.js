import { backlogPosition, backlogGroups, arrangeBacklog } from "./calendar-backlog.js";
import { fieldOn } from "./card-fields.js";

// The headings remember this browser's last arrangement; card positions use the normal durable
// save queue and are shared. Nothing reflows when a card is edited, added, dragged or resized.
export function backlogArrangement(ctx) {
  const { state, storage, icon, esc, task, patchTask, renderView, toast } = ctx;
  const fields = [["priority", "priority", "flag"], ["parent", "parent", "tree"], ["tags", "tags", "tag"], ["status", "status", "status"]];
  const key = project => `week-board-arrangement:${project}`;
  let busy = false;
  const buttons = count => `<div class="week-board-backlog-arrange" role="group" aria-label="Arrange Unscheduled">${fields.filter(([field]) => fieldOn(state.config, field)).map(([field, name, glyph]) => `<button type="button" class="icon-button" data-backlog-arrange="${field}" aria-label="Arrange by ${name}" title="Arrange by ${name}" ${busy || !count ? "disabled" : ""}>${icon(glyph)}</button>`).join("")}</div>`;
  function headings(cards) {
    const saved = storage.get(key(state.project.id), null);
    if (!saved || !fieldOn(state.config, saved.field) || !Array.isArray(saved.groups)) return "";
    const visible = new Set(cards.map(t => t.id));
    return saved.groups.filter(g => backlogPosition(g) && Array.isArray(g.ids) && g.ids.some(id => visible.has(id))).map(g => `<h4 class="week-board-backlog-group" style="left:${g.x}px;top:${g.y}px">${esc(g.label)}</h4>`).join("");
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-backlog-arrange]");
    if (!button || busy || state.view !== "calendar" || state.toolDragging || state.taskReordering) return;
    const field = button.dataset.backlogArrange;
    if (!fields.some(([f]) => f === field) || !fieldOn(state.config, field)) return;
    const board = button.closest(".week-board-backlog").querySelector(".week-board-backlog-board");
    const elements = [...board.querySelectorAll(".week-board-card[data-calendar-card]")], cards = elements.map(el => task(el.dataset.calendarCard)).filter(Boolean);
    if (!cards.length) return;
    const project = state.project.id;
    busy = state.taskReordering = true;
    let message = "";
    try {
      const plan = arrangeBacklog(backlogGroups(cards, field, state.config, state.tasks), {
        width: board.clientWidth, cardWidth: elements[0].offsetWidth,
        heights: new Map(elements.map(el => [el.dataset.calendarCard, el.offsetHeight])),
        headingHeight: Math.ceil(parseFloat(getComputedStyle(board).getPropertyValue("--type-body")) * 1.4),
      });
      storage.set(key(project), { field, groups: plan.groups });
      // Apply every position before rendering; the same queue as dragging retains unsynced edits.
      const pending = plan.positions.map(({ id, backlog }) => patchTask(id, { backlog }, false));
      board.scrollTo(0, 0);
      renderView(true);
      const results = await Promise.allSettled(pending), failed = results.find(r => r.status === "rejected");
      if (failed) throw failed.reason;
      if (plan.positions.some(({ id }) => { const entry = ctx.sync.entries.get(ctx.route("tasks", id)); return entry?.blocked || entry?.conflict; }))
        toast("The arrangement could not be synced. Review the pending changes in save status.", true);
      message = `Cards arranged by ${field === "tags" ? "tags" : field}. Drag any card to move it freely.`;
    } catch (error) { toast(error.message, true); }
    finally {
      busy = state.taskReordering = false;
      if (state.project?.id === project && state.view === "calendar") {
        renderView(true);
        document.querySelector(`[data-backlog-arrange="${field}"]`)?.focus({ preventScroll: true });
        const live = document.querySelector("[data-calendar-announcement]");
        if (live) live.textContent = message;
      }
    }
  });
  return { buttons, headings };
}
