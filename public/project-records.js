// Settings → Trash and Audit log (owner requests T92 and T93, 1 November 2026): the project's
// deleted cards, documents and boards, restored within 30 days, and who created, changed, deleted
// or restored which of them over the last 365 days.
import { formatDay, formatDateTime } from "./format-date.js";

const glyphs = { card: "task", task: "task", document: "documents", board: "board" };
const names = { card: "card", task: "card", document: "document", board: "board" };
const localDay = (time) => new Date(time).toLocaleDateString("en-CA");

export function projectRecords({ api, esc, icon, state, refresh, toast }) {
  const base = () => `/projects/${state.project.id}`;
  const title = (item) => `${item.title ? esc(item.title) : "Untitled"}${item.task_key || item.key ? ` <span class="task-id">${esc(item.task_key || item.key)}</span>` : ""}`;

  async function trash(host, valid) {
    const { items } = await api(`${base()}/trash`);
    if (!valid()) return;
    host.innerHTML = `<div class="settings-page-body">${items.length ? `<ul class="settings-record-list" aria-label="Deleted items">${items.map((item) => `<li class="settings-action-row"><div><h3>${icon(glyphs[item.kind])}${title(item)}</h3><p>Deleted ${esc(formatDateTime(item.deleted))} · deleted for good on ${esc(formatDay(localDay(item.expires)))}</p></div><button type="button" class="button small" data-trash-restore="${esc(item.key)}" aria-label="Restore ${esc(item.title || names[item.kind])}">Restore</button></li>`).join("")}</ul>` : "<p>Trash is empty. Deleted cards, documents and boards wait here for 30 days.</p>"}</div>`;
    host.onclick = async (event) => {
      const button = event.target.closest("[data-trash-restore]");
      if (!button) return;
      button.disabled = true;
      try {
        await api(`${base()}/trash`, { method: "POST", body: { key: button.dataset.trashRestore } });
        toast(`${button.getAttribute("aria-label").replace(/^Restore /, "")} restored.`);
        await refresh(false);
        await trash(host, valid);
      } catch (error) {
        button.disabled = false;
        toast(error.message, true);
      }
    };
  }

  // A field name as people say it, for the audit log.
  const field = (name, kind) => ({ body: kind === "card" ? "description" : "text", due: "due date", start: "start date", fields: "custom fields", title: "name", undo: "undo" })[name] || name;
  const row = (entry) => `<li class="settings-action-row" data-kind="${esc(entry.kind)}"><div><h3>${icon(glyphs[entry.kind])}<span>${esc(entry.user)} ${esc(entry.action)} ${esc(names[entry.kind] || entry.kind)} ${title(entry)}</span></h3><p>${esc(formatDateTime(entry.at))}${entry.fields?.length ? ` · ${esc(entry.fields.map((name) => field(name, entry.kind)).join(", "))}` : ""}</p></div></li>`;

  async function audit(host, valid) {
    let entries = (await api(`${base()}/audit`)).entries;
    if (!valid()) return;
    host.innerHTML = `<div class="settings-page-body"><div class="settings-record-filters"><label class="field">Show<select data-audit-kind data-settings-staging><option value="">All items</option><option value="card">Cards</option><option value="document">Documents</option><option value="board">Boards</option></select></label><label class="field">Search<input type="search" data-audit-search data-settings-staging placeholder="Item or person…" autocomplete="off"></label></div><ol class="settings-record-list" aria-label="Changes"></ol><p class="field-hint" data-audit-empty hidden>No changes yet.</p><button type="button" class="button small" data-audit-more hidden>Show older changes</button></div>`;
    const list = host.querySelector(".settings-record-list"), kind = host.querySelector("[data-audit-kind]"), search = host.querySelector("[data-audit-search]"), more = host.querySelector("[data-audit-more]");
    const show = () => {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const shown = entries.filter((e) => (!kind.value || e.kind === kind.value) && words.every((w) => `${e.user} ${e.title} ${e.key || ""}`.toLowerCase().includes(w)));
      list.innerHTML = shown.map(row).join("");
      host.querySelector("[data-audit-empty]").hidden = !!shown.length;
    };
    kind.onchange = show;
    search.oninput = show;
    more.hidden = entries.length < 200;
    more.onclick = async () => {
      const older = (await api(`${base()}/audit?before=${entries.at(-1).at}`)).entries;
      entries = [...entries, ...older];
      more.hidden = older.length < 200;
      show();
    };
    show();
  }

  return { trash, audit };
}
