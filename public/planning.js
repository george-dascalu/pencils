import { formatDay } from "./format-date.js";
import { taskColorAttributes, taskColorDot } from "./task-colors.js";
import { localDate } from "./task-visibility.js";
import { capacityView } from "./capacity.js";
import { calendarView } from "./calendar.js";
import { timelineHTML, timelineInteractions } from "./task-timeline.js";
export function planning(ctx) {
  const { state, esc, api, renderView } = ctx;
  const capacity = capacityView(ctx);
  const today = localDate;
  const calendar = calendarView(ctx);
  let timelineWeekends = ctx.storage.get("timeline-weekends", true) !== false;
  let timelineList = ctx.storage.get("timeline-list", "full");
  let timelineGroup = ctx.storage.get("timeline-group", "none");
  const timelineController = timelineInteractions(ctx, (scope, option, value) => {
    if (scope === "project") {
      if (option === "weekends") timelineWeekends = value;
      else if (option === "list") timelineList = value;
      else if (option === "group") timelineGroup = value;
      ctx.storage.set(option === "range" ? `timeline-range:${state.project.id}` : `timeline-${option}`, value);
      renderView(true);
    } else
      return ctx.changeBoard((b) => {
        const n = b.nodes.find((n) => n.id === scope);
        if (n) n[{ weekends: "timelineShowWeekends", range: "timelineRange", list: "timelineList", group: "timelineGroup" }[option]] = value;
      });
  });
  function timeline(tasks) {
    return timelineHTML(tasks, ctx, "project", timelineWeekends, ctx.storage.get(`timeline-range:${state.project.id}`, null), timelineList, timelineGroup);
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
    return `<div class="project-overview"><p class="field-hint">${tasks.length} active cards${state.tasks.length-tasks.length ? ` · ${state.tasks.length-tasks.length} archived` : ""}. List filters do not apply here.</p><div class="dashboard-metrics"><button class="dashboard-metric" data-feature="overview-open" data-query="done"><strong>${metric.percent}%</strong>Complete</button><button class="dashboard-metric" data-feature="overview-open" data-query="open"><strong>${open.length}</strong>Open cards</button><button class="dashboard-metric" data-feature="overview-open" data-query="blocked"><strong>${blocked.length}</strong>Blocked</button><button class="dashboard-metric" data-feature="overview-open" data-query="overdue"><strong>${open.filter((t) => t.due && t.due < today()).length}</strong>Overdue</button></div><div class="project-overview-columns"><section class="dashboard-deadlines"><h2>Upcoming and overdue</h2>${due.map((t) => `<button data-action="task-open" data-id="${esc(t.id)}"><span>${esc(t.title)}<small class="task-color-badge" ${taskColorAttributes(state, "assignee", t.assignee)}>${esc(t.assignee || "Unassigned")}</small></span><time datetime="${esc(t.due)}">${esc(formatDay(t.due))}</time></button>`).join("") || "<p>No open cards have deadlines.</p>"}</section><section class="overview-summary"><h2>About this project</h2><div class="canvas-markdown">${ctx.markdown(state.project.body || "Add a description in Project settings.")}</div><h2>Work by status</h2>${state.config.statuses.map((status) => `<div class="overview-status"><span>${taskColorDot(state, "status", status)}${esc(ctx.statusNames[status] || status)}</span><strong>${tasks.filter((t) => t.status === status).length}</strong></div>`).join("")}</section></div></div>`;
  }
  // Cross-project Markdown references on Home use every project's cards. They load once per
  // version of the data, not on every redraw (F0.22-39).
  let overviewFor = null, overviewLoad = null;
  function dashboard(version) {
    // A load made before the first event counts for the version that event names.
    if (overviewFor === -1 && version !== -1) overviewFor = version;
    // A change while loading loads again after, so the cards are never older than the version.
    if (overviewLoad) return overviewFor === version ? overviewLoad : overviewLoad.catch(() => {}).then(() => dashboard(version));
    if (overviewFor === version) return Promise.resolve();
    overviewFor = version;
    return (overviewLoad = api("/overview").then(
      (data) => { state.overview = data; },
      (error) => { overviewFor = null; throw error; },
    ).finally(() => { overviewLoad = null; }));
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
