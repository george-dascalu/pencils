// A card's tags in the card editor (F0.21-73): chips to remove, and a menu of the project's other
// tags that can also create one. The hidden "tags" field (JSON) stays what the card form saves.
import { projectTags, tagColor } from "./project-tags.js";
import { allowsTextAutofocus } from "./open-focus.js";

const MAX_TAGS = 30, MAX_NAME = 80; // as the server's tags() allows

// The field's value; a browser draft saved before F0.21-73 holds comma-separated text.
export function parseTags(value) {
  try {
    const tags = JSON.parse(value || "[]");
    if (Array.isArray(tags)) return tags.filter((t) => typeof t === "string");
  } catch {}
  return String(value).split(",").map((t) => t.trim()).filter(Boolean);
}

// White is the colour picker's "no colour"; such tags use the plain chip.
export const tagStyle = (config, name) => {
  const color = tagColor(config, name);
  return color && color.toLowerCase() !== "#ffffff" ? `style="--tag-color:${color}"` : "";
};

export function taskTagsHTML(state, tags, esc, icon) {
  const others = projectTags(state.config, state.tasks).filter((t) => !tags.includes(t.name)), full = tags.length >= MAX_TAGS;
  // The card's own tags are hidden options, so the menu doesn't offer to create them again.
  return `<div class="task-tags" role="group" aria-label="Tags" data-task-tags>${tags.map((name) => `<span class="tag-chip" ${tagStyle(state.config, name)}><span class="tag-chip-name">${esc(name)}</span><button type="button" class="icon-button" data-tag-remove="${esc(name)}" aria-label="Remove tag ${esc(name)}" title="Remove tag">${icon("close")}</button></span>`).join("")}<select class="task-tag-add" data-task-tag-add aria-label="Add tag" ${full ? `disabled title="A card has at most ${MAX_TAGS} tags."` : ""} data-select-search="Find or create a tag…" data-select-search-label="Find a tag" data-select-item-label="tag" data-select-empty="No matching tags." data-select-create="Create tag"><option value="" hidden selected>Add tag</option>${others.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join("")}${tags.map((name) => `<option value="${esc(name)}" hidden>${esc(name)}</option>`).join("")}</select></div>`;
}

export function installTaskTags(getState, esc, icon, toast) {
  const update = (group, change, focus) => {
    const form = group.closest("form"), field = form.elements.tags;
    const tags = change(parseTags(field.value));
    field.value = JSON.stringify(tags);
    group.outerHTML = taskTagsHTML(getState(), tags, esc, icon);
    if (focus) form.querySelector("[data-task-tag-add]")?.focus({ preventScroll: true });
    field.dispatchEvent(new Event("change", { bubbles: true }));
  };
  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("[data-task-tag-add]");
    // A project's tag names have no commas (server/model.js), so one typed becomes a space.
    const name = select?.value.replaceAll(",", " ").trim();
    if (!name) return;
    if (name.length > MAX_NAME) {
      select.value = "";
      return void toast(`Tag names have at most ${MAX_NAME} characters.`, true);
    }
    update(select.closest("[data-task-tags]"), (tags) => [...new Set([...tags, name])], document.activeElement === select);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-tag-remove]");
    if (!button?.closest("[data-task-tags]")) return;
    update(button.closest("[data-task-tags]"), (tags) => tags.filter((t) => t !== button.dataset.tagRemove), event.detail === 0 || allowsTextAutofocus());
  });
}
