// A card's tags in the card editor (F0.21-73, F0.22-1): one combobox field holding the tags as chips
// with an input to filter or create, and a list of the project's tags in the shared menu's look.
// The hidden "tags" field (JSON) stays what the card form saves.
import { projectTags, tagColor } from "./project-tags.js";
import { allowsTextAutofocus } from "./open-focus.js";
import { positionPopover } from "./popover-position.js";

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

const chip = (config, name, esc, remove = "") => `<span class="tag-chip" ${tagStyle(config, name)}><span class="tag-chip-name">${esc(name)}</span>${remove}</span>`;

export function taskTagsHTML(state, tags, esc, icon) {
  const full = tags.length >= MAX_TAGS, remove = (name) => `<button type="button" class="tag-combo-button" data-tag-remove="${esc(name)}" aria-label="Remove tag ${esc(name)}" title="Remove tag">${icon("close")}</button>`;
  return `<div class="task-tags" role="group" aria-label="Tags" data-task-tags><div class="tag-combo" data-tag-combo><div class="tag-combo-body">${tags.map((name) => chip(state.config, name, esc, remove(name))).join("")}<input type="text" class="tag-combo-input" data-tag-input role="combobox" aria-label="Add tag" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" autocomplete="off" spellcheck="false" placeholder="${tags.length ? "" : "Add tag"}" ${full ? `disabled title="A card has at most ${MAX_TAGS} tags."` : ""}></div><div class="tag-combo-end">${tags.length ? `<button type="button" class="tag-combo-button" data-tag-clear aria-label="Clear all tags" title="Clear all tags">${icon("close")}</button>` : ""}<button type="button" class="tag-combo-button" data-tag-toggle aria-label="Show all tags" title="Show all tags" aria-haspopup="listbox" aria-expanded="false" ${full ? "disabled" : ""}>${icon("chevron")}</button></div></div></div>`;
}

