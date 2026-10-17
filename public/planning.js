import { localDate } from "./task-visibility.js";
import { capacityView } from "./capacity.js";
import { timelineHTML, timelineInteractions } from "./task-timeline.js";
export function planning(ctx) {
  const { state, esc, api, $, taskDialog, renderView } = ctx;
  const capacity = capacityView(ctx);
  const today = localDate;
  let calendarMode = ctx.storage.get(
    "calendar-mode",
    matchMedia("(max-width: 780px)").matches ? "agenda" : "month",
  );
  let agendaPeriod = ctx.storage.get("agenda-period", "week"),
    agendaDate = localDate();
  let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function calendar(tasks) {
    const start = new Date(month);
    start.setDate(1 - ((start.getDay() + 6) % 7));
    const anchor = new Date(agendaDate + "T12:00:00");
    let from = agendaDate,
      to = agendaDate;
    if (agendaPeriod === "week") {
      anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      from = dateKey(anchor);
      anchor.setDate(anchor.getDate() + 6);
      to = dateKey(anchor);
    }
    if (agendaPeriod === "month") {
      from = dateKey(month);
      to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    }
    const agenda = `<div class="calendar-agenda">${
      tasks
        .filter((t) => t.due && t.due >= from && t.due <= to)
        .sort((a, b) => a.due.localeCompare(b.due))
        .map(
          (t) =>
            `<div class="agenda-row"><time datetime="${esc(t.due)}">${esc(new Date(t.due + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))}</time><button data-action="task-open" data-id="${esc(t.id)}">${esc(t.key || "")} ${esc(t.title)}</button><input type="date" ${t.source?'disabled title="Change the due date in the source"':""} data-agenda-date="${esc(t.id)}" value="${esc(t.due)}" aria-label="Due date for ${esc(t.title)}"></div>`,
        )
        .join("") || '<p class="field-hint">No tasks due in this period.</p>'
    }</div>`;
    const unscheduled = `<details class="calendar-unscheduled"><summary>Unscheduled (${tasks.filter((t) => !t.due).length})</summary>${
      tasks
        .filter((t) => !t.due)
        .map(
          (t) =>
            `<div class="agenda-row"><button data-action="task-open" data-id="${esc(t.id)}">${esc(t.key || "")} ${esc(t.title)}</button><input type="date" ${t.source?'disabled title="Change the due date in the source"':""} data-agenda-date="${esc(t.id)}" aria-label="Due date for ${esc(t.title)}"></div>`,
        )
        .join("") || "<p>All matching tasks have a due date.</p>"
    }</details>`;
    return `<div class="planning-head"><button class="button small" data-feature="month-prev">← Previous</button><h2>${calendarMode === "agenda" && agendaPeriod !== "month" ? `${esc(from)}${from !== to ? ` → ${esc(to)}` : ""}` : month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><button class="button small" data-feature="month-next">Next →</button><label>Layout <select id="calendar-mode"><option value="month" ${calendarMode === "month" ? "selected" : ""}>Month</option><option value="agenda" ${calendarMode === "agenda" ? "selected" : ""}>Agenda</option></select></label>${calendarMode === "agenda" ? `<label>Period<select id="agenda-period">${["day", "week", "month"].map((p) => `<option value="${p}" ${p === agendaPeriod ? "selected" : ""}>${ctx.label(p)}</option>`).join("")}</select></label><input type="date" id="agenda-date" aria-label="Agenda date" value="${agendaDate}">` : ""}</div>${
      calendarMode === "agenda"
        ? agenda
        : `<div class="calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<strong class="${i > 4 ? "weekend" : ""}">${d}</strong>`).join("")}${Array.from(
            { length: 42 },
            (_, i) => {
              const d = new Date(start);
              d.setDate(d.getDate() + i);
              const key = dateKey(d);
              return `<div class="calendar-day ${i % 7 > 4 ? "weekend" : ""} ${key === today() ? "today" : ""} ${d.getMonth() !== month.getMonth() ? "muted" : ""}"><button data-feature="date-task" data-date="${key}" aria-label="Add task due ${key}">${d.getDate()}</button>${tasks
                .filter((t) => t.due === key)
                .map(
                  (t) =>
                    `<button class="calendar-task" data-action="task-open" data-id="${esc(t.id)}">${esc(t.key || "")} ${esc(t.title)}</button>`,
                )
                .join("")}</div>`;
            },
          ).join("")}</div>`
    }${unscheduled}<p class="field-hint">${tasks.filter((t) => !t.due).length} tasks have no due date. Select a date to add a task.</p>`;
  }
  let timelineScale = ctx.storage.get("timeline-scale", "week");
  timelineInteractions(ctx, (scope, value) => {
    if (scope === "project") {
      timelineScale = value;
      ctx.storage.set("timeline-scale", value);
      renderView(true);
    } else
      ctx.changeBoard((b) => {
        const n = b.nodes.find((n) => n.id === scope);
        if (n) n.timelineScale = value;
      });
  });
  function timeline(tasks) {
    return timelineHTML(tasks, ctx, timelineScale);
  }
  function overview(metric) {
    const tasks = state.tasks.filter((t) => !t.archived),
      open = tasks.filter((t) => !state.config.done.includes(t.status));
    const due = open
      .filter((t) => t.due)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 8);
    const blocked = open.filter((t) =>
      (t.dependencies || []).some((id) =>
        tasks.some(
          (other) =>
            other.id === id && !state.config.done.includes(other.status),
        ),
      ),
    );
    return `<div class="project-overview"><p class="field-hint">All ${tasks.length} active project tasks · ${state.tasks.length-tasks.length} archived tasks excluded. Current project data; list filters do not apply.</p><div class="dashboard-metrics"><button class="dashboard-metric" data-feature="overview-open" data-query="done"><strong>${metric.percent}%</strong>Complete</button><button class="dashboard-metric" data-feature="overview-open" data-query="open"><strong>${open.length}</strong>Open tasks</button><button class="dashboard-metric" data-feature="overview-open" data-query="blocked"><strong>${blocked.length}</strong>Blocked</button><button class="dashboard-metric" data-feature="overview-open" data-query="overdue"><strong>${open.filter((t) => t.due && t.due < today()).length}</strong>Overdue</button></div><div class="project-overview-columns"><section class="overview-summary"><h2>About this project</h2><div class="canvas-markdown">${ctx.markdown(state.project.body || "Add a description in Project settings.")}</div><h2>Work by status</h2>${state.config.statuses.map((status) => `<div class="overview-status"><span>${esc(ctx.statusNames[status] || status)}</span><strong>${tasks.filter((t) => t.status === status).length}</strong></div>`).join("")}</section><section class="dashboard-deadlines"><h2>Upcoming and overdue</h2>${due.map((t) => `<button data-action="task-open" data-id="${esc(t.id)}"><span>${esc(t.title)}<small>${esc(t.assignee || "Unassigned")}</small></span><time>${esc(t.due)}</time></button>`).join("") || "<p>No open tasks have deadlines.</p>"}</section></div></div>`;
  }
  async function dashboard() {
    const data = await api("/overview");
    state.overview = data;
    if (state.project || !$(".organisation-overview")) return;
    const projects = data.projects.filter(
        (p) => p.organisation === state.organisation?.id && !p.archived,
      ),
      tasks = data.tasks.filter(
        (t) =>
          t.organisation === state.organisation?.id &&
          !t.archived &&
          !t.completed,
      );
    const due = tasks
      .filter((t) => t.due)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 8);
    $(".organisation-overview").insertAdjacentHTML(
      "afterbegin",
      `<div class="dashboard-metrics"><div><strong>${tasks.length}</strong>Open tasks</div><div><strong>${tasks.filter((t) => t.blocked).length}</strong>Blocked</div><div><strong>${tasks.filter((t) => t.due && t.due < today()).length}</strong>Overdue</div><div><strong>${projects.length}</strong>Active projects</div></div><div class="dashboard-deadlines"><h2>Upcoming and overdue</h2>${due.map((t) => `<button data-feature="global-open" data-project="${esc(t.project)}" data-id="${esc(t.id)}"><span>${esc(t.title)}<small>${esc(t.project_title)}${t.blocked ? " · Blocked" : ""}</small></span><time>${esc(t.due)}</time></button>`).join("") || "<p>No open tasks have deadlines.</p>"}</div>`,
    );
    for (const p of projects) {
      const card = $(`.project-card[data-id="${p.id}"]`);
      card?.insertAdjacentHTML(
        "beforeend",
        `<span class="project-health">${p.progress.percent}% complete · ${p.overdue ? "Needs attention" : p.blocked ? "Blocked work" : "On track"}<small>${p.blocked} blocked · ${p.overdue} overdue</small></span>`,
      );
    }
  }
  document.addEventListener("change", async (event) => {
    if (event.target.id === "agenda-period") {
      agendaPeriod = event.target.value;
      ctx.storage.set("agenda-period", agendaPeriod);
      renderView(true);
    }
    if (event.target.id === "agenda-date" && event.target.value) {
      agendaDate = event.target.value;
      const date = new Date(agendaDate + "T12:00:00");
      month = new Date(date.getFullYear(), date.getMonth(), 1);
      renderView(true);
    }
    if (event.target.id === "calendar-mode") {
      calendarMode = event.target.value;
      ctx.storage.set("calendar-mode", calendarMode);
      renderView(true);
    }
    if (event.target.dataset.agendaDate) {
      const el = event.target;
      el.disabled = true;
      try {
        await ctx.patchTask(el.dataset.agendaDate, { due: el.value || null });
        renderView(true);
      } catch (error) {
        ctx.toast(error.message, true);
        el.disabled = false;
      }
    }
  });
  function click(action, el) {
    if (action === "overview-open") {
      state.search = "";
      state.status = "all";
      state.type = "all";
      state.page = 0;
      state.extraFilters =
        el.dataset.query === "blocked"
          ? { blocked: true, completion: "open" }
          : el.dataset.query === "overdue"
            ? { due: "overdue" }
            : { completion: el.dataset.query };
      state.view = "list";
      state.savedView = null;
      ctx.renderApp();
      return true;
    }
    if (capacity.click(action)) return true;
    if (action === "month-prev" || action === "month-next") {
      if (calendarMode === "agenda" && agendaPeriod !== "month") {
        const date = new Date(agendaDate + "T12:00:00");
        date.setDate(
          date.getDate() +
            (action === "month-prev" ? -1 : 1) *
              (agendaPeriod === "week" ? 7 : 1),
        );
        agendaDate = dateKey(date);
        renderView(true);
        return true;
      }
      month = new Date(
        month.getFullYear(),
        month.getMonth() + (action === "month-next" ? 1 : -1),
        1,
      );
      renderView(true);
      return true;
    }
    if (action === "date-task") {
      taskDialog(null, { due: el.dataset.date });
      return true;
    }
    return false;
  }
  return {
    calendar,
    timeline,
    capacity: capacity.render,
    overview,
    dashboard,
    click,
  };
}
