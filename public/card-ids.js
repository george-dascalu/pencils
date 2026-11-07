// Card IDs (the project key and the card's number) show or hide on every card tile and row by one
// choice, kept in this browser and the same in every view (F0.22-61). The root's data-ids-hidden hides
// them through card-fields.css; the button sits in each view's bar (View options on phones).
const KEY = "card-ids";
export const cardIdsShown = (storage) => storage.get(KEY, true) !== false;
export const cardIdsButton = (storage, icon) => {
  const shown = cardIdsShown(storage);
  // A name before the button, shown in phones' View options (one row per option there).
  return `<label class="card-ids-control"><span class="control-label">Card IDs</span><button type="button" class="icon-button" data-card-ids aria-pressed="${shown}" aria-label="Card IDs" title="${shown ? "Hide" : "Show"} card IDs">${icon("hash")}</button></label>`;
};
export function installCardIds({ storage, renderView }) {
  const apply = () => document.documentElement.toggleAttribute("data-ids-hidden", !cardIdsShown(storage));
  apply();
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-card-ids]")) return;
    storage.set(KEY, !cardIdsShown(storage));
    apply();
    // The bar isn't redrawn with the view.
    const shown = cardIdsShown(storage);
    for (const button of document.querySelectorAll("[data-card-ids]")) {
      button.setAttribute("aria-pressed", shown);
      button.title = `${shown ? "Hide" : "Show"} card IDs`;
    }
    // Redrawn, so what's measured from the keys (cut-short IDs, Timeline's list) follows.
    renderView(true);
    document.querySelector("[data-card-ids]")?.focus({ preventScroll: true });
  });
}
