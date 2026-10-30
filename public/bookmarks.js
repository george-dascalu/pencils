// Bookmarks (owner request, 30 Oct 2026): a star in the card editor, the document bar, the board
// toolbar and a view's toolbar keeps that item in the signed-in person's bookmarks
// (server/bookmarks.js), which the search popup lists first.
export function installBookmarks({ api, esc, icon, toast }) {
  let marked = new Set(), toggles = 0, saving = Promise.resolve();
  const key = (kind, project, id) => `${kind}:${project}:${id}`;
  const sync = () => {
    for (const el of document.querySelectorAll("[data-bookmark]"))
      el.setAttribute("aria-pressed", String(marked.has(key(el.dataset.kind, el.dataset.project, el.dataset.id))));
  };
  // The bookmarks with their current names, after any saves on their way; the stars on the page
  // follow, unless one was pressed meanwhile.
  async function list() {
    const before = toggles;
    await saving;
    const { bookmarks } = await api("/bookmarks");
    if (before === toggles) {
      marked = new Set(bookmarks.map((b) => key(b.kind, b.project, b.id)));
      sync();
    }
    return bookmarks;
  }
  const button = (kind, project, id) =>
    `<button type="button" class="icon-button bookmark-button" data-bookmark data-kind="${kind}" data-project="${esc(project)}" data-id="${esc(id)}" aria-pressed="${marked.has(key(kind, project, id))}" aria-label="Bookmark" title="Bookmark">${icon("star")}</button>`;
  // Toggles at once and puts it back if the save fails; saves go in order.
  document.addEventListener("click", (event) => {
    const el = event.target.closest?.("[data-bookmark]");
    if (!el) return;
    const { kind, project, id } = el.dataset, item = key(kind, project, id), on = !marked.has(item);
    const set = (value) => { toggles++; value ? marked.add(item) : marked.delete(item); sync(); };
    set(on);
    saving = saving.then(() => api("/bookmarks", { method: on ? "POST" : "DELETE", body: { kind, project, id } })).catch((error) => {
      set(!on);
      toast(error.message, true);
    });
  });
  return { button, list, load: () => list().catch(() => {}) };
}
