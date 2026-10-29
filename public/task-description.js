import { canvasRichText, richToolbar } from "./canvas-rich-text.js";
import { taskAttachmentContent, retainTaskAttachments } from "./task-attachment-model.js";

export function taskDescriptionHTML(body, { esc, icon }) {
  return `<section class="task-description" aria-label="Description"><div class="task-rich-tools" role="toolbar" aria-label="Format description">${richToolbar(icon, { alignment: null, previewAction: "data-rich-preview", responsive: true })}</div><div class="inline-rich canvas-markdown" role="textbox" aria-label="Task description" aria-multiline="true" contenteditable="true" data-placeholder="Add a description…" spellcheck="true"></div><textarea class="markdown-source hidden" name="body" aria-label="Task description in Markdown">${esc(body)}</textarea><div id="markdown-preview" class="inline-preview canvas-markdown hidden"></div></section>`;
}
export function taskDescription(form, markdown, icon, project) {
  const controls = form.querySelector(".task-rich-tools");
  const editor = canvasRichText(form, markdown, {
    controls,
    sourceName: "body",
    readSource: value => taskAttachmentContent(value, project).description,
    writeSource: (value, original) => retainTaskAttachments(value, original, project),
  });
  form.addEventListener("submit", () => editor.flush(), true);
  form.addEventListener(
    "invalid",
    (event) => {
      const section = event.target.closest("details");
      if (section) section.open = true;
    },
    true,
  );
  const escape = (event) => {
    if (event.key === "Escape" && editor.escape()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const dialog = form.closest("dialog");
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
