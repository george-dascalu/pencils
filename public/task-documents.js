import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from "./open-focus.js";
import { cardMentions } from "./document-mentions.js";
import { viewOn } from "./card-fields.js";

// The two resource types share their picker, link rows, focus and save behaviour.
export function taskDocumentsEditor(ctx, form, options) {
  const editors = ['documents', 'boards'].filter(kind => viewOn(ctx.state.config, kind === 'boards' ? 'board' : kind))
    .map(kind => linkedResources(ctx, form, {...options, kind}));
  return {refresh: () => editors.forEach(editor => editor.refresh()), destroy: () => editors.forEach(editor => editor.destroy())};
}
function linkedResources(ctx, form, { flush, kind }) {
  const { state, esc, icon } = ctx;
  const project = state.project.id, isDocument = kind === 'documents';
  const singular = isDocument ? 'document' : 'board', caption = isDocument ? 'Documents' : 'Boards', glyph = isDocument ? 'file' : 'board';
  const selector = name => `[data-${singular}-${name}]`;
  const host = document.createElement("section");
  host.className = `task-resources task-${kind}`;
  host.setAttribute("aria-label", caption);
  host.innerHTML = `<div class="task-relationships-heading"><h3>${caption}</h3><button type="button" class="icon-button" data-${singular}-link-toggle aria-label="Link a ${singular}" title="Link a ${singular}" aria-haspopup="dialog" aria-expanded="false">${icon("plus")}</button></div>
    <div data-resource-list data-${singular}-list></div><div class="task-document-mentions" data-${singular}-mentions hidden></div>
    <div class="selection-popover task-relationship-picker" id="task-${singular}-picker" popover="manual" role="dialog" aria-label="Link a ${singular}" hidden>
      <div class="task-relationship-controls"><input type="search" aria-label="Find a ${singular}" placeholder="Find a ${singular}…"><button type="button" class="icon-button" data-${singular}-link-close aria-label="Close">${icon("close")}</button></div>
      <div class="task-relationship-options" data-${singular}-options></div>
    </div><p class="field-hint" data-${singular}-link-status role="status" hidden></p>`;
  ([...form.querySelectorAll(".task-resources")].at(-1) || form.querySelector(".task-relationships") || form.querySelector(".task-description")).after(host);
  const picker = host.querySelector(`#task-${singular}-picker`);
  const toggle = host.querySelector(selector("link-toggle"));
  toggle.setAttribute("aria-controls", picker.id);
  const search = picker.querySelector("input");
  const status = host.querySelector(selector("link-status"));
  let disposed = false, mentionKey = "", mentionHTML = "";
  const rendered = new WeakMap();
  const paint = (element, html) => {
    if (rendered.get(element) === html) return;
    element.innerHTML = html; rendered.set(element, html);
  };
  const active = () => !disposed && form.isConnected && state.project?.id === project;
  const linked = () => [...form.querySelectorAll(`input[name="${kind}"]`)].map((input) => input.value);
  const records = () => state[kind] || [];
  const title = (id) => records().find((d) => d.id === id)?.title || `Unavailable ${singular}`;
  function say(message = "", error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("form-error", error);
  }
  function refresh() {
    if (!active()) return;
    const ids = linked();
    paint(host.querySelector(selector("list")), ids.length
      ? ids.map((id) => `<div class="task-relationship-row"><button type="button" class="task-relationship-link" data-${singular}-open="${esc(id)}" ${!isDocument && !records().some(record => record.id === id) ? "disabled" : ""} title="Open ${esc(title(id))}">${icon(glyph)}<span class="task-relationship-title">${esc(title(id))}</span></button><button type="button" class="icon-button" data-${singular}-unlink="${esc(id)}" aria-label="Remove ${esc(title(id))}" title="Remove">${icon("close")}</button></div>`).join("")
      : `<p class="field-hint">No linked ${kind}.</p>`);
    // Incoming document mentions and older board links share this section;
    // skip rescanning while their records and the card's own links are unchanged.
    const task = form.dataset.id && (state.tasks || []).find((t) => t.id === form.dataset.id);
    const key = task ? [task.id, task.key, ids.join(), records().map((d) => d.revision || d.id).join()].join("|") : "";
    if (key !== mentionKey) {
      mentionKey = key;
      const mentions = task ? (isDocument ? cardMentions(task, records()) : records().filter(b => Array.isArray(b.settings?.linked_tasks) && b.settings.linked_tasks.includes(task.id)).map(document => ({document, linked:true}))).filter(({ document: d }) => !ids.includes(d.id))
        .sort((a, b) => a.document.title.localeCompare(b.document.title, undefined, { numeric: true, sensitivity: "base" })) : [];
      mentionHTML = mentions.length ? `<p class="caption">${isDocument ? "Mentioned in" : "Linked from"}</p>${mentions.map(({ document: d, linked }) => `<div class="task-relationship-row"><button type="button" class="task-relationship-link" data-${singular}-open="${esc(d.id)}" title="Open ${esc(d.title)}">${icon(glyph)}<span class="task-relationship-title">${esc(d.title)}</span>${linked ? "" : '<span class="field-hint">Not linked</span>'}</button></div>`).join("")}` : "";
      const list = host.querySelector(selector("mentions"));
      list.hidden = !mentionHTML;
      list.innerHTML = mentionHTML;
    }
    if (!picker.hidden) {
      const query = search.value.trim().toLowerCase();
      const matches = records().filter((d) => !ids.includes(d.id) && !d.archived && (d.title || "").toLowerCase().includes(query)).slice(0, 40);
      paint(picker.querySelector(selector("options")), matches.length
        ? matches.map((d) => `<button type="button" class="task-relationship-option" data-${singular}-link-add="${esc(d.id)}"><span class="task-relationship-link">${icon(glyph)}<span class="task-relationship-title">${esc(d.title || `Untitled ${singular}`)}</span></span></button>`).join("")
        : `<p class="field-hint">${records().length ? `No matching ${kind}.` : `This project has no ${kind} yet.`}</p>`);
      positionPopover(picker, toggle.getBoundingClientRect(), { width: 320, maxHeight: 420 });
    }
  }
  function close(focus = false) {
    if (picker.matches(":popover-open")) picker.hidePopover();
    picker.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (focus) toggle.focus();
  }
  async function write(ids) {
    for (const input of form.querySelectorAll(`input[name="${kind}"]`)) input.remove();
    for (const id of ids) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = kind;
      input.value = id;
      form.append(input);
    }
    form.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
    const saved = await flush();
    if (active()) say(saved ? (form.dataset.id ? `${caption} saved.` : "Saved with the card.") : `Finish saving the card before linking ${kind}.`, !saved);
  }
  async function click(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button === toggle) {
      if (!picker.hidden) return close(true);
      picker.hidden = false;
      picker.showPopover();
      toggle.setAttribute("aria-expanded", "true");
      search.value = "";
      refresh();
      focusOnOpen(search, picker.querySelector(selector("link-close")));
    } else if (button.hasAttribute(`data-${singular}-link-close`)) close(true);
    else if (button.getAttribute(`data-${singular}-link-add`)) {
      close(true);
      await write([...linked(), button.getAttribute(`data-${singular}-link-add`)]);
    } else if (button.getAttribute(`data-${singular}-unlink`)) {
      await write(linked().filter((id) => id !== button.getAttribute(`data-${singular}-unlink`)));
      toggle.focus();
    } else if (button.getAttribute(`data-${singular}-open`)) {
      const id = button.getAttribute(`data-${singular}-open`);
      if (form.dataset.id && !(await flush())) return say(`Finish saving the card before opening a ${singular}.`, true);
      ctx.closeDialog?.(true);
      await ctx.features?.[isDocument ? "openDocument" : "openBoard"]?.(id);
    }
  }
  host.addEventListener('click', event => {
    void click(event).catch(error => active() ? say(error.message, true) : ctx.toast?.(error.message, true));
  });
  picker.addEventListener("input", (event) => { event.stopPropagation(); if (event.target === search) refresh(); });
  host.addEventListener("keydown", (event) => {
    if (picker.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === "Enter" && event.target === search) event.preventDefault();
  });
  const outside = (event) => { if (!picker.contains(event.target) && !toggle.contains(event.target)) close(); };
  document.addEventListener("pointerdown", outside, true);
  refresh();
  return {
    refresh,
    destroy() {
      disposed = true;
      close();
      document.removeEventListener("pointerdown", outside, true);
      host.remove();
    },
  };
}
