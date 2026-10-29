import { taskColorAttributes, taskColorDot } from "./task-colors.js";
import { projectPeople } from "./teams.js";
const DAY = 86400000;
const stamp = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? Date.parse(`${value}T00:00:00Z`)
    : NaN;
const key = (ms) => new Date(ms).toISOString().slice(0, 10);
export function weekStart(value) {
  const date = stamp(value);
  return key(date - ((new Date(date).getUTCDay() + 6) % 7) * DAY);
}
export function capacityData(tasks, people, week, done = ["done"]) {
  const start = stamp(weekStart(week)),
    end = start + 6 * DAY;
  const make = (p) => ({
    ...p,
    count: 0,
    days: Array(7).fill(0),
    tasks: [],
    unscheduled: [],
    hours: 0,
    unknown: 0,
    hourDays: Array(7).fill(0),
    available: Array.from({ length: 7 }, (_, i) => {
      const days = p.working_days || [1, 2, 3, 4, 5],
        d = start + i * DAY;
      return days.includes(new Date(d).getUTCDay()) &&
        !(p.time_off || []).includes(key(d))
        ? (p.capacity ?? 40) / Math.max(1, days.length)
        : 0;
    }),
  });
  const rows = people.map(make),
    unassigned = make({
      id: "",
      name: "Unassigned / outside project teams",
      task_capacity: null,
    }),
    unscheduled = [];
  for (const task of tasks) {
    if (
      task.archived ||
      (typeof task.completed === "boolean"
        ? task.completed
        : done.includes(task.status))
    )
      continue;
    const row =
      rows.find((p) =>
        task.assignee_id ? p.id === task.assignee_id : p.name === task.assignee,
      ) || unassigned;
    const a = stamp(task.start || task.due),
      b = stamp(task.due || task.start);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) {
      row.unscheduled.push(task);
      unscheduled.push(task);
      continue;
    }
    if (b < start || a > end) continue;
    row.count++;
    row.tasks.push(task);
    const days = row.working_days || [1, 2, 3, 4, 5],
      span = Math.floor((b - a) / DAY) + 1;
    let workdays = Math.floor(span / 7) * days.length;
    for (let i = 0; i < span % 7; i++)
      if (days.includes(new Date(a + i * DAY).getUTCDay())) workdays++;
    if (!Number.isFinite(task.estimate) || !workdays) row.unknown++;
    else
      for (let i = 0; i < 7; i++) {
        const d = start + i * DAY;
        if (d >= a && d <= b && days.includes(new Date(d).getUTCDay())) {
          row.hourDays[i] += task.estimate / workdays;
          row.hours += task.estimate / workdays;
        }
      }
    row.days = row.days.map(
      (n, i) => n + (start + i * DAY >= a && start + i * DAY <= b ? 1 : 0),
    );
  }
  return { rows, unassigned, unscheduled };
}
export function capacityView(ctx) {
  const { state, esc, renderView } = ctx;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  let week = weekStart(today()),
    team = "";
  let unit = ctx.storage.get("capacity-unit", "tasks"),
    scope = "project",
    organisationTasks = null,
    loadedAt = null;
  const round = (n) => Math.round(n * 10) / 10;
  const count = (n) => `${n} task${n === 1 ? "" : "s"}`;
  function render(tasks) {
    const teams = (state.organisation?.teams || []).filter((t) =>
      state.project.teams?.includes(t.id),
    );
    if (!teams.some((t) => t.id === team)) team = "";
    const selected = teams.find((t) => t.id === team);
    const people = projectPeople(state).filter(
      (p) => !selected || selected.members.includes(p.id),
    );
    const data = capacityData(
        scope === "organisation" ? organisationTasks || [] : tasks,
        projectPeople(state),
        week,
        state.config.done,
      ),
      rows = data.rows.filter((p) =>
        people.some((person) => person.id === p.id),
      );
    const links = (list) =>
      list
        .map(
          (t) =>
            `<button type="button" class="capacity-task" data-feature="global-open" data-project="${esc(t.project || state.project.id)}" data-id="${esc(t.id)}"><span>${esc(t.key || "")} ${esc(t.title)}</span><small>${esc(t.project_title || "")} <span class="task-color-badge" ${taskColorAttributes(state, "assignee", t.assignee)}>${esc(t.assignee || "Unassigned")}</span></small></button>`,
        )
        .join("");
    const detail = (list, title) =>
      `<details class="capacity-work"><summary>${count(list.length)}${title ? ` ${title}` : ""}</summary>${links(list)}</details>`;
    const dates = Array.from(
      { length: 7 },
      (_, i) => new Date(stamp(week) + i * DAY),
    );
    const visibleTask = (t) =>
      !selected ||
      people.some((p) =>
        t.assignee_id ? t.assignee_id === p.id : t.assignee === p.name,
      );
    const amount = (p) => (unit === "hours" ? p.hours : p.count),
      limit = (p) =>
        unit === "hours"
          ? p.available.reduce((a, b) => a + b, 0)
          : p.task_capacity,
      limited = (p) => unit === "hours" || Number.isInteger(p.task_capacity),
      over = (p) => limited(p) && amount(p) > limit(p);
    return `<section class="capacity-view" aria-label="Team capacity"><div class="planning-head"><div class="planning-period"><button class="icon-button" data-feature="capacity-prev" aria-label="Previous week" title="Previous week">${ctx.icon("arrow")}</button><h2>Week of ${dates[0].toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</h2><button class="icon-button" data-feature="capacity-next" aria-label="Next week" title="Next week">${ctx.icon("arrow")}</button></div><div class="planning-options" data-phone-options><button class="button small" data-feature="capacity-today">This week</button><label>Measure <select id="capacity-unit"><option value="tasks" ${unit === "tasks" ? "selected" : ""}>Task count</option><option value="hours" ${unit === "hours" ? "selected" : ""}>Estimated hours</option></select></label><label>Scope <select id="capacity-scope"><option value="project" ${scope === "project" ? "selected" : ""}>This project and filters</option><option value="organisation" ${scope === "organisation" ? "selected" : ""}>All accessible organisation projects</option></select></label><label>Team <select id="capacity-team"><option value="">All project teams</option>${teams.map((t) => `<option value="${esc(t.id)}" ${t.id === team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label></div></div><p class="field-hint" data-phone-options>${scope === "organisation" ? `Work for this project’s people across accessible projects in this organisation. Loaded ${esc(loadedAt || "")}. Project filters do not apply.` : "This project and current filters."} ${unit === "hours" ? "Estimates spread evenly across each task’s working days. Time off reduces available hours; assigned work on those dates stays visible. Unknown estimates are counted separately." : "Each open task counts once per overlapping week. Daily counts show active tasks."} Configure hours, task limits, working days and time off in People.</p>${!teams.length ? '<div class="empty"><h2>Add a project team</h2><p>Create people and teams in Organisation settings, then choose teams in Project settings to see their capacity.</p><button type="button" class="button" data-action="directory-open" data-page="people">Manage people</button><button type="button" class="button" data-action="directory-open" data-page="teams">Manage teams</button><button type="button" class="button" data-view="settings">Choose project teams</button></div>' : `<div class="capacity-summary"><strong>${count(rows.reduce((n, p) => n + p.count, 0))} scheduled</strong><span>${count(rows.reduce((n, p) => n + p.unscheduled.length, 0))} unscheduled</span><span>${rows.filter(over).length} over limit</span></div><div class="table-scroll"><table class="capacity-table"><thead><tr><th>Person / work</th>${dates.map((d) => `<th>${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" })}</th>`).join("")}<th>Week / limit</th><th>Unscheduled</th></tr></thead><tbody>${rows.map((p) => `<tr><th scope="row">${taskColorDot(state, "assignee", p.name)}${esc(p.name)}${detail(p.tasks, "scheduled")}</th>${(unit === "hours" ? p.hourDays : p.days).map((n, i) => `<td class="${unit === "hours" && n > p.available[i] ? "capacity-over" : ""}">${round(n) || "—"}${unit === "hours" ? `<small> / ${round(p.available[i])} h</small>` : ""}</td>`).join("")}<td class="${over(p) ? "capacity-over" : ""}"><strong>${round(amount(p))}${limited(p) ? ` / ${round(limit(p))}` : ""} ${unit === "hours" ? "h" : "tasks"}</strong>${unit === "hours" && p.unknown ? `<small>${p.unknown} unknown estimate / no working dates</small>` : ""}${limited(p) ? `<progress max="${Math.max(limit(p), amount(p), 1)}" value="${amount(p)}" aria-label="${esc(p.name)} scheduled tasks"></progress><small>${over(p) ? `${round(amount(p) - limit(p))} over limit` : `${round(limit(p) - amount(p))} remaining`}</small>` : "<small>No limit set</small>"}</td><td>${detail(p.unscheduled, "unscheduled")}</td></tr>`).join("") || '<tr><td colspan="10">No people in this team. Add members in Organisation settings.</td></tr>'}</tbody></table></div>`}<div class="capacity-backlog">${!team && data.unassigned.tasks.length ? `<section><h3>Unassigned / outside project teams · ${count(data.unassigned.count)}</h3>${links(data.unassigned.tasks)}</section>` : ""}<section><h3>Unscheduled · ${count(data.unscheduled.filter(visibleTask).length)}</h3><p class="field-hint">Add a start or due date to include this work in the weekly counts.</p>${links(data.unscheduled.filter(visibleTask))}</section></div></section>`;
  }
  document.addEventListener("change", async (e) => {
    if (e.target.id === "capacity-unit") {
      unit = e.target.value;
      ctx.storage.set("capacity-unit", unit);
      renderView(true);
    }
    if (e.target.id === "capacity-scope") {
      const next = e.target.value;
      if (next === "organisation") {
        e.target.disabled = true;
        try {
          const data = await ctx.api("/overview");
          organisationTasks = data.tasks.filter(
            (t) => t.organisation === state.organisation?.id,
          );
          loadedAt = new Date().toLocaleTimeString();
          scope = next;
        } catch (error) {
          ctx.toast(error.message, true);
        }
      } else scope = next;
      renderView(true);
    }
    if (e.target.id === "capacity-team") {
      team = e.target.value;
      renderView(true);
    }
  });
  function click(action) {
    if (!["capacity-prev", "capacity-next", "capacity-today"].includes(action))
      return false;
    week =
      action === "capacity-today"
        ? weekStart(today())
        : key(stamp(week) + (action === "capacity-prev" ? -7 : 7) * DAY);
    renderView(true);
    return true;
  }
  return { render, click };
}
