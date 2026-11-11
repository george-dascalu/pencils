// Settings → Tags (F0.21-73). Adding a tag or choosing its colour saves with the page; renaming or
// deleting one changes every card that has it, after a confirmation that says how many.
import { projectTags, listableTag, autoTagColor } from "./project-tags.js";
import { confirmAction } from "./confirm-popover.js";

const cards = (n) => `${n} card${n === 1 ? "" : "s"}`;
const tagged = (state, name) => state.tasks.filter((t) => t.tags?.includes(name)).length;
const clean = (value) => value.replaceAll(",", " ").trim();

function row({ state, esc, icon, colorPicker }, t) {
  return `<li class="project-tag" data-tag="${esc(t.name)}"${t.color ? " data-own-color" : ""}>${colorPicker({ label: `${t.name} colour`, value: t.color || autoTagColor(t.name), name: "tag-color" })}<input class="project-tag-name" data-tag-name data-settings-staging value="${esc(t.name)}" aria-label="Tag name: ${esc(t.name)}" maxlength="80" required><span class="project-tag-count">${cards(tagged(state, t.name))}</span><button type="button" class="icon-button danger" data-tag-delete aria-label="Delete tag ${esc(t.name)}" title="Delete tag">${icon("trash")}</button></li>`;
}

export function tagsSettingsHTML(ctx) {
  const tags = projectTags(ctx.state.config, ctx.state.tasks);
  return `<fieldset class="project-tags-settings"><legend>Tags</legend><p class="field-hint">Cards in this project choose from these tags, and a tag created on a card joins them. Renaming or deleting a tag changes every card that has it.</p><input type="hidden" name="tags"><ul class="project-tag-list">${tags.map((t) => row(ctx, t)).join("")}</ul><div class="project-tag-new"><input data-tag-new data-settings-staging aria-label="New tag name" placeholder="New tag" maxlength="80"><button type="button" class="button small" data-tag-add>Add tag</button></div></fieldset>`;
}

// The list as the page shows it, for the page's save. A tag written outside the app with a name
// the list can't hold (a comma, say) stays on its cards and keeps its row, but isn't saved.
export const tagRows = (form) =>
  [...form.querySelectorAll("[data-tag]")].filter((li) => listableTag(li.dataset.tag)).map((li) => {
    const color = li.querySelector("[data-color-value]").value.toLowerCase();
    // A tag left on its automatic colour keeps none of its own, unless it had one; white (no colour) is a
    // choice too (F0.23-22).
    return { name: li.dataset.tag, ...(li.hasAttribute("data-own-color") || color !== autoTagColor(li.dataset.tag) ? { color } : {}) };
  });

export function tagsSettings(form, ctx, saveState) {
  const { state, api, refresh, renderApp, toast } = ctx;
  const error = form.querySelector(".form-error"), names = () => tagRows(form).map((t) => t.name);
  const fail = (message) => { error.textContent = message; error.classList.remove("hidden"); };
  function add() {
    const input = form.querySelector("[data-tag-new]"), name = clean(input.value);
    if (!name) return;
    if (names().includes(name)) return fail(`“${name}” is already a tag.`);
    form.querySelector(".project-tag-list").insertAdjacentHTML("beforeend", row(ctx, { name }));
    input.value = "";
    form.elements.tags.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function edit(from, to) {
    // After a save under way, so this one checks against its revision.
    while (state.settingsSaving) await new Promise((resolve) => setTimeout(resolve, 50));
    state.settingsSaving = true;
    saveState(state, "Saving…");
    try {
      const result = await api(`/projects/${state.project.id}`, { method: "PATCH", body: { revision: state.project.revision, tag_edit: { from, to } } });
      await refresh(false);
      saveState(state, "Saved");
      toast(`${to === null ? `Deleted “${from}”` : `Renamed “${from}” to “${to}”`}${result.count ? ` on ${cards(result.count)}` : ""}.`);
    } catch (e) {
      saveState(state, "Not saved");
      toast(e.message, true);
    } finally {
      state.settingsSaving = false;
      renderApp();
    }
  }
  form.addEventListener("click", (event) => {
    if (event.target.closest("[data-tag-add]")) return add();
    const remove = event.target.closest("[data-tag-delete]");
    if (!remove) return;
    const from = remove.closest("[data-tag]").dataset.tag, n = tagged(state, from);
    void confirmAction({ anchor: remove, title: `Delete the tag “${from}”?`, message: n ? `It is removed from ${cards(n)}.` : "No card has it.", confirmLabel: "Delete tag", danger: true })
      .then((ok) => ok && edit(from, null));
  });
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches("[data-tag-new]")) return;
    event.preventDefault();
    add();
  });
  form.addEventListener("change", (event) => {
    if (!event.target.matches("[data-tag-name]")) return;
    const input = event.target, from = input.closest("[data-tag]").dataset.tag, to = clean(input.value), n = tagged(state, from);
    if (!to || to === from) return void (input.value = from);
    if (!listableTag(to)) return void (input.value = from);
    const merge = names().includes(to) ? ` Cards with both keep one “${to}”.` : "";
    void confirmAction({ anchor: input, title: `Rename the tag “${from}” to “${to}”?`, message: `${n ? `${cards(n)} change.` : "No card has it yet."}${merge}`, confirmLabel: "Rename tag" })
      .then((ok) => (ok ? edit(from, to) : void (input.value = from)));
  });
}
