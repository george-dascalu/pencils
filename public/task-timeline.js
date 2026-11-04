import { sourceReadOnly } from "./source-model.js";
import { taskFieldColor, taskColorDot } from "./task-colors.js";
import { taskDateEditor } from "./task-date-editor.js";
import { timelineRangeEditor, timelineRoot, timelineRangeName } from "./timeline-range.js";
import { rangeLabelHTML } from "./range-menu.js";
import { agendaQuickRange } from "./calendar-model.js";
import { timelineSelection } from "./timeline-select.js";
import { pageOf, localDate } from "./task-visibility.js";
import { cardKeyNumber } from "./card-key.js";
import { relationshipChanges } from "./task-relationship-model.js";
import { naturalGroups, inGroup } from "./task-group-order.js";
import { fieldOn } from "./card-fields.js";
import { statusLabel } from "./workflow-model.js";
import { priorityLabel } from "./task-priority.js";
import { projectPeople } from "./teams.js";

// Timeline's Group by (F0.21-91): the card fields List groups by, and tags.
const GROUPS = [["none", "No grouping"], ["status", "Status"], ["type", "Type"], ["assignee", "Assignee"], ["priority", "Priority"], ["tags", "Tag"]];
import {
  DAY,
  dateKey,
  shiftDate,
  isWeekend,
  weekStart,
  timelineAxis,
  timelineHeader,
  validTimelineChoice,
  timelineScaleFor,
  timelineBarBounds,
} from "./timeline-dates.js";
export { shiftDate } from "./timeline-dates.js";
// The dates a range choice shows: its own, or a quick range's as of today (F0.21-89).
function shownRange(choice) {
  if (!validTimelineChoice(choice)) return null;
  if (!choice.quick) return choice;
  const { from, to } = agendaQuickRange(choice.quick, localDate());
  return { start: from, end: to };
}
export function timelineHTML(
  tasks,
  ctx,
  scope = "project",
  showWeekends = true,
  requestedRange = null,
  list = "full",
  group = "none",
) {
  const { esc } = ctx;
  if (!["full", "number", "hidden"].includes(list)) list = "full";
  const config = ctx.state?.config || {}, groups = GROUPS.filter(([key]) => key === "none" || fieldOn(config, key));
  if (!groups.some(([key]) => key === group)) group = "none";
  const range = shownRange(requestedRange);
  const allDated = tasks.filter((t) => t.start || t.due);
  const allUndated = tasks.filter((t) => !t.start && !t.due);
  const pageKey = `${ctx.state?.project?.id || ""}/${scope}`;
  const page = pageOf(
    [...allDated, ...allUndated],
    ctx.state?.timelinePages?.[pageKey],
    200,
  );
  const dated = page.items.filter((t) => t.start || t.due);
  const undated = page.items.filter((t) => !t.start && !t.due);
  const stamps = allDated.flatMap((t) =>
    [t.start, t.due].filter(Boolean).map(Date.parse),
  );
  const min = range ? Date.parse(range.start) : weekStart(stamps.length ? Math.min(...stamps) : localDate());
  const max = range ? Date.parse(range.end) : stamps.length ? Math.max(...stamps) : min;
  // The scale follows the days shown (F0.21-89, no Day/Week/Month choice).
  const scale = timelineScaleFor(Math.round((max - min) / DAY) + 1);
  const unit = scale === "day" ? 42 : scale === "month" ? 4 : 16;
  const axis = timelineAxis(min, unit, showWeekends);
  const width = range ? Math.max(unit, axis.end(max)) : Math.max(700, axis.end(max) + 4 * unit);
  const step = scale === "day" ? 1 : showWeekends ? 7 : 5;
  const x = axis.x;
  // Dots at a bar's ends drag an arrow to another card (F0.21-90); pointer only, as the card's
  // Dependencies section does the same from the keyboard.
  // Scheduled rows under a band per group, in the order List's groups take; a card with several
  // tags shows under each.
  const groupName = (value) => group === "status" ? statusLabel(config, value) : group === "priority" ? priorityLabel(value) : group === "tags" ? value || "No tag" : group === "type" ? (value ? ctx.label(value) : "No type") : value || "Unassigned";
  const groupedRows = (rows, row) => group === "none" ? rows.map(row).join("") : naturalGroups(group, rows, config, projectPeople(ctx.state).map((p) => p.name))
    .map((value) => [value, rows.filter((t) => inGroup(t, group, value))]).filter(([, items]) => items.length)
    .map(([value, items]) => `<div class="timeline-section-label timeline-group-label" data-timeline-group-value="${esc(value)}"><span>${esc(groupName(value))} (${items.length})</span></div>${items.map(row).join("")}`).join("");
  const linkDots = '<span class="timeline-link" data-link-end="start" aria-hidden="true" title="Drag to a card this one waits for"></span><span class="timeline-link" data-link-end="due" aria-hidden="true" title="Drag to a card that waits for this one"></span>';
  const taskLabel = (t, unplanned = false) =>
    `<div class="timeline-task-label"><button class="timeline-task-open" data-action="task-open" data-id="${esc(t.id)}" title="${esc(t.key || "")} ${esc(t.title)}" aria-label="${esc(t.key || "")} ${esc(t.title)}" ${unplanned ? `draggable="${!sourceReadOnly(t,"due")}" data-unscheduled="${esc(t.id)}"` : ""}>${taskColorDot(ctx.state, "status", t.status)}<span class="timeline-key-full">${esc(t.key || "")}</span><span class="timeline-key-number">${esc(t.key ? cardKeyNumber(t.key) : t.title)}</span> <span class="timeline-title">${esc(t.title)}</span></button><button type="button" class="icon-button timeline-date-action ${unplanned ? "timeline-schedule" : ""}" data-task-dates="${esc(t.id)}" aria-label="${unplanned ? "Set" : "Edit"} dates for ${esc(t.title)}" title="${unplanned ? "Set" : "Edit"} dates" aria-haspopup="dialog" aria-expanded="false">${ctx.icon("calendar")}</button></div>`;
  const pager =
    page.pages > 1
      ? `<div class="timeline-page-summary" role="status">Page ${page.page + 1} of ${page.pages} · ${tasks.length} cards<button class="button small" data-timeline-page="${page.page - 1}" ${!page.page ? "disabled" : ""}>Previous cards</button><button class="button small" data-timeline-page="${page.page + 1}" ${page.page + 1 >= page.pages ? "disabled" : ""}>Next cards</button></div>`
      : "";
  // The project Timeline shows its options in the toolbar row; a board's Timeline keeps them inside.
  const head = `<div class="planning-head" data-timeline-options="${esc(scope)}" ${scope === "project" ? "data-phone-options" : ""}><div class="timeline-options"><label data-filters-option><span class="control-label">Group by</span> <select data-timeline-group="${esc(scope)}" aria-label="Group by">${groups.map(([value, name]) => `<option value="${value}" ${group === value ? "selected" : ""}>${name}</option>`).join("")}</select></label><label data-filters-option><span class="control-label">Card list</span> <select data-timeline-list="${esc(scope)}" aria-label="Card list">${[["full", "Full list"], ["number", "Card numbers"], ["hidden", "List hidden"]].map(([value, name]) => `<option value="${value}" ${list === value ? "selected" : ""}>${name}</option>`).join("")}</select></label><button type="button" class="button small range-trigger" data-timeline-range aria-haspopup="dialog" aria-expanded="false" aria-label="Timeline range: ${esc(timelineRangeName(requestedRange, range))}" title="Timeline range">${rangeLabelHTML(timelineRangeName(requestedRange, range), ctx)}</button><label class="check-control"><input type="checkbox" data-timeline-weekends data-weekends-toggle ${showWeekends ? "checked" : ""}>Show weekends</label></div><span class="timeline-hint" role="status">${range && axis.end(max) === 0 ? "No weekdays in this range. Show weekends or change the range." : "Choose a row to set its start and end dates. Drag bars to move or resize."}</span></div>`;
  const section = (options) => `<section class="task-timeline" data-timeline="${esc(scope)}" data-list="${esc(list)}" data-min="${min}" data-unit="${unit}" data-scale="${scale}" data-weekends="${showWeekends}" data-range-start="${range?.start || ""}" data-range-end="${range?.end || ""}" data-range-choice="${range && requestedRange.quick ? esc(requestedRange.quick) : ""}" data-auto-end="${axis.dateAt(width - 1)}" style="--timeline-unit:${unit}px;--timeline-step:${step * unit}px;--timeline-week:${7 * unit}px;--timeline-work:${5 * unit}px">
    ${options}${pager}
    <div class="timeline-scroll" tabindex="0" role="region" aria-label="Project timeline"><div class="timeline-sheet" style="width:${tasks.length ? `calc(${width}px + var(--timeline-label))` : "100%"}">
      <div class="timeline-header"><span class="timeline-task-label"><span class="timeline-head-full">Card</span><span class="timeline-head-number">#</span></span><div class="timeline-ruler"></div></div>
      <svg class="timeline-dependencies" height="${dated.length * 44}" style="left:var(--timeline-label);top:60px" role="img" aria-label="Card dependencies"></svg>
      ${groupedRows(dated, (t) => `<div class="timeline-row" data-timeline-row="${esc(t.id)}">${taskLabel(t)}<div class="timeline-track" data-schedule-target tabindex="0" role="group" aria-label="Choose start and end dates for ${esc(t.title)}" title="Choose a start, then an end" ${sourceReadOnly(t,"due") ? 'aria-disabled="true"' : ""}><div tabindex="0" role="slider" aria-label="Schedule ${esc(t.title)}" aria-valuetext="${esc(t.start || t.due)} to ${esc(t.due || t.start)}" class="timeline-bar ${t.milestone ? "milestone" : ""} ${!showWeekends && axis.end(t.due || t.start) === x(t.start || t.due) ? "weekend-only" : ""} ${linkEdges(x(t.start || t.due), Math.max(12, axis.end(t.due || t.start) - x(t.start || t.due)), width)}" data-timeline-task="${esc(t.id)}" title="${esc(t.start || t.due)} to ${esc(t.due || t.start)} · Select to edit dates · Alt+arrows moves by a ${showWeekends ? "day" : "weekday"}" data-task-color="status" style="--task-field-color:${taskFieldColor(ctx.state, "status", t.status)};left:${x(t.start || t.due)}px;width:${Math.max(12, axis.end(t.due || t.start) - x(t.start || t.due))}px"><span data-date-end="start" role="separator" aria-label="Resize start date"></span><span class="timeline-bar-text">${esc(t.title)}</span><span data-date-end="due" role="separator" aria-label="Resize due date"></span>${linkDots}</div><span class="timeline-outside" hidden>Outside range</span><button class="milestone-toggle" data-milestone="${esc(t.id)}" aria-pressed="${!!t.milestone}" title="Toggle milestone">◇</button></div></div>`)}
      ${undated.length ? `<div class="timeline-section-label"><span>Unscheduled (${allUndated.length})</span></div>${undated.map((t) => `<div class="timeline-row timeline-unplanned" data-timeline-row="${esc(t.id)}">${taskLabel(t, true)}<div class="timeline-track" data-schedule-target tabindex="0" role="group" aria-label="Choose start and end dates for ${esc(t.title)}" title="Choose a start, then an end" ${sourceReadOnly(t,"due") ? 'aria-disabled="true"' : ""}><span class="timeline-schedule-hint" aria-hidden="true"><span class="timeline-hint-card">${esc(t.key || "")} ${esc(t.title)} · </span>Set start, then end</span></div></div>`).join("")}` : ""}
      ${!tasks.length ? `<div class="empty">${ctx.icon("leaf")}<h2>${ctx.state?.tasks?.length ? "No matching cards" : "No cards yet"}</h2><button class="button soft" data-action="${ctx.state?.tasks?.length ? "filters-reset" : "task-new"}">${ctx.state?.tasks?.length ? "Clear filters" : "Add a card"}</button></div>` : ""}
    </div></div></section>`;
  return scope === "project" ? { controls: head, html: section("") } : section(head);
}
// A link dot that would fall past the timeline's edge is left out (board-upgrades.css).
const linkEdges = (left, width, track) => `${left < 24 ? "link-edge-start" : ""} ${track - left - width < 24 ? "link-edge-due" : ""}`;
export function timelineInteractions(ctx, onOption) {
  const { state, patchTask, task, renderView, toast } = ctx;
  const dateEditor = taskDateEditor(ctx);
  const rangeEditor = timelineRangeEditor(ctx, onOption);
  const selection = timelineSelection(ctx, () => { dateEditor.close(); rangeEditor.close(); });
  function editDates(id, trigger) {
    const projectId = state.project.id;
    const scope = trigger.closest("[data-timeline]").dataset.timeline;
    // The chosen row while it shows (a card grouped under several tags has a row in each), else the card's first.
    const row = () => (trigger.isConnected && trigger.closest("[data-timeline-row]")) ||
      document.querySelector(`[data-timeline="${CSS.escape(scope)}"] [data-timeline-row="${CSS.escape(id)}"]`);
    dateEditor.open(id, () => (state.project?.id === projectId ? row()?.querySelector("[data-task-dates]") : null),
      { chooseOnTimeline: () => selection.arm(row()?.querySelector("[data-schedule-target]")) },
    );
  }
  function drawDependencies(root) {
    const svg = root.querySelector(".timeline-dependencies");
    if (!svg) return;
    const origin = svg.getBoundingClientRect(), scale = origin.width / svg.clientWidth || 1;
    const bars = new Map([...root.querySelectorAll("[data-timeline-task]:not([hidden])")].map(bar => {
      const rect = bar.getBoundingClientRect();
      return [bar.dataset.timelineTask, { left: (rect.left - origin.left) / scale, right: (rect.right - origin.left) / scale,
        top: (rect.top - origin.top) / scale, center: (rect.top + rect.height / 2 - origin.top) / scale }];
    }));
    const marker = `timeline-arrow-${encodeURIComponent(root.dataset.timeline)}`;
    const paths = [];
    for (const [id, target] of bars) {
      const t = task(id);
      for (const predecessor of t?.dependencies || []) {
        const source = bars.get(predecessor);
        if (!source || predecessor === id) continue;
        const sx = source.right + 1, sy = source.center, tx = target.left - 2, ty = target.center;
        let path;
        if (tx < 10) {
          // At the left edge, enter above the bar so the arrowhead stays visible.
          const endX = target.left + Math.min(12, (target.right - target.left) / 2), endY = target.top - 2;
          path = `M${sx},${sy} H${sx + 10} V${endY - 6} H${endX} V${endY}`;
        } else if (tx >= sx + 20) {
          const middle = sx + Math.min(24, (tx - sx) / 2);
          path = `M${sx},${sy} H${middle} V${ty} H${tx}`;
        } else {
          // Route backwards dependencies through the space between rows.
          const lane = sy + (ty > sy ? 22 : -22);
          path = `M${sx},${sy} H${sx + 10} V${lane} H${tx - 10} V${ty} H${tx}`;
        }
        paths.push(`<path class="timeline-dependency-path" data-from="${ctx.esc(predecessor)}" data-to="${ctx.esc(id)}" d="${path}" marker-end="url(#${marker})"><title>${ctx.esc(t.title)} depends on ${ctx.esc(task(predecessor)?.title || predecessor)}</title></path>`);
      }
    }
    svg.innerHTML = `<defs><marker id="${marker}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="currentColor" stroke="none"/></marker></defs>${paths.join("")}`;
  }
  const resize = new ResizeObserver((entries) => {
    for (const { target: ruler } of entries) {
      const root = ruler.closest("[data-timeline]");
      let unit = +root.dataset.unit;
      const range = root.dataset.rangeEnd ? { start: root.dataset.rangeStart, end: root.dataset.rangeEnd } : null,
        showWeekends = root.dataset.weekends !== "false";
      if (range) {
        const days = timelineAxis(+root.dataset.min, 1, showWeekends).end(range.end);
        unit = ruler.clientWidth / Math.max(1, days);
        root.dataset.unit = unit;
        const step = root.dataset.scale === "day" ? 1 : showWeekends ? 7 : 5;
        for (const [key, value] of Object.entries({ unit, step: step * unit, week: 7 * unit, work: 5 * unit }))
          root.style.setProperty(`--timeline-${key}`, `${value}px`);
        const offset = (new Date(+root.dataset.min).getUTCDay() + 6) % 7;
        root.style.setProperty("--timeline-offset", `${-Math.min(offset, showWeekends ? 6 : 5) * unit}px`);
        const axis = timelineAxis(+root.dataset.min, unit, showWeekends);
        for (const bar of root.querySelectorAll("[data-timeline-task]")) {
          const t = task(bar.dataset.timelineTask), start = t.start || t.due, due = t.due || t.start;
          const box = timelineBarBounds(axis, start, due, days ? ruler.clientWidth : 0, range);
          bar.hidden = box.outside;
          bar.style.left = `${box.left}px`;
          bar.style.width = `${box.width}px`;
          bar.classList.toggle("clipped-start", box.clippedStart);
          bar.classList.toggle("clipped-end", box.clippedEnd);
          bar.classList.toggle("link-edge-start", box.left < 24);
          bar.classList.toggle("link-edge-due", ruler.clientWidth - box.left - box.width < 24);
          const outside = bar.parentElement.querySelector(".timeline-outside");
          outside.hidden = !box.outside;
          outside.textContent = days ? "Outside range" : "No weekdays in range";
        }

      }
      drawDependencies(root);
      const { months, ticks } = timelineHeader(
        +root.dataset.min,
        unit,
        showWeekends,
        root.dataset.scale,
        ruler.clientWidth,
        range?.end,
      );
      const band = (className, items) => {
        const row = document.createElement("div");
        row.className = className;
        for (const item of items) {
          const span = document.createElement("span");
          span.style.left = `${item.left}px`;
          span.style.width = `${item.width}px`;
          if (className === "timeline-ticks") {
            const label = document.createElement("span");
            label.textContent = item.label;
            span.append(label);
          } else span.textContent = item.label;
          span.title = item.title;
          span.setAttribute("aria-label", item.title);
          if (item.date) span.dataset.date = item.date;
          if (item.weekend) span.classList.add("weekend");
          row.append(span);
        }
        return row;
      };
      ruler.replaceChildren(
        band("timeline-months", months),
        band("timeline-ticks", ticks),
      );
      const today = localDate(),
        axis = timelineAxis(+root.dataset.min, unit, showWeekends);
      const left =
        axis.x(today) + (!showWeekends && isWeekend(today) ? 0 : unit / 2);
      if (left >= 0 && left < ruler.clientWidth) {
        const marker = document.createElement("span");
        marker.className = "timeline-today";
        marker.setAttribute("role", "img");
        marker.style.left = `${left}px`;
        marker.title = `Today · ${today}`;
        marker.setAttribute("aria-label", marker.title);
        ruler.append(marker);
      }
    }
  });
  function render() {
    selection.refresh();
    resize.disconnect();
    document
      .querySelectorAll(".timeline-ruler")
      .forEach((ruler) => resize.observe(ruler));
  }

  let drag = null,
    link = null,
    unscheduled = null,
    suppress = false;
  // Dragging a link dot (F0.21-90): a dashed arrow follows the pointer, and the card under it
  // waits for this one (from the end dot) or this one waits for it (from the start dot).
  function linkPoint(svg, x, y) {
    const r = svg.getBoundingClientRect(), z = r.width / svg.clientWidth || 1;
    return [(x - r.left) / z, (y - r.top) / z];
  }
  function startLink(e, dot) {
    if (link) return;
    const root = dot.closest("[data-timeline]"), svg = root.querySelector(".timeline-dependencies"), bar = dot.closest("[data-timeline-task]");
    const box = bar.getBoundingClientRect(), path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "timeline-link-preview");
    svg.append(path);
    dateEditor.close();
    link = { pointer: e.pointerId, root, svg, path, from: bar.dataset.timelineTask, end: dot.dataset.linkEnd, target: null,
      start: linkPoint(svg, dot.dataset.linkEnd === "due" ? box.right : box.left, box.top + box.height / 2) };
    root.dataset.linking = "";
    state.toolDragging = true;
    root.setPointerCapture(e.pointerId);
    moveLink(e);
  }
  function moveLink(e) {
    // A re-render replaced the timeline: drop the arrow rather than link from a stale view.
    if (!link.root.isConnected) return void endLink(true);
    if (link.cancelled) return;
    const [x, y] = linkPoint(link.svg, e.clientX, e.clientY), [sx, sy] = link.start;
    link.path.setAttribute("d", `M${sx},${sy} L${x},${y}`);
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-timeline-row]");
    const id = row && link.root.contains(row) && row.dataset.timelineRow !== link.from ? row.dataset.timelineRow : null;
    if (id === link.target) return;
    link.root.querySelector("[data-link-target]")?.removeAttribute("data-link-target");
    row?.toggleAttribute("data-link-target", !!id);
    link.target = id;
  }
  function clearLink(l) {
    l.path.remove();
    delete l.root.dataset.linking;
    l.root.querySelector("[data-link-target]")?.removeAttribute("data-link-target");
  }
  async function endLink(cancel) {
    const l = link;
    link = null;
    state.toolDragging = false;
    clearLink(l);
    if (l.root.hasPointerCapture(l.pointer)) l.root.releasePointerCapture(l.pointer);
    suppress = true;
    setTimeout(() => (suppress = false), 0);
    if (cancel || l.cancelled || !l.target) return;
    try {
      const [change] = relationshipChanges(state.tasks, state.config, l.from, l.end === "due" ? "blocks" : "blocked-by", l.target);
      const next = change?.changes.dependencies;
      if (next && next.length !== (task(change.id)?.dependencies || []).length) await patchTask(change.id, change.changes);
    } catch (err) {
      toast(err.message, true);
    }
  }
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      const dot = e.target.closest("[data-link-end]");
      if (dot && e.button === 0) {
        stop(e);
        startLink(e, dot);
        return;
      }
      const el = e.target.closest("[data-timeline-task]");
      if (!el || e.button !== 0) return;
      stop(e);
      const root = el.closest("[data-timeline]"),
        t = task(el.dataset.timelineTask);
      if (!t || sourceReadOnly(t,"due")) return;
      dateEditor.close();
      drag = {
        pointer: e.pointerId,
        capture: root,
        el,
        t,
        start: t.start || t.due,
        due: t.due || t.start,
        range: root.dataset.rangeEnd ? { start: root.dataset.rangeStart, end: root.dataset.rangeEnd } : null,
        width: el.parentElement.clientWidth,
        x: e.clientX,
        axis: timelineAxis(
          +root.dataset.min,
          +root.dataset.unit,
          root.dataset.weekends !== "false",
        ),
        unit:
          +root.dataset.unit *
          (root.closest(".board-node") ? state.camera.z : 1),
        end: e.target.dataset.dateEnd,
        moved: false,
      };
      state.toolDragging = true;
      root.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (link && e.pointerId === link.pointer) {
        stop(e);
        moveLink(e);
        return;
      }
      if (!drag || e.pointerId !== drag.pointer) return;
      stop(e);
      const d = drag,
        delta = Math.round((e.clientX - d.x) / d.unit);
      d.moved ||= Math.abs(e.clientX - d.x) > 3;
      if (!d.moved) return;
      d.next = {
        start: d.end === "due" ? d.start : d.axis.shift(d.start, delta),
        due:
          d.end === "start"
            ? d.due
            : d.end === "due"
              ? d.axis.shift(d.due, delta)
              : shiftDate(
                  d.due,
                  (Date.parse(d.axis.shift(d.start, delta)) -
                    Date.parse(d.start)) /
                    DAY,
                ),
      };
      if (d.next.start > d.next.due) {
        if (d.end === "start") d.next.start = d.next.due;
        else d.next.due = d.next.start;
      }
      d.el.querySelector(".timeline-bar-text").textContent = `${d.next.start} → ${d.next.due}`;
      const bounds = timelineBarBounds(d.axis, d.next.start, d.next.due, d.width, d.range);
      d.el.style.left = `${bounds.left}px`;
      d.el.style.width = `${bounds.width}px`;
      drawDependencies(d.capture);
    },
    true,
  );
  async function finish(e, cancel = false) {
    if (link && (e?.pointerId == null || e.pointerId === link.pointer)) {
      e?.stopImmediatePropagation();
      return endLink(cancel);
    }
    if (!drag || (e?.pointerId != null && e.pointerId !== drag.pointer)) return;
    e?.stopImmediatePropagation();
    const d = drag;
    drag = null;
    state.toolDragging = false;
    if (d.capture?.hasPointerCapture(d.pointer))
      d.capture.releasePointerCapture(d.pointer);
    const edit = !cancel && !d.moved && !d.end;
    suppress = d.moved || edit;
    setTimeout(() => (suppress = false), 0);
    try {
      if (!cancel && d.moved && d.next) await patchTask(d.t.id, d.next);
      else if (d.moved) renderView(true);
      else if (edit) editDates(d.t.id, d.el);
    } catch (err) {
      toast(err.message, true);
    }
  }
  // A mouse near a bar's row shows its link dots; touch never does (see board-upgrades.css).
  let nearBar = null;
  const showNear = (bar) => {
    if (bar === nearBar) return;
    nearBar?.removeAttribute("data-near");
    bar?.setAttribute("data-near", "");
    nearBar = bar;
  };
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || drag || link) return;
    const bar = e.target.closest?.("[data-timeline-row]")?.querySelector("[data-timeline-task]:not([hidden])"), r = bar?.getBoundingClientRect();
    showNear(r && e.clientX > r.left - 32 && e.clientX < r.right + 32 ? bar : null);
  }, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => showNear(null));
  document.addEventListener("pointerup", (e) => finish(e), true);
  document.addEventListener("pointercancel", (e) => finish(e, true), true);
  window.addEventListener("blur", () => finish(null, true));
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        stop(e);
        finish(null, true);
      }
      // Escape drops the arrow; the pointer still ends the drag, so its click does nothing.
      if (link && e.key === "Escape") {
        stop(e);
        clearLink(link);
        link.cancelled = true;
      }
      const el = e.target.closest("[data-timeline-task]");
      if (el && ["Enter", " "].includes(e.key)) {
        stop(e);
        editDates(el.dataset.timelineTask, el);
        return;
      }
      if (
        el &&
        !sourceReadOnly(task(el.dataset.timelineTask),"due") &&
        e.altKey &&
        ["ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        stop(e);
        const t = task(el.dataset.timelineTask),
          d = e.key === "ArrowLeft" ? -1 : 1,
          root = el.closest("[data-timeline]"),
          axis = timelineAxis(
            +root.dataset.min,
            +root.dataset.unit,
            root.dataset.weekends !== "false",
          ),
          start = axis.shift(t.start || t.due, d),
          delta = (Date.parse(start) - Date.parse(t.start || t.due)) / DAY;
        patchTask(t.id, {
          start,
          due: shiftDate(t.due || t.start, delta),
        }).catch((err) => toast(err.message, true));
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (suppress) {
        stop(e);
        return;
      }
      const dates = e.target.closest("[data-task-dates]");
      const range = e.target.closest("[data-timeline-range]");
      if (range) {
        stop(e); selection.clear(); dateEditor.close(); rangeEditor.open(range); return;
      }
      const bar = e.target.closest("[data-timeline-task]");
      if (dates || (bar && !e.target.closest("[data-date-end]"))) {
        stop(e);
        editDates(
          dates?.dataset.taskDates || bar.dataset.timelineTask,
          dates || bar,
        );
        return;
      }
      const paging = e.target.closest("[data-timeline-page]");
      if (paging) {
        stop(e);
        state.timelinePages ||= {};
        state.timelinePages[
          `${state.project.id}/${paging.closest("[data-timeline]").dataset.timeline}`
        ] = Number(paging.dataset.timelinePage);
        renderView(true);
        return;
      }
      const id = e.target.closest("[data-milestone]")?.dataset.milestone;
      if (id) {
        stop(e);
        patchTask(id, { milestone: !task(id).milestone }).catch((err) =>
          toast(err.message, true),
        );
      }
    },
    true,
  );
  document.addEventListener("change", (e) => {
    // Its own scope: on desktop and iPad it waits in Filters, away from the other options.
    if (e.target.matches("[data-timeline-list]"))
      onOption(e.target.dataset.timelineList, "list", e.target.value);
    if (e.target.matches("[data-timeline-group]"))
      onOption(e.target.dataset.timelineGroup, "group", e.target.value);
    if (e.target.matches("[data-timeline-weekends]") && e.target.type === "checkbox")
      onOption(
        timelineRoot(e.target).dataset.timeline,
        "weekends",
        e.target.checked,
      );
  });
  document.addEventListener(
    "dragstart",
    (e) => {
      const n = e.target.closest("[data-unscheduled]");
      if (!n) return;
      if (sourceReadOnly(task(n.dataset.unscheduled),"due")) return stop(e);
      unscheduled = n.dataset.unscheduled;
      e.dataTransfer.setData("text/x-pencils-task", unscheduled);
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    "dragover",
    (e) => {
      if (unscheduled && e.target.closest("[data-schedule-target]")) stop(e);
    },
    true,
  );
  document.addEventListener(
    "drop",
    (e) => {
      const track = e.target.closest("[data-schedule-target]");
      if (!track || !unscheduled) return;
      stop(e);
      const root = track.closest("[data-timeline]"),
        r = track.getBoundingClientRect(),
        z = root.closest(".board-node") ? state.camera.z : 1,
        axis = timelineAxis(
          +root.dataset.min,
          +root.dataset.unit,
          root.dataset.weekends !== "false",
        ),
        date = axis.dateAt(Math.max(0, (e.clientX - r.left) / z));
      patchTask(unscheduled, { start: date, due: date }).catch((err) =>
        toast(err.message, true),
      );
      unscheduled = null;
    },
    true,
  );
  document.addEventListener("dragend", () => (unscheduled = null));
  return { render };
}
