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
  });
  const rows = people.map(make),
    unassigned = make({
      id: "",
      name: "Unassigned / outside project teams",
      task_capacity: null,
    }),
    unscheduled = [];
  for (const task of tasks) {
    if (task.archived || done.includes(task.status)) continue;
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
        tasks,
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
            `<button type="button" class="capacity-task" data-action="task-open" data-id="${esc(t.id)}"><span>${esc(t.key || "")} ${esc(t.title)}</span><small>${esc(t.assignee || "Unassigned")}</small></button>`,
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
    const limited = (p) => Number.isInteger(p.task_capacity),
      over = (p) => limited(p) && p.count > p.task_capacity;
    return `<section class="capacity-view" aria-label="Team capacity"><div class="planning-head"><button class="button small" data-feature="capacity-prev" aria-label="Previous week">← Previous</button><h2>Week of ${dates[0].toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</h2><button class="button small" data-feature="capacity-next" aria-label="Next week">Next →</button><button class="button small" data-feature="capacity-today">This week</button><label>Team <select id="capacity-team"><option value="">All project teams</option>${teams.map((t) => `<option value="${esc(t.id)}" ${t.id === team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label></div><p class="field-hint">Task counts per person for this project and the current filters. Each open task counts once per week it overlaps; daily counts show tasks active that day. Estimates are not used. Set optional weekly task limits in Organisation settings. Other projects and time off are not included.</p>${!teams.length ? '<div class="empty"><h2>Add a project team</h2><p>Create people and teams in Organisation settings, then choose teams in Project settings to see their capacity.</p></div>' : `<div class="capacity-summary"><strong>${count(rows.reduce((n, p) => n + p.count, 0))} scheduled</strong><span>${count(rows.reduce((n, p) => n + p.unscheduled.length, 0))} unscheduled</span><span>${rows.filter(over).length} over limit</span></div><div class="table-scroll"><table class="capacity-table"><thead><tr><th>Person / work</th>${dates.map((d) => `<th>${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" })}</th>`).join("")}<th>Week / limit</th><th>Unscheduled</th></tr></thead><tbody>${rows.map((p) => `<tr><th scope="row">${esc(p.name)}${detail(p.tasks, "scheduled")}</th>${p.days.map((n) => `<td>${n || "—"}</td>`).join("")}<td class="${over(p) ? "capacity-over" : ""}"><strong>${p.count}${limited(p) ? ` / ${p.task_capacity}` : ""} tasks</strong>${limited(p) ? `<progress max="${Math.max(p.task_capacity, p.count, 1)}" value="${p.count}" aria-label="${esc(p.name)} scheduled tasks"></progress><small>${over(p) ? `${p.count - p.task_capacity} over limit` : `${p.task_capacity - p.count} remaining`}</small>` : "<small>No limit set</small>"}</td><td>${detail(p.unscheduled, "unscheduled")}</td></tr>`).join("") || '<tr><td colspan="10">No people in this team. Add members in Organisation settings.</td></tr>'}</tbody></table></div>`}<div class="capacity-backlog">${!team && data.unassigned.tasks.length ? `<section><h3>Unassigned / outside project teams · ${count(data.unassigned.count)}</h3>${links(data.unassigned.tasks)}</section>` : ""}<section><h3>Unscheduled · ${count(data.unscheduled.filter(visibleTask).length)}</h3><p class="field-hint">Add a start or due date to include this work in the weekly counts.</p>${links(data.unscheduled.filter(visibleTask))}</section></div></section>`;
  }
  document.addEventListener("change", (e) => {
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
