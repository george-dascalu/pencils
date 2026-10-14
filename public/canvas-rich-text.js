import TurndownService from "/vendor/turndown.js";
import { gfm } from "/vendor/turndown-gfm.js";

// The source textarea remains authoritative for saving, drafts and Obsidian.
export function canvasRichText(form, markdown) {
  const source = form.elements.text;
  const rich = form.querySelector(".inline-rich");
  const preview = form.querySelector(".inline-preview");
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  converter.use(gfm);
  converter.addRule("vaultReference", {
    filter: (node) => node.hasAttribute("data-md-source"),
    replacement: (_, node) => node.getAttribute("data-md-source"),
  });
  converter.addRule("originalLink", {
    filter: (node) =>
      node.nodeName === "A" && node.hasAttribute("data-md-href"),
    replacement: (content, node) =>
      `[${content}](${node.getAttribute("data-md-href")}${node.title ? ` "${node.title.replaceAll('"', '\\"')}"` : ""})`,
  });
  converter.addRule("vaultImage", {
    filter: (node) =>
      node.nodeName === "IMG" && node.hasAttribute("data-md-src"),
    replacement: (_, node) =>
      `![${node.alt || ""}](${node.getAttribute("data-md-src")})`,
  });
  let mode = "source",
    lastHTML = "",
    selection = null,
    previous = "source";
  function flush() {
    if (mode !== "rich" || rich.innerHTML === lastHTML) return;
    source.value = converter.turndown(rich);
    lastHTML = rich.innerHTML;
    source.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function show(next) {
    flush();
    mode = next;
    if (next === "rich") {
      rich.innerHTML = source.value ? markdown(source.value) : "<p><br></p>";
      for (const el of rich.querySelectorAll("[data-md-source]"))
        el.contentEditable = "false";
      lastHTML = rich.innerHTML;
    }
    if (next === "preview") preview.innerHTML = markdown(source.value);
    source.classList.toggle("hidden", next !== "source");
    rich.classList.toggle("hidden", next !== "rich");
    preview.classList.toggle("hidden", next !== "preview");
    form
      .querySelector(".rich-toolbar")
      .classList.toggle("hidden", next !== "rich");
    for (const button of form.querySelectorAll("[data-rich-mode]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.richMode === next),
      );
    const toggle = form.querySelector('[data-pro="inline-preview"]');
    toggle.textContent = next === "preview" ? "Back to edit" : "Preview";
    toggle.setAttribute("aria-pressed", String(next === "preview"));
    form.dataset.editorMode = next;
    if (next !== "preview")
      (next === "rich" ? rich : source).focus({ preventScroll: true });
  }
  const remember = () => {
    const s = window.getSelection();
    if (
      s?.rangeCount &&
      rich.contains(s.anchorNode) &&
      rich.contains(s.focusNode)
    )
      selection = s.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    rich.focus({ preventScroll: true });
    if (selection && rich.contains(selection.commonAncestorContainer)) {
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(selection);
    }
  };
  function command(name, value = null) {
    restore();
    document.execCommand(name, false, value);
    if (name === "createLink")
      for (const link of rich.querySelectorAll("a[href]"))
        if (link.getAttribute("href") === value) link.dataset.mdHref = value;
    remember();
    flush();
  }
  rich.addEventListener("input", flush);
  rich.addEventListener("keyup", remember);
  rich.addEventListener("mouseup", remember);
  rich.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand(
      "insertText",
      false,
      e.clipboardData.getData("text/plain"),
    );
    flush();
  });
  // Do not insert unsanitized dragged HTML or navigate away from an editor.
  rich.addEventListener("drop", (e) => e.preventDefault());
  rich.addEventListener("click", (e) => {
    if (e.target.closest("a,button,[data-md-source]")) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  form.addEventListener("mousedown", (e) => {
    if (e.target.closest("[data-rich-command],[data-rich-link]")) {
      remember();
      e.preventDefault();
    }
  });
  form.addEventListener("click", (e) => {
    const el = e.target.closest(
      "[data-rich-mode],[data-rich-command],[data-rich-link],[data-rich-link-save]",
    );
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (el.dataset.richMode) show(el.dataset.richMode);
    if (el.dataset.richCommand)
      command(el.dataset.richCommand, el.dataset.value || null);
    if (el.hasAttribute("data-rich-link")) {
      form.querySelector(".rich-link-field").classList.remove("hidden");
      form.querySelector("[name=rich-url]").focus();
    }
    if (el.hasAttribute("data-rich-link-save")) {
      const input = form.querySelector("[name=rich-url]"),
        url = input.value.trim();
      if (!/^(https?:\/\/|mailto:|#)/i.test(url)) {
        input.setCustomValidity(
          "Use https://, http://, mailto: or a #heading link.",
        );
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      command("createLink", url);
      form.querySelector(".rich-link-field").classList.add("hidden");
    }
  });
  form
    .querySelector("[name=rich-url]")
    .addEventListener("input", (e) => e.target.setCustomValidity(""));
  form.querySelector("[name=rich-url]").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      form.querySelector("[data-rich-link-save]").click();
    }
  });
  show("source");
  return {
    flush,
    preview() {
      if (mode === "preview") show(previous);
      else {
        previous = mode;
        show("preview");
      }
    },
  };
}

export const richToolbar = `<div class="rich-modes" role="group" aria-label="Text editing mode"><button type="button" class="button small" data-rich-mode="rich" aria-pressed="false">Rich text</button><button type="button" class="button small" data-rich-mode="source" aria-pressed="true">Markdown</button></div><div class="rich-toolbar hidden" role="toolbar" aria-label="Format text">${[
  ["bold", "Bold", "B"],
  ["italic", "Italic", "I"],
  ["strikeThrough", "Strikethrough", "S̶"],
  ["formatBlock", "Heading", "H2", "h2"],
  ["formatBlock", "Paragraph", "¶", "p"],
  ["insertUnorderedList", "Bullet list", "• List"],
  ["insertOrderedList", "Numbered list", "1. List"],
  ["formatBlock", "Quote", "❝", "blockquote"],
]
  .map(
    ([command, title, label, value]) =>
      `<button type="button" class="button small" data-rich-command="${command}" ${value ? `data-value="${value}"` : ""} aria-label="${title}" title="${title}">${label}</button>`,
  )
  .join(
    "",
  )}<button type="button" class="button small" data-rich-link>Link</button></div><div class="rich-link-field hidden"><input name="rich-url" aria-label="Link URL" placeholder="https://…"><button type="button" class="button small" data-rich-link-save>Apply link</button></div>`;
