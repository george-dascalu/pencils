import { taskAttachmentContent } from "./task-attachment-model.js";
import { attachmentPreview } from "./attachment-preview.js";

// Bind uploads to this editor, even if another task opens before a request ends.
export function taskAttachments(
  { api, route, state, esc, icon },
  form,
  editor,
  { section = form.querySelector('.task-description'), sourceName = 'body', dropTarget = form.closest('dialog'),
    heading = 'Attachments', addLabel = 'Add attachments', addButton = true, previewId = 'attachment-preview', onPending = () => {} } = {},
) {
  const dialog = form.closest("dialog"),
    project = state.project.id,
    endpoint = route("attachments"),
    status = document.createElement("p"),
    choose = document.createElement("button"),
    input = document.createElement("input"),
    overlay = document.createElement("div"),
    list = document.createElement("section"),
    preview = attachmentPreview({ esc, icon }, dialog, previewId),
    source = form.querySelector(`[name="${sourceName}"]`);
  list.className = "task-attachments";
  list.setAttribute("aria-label", heading);
  // The + beside the title adds files, as Relationships' controls and the sidebar's lists do.
  list.innerHTML = `<div class="task-attachments-heading"><h3>${esc(heading)}</h3></div><ul class="task-attachment-list"></ul>`;
  section.append(list);
  status.className = "field-hint task-attachment-status";
  status.setAttribute("role", "status");
  choose.type = "button";
  choose.className = "task-attachment-choose icon-button";
  choose.setAttribute("aria-label", addLabel);
  choose.title = addLabel;
  choose.innerHTML = icon("plus");
  // Without its own + (a note's bar has Attach files), the list shows only when it holds files.
  if (addButton) list.querySelector(".task-attachments-heading").append(choose);
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  input.accept = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.zip";
  input.setAttribute("aria-label", "Choose attachments");
  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    enqueue([...input.files]);
    input.value = "";
  });
  section.append(input, status);
  overlay.className = "task-file-drop-overlay";
  overlay.textContent = "Drop files to attach";
  overlay.hidden = true;
  dropTarget.append(overlay);
  let disposed = false,
    depth = 0,
    pending = 0,
    queue = Promise.resolve();
  const errors = [];
  const active = () =>
    !disposed && form.isConnected && state.project?.id === project;
  let files = [],
    rendered = "";
  function refresh() {
    if (!active()) return;
    files = taskAttachmentContent(source.value, project).files;
    const html = files
      .map(
        (file) =>
          `<li><button type="button" class="task-attachment-open" data-attachment-file="${esc(file.file)}" aria-label="Preview ${esc(file.name)}" aria-haspopup="dialog" aria-expanded="false">${icon(/^(png|jpe?g|gif|webp)$/.test(file.extension) ? "image" : "file")}<span class="task-attachment-name">${esc(file.name)}</span><span class="task-attachment-type">${esc(file.extension.toUpperCase())}</span>${icon("external")}</button></li>`,
      )
      .join("");
    if (html !== rendered) {
      preview.close();
      list.querySelector("ul").innerHTML = html;
      rendered = html;
    }
    list.querySelector("ul").hidden = !files.length;
    if (!addButton) list.hidden = !files.length;
  }
  function bodyChanged(event) {
    if (event.target === source) refresh();
  }
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-attachment-file]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const file = files.find(
      (file) => file.file === button.dataset.attachmentFile,
    );
    if (file) preview.open(file, button);
  });
  form.addEventListener("input", bodyChanged);
  form.addEventListener("task-description-reloaded", refresh);
  refresh();
  const hasFiles = (event) =>
    [...(event.dataTransfer?.types || [])].includes("Files");
  const highlight = (show) => {
    overlay.hidden = !show;
  };
  function report() {
    if (!active()) return;
    onPending(pending);
    status.classList.toggle("form-error", !!errors.length);
    status.textContent =
      [
        pending ? `Attaching ${pending} file${pending === 1 ? "" : "s"}…` : "",
        ...errors,
      ]
        .filter(Boolean)
        .join(" ") || "Files attached.";
  }
  async function upload(file) {
    if (!active()) return;
    try {
      if (!/\.(png|jpe?g|gif|webp|pdf|txt|md|csv|zip)$/i.test(file.name))
        throw new Error("Use an image, PDF, text, Markdown, CSV or ZIP file.");
      if (file.size > 10000000) throw new Error("Use a file under 10 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = "";
      for (let i = 0; i < bytes.length; i += 8192)
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
      if (!active()) return;
      const attachment = await api(endpoint, {
        method: "POST",
        body: { name: file.name, data: btoa(raw) },
      });
      if (!active()) return;
      // Flush typing that happened during the upload before appending its link.
      editor.flush();
      const body = source;
      const name = file.name
        .replace(/[\r\n]/g, " ")
        .replace(/[\\[\]]/g, "\\$&");
      const image = /\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "!" : "";
      body.value += `\n\n${image}[${name}](../${attachment.path})\n`;
      editor.reload();
      body.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    } finally {
      pending--;
      report();
    }
  }
  function enter(event) {
    if (!hasFiles(event) || !ownsDrop(event)) return;
    event.preventDefault();
    depth++;
    highlight(true);
  }
  function over(event) {
    if (!hasFiles(event) || !ownsDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    highlight(true);
  }
  function leave(event) {
    if (!hasFiles(event) || !ownsDrop(event)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) highlight(false);
  }
  function drop(event) {
    if (!hasFiles(event) || !ownsDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    depth = 0;
    highlight(false);
    enqueue([...event.dataTransfer.files]);
  }
  function enqueue(files) {
    if (!files.length) return;
    if (!pending) errors.length = 0;
    pending += files.length;
    report();
    for (const file of files) queue = queue.then(() => upload(file));
  }
  function submit(event) {
    if (!pending) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status.textContent =
      "Wait for the files to finish attaching before continuing.";
    status.scrollIntoView({ block: "nearest" });
  }
  function finalise(event) {
    if (event.target.closest('[data-feature="draft-finalise"]')) submit(event);
  }
  function ownsDrop(event) {
    const scope = event.target.closest('[data-attachment-scope]');
    return !scope || scope === section;
  }
  dropTarget.addEventListener("dragenter", enter, true);
  dropTarget.addEventListener("dragover", over, true);
  dropTarget.addEventListener("dragleave", leave, true);
  dropTarget.addEventListener("drop", drop, true);
  form.addEventListener("submit", submit, true);
  form.addEventListener("click", finalise, true);
  return {
    pick: () => input.click(),
    get pending() { return pending; },
    settled: () => queue,
    destroy() {
      disposed = true;
      preview.destroy();
      form.removeEventListener("input", bodyChanged);
      form.removeEventListener("task-description-reloaded", refresh);
      dropTarget.removeEventListener("dragenter", enter, true);
      dropTarget.removeEventListener("dragover", over, true);
      dropTarget.removeEventListener("dragleave", leave, true);
      dropTarget.removeEventListener("drop", drop, true);
      form.removeEventListener("submit", submit, true);
      form.removeEventListener("click", finalise, true);
      overlay.remove();
      list.remove();
      status.remove();
      choose.remove();
      input.remove();
    },
  };
}
