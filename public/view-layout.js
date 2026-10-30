import { syncTopbarTitle } from "./topbar-title.js";

// Layout changes when navigating, not when a card, cursor or zoom label changes.
// Broad ancestor :has() selectors made those small DOM edits restyle the page.
export function updateViewLayout(state) {
  const main = document.querySelector(".main");
  if (!main) {
    document.documentElement.classList.remove("table-viewport-view");
    return;
  }
  const view = state.project && !state.helpArticle && !state.directoryPage
    ? state.view === "board" && state.boardGallery ? "board-gallery" : state.view
    : "";
  main.classList.toggle("project-main", !!main.querySelector(".tabs"));
  main.classList.toggle("project-warning", !!main.querySelector(":scope > .connection-banner, :scope > .warning"));
  document.documentElement.classList.toggle("table-viewport-view", view === "table" && !main.classList.contains("project-warning"));
  main.dataset.layoutView = view;
  // A phone layout tray belongs to the view it was opened on; leaving the view closes it.
  if (state.layoutTray && state.layoutTray !== view) state.layoutTray = null;
  const content = main.querySelector("#view-content");
  if (content) content.dataset.layoutView = view;
  if (!["board", "drawing"].includes(view)) setBoardExpanded(false);
  syncTopbarTitle(state);
}

export function setBoardExpanded(expanded) {
  document.documentElement.classList.toggle("board-expanded-view", expanded);
}
