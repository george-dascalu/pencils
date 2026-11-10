import { canvasRichText, richToolbar } from "./canvas-rich-text.js";
import { installDescriptionResize } from "./task-description-resize.js";
import { taskAttachmentContent, retainTaskAttachments } from "./task-attachment-model.js";

export function taskDescriptionHTML(body, { esc, icon }) {
  return `<section class="task-description" aria-label="Description"><div class="task-rich-tools" role="toolbar" aria-label="Format description">${richToolbar(icon, { alignment: null, preview: false, responsive: true, extra: `<div class="selection-group task-description-expand" role="group" aria-label="Description size"><button type="button" class="selection-action" data-description-expand aria-pressed="false" aria-label="Expand description" title="Expand description">${icon("fullscreen")}<span class="selection-action-label">Expand description</span></button></div>` })}</div><div class="inline-rich canvas-markdown" role="textbox" aria-label="Card description" aria-multiline="true" contenteditable="true" data-placeholder="Add a description…" spellcheck="true"></div><textarea class="markdown-source hidden" name="body" aria-label="Card description in Markdown">${esc(body)}</textarea><div class="inline-preview canvas-markdown hidden"></div></section>`;
}
export function taskDescription(form, markdown, icon, project) {
  const controls = form.querySelector(".task-rich-tools");
  const editor = canvasRichText(form, markdown, {
    controls,
    sourceName: "body",
    readSource: value => taskAttachmentContent(value, project).description,
    writeSource: (value, original) => retainTaskAttachments(value, original, project),
  });
  installDescriptionResize(form.querySelector(".task-description"));
  form.addEventListener("submit", () => editor.flush(), true);
  form.addEventListener(
    "invalid",
    (event) => {
      const section = event.target.closest("details");
      if (section) section.open = true;
    },
    true,
  );
  const dialog = form.closest("dialog");
  const section = form.querySelector(".task-description");
  const expand = section.querySelector("[data-description-expand]");
  // Expanding only toggles layout classes, so the editor, caret and unsaved text stay as they are.
  const setExpanded = (on) => {
    const name = on ? "Restore description" : "Expand description";
    section.toggleAttribute("data-expanded", on);
    dialog.toggleAttribute("data-description-expanded", on);
    expand.setAttribute("aria-pressed", on);
    expand.title = name; // the accessible name stays "Expand description"; aria-pressed carries the state
    expand.replaceChild(Object.assign(document.createElement("span"), { innerHTML: icon(on ? "shrink" : "fullscreen") }).firstChild, expand.querySelector(".icon"));
  };
  expand.addEventListener("click", () => setExpanded(!section.hasAttribute("data-expanded")));
  const escape = (event) => {
    if (event.key !== "Escape") return;
    const popup = editor.escape();
    if (popup || section.hasAttribute("data-expanded")) {
      if (!popup) setExpanded(false);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  dialog.addEventListener("keydown", escape, true);
  return {
    ...editor,
    destroy() {
      dialog.removeEventListener("keydown", escape, true);
      editor.destroy();
    },
    reload() {
      editor.reload();
      form.dispatchEvent(new Event("task-description-reloaded"));
    },
  };
}