export function installTaskTags(getState, esc, icon, toast) {
  let menu, group, active = -1, quiet = false; // quiet: a focus the editor moves itself must not open the list
  const field = (g) => g.closest("form").elements.tags, input = () => group?.querySelector("[data-tag-input]");
  const optionList = () => [...(menu?.querySelectorAll('[role="option"]') || [])];
  const typed = () => input()?.value.replaceAll(",", " ").trim() || "";
  function closeMenu() {
    if (!menu) return;
    const closing = menu;
    menu = null; active = -1;
    for (const control of group?.querySelectorAll("[data-tag-input], [data-tag-toggle]") || []) control.setAttribute("aria-expanded", "false");
    input()?.removeAttribute("aria-activedescendant");
    // Fades out when the device allows motion, as the shared select menu does.
    if (parseFloat(getComputedStyle(closing).transitionDuration) < 0.05) return closing.remove();
    closing.classList.add("closing");
    closing.addEventListener("transitionend", () => closing.remove());
    setTimeout(() => closing.remove(), 300);
  }
  function paint() {
    const state = getState(), chosen = parseTags(field(group).value), words = typed().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const all = projectTags(state.config, state.tasks).map((t) => t.name);
    for (const name of chosen) if (!all.some((n) => n === name)) all.push(name);
    const shown = all.filter((name) => words.every((w) => name.toLocaleLowerCase().includes(w)));
    const create = typed() && !all.some((n) => n.toLocaleLowerCase() === typed().toLocaleLowerCase()) ? typed() : "";
    menu.innerHTML = shown.map((name, i) => `<button type="button" role="option" tabindex="-1" id="tag-option-${i}" data-tag-option="${esc(name)}" aria-selected="${chosen.includes(name)}">${chip(state.config, name, esc)}${icon("check")}</button>`).join("")
      + (create ? `<button type="button" role="option" tabindex="-1" id="tag-option-${shown.length}" data-tag-create aria-selected="false">${icon("plus")}<span>Create tag “${esc(create)}”</span></button>` : "")
      || '<p class="tag-combo-empty">No tags yet. Type to create one.</p>';
    // Typing highlights the first match, or the creating option when nothing matches.
    const count = optionList().length;
    active = words.length ? (active >= 0 && active < count ? active : 0) : active < count ? active : -1;
    mark();
    place();
  }
  function mark() {
    optionList().forEach((o, i) => { o.classList.toggle("active", i === active); });
    const o = optionList()[active];
    if (o) { input().setAttribute("aria-activedescendant", o.id); o.scrollIntoView({ block: "nearest" }); } else input()?.removeAttribute("aria-activedescendant");
  }
  const place = () => {
    if (!menu) return;
    const combo = group?.isConnected && group.querySelector(".tag-combo");
    if (combo) positionPopover(menu, combo.getBoundingClientRect(), { width: combo.offsetWidth, maxHeight: 280 }); else closeMenu();
  };
  function openMenu(g) {
    if (menu && group === g) return;
    closeMenu();
    group = g;
    for (const stale of document.querySelectorAll(".tag-combo-menu.closing")) stale.remove();
    menu = document.createElement("div");
    menu.className = "select-menu tag-combo-menu";
    menu.id = "tag-combo-menu";
    menu.setAttribute("popover", "manual");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "All tags");
    menu.setAttribute("aria-multiselectable", "true");
    (g.closest("dialog, [popover]") || document.body).append(menu);
    for (const control of g.querySelectorAll("[data-tag-input], [data-tag-toggle]")) { control.setAttribute("aria-expanded", "true"); control.setAttribute("aria-controls", menu.id); }
    menu.showPopover();
    active = -1;
    paint();
  }
  const refocus = () => { quiet = true; input()?.focus({ preventScroll: true }); quiet = false; };
  // Changes edit the group in place, so the input, its focus and the open list carry on.
  const update = (g, change, focus) => {
    const form = g.closest("form"), field = form.elements.tags, wasOpen = menu && group === g;
    const tags = change(parseTags(field.value));
    field.value = JSON.stringify(tags);
    const open = wasOpen, keep = active;
    if (wasOpen) closeMenu();
    g.outerHTML = taskTagsHTML(getState(), tags, esc, icon);
    group = form.querySelector("[data-task-tags]");
    if (focus) refocus();
    if (open) { openMenu(group); active = keep; paint(); }
    field.dispatchEvent(new Event("change", { bubbles: true }));
  };
  function add(g, text) {
    // A project's tag names have no commas (server/model.js), so one typed becomes a space.
    const name = text.replaceAll(",", " ").trim();
    if (!name) return;
    if (name.length > MAX_NAME) return void toast(`Tag names have at most ${MAX_NAME} characters.`, true);
    const known = projectTags(getState().config, getState().tasks).map((t) => t.name).concat(parseTags(field(g).value));
    const exact = known.find((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase()) || name;
    update(g, (tags) => (tags.includes(exact) ? tags : [...tags, exact]), true);
  }
  const pick = (g, option) => {
    if (option.hasAttribute("data-tag-create")) return add(g, typed());
    const name = option.dataset.tagOption;
    update(g, (tags) => (tags.includes(name) ? tags.filter((t) => t !== name) : tags.length >= MAX_TAGS ? tags : [...tags, name]), true);
  };
  const root = (event) => event.target.closest?.("[data-task-tags]");
  // Keep focus in the input while the list's rows and the field's buttons are pressed.
  document.addEventListener("mousedown", (event) => {
    if (event.target.closest?.("[data-tag-combo] button, .tag-combo-menu")) event.preventDefault();
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu && !event.target.closest?.("[data-tag-combo], .tag-combo-menu")) closeMenu();
  }, true);
  document.addEventListener("click", (event) => {
    const g = root(event), option = event.target.closest?.(".tag-combo-menu [role=option]");
    if (option && group?.isConnected) return pick(group, option);
    if (!g) return;
    const remove = event.target.closest("[data-tag-remove]"), focus = event.detail === 0 || allowsTextAutofocus();
    if (remove) return update(g, (tags) => tags.filter((t) => t !== remove.dataset.tagRemove), focus);
    if (event.target.closest("[data-tag-clear]")) return update(g, () => [], focus);
    if (event.target.closest("[data-tag-toggle]")) {
      if (menu && group === g) closeMenu();
      else {
        openMenu(g);
        // Keys then work in the list; on touch the input stays unfocused so no keyboard opens.
        if (allowsTextAutofocus()) refocus(); else event.target.closest("[data-tag-toggle]").focus({ preventScroll: true });
      }
      return;
    }
    // A tap on the field's empty part is a tap on its input.
    if (event.target.closest("input")) openMenu(g);
    else if (!event.target.closest(".tag-chip")) { g.querySelector("[data-tag-input]")?.focus({ preventScroll: true }); openMenu(g); }
  });
  document.addEventListener("focusin", (event) => {
    if (!quiet && event.target.matches?.("[data-tag-input]")) openMenu(root(event));
  });
  document.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-tag-input]")) return;
    active = -1;
    openMenu(root(event));
    paint();
  });
  document.addEventListener("keydown", (event) => {
    if (!event.target.matches?.("[data-tag-input]")) return;
    const g = root(event), options = optionList();
    if (event.key === "Escape" && menu) { event.preventDefault(); event.stopPropagation(); closeMenu(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!menu) return openMenu(g);
      active = options.length ? (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : -1;
      mark();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) return;
      const o = options[active];
      // With text typed, Enter adds; a tag already on the card is only cleared from the input.
      if (o && event.target.value.trim() && o.getAttribute("aria-selected") === "true") { event.target.value = ""; paint(); }
      else if (o) pick(g, o); else add(g, event.target.value);
    } else if (event.key === "Backspace" && !event.target.value) {
      const tags = parseTags(field(g).value);
      if (tags.length) { event.preventDefault(); update(g, (all) => all.slice(0, -1), true); }
    }
  }, true);
  // Tabbing out of the field (or off the list) closes it.
  document.addEventListener("focusout", (event) => {
    const to = event.relatedTarget;
    if (menu && !quiet && event.target.closest?.("[data-task-tags], .tag-combo-menu") && !to?.closest?.("[data-task-tags], .tag-combo-menu")) closeMenu();
  });
  document.addEventListener("scroll", () => place(), true);
  window.addEventListener("resize", () => place());
  window.visualViewport?.addEventListener("resize", () => place());
}
