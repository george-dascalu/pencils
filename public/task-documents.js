import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from "./open-focus.js";

// Documents linked from a card. Links live on the task record (`documents`);
// the document view lists the cards that point at it.
export function taskDocumentsEditor(ctx, form, { flush }) {
  const { state, esc, icon } = ctx;
  const project = state.project.id;
  const host = document.createElement("section");
  host.className = "task-documents";
  host.setAttribute("aria-label", "Documents");
  host.innerHTML = `<div class="task-relationships-heading"><h3>Documents</h3><button type="button" class="icon-button" data-document-link-toggle aria-label="Link a document" title="Link a document" aria-haspopup="dialog" aria-expanded="false">${icon("plus")}</button></div>
    <div data-document-list></div>
    <div class="selection-popover task-relationship-picker" id="task-document-picker" popover="manual" role="dialog" aria-label="Link a document" hidden>
      <div class="task-relationship-controls"><input type="search" aria-label="Find a document" placeholder="Find a document…"><button type="button" class="icon-button" data-document-link-close aria-label="Close">${icon("close")}</button></div>
      <div class="task-relationship-options" data-document-options></div>
    </div><p class="field-hint" data-document-link-status role="status" hidden></p>`;
  (form.querySelector(".task-relationships") || form.querySelector(".task-description")).after(host);
  const picker = host.querySelector("[data-document-picker], #task-document-picker");
  const toggle = host.querySelector("[data-document-link-toggle]");
  toggle.setAttribute("aria-controls", picker.id);
  const search = picker.querySelector("input");
  const status = host.querySelector("[data-document-link-status]");
  let disposed = false;
  const active = () => !disposed && form.isConnected && state.project?.id === project;
  const linked = () => [...form.querySelectorAll('input[name="documents"]')].map((input) => input.value);
  const documents = () => state.documents || [];
  const title = (id) => documents().find((d) => d.id === id)?.title || "Unavailable document";
  function say(message = "", error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("form-error", error);
  }
  function refresh() {
    if (!active()) return;
    const ids = linked();
    host.querySelector("[data-document-list]").innerHTML = ids.length
      ? ids.map((id) => `<div class="task-relationship-row"><button type="button" class="task-relationship-link" data-document-open="${esc(id)}" title="Open ${esc(title(id))}">${icon("file")}<span class="task-relationship-title">${esc(title(id))}</span></button><button type="button" class="icon-button" data-document-unlink="${esc(id)}" aria-label="Remove ${esc(title(id))}" title="Remove">${icon("close")}</button></div>`).join("")
      : '<p class="field-hint">No linked documents.</p>';
    if (!picker.hidden) {
      const query = search.value.trim().toLowerCase();
      const matches = documents().filter((d) => !ids.includes(d.id) && (d.title || "").toLowerCase().includes(query)).slice(0, 40);
      picker.querySelector("[data-document-options]").innerHTML = matches.length
        ? matches.map((d) => `<button type="button" class="task-relationship-option" data-document-link-add="${esc(d.id)}"><span class="task-relationship-link">${icon("file")}<span class="task-relationship-title">${esc(d.title || "Untitled document")}</span></span></button>`).join("")
        : `<p class="field-hint">${documents().length ? "No matching documents." : "This project has no documents yet."}</p>`;
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
    for (const input of form.querySelectorAll('input[name="documents"]')) input.remove();
    for (const id of ids) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "documents";
      input.value = id;
      form.append(input);
    }
    form.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
    const saved = await flush();
    if (active()) say(saved ? (form.dataset.id ? "Documents saved." : "Saved with the card.") : "Finish saving the card before linking documents.", !saved);
  }
  host.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button === toggle) {
      if (!picker.hidden) return close(true);
      picker.hidden = false;
      picker.showPopover();
      toggle.setAttribute("aria-expanded", "true");
      search.value = "";
      refresh();
      focusOnOpen(search, picker.querySelector("[data-document-link-close]"));
    } else if (button.hasAttribute("data-document-link-close")) close(true);
    else if (button.dataset.documentLinkAdd) {
      close(true);
      await write([...linked(), button.dataset.documentLinkAdd]);
    } else if (button.dataset.documentUnlink) {
      await write(linked().filter((id) => id !== button.dataset.documentUnlink));
      toggle.focus();
    } else if (button.dataset.documentOpen) {
      const id = button.dataset.documentOpen;
      if (form.dataset.id && !(await flush())) return say("Finish saving the card before opening a document.", true);
      ctx.closeDialog?.(true);
      await ctx.features?.openDocument?.(id);
    }
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
