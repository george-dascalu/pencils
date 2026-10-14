export function planning(ctx) {
  const { state, esc, api, $, taskDialog, renderView } = ctx;
  const today = () => new Date().toLocaleDateString("en-CA");
  let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function calendar(tasks) {
    const start = new Date(month);
    start.setDate(1 - ((start.getDay() + 6) % 7));
    return `<div class="planning-head"><button class="button small" data-feature="month-prev">← Previous</button><h2>${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><button class="button small" data-feature="month-next">Next →</button></div><div class="calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<strong>${d}</strong>`).join("")}${Array.from(
      { length: 42 },
      (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = dateKey(d);
        return `<div class="calendar-day ${key === today() ? "today" : ""} ${d.getMonth() !== month.getMonth() ? "muted" : ""}"><button data-feature="date-task" data-date="${key}" aria-label="Add task due ${key}">${d.getDate()}</button>${tasks
          .filter((t) => t.due === key)
          .map(
            (t) =>
              `<button class="calendar-task" data-action="task-open" data-id="${esc(t.id)}">${esc(t.title)}</button>`,
          )
          .join("")}</div>`;
      },
    ).join(
      "",
    )}</div><p class="field-hint">${tasks.filter((t) => !t.due).length} tasks have no due date. Select a date to add a task.</p>`;
  }
  function timeline(tasks) {
    const dated = tasks.filter((t) => t.start || t.due).slice(0, 200);
    if (!dated.length)
      return '<div class="empty"><h2>Plan a time window</h2><p>Add start or due dates to tasks to see the timeline.</p></div>';
    const stamps = dated.flatMap((t) =>
        [t.start, t.due].filter(Boolean).map((d) => Date.parse(d)),
      ),
      min = Math.min(...stamps),
      max = Math.max(...stamps),
      day = 86400000,
      span = Math.max(7, Math.ceil((max - min) / day) + 1);
    return `<p class="field-hint">${new Date(min).toLocaleDateString()} – ${new Date(min + span * day).toLocaleDateString()} · ${tasks.length - dated.length} undated or additional tasks · Open a task to adjust dates.</p><div class="timeline">${dated
      .map((t) => {
        const start = Date.parse(t.start || t.due),
          end = Date.parse(t.due || t.start);
        return `<div class="timeline-row"><button data-action="task-open" data-id="${esc(t.id)}">${esc(t.title)}</button><div class="timeline-track"><button class="timeline-bar ${state.config.done.includes(t.status) ? "complete" : ""}" style="left:${((start - min) / day / span) * 100}%;width:${Math.max(1, ((end - start + day) / day / span) * 100)}%" data-action="task-open" data-id="${esc(t.id)}" title="${esc(t.title)}: ${esc(t.start || t.due)} to ${esc(t.due || t.start)}">${esc(t.status)}</button></div></div>`;
      })
      .join("")}</div>`;
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
    return `<div class="project-overview"><div class="dashboard-metrics"><div><strong>${metric.percent}%</strong>Complete</div><div><strong>${open.length}</strong>Open tasks</div><div><strong>${blocked.length}</strong>Blocked</div><div><strong>${open.filter((t) => t.due && t.due < today()).length}</strong>Overdue</div></div><div class="project-overview-columns"><section class="overview-summary"><h2>About this project</h2><div class="canvas-markdown">${ctx.markdown(state.project.body || "Add a description in Project settings.")}</div><h2>Work by status</h2>${state.config.statuses.map((status) => `<div class="overview-status"><span>${esc(ctx.statusNames[status] || status)}</span><strong>${tasks.filter((t) => t.status === status).length}</strong></div>`).join("")}</section><section class="dashboard-deadlines"><h2>Upcoming and overdue</h2>${due.map((t) => `<button data-action="task-open" data-id="${esc(t.id)}"><span>${esc(t.title)}<small>${esc(t.assignee || "Unassigned")}</small></span><time>${esc(t.due)}</time></button>`).join("") || "<p>No open tasks have deadlines.</p>"}</section></div></div>`;
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
  function click(action, el) {
    if (action === "month-prev" || action === "month-next") {
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
  return { calendar, timeline, overview, dashboard, click };
}
