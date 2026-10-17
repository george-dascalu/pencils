import { Problem } from "./problem.js";
const fail = (message) => {
  throw new Problem(400, message);
};
const list = (value, label, max = 500) => {
  if (!Array.isArray(value) || value.length > max)
    fail(`${label} must be a list of at most ${max} entries.`);
  return value;
};
const id = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function directory(people = [], teams = []) {
  const personIds = new Set(),
    names = new Set(),
    teamIds = new Set();
  const cleanedPeople = list(people, "People").map((p) => {
    if (!p || !id(p.id) || personIds.has(p.id))
      fail("Every person needs a unique ID.");
    if (
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.trim().length > 100
    )
      fail("Person names must contain 1–100 characters.");
    const name = p.name.trim();
    if (names.has(name.toLowerCase()))
      fail("Use distinct names for people in an organisation.");
    personIds.add(p.id);
    names.add(name.toLowerCase());
    const capacity = p.capacity ?? 40;
    if (
      typeof capacity !== "number" ||
      !Number.isFinite(capacity) ||
      capacity < 0 ||
      capacity > 168
    )
      fail("Weekly capacity must be between 0 and 168 hours.");
    const task_capacity = p.task_capacity ?? null;
    if (
      task_capacity !== null &&
      (!Number.isInteger(task_capacity) ||
        task_capacity < 0 ||
        task_capacity > 10000)
    )
      fail(
        "Weekly task limit must be a whole number from 0 to 10000, or blank.",
      );
    const working_days = p.working_days ?? [1, 2, 3, 4, 5];
    if (
      !Array.isArray(working_days) ||
      working_days.length > 7 ||
      working_days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      new Set(working_days).size !== working_days.length
    )
      fail("Working days must be distinct weekdays.");
    const time_off = p.time_off ?? [];
    if (
      !Array.isArray(time_off) ||
      time_off.length > 366 ||
      time_off.some(
        (d) =>
          typeof d !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
          !Number.isFinite(Date.parse(d)) ||
          new Date(d).toISOString().slice(0, 10) !== d,
      )
    )
      fail("Time off must contain up to 366 dates in YYYY-MM-DD format.");
    return {
      ...p,
      name,
      capacity,
      task_capacity,
      working_days,
      time_off: [...new Set(time_off)],
    };
  });
  const teamNames = new Set();
  const cleanedTeams = list(teams, "Teams", 100).map((t) => {
    if (!t || !id(t.id) || teamIds.has(t.id))
      fail("Every team needs a unique ID.");
    if (
      typeof t.name !== "string" ||
      !t.name.trim() ||
      t.name.trim().length > 100
    )
      fail("Team names must contain 1–100 characters.");
    const name = t.name.trim();
    if (teamNames.has(name.toLowerCase()))
      fail("Team names must be unique within an organisation.");
    teamIds.add(t.id);
    teamNames.add(name.toLowerCase());
    const members = list(t.members || [], "Team members");
    if (members.some((member) => !personIds.has(member)))
      fail("Team members must belong to the organisation.");
    return { ...t, name, members: [...new Set(members)] };
  });
  return { people: cleanedPeople, teams: cleanedTeams };
}
export function projectTeams(value = [], organisation) {
  list(value, "Project teams", 100);
  const available = new Set((organisation.teams || []).map((t) => t.id));
  if (value.some((id) => !available.has(id)))
    fail("Project teams must belong to the project organisation.");
  return [...new Set(value)];
}
export function membersForProject(project, organisation) {
  const selected = new Set(project.teams || []),
    members = new Set(
      (organisation.teams || [])
        .filter((t) => selected.has(t.id))
        .flatMap((t) => t.members || []),
    );
  return (organisation.people || []).filter((p) => members.has(p.id));
}
