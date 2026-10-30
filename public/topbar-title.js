// The header names only what is open: the board or document, or else the project. Phones keep
// the name for screen readers only (project-layout.css).

export function openItemTitle(state) {
  if (!state.project || state.helpArticle || state.directoryPage) return null;
  if (state.view === "board" && !state.boardGallery)
    return state.boards?.find((b) => b.id === state.selectedBoard)?.title || null;
  if (state.view === "documents")
    return state.documents?.find((d) => d.id === state.selectedDocument)?.title || null;
  return null;
}

export function syncTopbarTitle(state) {
  const crumb = document.querySelector(".topbar .breadcrumb");
  if (!crumb || !state.project || state.helpArticle || state.directoryPage) return;
  const item = openItemTitle(state), project = state.project.title || "";
  const heading = crumb.querySelector("strong");
  if (heading) {
    const title = item || project;
    if (heading.textContent !== title) heading.textContent = title;
    if (item) heading.title = `${project} / ${item}`;
    else heading.removeAttribute("title");
  }
}
