import DOMPurify from "/vendor/purify.js";
import { alignmentButtons, textAlignments } from "./text-alignment.js";
import { positionToolbarPopover } from "./selection-toolbar.js";
import { focusOnOpen } from "./open-focus.js";
import { installToolbarScroll, floatMenuPanel } from "./rich-toolbar-scroll.js";
import TurndownService from "/vendor/turndown.js";
import { gfm } from "/vendor/turndown-gfm.js";

// The source textarea remains authoritative for saving, drafts and Obsidian.
export function canvasRichText(
  form,
  markdown,
  {
    controls = form,
    plain = false,
    emptyParagraph = false,
    reposition = () => {},
    onAlignment = () => {},
    sourceName = "text",
    readSource = value => value,
    writeSource = value => value,
  } = {},
) {
  const lifecycle = new AbortController();
  const source = form.elements?.[sourceName] || form.querySelector(`[name="${sourceName}"]`);
  const formats = controls.querySelector(".rich-format-menu");
  const alignment = controls.querySelector(".rich-align-menu");
  const menus = [formats, alignment].filter(Boolean);
  const scrolling = installToolbarScroll(controls.querySelector(".rich-toolbar-shell"));
  const linkField = controls.querySelector(".rich-link-field");
  const linkButton = controls.querySelector("[data-rich-link]");
  function closeMenus(focus = false) {
    const openMenu = menus.find((menu) => menu.open);
    const open = !!openMenu || !linkField.classList.contains("hidden");
    const trigger = openMenu ? openMenu.querySelector("summary") : linkButton;
    menus.forEach((menu) => { menu.open = false; floatMenuPanel(menu); });
    linkField.classList.add("hidden");
    linkButton.setAttribute("aria-expanded", "false");
    if (focus && open) trigger.focus({ preventScroll: true });
    return open;
  }
  function positionMenus() {
    // Menus float in the top layer wherever the toolbar lives; the link field
    // stays anchored inside its canvas or dialog.
    for (const menu of menus) floatMenuPanel(menu, { width: 200, maxHeight: 320 });
    const canvas = controls.closest("#canvas, .dialog-body, .document-editor, .board-comments, .task-comments-panel");
    if (!canvas) return;
    if (!linkField.classList.contains("hidden"))
      positionToolbarPopover(linkField, controls, canvas);
  }
  function activeFormats() {
    const selection = window.getSelection();
    if (mode !== "rich" || !rich.contains(selection?.anchorNode)) return;
    const element = selectionElement();
    const custom = {
      highlight: () => !!element?.closest("mark"),
      inlineCode: () => !!element?.closest("code"),
      checklist: () => !!element?.closest("li")?.querySelector(':scope > input[type="checkbox"]'),
      codeBlock: () => !!element?.closest("pre"),
    };
    for (const button of controls.querySelectorAll(
      "[data-rich-command][aria-pressed]",
    )) {
      const name = button.dataset.richCommand;
      button.setAttribute(
        "aria-pressed",
        String(custom[name] ? custom[name]() : document.queryCommandState(name)),
      );
    }
  }
  function selectionElement() {
    const node = window.getSelection()?.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element && rich.contains(element) ? element : null;
  }
  const rich = form.querySelector(".inline-rich");
  const preview = form.querySelector(".inline-preview");
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    hr: "---",
    bulletListMarker: "-",
  });
  converter.use(gfm);
  converter.addRule("highlight", { filter: "mark", replacement: content => `==${content}==` });
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
    source.value = writeSource(plain ? rich.innerText : converter.turndown(rich), source.value);
    rich.dataset.empty = String(
      !rich.textContent.trim() && !rich.querySelector("img"),
    );
    lastHTML = rich.innerHTML;
    source.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function show(next) {
    flush();
    mode = next;
    if (next === "rich") {
      const value = readSource(source.value);
      if (plain) rich.textContent = value;
      else rich.innerHTML = value.trim() ? markdown(value) : "";
      if (emptyParagraph && !value.trim()) {
        const line = document.createElement("p");
        line.dataset.emptyLine = "";
        line.dataset.placeholder = rich.dataset.placeholder || "";
        line.append(document.createElement("br"));
        rich.replaceChildren(line);
      }
      rich.dataset.empty = String(
        !rich.textContent.trim() && !rich.querySelector("img"),
      );
      for (const el of rich.querySelectorAll("[data-md-source]"))
        el.contentEditable = "false";
      lastHTML = rich.innerHTML;
    }
    if (next === "preview") {
      const value = readSource(source.value);
      if (plain) preview.textContent = value;
      else preview.innerHTML = value.trim() ? markdown(value) : "";
    }
    source.classList.toggle("hidden", next !== "source");
    rich.classList.toggle("hidden", next !== "rich");
    preview.classList.toggle("hidden", next !== "preview");
    controls
      .querySelector(".rich-format-groups")
      .classList.toggle("hidden", next !== "rich" || plain);
    closeMenus();
    scrolling.update();
    const modeButton = controls.querySelector("[data-rich-mode]");
    modeButton.dataset.richMode = next === "source" ? "rich" : "source";
    const modeLabel = next === "source" ? "Rich text" : "Markdown";
    modeButton.setAttribute("aria-label", modeLabel);
    modeButton.title = modeLabel;
    modeButton.querySelector(".selection-action-label").textContent = modeLabel;
    modeButton.setAttribute("aria-pressed", String(next === "source"));
    const toggle = controls.querySelector(
      '[data-pro="inline-preview"],[data-rich-preview]',
    );
    if (toggle) {
      const label = next === "preview" ? "Back to edit" : "Preview";
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      toggle.querySelector(".selection-action-label").textContent = label;
      toggle.setAttribute("aria-pressed", String(next === "preview"));
    }
    form.dataset.editorMode = next;
    reposition();
    if (next !== "preview")
      focusOnOpen(next === "rich" ? rich : source, modeButton.closest("details")?.querySelector("summary") || modeButton);
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
  // Inline wraps toggle a mark or code element around the selection.
  function toggleInline(tag) {
    const wrapper = selectionElement()?.closest(tag);
    if (wrapper) {
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
      wrapper.remove();
      return;
    }
    const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null;
    if (!range) return;
    const holder = document.createElement("div");
    holder.append(range.cloneContents());
    const inner = range.collapsed ? "text" : holder.innerHTML;
    document.execCommand("insertHTML", false, `<${tag}>${inner}</${tag}>`);
  }
  function checklist() {
    let item = selectionElement()?.closest("li");
    if (!item) {
      document.execCommand("insertUnorderedList");
      item = selectionElement()?.closest("li");
    }
    if (!item) return;
    const box = item.querySelector(':scope > input[type="checkbox"]');
    if (box) {
      box.remove();
      return;
    }
    const input = document.createElement("input");
    input.type = "checkbox";
    input.contentEditable = "false";
    item.prepend(input);
  }
  function codeBlock() {
    const existing = selectionElement()?.closest("pre");
    if (existing) {
      const paragraph = document.createElement("p");
      paragraph.textContent = existing.textContent;
      existing.replaceWith(paragraph);
      return;
    }
    const selection = window.getSelection();
    const block = selectionElement()?.closest("p,h1,h2,h3,h4,h5,h6,blockquote,li,div");
    const text = selection?.isCollapsed ? block?.textContent || "" : selection.toString();
    const pre = document.createElement("pre"), code = document.createElement("code");
    code.textContent = text || "code";
    pre.append(code);
    if (block && block !== rich && (selection?.isCollapsed || selection.toString() === block.textContent)) block.replaceWith(pre);
    else document.execCommand("insertHTML", false, pre.outerHTML);
  }
  function command(name, value = null) {
    restore();
    if (name === "highlight") toggleInline("mark");
    else if (name === "inlineCode") toggleInline("code");
    else if (name === "checklist") checklist();
    else if (name === "codeBlock") codeBlock();
    else if (name === "divider") document.execCommand("insertHTML", false, "<hr><p><br></p>");
    else document.execCommand(name, false, value);
    if (name === "createLink")
      for (const link of rich.querySelectorAll("a[href]"))
        if (link.getAttribute("href") === value) link.dataset.mdHref = value;
    remember();
    flush();
    activeFormats();
    closeMenus();
  }
  rich.addEventListener("beforeinput", (event) => {
    // Use beforeinput so physical and virtual keyboards share the shortcut.
    // Pasting, composing, code, existing lists and plain labels remain literal.
    if (
      plain ||
      mode !== "rich" ||
      event.isComposing ||
      !event.cancelable ||
      event.inputType !== "insertText" ||
      event.data !== " "
    )
      return;
    const caret = window.getSelection();
    if (
      !caret?.isCollapsed ||
      !caret.rangeCount ||
      !rich.contains(caret.anchorNode)
    )
      return;
    const range = caret.getRangeAt(0),
      element =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement;
    if (element.closest("li,pre,code,[contenteditable=false]")) return;
    let block = element;
    while (
      block !== rich &&
      !block.matches("p,div,h1,h2,h3,h4,h5,h6,blockquote")
    )
      block = block.parentElement;
    const prefix = range.cloneRange();
    prefix.setStart(block, 0);
    // Only a marker at the beginning of this block, never a dash in prose.
    if (
      !/^(?:[-*+]|1[.)]|#{1,6}|>)$/.test(prefix.toString()) ||
      prefix.cloneContents().querySelector("br,img,[data-md-source]")
    )
      return;
    const marker = prefix.toString(), ordered = /^1[.)]$/.test(marker);
    event.preventDefault();
    caret.removeAllRanges();
    caret.addRange(prefix);
    // Native editing commands preserve the browser's text undo history.
    document.execCommand("delete");
    if (marker.startsWith('#')) document.execCommand("formatBlock", false, `h${marker.length}`);
    else if (marker === '>') document.execCommand("formatBlock", false, 'blockquote');
    else document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
    remember();
    flush();
    activeFormats();
  });
  let formattingInline = false;
  rich.addEventListener("input", event => {
    // Interpret completed Markdown only as it is typed; existing escaped text
    // and code blocks keep their literal meaning, including after undo.
    if (!plain && !formattingInline && !event.isComposing && event.inputType === 'insertText') {
      const caret = window.getSelection(), anchor = caret?.anchorNode;
      if (caret?.isCollapsed && anchor?.nodeType === Node.TEXT_NODE && rich.contains(anchor) && !anchor.parentElement.closest('code,pre,[contenteditable=false]')) {
        const prefix = anchor.data.slice(0, caret.anchorOffset);
        const patterns = [/(?<![\\*])\*\*\*[^*\n]+\*\*\*$/, /(?<![\\*])\*\*[^*\n]+\*\*$/, /(?<![\\*])\*[^*\n]+\*$/, /(?<![\\~])~~[^~\n]+~~$/, /(?<![\\=])==[^=\n]+==$/, /(?<![\\`])`[^`\n]+`$/];
        const match = patterns.map(pattern => pattern.exec(prefix)).find(Boolean);
        if (match) {
          const parsed = document.createElement('div'); parsed.innerHTML = markdown(match[0]);
          const range = document.createRange(); range.setStart(anchor, prefix.length - match[0].length); range.setEnd(anchor, caret.anchorOffset);
          caret.removeAllRanges(); caret.addRange(range);
          formattingInline = true;
          try { document.execCommand('insertHTML', false, parsed.firstElementChild?.tagName === 'P' ? parsed.firstElementChild.innerHTML : parsed.innerHTML); }
          finally { formattingInline = false; }
          remember(); activeFormats();
        }
      }
    }
    flush();
  });
  rich.addEventListener("keyup", remember);
  rich.addEventListener("mouseup", remember);
  rich.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    const html = event.clipboardData?.getData("text/html") || "";
    if (!text && !html) return;
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    if (plain || element?.closest('pre,code')) document.execCommand("insertText", false, text);
    else {
      const source = html ? converter.turndown(DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style'] })) : text;
      const parsed = document.createElement('div'); parsed.innerHTML = markdown(source);
      const inline = parsed.children.length === 1 && parsed.firstElementChild.tagName === 'P';
      // Empty editable roots can retain the browser's previous heading style.
      // Reset it before inserting document blocks so following paragraphs do not
      // become children of an inherited heading.
      if (!inline && !rich.textContent.trim()) document.execCommand("formatBlock", false, "p");
      document.execCommand("insertHTML", false, inline ? parsed.firstElementChild.innerHTML : parsed.innerHTML);
    }
    remember(); flush(); activeFormats();
  });
  // Do not insert unsanitized dragged HTML or navigate away from an editor.
  rich.addEventListener("drop", (e) => e.preventDefault());
  rich.addEventListener("click", (e) => {
    if (e.target.closest("a,button,[data-md-source]")) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  controls.addEventListener("mousedown", (e) => {
    if (
      e.target.closest("[data-rich-command],[data-rich-link],[data-text-align]")
    ) {
      remember();
      e.preventDefault();
    }
  });
  controls.addEventListener("click", (e) => {
    // A menu summary toggles natively; float its panel on the next frame so the
    // top-layer position is ready before the toggle event settles.
    if (e.target.closest("summary")) requestAnimationFrame(positionMenus);
    const el = e.target.closest(
      "[data-rich-mode],[data-rich-command],[data-rich-link],[data-rich-link-save],[data-text-align],[data-rich-preview]",
    );
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (textAlignments.includes(el.dataset.textAlign)) {
      if (mode === "rich") restore();
      else if (mode === "source") source.focus({ preventScroll: true });
      onAlignment(el.dataset.textAlign);
      for (const button of alignment.querySelectorAll("[data-text-align]"))
        button.setAttribute("aria-pressed", String(button === el));
      alignment.querySelector("summary .icon").innerHTML =
        el.querySelector(".icon").innerHTML;
      closeMenus();
      return;
    }
    if (el.hasAttribute("data-rich-preview")) togglePreview();
    if (el.dataset.richMode) show(el.dataset.richMode);
    if (el.dataset.richCommand)
      command(el.dataset.richCommand, el.dataset.value || null);
    if (el.hasAttribute("data-rich-link")) {
      const opening = linkField.classList.contains("hidden");
      closeMenus();
      if (!opening) return;
      linkField.classList.remove("hidden");
      linkButton.setAttribute("aria-expanded", "true");
      positionMenus();
      controls.querySelector("[name=rich-url]").focus({ preventScroll: true });
    }
    if (el.hasAttribute("data-rich-link-save")) {
      const input = controls.querySelector("[name=rich-url]"),
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
      controls.querySelector(".rich-link-field").classList.add("hidden");
    }
  });
  controls
    .querySelector("[name=rich-url]")
    .addEventListener("input", (e) => e.target.setCustomValidity(""));
  controls.querySelector("[name=rich-url]").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      controls.querySelector("[data-rich-link-save]").click();
    }
  });
  for (const menu of menus)
    menu.addEventListener("toggle", () => {
      if (menu.open) {
        menus
          .filter((other) => other !== menu)
          .forEach((other) => (other.open = false));
        linkField.classList.add("hidden");
        linkButton.setAttribute("aria-expanded", "false");
        positionMenus();
      }
    });
  document.addEventListener(
    "selectionchange",
    () => {
      remember();
      activeFormats();
    },
    { signal: lifecycle.signal },
  );
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!controls.contains(e.target)) closeMenus();
      else if (e.target.closest("summary")) remember();
    },
    { signal: lifecycle.signal, capture: true },
  );
  controls.addEventListener("keydown", (e) => {
    if (
      e.target.matches("input,select,textarea,[contenteditable]") ||
      e.ctrlKey ||
      e.metaKey
    )
      return;
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "ArrowDown" && e.target.matches("summary"))
      e.target.closest("details").open = true;
    const scope =
      menus.find((menu) => menu.open)?.querySelector(".selection-popover") ||
      controls;
    const buttons = [...scope.querySelectorAll("button,summary")].filter(
      (el) => !el.disabled && el.getClientRects().length,
    );
    const current = buttons.indexOf(document.activeElement);
    const index =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : (current +
              (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) +
              buttons.length) %
            buttons.length;
    buttons[index]?.focus({ preventScroll: true });
    buttons[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  controls.querySelector(".rich-modes").classList.toggle("hidden", plain);
  show("rich");
  function togglePreview() {
    if (mode === "preview") show(previous);
    else {
      previous = mode;
      show("preview");
    }
  }
  return {
    flush,
    positionMenus,
    escape: () => closeMenus(true),
    destroy: () => { scrolling.destroy(); closeMenus(); lifecycle.abort(); },
    preview: togglePreview,
    reload: () => show(mode),
  };
}

export function richToolbar(
  icon,
  {
    restored = false,
    alignment = "left",
    previewAction = 'data-pro="inline-preview"',
    idPrefix = "canvas",
    adapter = "rich",
    modes = true,
    extra = "",
  } = {},
) {
  // One control set for every surface. The rich editor runs execCommand names
  // (plus a few custom verbs); documents run their Markdown editor's names.
  const rich = adapter === "rich";
  const COMMANDS = {
    paragraph: ["formatBlock", "p", "paragraph"],
    h1: ["formatBlock", "h1", "h1"],
    h2: ["formatBlock", "h2", "h2"],
    h3: ["formatBlock", "h3", "h3"],
    quote: ["formatBlock", "blockquote", "quote"],
    bold: ["bold", "", "bold"],
    italic: ["italic", "", "italic"],
    strike: ["strikeThrough", "", "strike"],
    highlight: ["highlight", "", "highlight"],
    code: ["inlineCode", "", "code"],
    bullet: ["insertUnorderedList", "", "bullet"],
    number: ["insertOrderedList", "", "number"],
    check: ["checklist", "", "check"],
    codeblock: ["codeBlock", "", "codeblock"],
    divider: ["divider", "", "rule"],
  };
  const action = (label, glyph, attributes = "") =>
    `<button type="button" class="selection-action" aria-label="${label}" title="${label}" ${attributes}>${icon(glyph)}<span class="selection-action-label">${label}</span></button>`;
  const control = (key, label, glyph, pressed = true) => {
    const [command, value, documentCommand] = COMMANDS[key];
    return action(
      label,
      glyph,
      rich
        ? `data-rich-command="${command}" ${value ? `data-value="${value}"` : pressed ? 'aria-pressed="false"' : ""}`
        : `data-document-format="${documentCommand}"`,
    );
  };
  const group = (label, content, className = "") =>
    `<div class="selection-group ${className}" role="group" aria-label="${label}">${content}</div>`;
  const menu = (className, label, glyph, items) =>
    `<details class="selection-menu ${className}"><summary aria-label="${label}" title="${label}">${glyph}${icon("chevron")}</summary><div class="selection-popover" role="group" aria-label="${label}">${items}</div></details>`;
  const link = rich
    ? action("Link", "link", 'data-rich-link aria-expanded="false"')
    : action("Link", "link", 'data-document-format="link"');
  return `<div class="rich-toolbar-shell">
    <button type="button" class="rich-scroll" data-rich-scroll="start" aria-label="Scroll formatting tools back" title="More tools" hidden>${icon("chevron-left")}</button>
    <div class="rich-toolbar" role="group" aria-label="Format text">
      <div class="rich-format-groups">
        ${group("Text style", menu("rich-format-menu", "Text style", icon("text"), `${control("paragraph", "Paragraph", "paragraph", false)}${control("h1", "Heading 1", "heading", false)}${control("h2", "Heading 2", "heading", false)}${control("h3", "Heading 3", "heading", false)}${control("quote", "Quote", "quote", false)}`))}
        ${group("Text emphasis", `${control("bold", "Bold", "bold")}${control("italic", "Italic", "italic")}${control("strike", "Strikethrough", "strike")}${control("highlight", "Highlight", "highlighter")}${control("code", "Inline code", "code")}`)}
        ${group("Lists", `${control("bullet", "Bullet list", "list")}${control("number", "Numbered list", "numbered")}${control("check", "Checklist", "checklist")}`)}
        ${group("Insert", `${link}${control("codeblock", "Code block", "codeblock")}${control("divider", "Divider", "divider", false)}`)}
      </div>
      ${rich && alignment !== null ? group("Text alignment", menu("rich-align-menu", "Text alignment", icon(`text-${alignment || "left"}`), alignmentButtons(icon, alignment))) : ""}
      ${rich && modes ? `${group("Text editing mode", action("Markdown", "markdown", 'data-rich-mode="source" aria-pressed="false"'), "rich-modes")}${group("Text preview", action("Preview", "preview", `${previewAction} aria-pressed="false"`))}` : ""}
      ${extra}
    </div>
    <button type="button" class="rich-scroll" data-rich-scroll="end" aria-label="Scroll formatting tools forward" title="More tools" hidden>${icon("chevron-right")}</button>
  </div>
  ${rich ? `<div class="selection-popover rich-link-field hidden" role="group" aria-label="Insert link"><label for="${idPrefix}-rich-url">Link address</label><div class="rich-link-input"><input id="${idPrefix}-rich-url" name="rich-url" aria-label="Link URL" placeholder="https://…"><button type="button" class="selection-action rich-save" data-rich-link-save aria-label="Apply link" title="Apply link">${icon("check")}</button></div></div>` : ""}
  ${restored ? '<span class="rich-draft" role="status">Draft restored</span>' : ""}<p class="inline-error" role="alert"></p>`;
}
