const newId = () =>
  `person-${Date.now().toString(36)}-${Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join("")}`;
// A person's short name, set in People, or the first three letters of their name, such as Geo for George.
const letters = (name) => {
  const [first = "", ...rest] = [...String(name || "").trim()].slice(0, 3);
  return first.toUpperCase() + rest.join("");
};
export const shortName = (state, name) =>
  state.organisation?.people?.find((p) => p.name === name)?.short_name ||
  letters(name);
export function projectPeople(state) {
  const teams = new Set(state.project?.teams || []);
  const ids = new Set(
    (state.organisation?.teams || [])
      .filter((t) => teams.has(t.id))
      .flatMap((t) => t.members),
  );
  return (state.organisation?.people || []).filter((p) => ids.has(p.id));
}
export function assigneeHint(state) {
  if (projectPeople(state).length) return "";
  if (!state.project?.teams?.length)
    return "No teams assigned. Select a team in Project settings to make its members available as assignees.";
  return "The project's teams have no members. Open Teams in the sidebar, select the people in each team and save. Adding someone to People alone does not add them to a team.";
}
export function assigneeOptions(state, current, esc) {
  const people = projectPeople(state);
  return `<option value="">Unassigned</option>${current && !people.some((p) => p.name === current) ? `<option selected value="${esc(current)}">${esc(current)} (previous assignment)</option>` : ""}${people.map((p) => `<option value="${esc(p.name)}" ${p.name === current ? "selected" : ""}>${esc(p.name)}</option>`).join("")}`;
}
export function organisationTeams(form, organisation, esc, mode = "all") {
  let people = structuredClone(organisation?.people || []),
    teams = structuredClone(organisation?.teams || []);
  const host = document.createElement("section");
  host.className = "organisation-teams";
  form.querySelector(".dialog-body").append(host);
  function sync() {
    form.elements.people.value = JSON.stringify(people);
    form.elements.teams.value = JSON.stringify(teams);
  }
  function paint() {
    host.innerHTML = `<input type="hidden" name="people"><input type="hidden" name="teams"><div data-directory-section="people" ${mode === "teams" ? "hidden" : ""}><h3>People</h3><p class="field-hint">People can belong to several teams. Weekly task limits are optional. Hours spread across working days; time off reduces availability. Leave blank to track workload without a limit. No login account is required.</p><div class="people-list">${!people.length ? '<p class="directory-empty">No people yet. Add someone to start building your teams.</p>' : ""}${people
      .map(
        (p) =>
          `<div class="person-row" data-person="${esc(p.id)}"><input aria-label="Person name" data-person-field="name" value="${esc(p.name)}" placeholder="Name" maxlength="100" required><label>Short name<input aria-label="Short name for ${esc(p.name)}" data-person-field="short_name" maxlength="3" placeholder="${esc(letters(p.name))}" value="${esc(p.short_name || "")}"></label><label>Tasks / week<input aria-label="Weekly task limit for ${esc(p.name)}" data-person-field="task_capacity" type="number" min="0" max="10000" step="1" value="${p.task_capacity ?? ""}"></label><label>Hours / week<input aria-label="Weekly hours for ${esc(p.name)}" data-person-field="capacity" type="number" min="0" max="168" step="any" value="${p.capacity ?? 40}"></label><details><summary>Availability</summary><div class="team-members">${[
            [1, "Mon"],
            [2, "Tue"],
            [3, "Wed"],
            [4, "Thu"],
            [5, "Fri"],
            [6, "Sat"],
            [0, "Sun"],
          ]
            .map(
              ([d, name]) =>
                `<label><input type="checkbox" data-person-day="${d}" ${(p.working_days || [1, 2, 3, 4, 5]).includes(d) ? "checked" : ""}>${name}</label>`,
            )
            .join(
              "",
            )}</div><label>Time off dates (YYYY-MM-DD, comma separated)<input data-person-field="time_off" value="${esc((p.time_off || []).join(", "))}"></label></details><button type="button" class="icon-button danger" data-remove-person="${esc(p.id)}" aria-label="Delete ${esc(p.name)}" title="Delete person"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></div>`,
      )
      .join(
        "",
      )}</div><button type="button" class="button small" data-add-person>Add person</button></div><div data-directory-section="teams" ${mode === "people" ? "hidden" : ""}><h3>Teams</h3><p class="field-hint">Choose which people belong to each team. Assign teams to projects in Project settings.</p>${!teams.length ? '<p class="directory-empty">No teams yet. Add a team, then choose its members.</p>' : ""}${teams.map((t) => `<fieldset data-team="${esc(t.id)}"><div class="team-heading"><input aria-label="Team name" data-team-name value="${esc(t.name)}" placeholder="Team name" maxlength="100" required><button type="button" class="icon-button danger" data-remove-team="${esc(t.id)}" aria-label="Delete team" title="Delete team"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></div><div class="team-members">${people.map((p) => `<label><input type="checkbox" data-member="${esc(p.id)}" ${t.members.includes(p.id) ? "checked" : ""}> <span data-person-name="${esc(p.id)}">${esc(p.name || "Unnamed person")}</span></label>`).join("") || "<p>Add people to the organisation to choose members.</p>"}</div></fieldset>`).join("")}<button type="button" class="button small" data-add-team>Add team</button></div>`;
    sync();
  }
  host.addEventListener("input", (e) => {
    const el = e.target,
      person = people.find(
        (p) => p.id === el.closest("[data-person]")?.dataset.person,
      ),
      team = teams.find(
        (t) => t.id === el.closest("[data-team]")?.dataset.team,
      );
    if (person && el.dataset.personField) {
      person[el.dataset.personField] = ["task_capacity", "capacity"].includes(
        el.dataset.personField,
      )
        ? el.value === ""
          ? null
          : Number(el.value)
        : el.dataset.personField === "time_off"
          ? el.value
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : el.value;
      if (el.dataset.personField === "name")
        for (const label of host.querySelectorAll(
          `[data-person-name="${person.id}"]`,
        ))
          label.textContent = el.value || "Unnamed person";
      if (el.dataset.personField === "name")
        el.closest("[data-person]").querySelector(
          "[data-person-field=short_name]",
        ).placeholder = letters(el.value);
    }
    if (person && el.dataset.personDay != null) {
      const days = new Set(person.working_days || [1, 2, 3, 4, 5]);
      el.checked
        ? days.add(+el.dataset.personDay)
        : days.delete(+el.dataset.personDay);
      person.working_days = [...days];
    }
    if (team && el.hasAttribute("data-team-name")) team.name = el.value;
    if (team && el.dataset.member)
      team.members = el.checked
        ? [...new Set([...team.members, el.dataset.member])]
        : team.members.filter((id) => id !== el.dataset.member);
    sync();
  });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-add-person"))
      people.push({ id: newId(), name: "", task_capacity: null });
    else if (b.hasAttribute("data-add-team"))
      teams.push({ id: newId(), name: "", members: [] });
    else if (b.dataset.removePerson) {
      people = people.filter((p) => p.id !== b.dataset.removePerson);
      teams.forEach(
        (t) =>
          (t.members = t.members.filter((id) => id !== b.dataset.removePerson)),
      );
    } else if (b.dataset.removeTeam)
      teams = teams.filter((t) => t.id !== b.dataset.removeTeam);
    else return;
    paint();
    host
      .querySelector(
        b.hasAttribute("data-add-person")
          ? ".person-row:last-child input"
          : b.hasAttribute("data-add-team")
            ? "fieldset:last-of-type input"
            : "[data-add-person]",
      )
      ?.focus();
    form.elements.people.dispatchEvent(new Event("input", { bubbles: true }));
  });
  paint();
  return () => {
    people = JSON.parse(form.elements.people.value || "[]");
    teams = JSON.parse(form.elements.teams.value || "[]");
    paint();
  };
}
export function projectTeamControls(form, state, esc) {
  let selected =
    form.dataset.edit === "true" ? [...(state.project.teams || [])] : [];
  const host = document.createElement("fieldset");
  host.className = "project-team-settings";
  form.querySelector('[name="organisation"]').closest("label").after(host);
  function paint() {
    const org = state.organisations.find(
      (o) => o.id === form.elements.organisation.value,
    );
    host.innerHTML = `<legend>Project teams</legend><input type="hidden" name="teams" value="${esc(JSON.stringify(selected))}"><div class="team-members">${(org?.teams || []).map((t) => `<label><input type="checkbox" data-project-team="${esc(t.id)}" ${selected.includes(t.id) ? "checked" : ""}> ${esc(t.name)} <small>(${t.members.length ? `${t.members.length} members` : "No members"})</small></label>`).join("") || '<p class="field-hint">Add people and teams from the Teams section in the sidebar first.</p>'}</div><p class="field-hint">Assignees come from the selected teams. A person in several teams appears once.</p>`;
  }
  host.addEventListener("change", (e) => {
    if (!e.target.dataset.projectTeam) return;
    selected = [...host.querySelectorAll("[data-project-team]:checked")].map(
      (el) => el.dataset.projectTeam,
    );
    form.elements.teams.value = JSON.stringify(selected);
  });
  form.elements.organisation.addEventListener("change", () => {
    selected = [];
    paint();
  });
  paint();
  return () => {
    selected = JSON.parse(form.elements.teams.value || "[]");
    paint();
  };
}
