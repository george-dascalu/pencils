import { focusOnOpen } from "./open-focus.js";
// Search's own order and removed items (owner request, 3 Nov 2026), kept for each person on the
// server (server/search-items.js): Bookmarks and Commands are dragged into order within their own
// list (or moved with Alt+Up/Down), and an item removed from Search waits in Settings → You.
export const itemKey = (item) => (item.kind ? `${item.kind}:${item.project}:${item.id}` : `command:${item.id}`);
// The saved order first, then what it doesn't know yet, in its usual order.
export function ordered(items, order) {
  const rank = new Map(order.map((key, i) => [key, i]));
  return items.map((item, i) => [rank.get(itemKey(item)) ?? order.length + i, item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}
// After a drag in a list narrowed by typing: the shown items trade places among themselves and the
// rest keep theirs. Shown items the order didn't know yet join it at the end, where they were shown.
export function placed(order, shown) {
  const base = [...order, ...shown.filter((key) => !order.includes(key))], moving = new Set(shown);
  let i = 0;
  return base.map((key) => (moving.has(key) ? shown[i++] : key));
}

export function installSearchItems({ api, esc, icon, toast, commands, bookmarks, viewLabel, changed }) {
  let saved = { bookmarks: [], commands: [], hidden: [] }, ready = null, saving = Promise.resolve(), edits = 0;
  // The server's copy, unless a change was made here since it was asked for; a failed load keeps ours.
  const fetchSaved = () => {
    const at = edits;
    return api("/search-items").then((data) => { if (at === edits) saved = data; }).catch(() => {});
  };
  // The latest, after any changes on their way. Search waits only for the first: later ones apply
  // from the next time it draws its lists.
  const load = () => {
    const next = saving.then(fetchSaved);
    ready ||= next;
    return next;
  };
  // Changes show at once and save in order; a refused one shows the saved lists again.
  function save(next) {
    saved = next;
    edits++;
    saving = saving.then(() => api("/search-items", { method: "PATCH", body: next })).catch((error) => {
      toast(error.message, true);
      return fetchSaved().then(changed);
    });
  }
  function announce(message) {
    let live = document.querySelector("#search-item-status");
    if (!live) {
      live = Object.assign(document.createElement("span"), { id: "search-item-status", className: "sr-only" });
      live.setAttribute("role", "status");
      document.body.append(live);
    }
    live.textContent = message;
  }
  const shown = (list, items) => ordered(items.filter((item) => !saved.hidden.includes(itemKey(item))), saved[list]);
  // A row of a sortable list: the result, then Remove from Search and the drag handle.
  function row(result, item, title) {
    const name = esc(title);
    return `<div class="search-item" data-search-key="${esc(itemKey(item))}">${result}<button type="button" class="icon-button search-item-remove" data-search-remove aria-label="Remove ${name} from Search" title="Remove from Search">${icon("hide")}</button><button type="button" class="icon-button search-item-handle" data-search-drag aria-label="Move ${name}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="Drag to reorder. Alt + Up/Down moves it.">${icon("drag")}</button></div>`;
  }
  const list = (name, rows) => `<div class="search-item-list" data-search-list="${name}">${rows}</div>`;
  const keys = (host) => [...host.querySelectorAll(":scope > .search-item")].map((el) => el.dataset.searchKey);
  const commit = (host) => save({ ...saved, [host.dataset.searchList]: placed(saved[host.dataset.searchList], keys(host)) });

  document.addEventListener("click", (event) => {
    const remove = event.target.closest?.("[data-search-remove]"), restore = event.target.closest?.("[data-search-restore]");
    if (remove) {
      const item = remove.closest(".search-item"), next = item.nextElementSibling || item.previousElementSibling, focused = document.activeElement === remove;
      save({ ...saved, hidden: [...saved.hidden, item.dataset.searchKey] });
      item.remove();
      // The keyboard stays in the list, on the row that took its place; an emptied list redraws, and
      // the keyboard goes back to the field.
      if (next) { if (focused) next.querySelector("[data-search-remove]").focus(); }
      else {
        changed();
        if (focused) focusOnOpen(document.querySelector("#global-search-input"));
      }
      toast("Removed from Search. Bring it back in Settings → You.");
    } else if (restore) {
      save({ ...saved, hidden: saved.hidden.filter((key) => key !== restore.dataset.searchRestore) });
      paintRemoved();
    }
  });
  // Alt+Up/Down moves the focused row within its list.
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const item = event.target.closest?.(".search-item-list > .search-item");
    if (!item) return;
    event.preventDefault();
    const other = event.key === "ArrowUp" ? item.previousElementSibling : item.nextElementSibling;
    if (!other) return;
    const focused = document.activeElement;
    if (event.key === "ArrowUp") other.before(item);
    else other.after(item);
    focused.focus();
    commit(item.parentElement);
    const all = [...item.parentElement.children];
    announce(`${item.querySelector(".search-result").dataset.title || item.querySelector(".search-result").textContent} moved to ${all.indexOf(item) + 1} of ${all.length}.`);
  });
  // A drag on the handle moves the row past the rows it crosses; the list scrolls near its edges.
  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest?.("[data-search-drag]");
    if (!handle || event.button > 0) return;
    event.preventDefault();
    const item = handle.closest(".search-item"), host = item.parentElement, before = keys(host).join();
    const scroller = host.closest(".search-dialog-results");
    item.classList.add("search-item-dragging");
    // On the window: moving the row would end a pointer capture on the handle.
    const move = (e) => {
      if (e.pointerId !== event.pointerId) return;
      const next = [...host.querySelectorAll(":scope > .search-item")].find((el) => el !== item && e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
      if (next !== item.nextElementSibling) host.insertBefore(item, next || null);
      const box = scroller?.getBoundingClientRect();
      if (box) scroller.scrollTop += e.clientY < box.top + 32 ? -8 : e.clientY > box.bottom - 32 ? 8 : 0;
    };
    const end = (e) => {
      if (e.pointerId !== event.pointerId) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      item.classList.remove("search-item-dragging");
      if (keys(host).join() !== before) commit(host);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  });

  // Settings → You: the removed items, each with Bring back.
  let choices = null;
  const removedTitle = (key) => {
    if (key.startsWith("command:")) return commands(true).find((c) => `command:${c.id}` === key)?.title;
    const b = choices?.find((c) => itemKey(c) === key);
    return b && (b.kind === "view" ? `${viewLabel(b.id)} · ${b.project_title}` : b.title);
  };
  function removedHTML() {
    if (!choices) return '<p class="field-hint">Loading…</p>';
    const rows = saved.hidden.map((key) => [key, removedTitle(key)]).filter(([, title]) => title);
    return rows.length
      ? `<ul class="search-removed-list">${rows.map(([key, title]) => `<li><span>${esc(title)}</span><button type="button" class="button small" data-search-restore="${esc(key)}" aria-label="Bring back ${esc(title)}">Bring back</button></li>`).join("")}</ul>`
      : '<p class="field-hint">Nothing removed from Search.</p>';
  }
  function paintRemoved() {
    for (const el of document.querySelectorAll(".search-removed")) el.innerHTML = removedHTML();
  }
  const settingsHTML = () => `<fieldset class="appearance-group"><legend>Search</legend><p class="field-hint">Items you removed from Search. Drag Bookmarks and Commands in Search to change their order.</p><div class="search-removed">${removedHTML()}</div></fieldset>`;
  async function mountSettings() {
    [choices] = await Promise.all([bookmarks.list().catch(() => []), saving.then(load)]);
    paintRemoved();
  }
  return { load, loaded: () => ready || load(), shown, row, list, settingsHTML, mountSettings };
}
