import { NEW_CARD_PARTS } from "./card-fields.js";

// On desktop and iPad a card's Attachments, Notes, Relationships, Documents and Boards share one row of
// tabs below the description, one section at a time (owner request F0.23-10); phones' card page and the
// card's board keep them all. A section the card leaves out has no tab, and with one left there is no
// row. The last tab chosen opens next time, in this browser.
const PARTS = ["attachments", "notes", "relationships", "documents", "boards"];
const KEY = "card-section-tab";
export function taskSectionTabs(form, storage) {
  const dialog = form.closest("dialog"), description = form.querySelector(".task-description");
  const body = description?.parentElement;
  if (!body || !dialog) return { destroy() {} };
  // The card's own attachment list ends the description; in tabs it is a section like the rest.
  const list = description.querySelector(":scope > .task-attachments");
  const off = form.matches(".task-create-form") ? (form.dataset.createOff || "").split(" ") : [];
  const sections = new Map(PARTS.map((part) => [part, part === "attachments" ? list : body.querySelector(`:scope > .task-${part}`)])
    .filter(([part, section]) => section && !off.includes(part)));
  if (sections.size < 2) return { destroy() {} };
  const names = Object.fromEntries(NEW_CARD_PARTS);
  const bar = document.createElement("div");
  bar.className = "view-layout-switcher task-section-tabs";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Card sections");
  for (const [part, section] of sections) {
    section.id ||= `task-section-${part}`;
    bar.insertAdjacentHTML("beforeend", `<button type="button" role="tab" id="task-tab-${part}" data-section-tab="${part}" aria-controls="${section.id}"><span>${names[part]}</span> <span class="tab-count" hidden></span></button>`);
  }
  const tabs = [...bar.children];
  description.after(bar);
  const stored = storage.get(KEY, null);
  let chosen = sections.has(stored) ? stored : sections.keys().next().value;
  function apply() {
    const on = !dialog.matches(".task-editor-page, .card-board");
    bar.hidden = !on;
    if (on && list?.previousElementSibling !== bar) bar.after(list);
    else if (!on && list && list.parentElement !== description) description.append(list);
    for (const [part, section] of sections) {
      section.hidden = on && part !== chosen;
      if (on) section.setAttribute("role", "tabpanel"), section.setAttribute("aria-labelledby", `task-tab-${part}`);
      else section.removeAttribute("role"), section.removeAttribute("aria-labelledby");
    }
    for (const tab of tabs) {
      const selected = tab.dataset.sectionTab === chosen;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  }
  const choose = (part, remember = false) => {
    chosen = part;
    if (remember) storage.set(KEY, part);
    apply();
  };
  const notes = () => { try { return JSON.parse(form.elements.notes?.value || "[]")?.length || 0; } catch { return 0; } };
  // Counts show what the hidden sections hold: for Documents and Boards, the card's own links, not mentions.
  function count() {
    for (const tab of tabs) {
      const part = tab.dataset.sectionTab, section = sections.get(part);
      const n = part === "attachments" ? section.querySelectorAll(".task-attachment-list > li").length
        : part === "notes" ? notes()
        : section.querySelectorAll(part === "relationships" ? ".task-relationship-row" : "[data-resource-list] > .task-relationship-row").length;
      const badge = tab.querySelector(".tab-count");
      if (badge.textContent !== String(n || "")) badge.textContent = n || "";
      badge.hidden = !n;
    }
  }
  bar.addEventListener("click", (event) => {
    const tab = event.target.closest("[role=tab]");
    if (tab) choose(tab.dataset.sectionTab, true);
  });
  bar.addEventListener("keydown", (event) => {
    const at = tabs.indexOf(event.target);
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (at < 0 || to === undefined) return;
    event.preventDefault();
    const tab = tabs[(to + tabs.length) % tabs.length];
    choose(tab.dataset.sectionTab, true);
    tab.focus();
  });
  // A section that adds something out of sight (a file pasted or dropped on the card) asks to be shown.
  const reveal = (event) => {
    for (const [part, section] of sections) if (section.contains(event.target)) choose(part);
  };
  form.addEventListener("task-section-reveal", reveal);
  const modes = new MutationObserver(apply);
  modes.observe(dialog, { attributes: true, attributeFilter: ["class"] });
  const items = new MutationObserver(count);
  for (const section of sections.values()) items.observe(section, { childList: true, subtree: true });
  apply();
  count();
  return {
    destroy() {
      modes.disconnect();
      items.disconnect();
      form.removeEventListener("task-section-reveal", reveal);
      bar.remove();
    },
  };
}
