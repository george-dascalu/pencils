// The header names what is open. With a board or a document open, its name
// replaces the project's: phones keep the view and project on the second line,
// and wide desktop headers keep the project as a crumb (Organisation / Project /
// Board). Every other view names the project.
let labelFor = (view) => view;
export function installTopbarTitle({ viewLabel }) {
  labelFor = viewLabel;
}

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
  const item = openItemTitle(state), project = state.project.title || "", view = labelFor(state.view);
  const heading = crumb.querySelector("strong");
  if (heading) {
    const title = item || project;
    if (heading.textContent !== title) heading.textContent = title;
    if (item) heading.title = `${project} / ${item}`;
    else heading.removeAttribute("title");
  }
  const projectCrumb = crumb.querySelector(".project-crumb");
  if (projectCrumb) {
    projectCrumb.textContent = project;
    projectCrumb.hidden = !item;
    crumb.querySelector(".project-crumb-separator").hidden = !item;
  }
  const second = crumb.querySelector(".phone-current-view");
  if (second) second.textContent = item ? `${view} · ${project}` : view;
}
