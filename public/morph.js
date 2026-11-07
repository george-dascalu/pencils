// Redraws patch the page to match the new HTML instead of replacing it (F0.22-41): unchanged rows
// keep their nodes, so the browser restyles only what changed, and focus and scroll stay put.
import { Idiomorph } from "/vendor/idiomorph.js";

// What scripts add after drawing stays: the scroll arrows of control rows (toolbar-scroll.js), the
// attributes that tie them to their row, and Kanban's column width (kanban-layout.js), whose
// removal would restyle every card.
const ownAttribute = (name, node) => name === "data-scroll-controls" || (name === "id" && node.id.startsWith("toolbar-scroll-")) || (name === "style" && node.classList.contains("kanban"));
// A card ID or name fitted to its room (card-key.js, assignee-name.js) keeps its fitted text while
// what it was drawn from is the same; patching it back would show it in full for a frame.
const fitAttributes = (el) => [...el.attributes].filter(({ name }) => name !== "data-key-full" && name !== "data-key-title" && !(name === "title" && "keyTitle" in el.dataset)).map(({ name, value }) => `${name}=${value}`).sort().join("\n");
function keepsFit(from, to) {
  if (from.nodeType !== 1 || to.nodeType !== 1) return false;
  const key = "keyFull" in from.dataset;
  if (!key && !from.matches(".task-assignee[data-full-name]")) return false;
  return (!key || to.textContent === from.dataset.keyFull) && fitAttributes(from) === fitAttributes(to);
}

// Sets element's content to html. `keep` names descendants left as they are, for code that fills
// them after (the view inside the page).
export function morphHTML(element, html, keep = []) {
  Idiomorph.morph(element, html, {
    // Not ignoreActiveValue: it leaves the focused element's children as they were, so a focused
    // button would keep showing the old value. Redraws already wait while text is being typed.
    morphStyle: "innerHTML",
    callbacks: {
      beforeNodeMorphed: (from, to) => !(from.nodeType === 1 && keep.some((selector) => from.matches(selector))) && !keepsFit(from, to),
      beforeNodeRemoved: (node) => !node.classList?.contains("toolbar-scroll-indicators"),
      beforeAttributeUpdated: (name, node, change) => !(change === "remove" && ownAttribute(name, node)),
    },
  });
}

// Sets element's content, patching it when it last showed the same page (a project's view) and
// replacing it otherwise.
export function setHTML(element, html, page, keep) {
  if (page && element.dataset.page === page) morphHTML(element, html, keep);
  else element.innerHTML = html;
  if (page) element.dataset.page = page;
  else delete element.dataset.page;
}
