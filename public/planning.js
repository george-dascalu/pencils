import { formatDay } from "./format-date.js";
import { taskColorAttributes, taskColorDot } from "./task-colors.js";
import { localDate } from "./task-visibility.js";
import { capacityView } from "./capacity.js";
import { calendarView } from "./calendar.js";
import { timelineHTML, timelineInteractions } from "./task-timeline.js";
export function planning(ctx) {
  const { state, esc, api, $, renderView } = ctx;
  const capacity = capacityView(ctx);
  const today = localDate;
  const calendar = calendarView(ctx);
  let timelineScale = ctx.storage.get("timeline-scale", "week");
  let timelineWeekends = ctx.storage.get("timeline-weekends", true) !== false;
  const timelineController = timelineInteractions(ctx, (scope, option, value) => {
    if (scope === "project") {
      if (option === "scale") timelineScale = value;
      else if (option === "weekends") timelineWeekends = value;
      ctx.storage.set(option === "range" ? `timeline-range:${state.project.id}` : `timeline-${option}`, value);
      renderView(true);
    } else
      return ctx.changeBoard((b) => {
        const n = b.nodes.find((n) => n.id === scope);
        if (n) n[{ scale: "timelineScale", weekends: "timelineShowWeekends", range: "timelineRange" }[option]] = value;
      });
  });
  function timeline(tasks) {
    return timelineHTML(tasks, ctx, timelineScale, "project", timelineWeekends, ctx.storage.get(`timeline-range:${state.project.id}`, null));
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
    return `<div class="project-overview"><p class="field-hint">${tasks.length} active cards${state.tasks.length-tasks.length ? ` · ${state.tasks.length-tasks.length} archived` : ""}. List filters do not apply here.</p><div class="dashboard-metrics"><button class="dashboard-metric" data-feature="overview-open" data-query="done"><strong>${metric.percent}%</strong>Complete</button><button class="dashboard-metric" data-feature="overview-open" data-query="open"><strong>${open.length}</strong>Open tasks</button><button class="dashboard-metric" data-feature="overview-open" data-query="blocked"><strong>${blocked.length}</strong>Blocked</button><button class="dashboard-metric" data-feature="overview-open" data-query="overdue"><strong>${open.filter((t) => t.due && t.due < today()).length}</strong>Overdue</button></div><div class="project-overview-columns"><section class="overview-summary"><h2>About this project</h2><div class="canvas-markdown">${ctx.markdown(state.project.body || "Add a description in Project settings.")}</div><h2>Work by status</h2>${state.config.statuses.map((status) => `<div class="overview-status"><span>${taskColorDot(state, "status", status)}${esc(ctx.statusNames[status] || status)}</span><strong>${tasks.filter((t) => t.status === status).length}</strong></div>`).join("")}</section><section class="dashboard-deadlines"><h2>Upcoming and overdue</h2>${due.map((t) => `<button data-action="task-open" data-id="${esc(t.id)}"><span>${esc(t.title)}<small class="task-color-badge" ${taskColorAttributes(state, "assignee", t.assignee)}>${esc(t.assignee || "Unassigned")}</small></span><time datetime="${esc(t.due)}">${esc(formatDay(t.due))}</time></button>`).join("") || "<p>No open tasks have deadlines.</p>"}</section></div></div>`;
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
      `<div class="dashboard-metrics"><div><strong>${tasks.length}</strong>Open tasks</div><div><strong>${tasks.filter((t) => t.blocked).length}</strong>Blocked</div><div><strong>${tasks.filter((t) => t.due && t.due < today()).length}</strong>Overdue</div><div><strong>${projects.length}</strong>Active projects</div></div><div class="dashboard-deadlines"><h2>Upcoming and overdue</h2>${due.map((t) => `<button data-feature="global-open" data-project="${esc(t.project)}" data-id="${esc(t.id)}"><span>${esc(t.title)}<small>${esc(t.project_title)}${t.blocked ? " · Blocked" : ""}</small></span><time datetime="${esc(t.due)}">${esc(formatDay(t.due))}</time></button>`).join("") || "<p>No open tasks have deadlines.</p>"}</div>`,
    );
    for (const p of projects) {
      const card = $(`.project-card[data-id="${p.id}"]`);
      card?.insertAdjacentHTML(
        "beforeend",
        `<span class="project-health">${p.progress.percent}% complete · ${p.overdue ? "Needs attention" : p.blocked ? "Blocked work" : "On track"}<small>${p.blocked} blocked · ${p.overdue} overdue</small></span>`,
      );
    }
  }
  function click(action, el) {
    if (action === "overview-open") {
      if (!ctx.canNavigate()) return true;
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
    if (calendar.click(action, el)) return true;
    return false;
  }
  return {
    calendar: calendar.render,
    timeline,
    timelineRender: timelineController.render,
    capacity: capacity.render,
    overview,
    dashboard,
    click,
  };
}
