// Layout changes when navigating, not when a card, cursor or zoom label changes.
// Broad ancestor :has() selectors made those small DOM edits restyle the page.
export function updateViewLayout(state) {
  const main = document.querySelector(".main");
  if (!main) return;
  const view = state.project && !state.helpArticle && !state.directoryPage
    ? state.view === "board" && state.boardGallery ? "board-gallery" : state.view
    : "";
  main.classList.toggle("project-main", !!main.querySelector(".tabs"));
  main.classList.toggle("project-warning", !!main.querySelector(":scope > .connection-banner, :scope > .warning"));
  main.dataset.layoutView = view;
  const content = main.querySelector("#view-content");
  if (content) content.dataset.layoutView = view;
  if (!["board", "drawing"].includes(view)) setBoardExpanded(false);
}

export function setBoardExpanded(expanded) {
  document.documentElement.classList.toggle("board-expanded-view", expanded);
}
