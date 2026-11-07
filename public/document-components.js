import TurndownService from "/vendor/turndown.js";
import { gfm } from "/vendor/turndown-gfm.js";
import { codeLanguages, codeLanguageName, codeLanguageEntry, highlightCode } from "./document-code.js";
import { esc } from "./escape.js";
import { editableDocumentTable } from "./document-inline-table.js";
import { focusOnOpen } from "./open-focus.js";
import { installTextColorRule, textColor } from './document-text-color.js';
import { isolateHistory, StateEffect } from '/vendor/editor/deps.js';
import { documentTextChange, documentCodeFence } from './document-performance.js';
export const documentComponentChange = StateEffect.define();

const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
converter.use(gfm);
installTextColorRule(converter);
converter.addRule("documentSource", {
  filter: node => node.hasAttribute?.("data-document-source"),
  replacement: (_content, node) => node.dataset.documentSource,
});
converter.addRule("documentHighlight", { filter: "mark", replacement: content => `==${content}==` });
// Turndown tries the last added rule first, so a wiki link (which also has an href) keeps its source.
converter.addRule("documentLink", {
  filter: node => node.tagName === "A" && node.hasAttribute("data-document-href") && !node.hasAttribute("data-document-source"),
  replacement: (content, node) => `[${content}](${node.dataset.documentHref})`,
});
converter.addRule("documentImage", {
  filter: node => node.tagName === "IMG" && node.hasAttribute("data-document-src"),
  replacement: (_content, node) => `![${node.alt || ""}](${node.dataset.documentSrc})`,
});
converter.addRule("documentCallout", {
  filter: node => node.hasAttribute?.("data-document-callout"),
  replacement: (_content, node) => {
    const copy = node.cloneNode(true), heading = copy.querySelector(":scope > strong, :scope > summary");
    const title = heading ? converter.turndown(heading) : "";
    heading?.remove();
    copy.removeAttribute("data-document-callout");
    const body = converter.turndown(copy).trim();
    return "\n\n" + [`> ${node.dataset.documentCallout} ${title}`, ...body.split("\n").map(line => `> ${line}`)].join("\n") + "\n\n";
  },
});
const trim = raw => raw.replace(/\n+$/, "");
// A pipe that ends a table cell: one after an even run of backslashes (`\\|` is a backslash, then
// the next cell; `\|` is a pipe inside the cell).
const CELL_PIPE = /(?<=(?<!\\)(?:\\\\)*)\|/;
const toMarkdown = element => converter.turndown(element).trim();
// A cell's contents, not the cell, whose GFM rule turns line breaks into spaces. Typed line breaks
// are newlines in the cell's text (it keeps white space); written as <br> text they survive the
// trim at a cell's start or end.
const cellMarkdown = cell => {
  const contents = document.createElement("div");
  contents.append(...[...cell.childNodes].map(node => node.cloneNode(true)));
  const walker = document.createTreeWalker(contents, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement.closest("pre") && (node.data.trim() || !contents.querySelector("pre,blockquote,ul,ol,p,div"))) node.data = node.data.replaceAll("\n", "<br>");
  }
  return toMarkdown(contents);
};
const callout = raw => /^>\s*\[!([\w-]+)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n|$)/.exec(raw);

// A rendered block owns editable DOM, while every edit remains a CodeMirror
// transaction. Only this block changes; the rest of the Markdown is untouched.
export function editableDocumentComponent({ element, raw, from, kind, editor, renderer, onError, onFocus, onLink, onSearch, onEscape, history, hydrate, icon, panel, toast, tableLayouts, tablePage }) {
  let source = trim(raw), position = from, writing = false, composing = false;
  let savedRange = null, focusedField = null;
  const token = renderer.tokens(source)[0];
  element.dataset.componentType = kind;
  element.dataset.componentFrom = String(from);
  element.classList.add("document-editable-component");
  const fields = [];
  let serialize, tableController;
  function field(node, label, { multiline = true, plain = false } = {}) {
    node.contentEditable = plain ? "plaintext-only" : "true";
    node.setAttribute("role", "textbox");
    node.setAttribute("aria-label", label);
    node.setAttribute("aria-multiline", String(multiline));
    node.setAttribute("tabindex", "0");
    node.dataset.componentField = String(fields.length);
    fields.push(node);
    for (const protectedNode of node.querySelectorAll("[data-document-source],.document-transclusion")) {
      protectedNode.contentEditable = "false";
    }
    for (const checkbox of node.querySelectorAll('input[type="checkbox"]')) checkbox.disabled = false;
    node.addEventListener("change", event => {
      const checkbox = event.target;
      if (checkbox.matches('input[type="checkbox"]')) {
        checkbox.toggleAttribute("checked", checkbox.checked);
        commit(node);
      }
    });
    const rememberSelection = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && node.contains(selection.anchorNode) && node.contains(selection.focusNode))
        savedRange = selection.getRangeAt(0).cloneRange();
    };
    node.addEventListener("focus", () => { focusedField = node; onFocus(api, node); });
    for (const event of ["keyup", "mouseup", "input", "blur"])
      node.addEventListener(event, rememberSelection);
    node.addEventListener("input", () => { if (!composing) commit(node); });
    node.addEventListener("compositionstart", () => { composing = true; });
    node.addEventListener("compositionend", () => { composing = false; commit(node); });
    node.addEventListener("paste", event => {
      // Paste text, never executable HTML or controls from another page.
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      commit(node);
    });
    node.addEventListener("keydown", event => {
      // Keys that confirm IME text (Safari reports them after compositionend, as key code 229).
      if (event.isComposing || event.keyCode === 229) return;
      // Ctrl/Cmd+Home/End and Cmd+Up/Down move within this block. Left to the
      // browser they jump to the editor's ends, which CodeMirror cannot place
      // inside a block and resolves to the start of the document.
      const toStart = (event.ctrlKey || event.metaKey) && event.key === "Home" || event.metaKey && event.key === "ArrowUp";
      const toEnd = (event.ctrlKey || event.metaKey) && event.key === "End" || event.metaKey && event.key === "ArrowDown";
      if (toStart || toEnd) {
        event.preventDefault(); event.stopPropagation();
        const edge = document.createRange();
        edge.selectNodeContents(node); edge.collapse(toStart);
        const selection = window.getSelection();
        if (event.shiftKey && selection.rangeCount && node.contains(selection.anchorNode)) selection.extend(edge.startContainer, edge.startOffset);
        else { selection.removeAllRanges(); selection.addRange(edge); }
        return;
      }
      if (event.key === "Tab" && (event.ctrlKey || event.metaKey || event.altKey)) return;
      if ((event.ctrlKey || event.metaKey) && ["s", "e"].includes(event.key.toLowerCase())) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const index = fields.indexOf(node);
        history(event.shiftKey);
        queueMicrotask(() => editor.dom.querySelector(`[data-component-from="${position}"] [data-component-field="${index}"]`)?.focus());
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault(); onSearch();
      } else if ((event.ctrlKey || event.metaKey) && ["b", "i", "k"].includes(event.key.toLowerCase()) && !plain) {
        event.preventDefault(); api.format({ b: "bold", i: "italic", k: "link" }[event.key.toLowerCase()]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (onEscape?.()) return;
        editor.dispatch({ selection: { anchor: Math.min(position + source.length + 1, editor.state.doc.length) } });
        editor.focus();
      } else if (event.key === "Enter" && (!multiline || plain || node.matches("td,th") && !event.documentTableRichEnter)) {
        event.preventDefault();
        if (multiline) { document.execCommand("insertText", false, "\n"); commit(node); }
      } else if (event.key === "Tab" && kind === "table") {
        const cells = [...element.querySelectorAll("th, td")]; // in table order, after rows or columns move
        const next = cells[cells.indexOf(node) + (event.shiftKey ? -1 : 1)];
        if (next) { event.preventDefault(); next.focus(); }
      }
      event.stopPropagation();
    });
    return node;
  }
  function commit(changedField, isolate = false) {
    if (!serialize || composing) return;
    try {
      for (const field of fields)
        for (const checkbox of field.querySelectorAll('input[type="checkbox"]')) checkbox.disabled = false;
      const next = trim(serialize(changedField));
      if (next === source) return;
      if (editor.state.doc.sliceString(position, position + source.length) !== source)
        throw new Error("This component changed. Reopen the document before editing it.");
      const change=documentTextChange(source,next);
      writing = true;
      editor.dispatch({ changes: { from: position+change.from, to: position+change.to, insert: change.insert }, effects:documentComponentChange.of({from:position,to:position+source.length,kind}), userEvent: "input", ...(isolate ? { annotations: isolateHistory.of('full') } : {}) });
      if (editor.state.doc.sliceString(position, position + next.length) === next) source = next;
      editor.requestMeasure();
    } catch (error) { onError(error.message); }
    finally { writing = false; }
  }
  const api = {
    element,
    destroy: () => tableController?.destroy(),
    tablePage: () => tableController?.page?.(),
    revealMatch(start,end){if(tableController&&start>=position&&end<=position+source.length)tableController.revealSource(start-position,source);},
    end: () => position + source.length,
    update(nextFrom, nextRaw) {
      const next = trim(nextRaw);
      if (!writing && source !== next) return false;
      position = nextFrom; source = next;
      element.dataset.componentFrom = String(position);
      return true;
    },
    selectionInfo() {
      const selection = window.getSelection();
      const node = focusedField;
      if (!node || !node.isConnected) return null;
      if (selection?.rangeCount && node.contains(selection.anchorNode) && node.contains(selection.focusNode)) savedRange = selection.getRangeAt(0).cloneRange();
      if (!savedRange || savedRange.collapsed || !node.contains(savedRange.commonAncestorContainer)) return null;
      const formats = {};
      let color = null;
      for (let el = savedRange.startContainer.nodeType === Node.ELEMENT_NODE ? savedRange.startContainer : savedRange.startContainer.parentElement; el && node.contains(el); el = el.parentElement) {
        if (!el.contains(savedRange.endContainer)) continue;
        if (el.matches('b,strong')) formats.bold = true;
        if (el.matches('i,em')) formats.italic = true;
        if (el.matches('s,del,strike')) formats.strike = true;
        if (el.matches('mark')) formats.highlight = true;
        if (el.matches('code')) formats.code = true;
        color ||= textColor(el.style.color || el.getAttribute('color'));
      }
      return { range: savedRange.cloneRange(), rect: savedRange.getBoundingClientRect(), formats, color, plain: node.contentEditable === 'plaintext-only' };
    },
    format(command, value, { focus = true } = {}) {
      const node = fields.find(node => node.contains(document.activeElement) || node === document.activeElement)
        || focusedField;
      if (tableController?.format(command, value, { focus })) return true;
      if (!node) return false;
      if (focus) node.focus();
      if (savedRange && node.contains(savedRange.commonAncestorContainer)) {
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange);
      }
      if (node.contentEditable === "plaintext-only") return true;
      const commands = { bold: "bold", italic: "italic", strike: "strikeThrough",
        bullet: "insertUnorderedList", number: "insertOrderedList" };
      if (command === 'color' && textColor(value)) {
        document.execCommand('foreColor', false, textColor(value));
        for (const font of node.querySelectorAll('font[color]')) {
          const color = textColor(font.getAttribute('color'));
          if (color) { font.style.color = color; font.removeAttribute('color'); }
        }
      }
      else if (commands[command]) document.execCommand(commands[command]);
      else if (command === 'highlight' && savedRange && !savedRange.collapsed) {
        // Preserve existing bold/colour DOM and the selection when adding or removing a highlight.
        const range = savedRange.cloneRange(), selection = window.getSelection();
        const ancestor = range.commonAncestorContainer;
        const mark = (ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement)?.closest('mark');
        if (mark && node.contains(mark) && mark.textContent === range.toString()) {
          const first = mark.firstChild, last = mark.lastChild;
          mark.replaceWith(...mark.childNodes); range.setStartBefore(first); range.setEndAfter(last);
        } else {
          const highlight = document.createElement('mark'); highlight.append(range.extractContents());
          range.insertNode(highlight); range.selectNodeContents(highlight);
        }
        selection.removeAllRanges(); selection.addRange(range);
      }
      else if (/^h[1-6]$/.test(command) || command === "paragraph" || command === "quote")
        document.execCommand("formatBlock", false, command === "quote" ? "blockquote" : command === "paragraph" ? "p" : command);
      else {
        const selected = window.getSelection()?.toString() || "text";
        const wraps = { highlight: ["==", "=="], code: ["`", "`"], link: ["[", "](https://)"], wiki: ["[[", "]]"], math: ["$", "$"] };
        if (wraps[command]) {
          const [before, after] = wraps[command];
          document.execCommand("insertHTML", false, renderer.render(before + selected + after, true));
        } else if (command === "check") {
          document.execCommand("insertHTML", false, renderer.render("- [ ] " + selected));
        } else {
          // Block insertion belongs after this component, never at CodeMirror's
          // old caret position in an unrelated paragraph.
          const anchor = position + source.length;
          editor.dispatch({ changes: { from: anchor, insert: "\n\n" }, selection: { anchor: anchor + 2 } });
          editor.focus();
          return false;
        }
      }
      const selection = window.getSelection();
      if (selection?.rangeCount && node.contains(selection.anchorNode) && node.contains(selection.focusNode)) savedRange = selection.getRangeAt(0).cloneRange();
      commit(node, true); return true;
    },
    insert(value) {
      if (!focusedField) return false;
      focusedField.focus();
      if (savedRange && focusedField.contains(savedRange.commonAncestorContainer)) {
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange);
      }
      document.execCommand(focusedField.contentEditable === "plaintext-only" ? "insertText" : "insertHTML",
        false, focusedField.contentEditable === "plaintext-only" ? value : renderer.render(value, true));
      commit(focusedField); return true;
    },
    // Input events already dispatch synchronously. Merely focusing a component
    // and saving/leaving must not normalize otherwise untouched Markdown.
    commit: () => {
      if (composing) { composing = false; commit(focusedField); }
    },
  };
  if (kind === "table") {
    try {
      tableController = editableDocumentTable({ element, token, field, fields, markdown: cellMarkdown, pipe: CELL_PIPE,
        renderer, icon, panel, commit, history, onError, toast, saveTemplate: tableLayouts?.save,
        initialPage:tablePage,
        onPage: hydrate,
        requestMeasure: () => editor.requestMeasure(),
        activate: node => { focusedField = node; savedRange = null; onFocus(api, node); },
      });
      serialize = tableController.serialize;
    } catch (error) {
      // An imported table beyond the inline editing guard remains readable.
      const notice = document.createElement('p'); notice.className = 'field-hint';
      notice.textContent = `${error.message} Use Source to edit this table.`;
      element.append(notice);
    }
  } else if (kind === "blockquote") {
    const header = callout(source);
    if (header) {
      let wrapper = element.querySelector(".document-callout");
      const heading = wrapper.querySelector(":scope > strong, :scope > summary");
      const title = document.createElement("span"); title.innerHTML = heading.innerHTML;
      heading.replaceChildren(title);
      field(title, "Callout title", { multiline: false });
      const body = document.createElement("div"); body.className = "document-callout-content";
      while (heading.nextSibling) body.append(heading.nextSibling);
      if (header[2]) {
        // Keep disclosure and text editing as sibling controls, not a textbox
        // nested inside the native interactive <summary>.
        const aside = document.createElement("aside"); aside.className = "document-callout";
        const headingRow = document.createElement("div"); headingRow.className = "document-callout-heading";
        const toggle = document.createElement("button");
        toggle.type = "button"; toggle.className = "icon-button";
        toggle.innerHTML = icon ? icon("chevron") : "Toggle";
        const label = document.createElement("strong"); label.append(title);
        body.hidden = header[2] === "-";
        const update = () => {
          toggle.setAttribute("aria-expanded", String(!body.hidden));
          toggle.setAttribute("aria-label", body.hidden ? "Expand callout" : "Collapse callout");
        };
        toggle.addEventListener("click", () => { body.hidden = !body.hidden; update(); editor.requestMeasure(); });
        update(); headingRow.append(toggle, label); aside.append(headingRow, body);
        wrapper.replaceWith(aside); wrapper = aside;
      } else wrapper.append(body);
      field(body, "Callout content");
      serialize = changed => {
        const current = callout(source);
        if (changed === title) return `> [!${current[1]}]${current[2] || ""} ${toMarkdown(title)}\n` + source.slice(current[0].length);
        return source.split("\n")[0] + "\n" + toMarkdown(body).split("\n").map(line => `> ${line}`).join("\n");
      };
    } else {
      const quote = field(element.querySelector("blockquote"), "Quote content");
      serialize = () => toMarkdown(quote).split("\n").map(line => `> ${line}`).join("\n");
    }
  } else if (kind === "code") {
    const lang = token.lang?.split(/\s/)[0];
    // Diagrams and task queries show their result, with their source edited below it.
    const query = lang === "tasks", diagram = lang === "mermaid" || query;
    let code = element.querySelector("pre code");
    if (diagram) {
      const pre = document.createElement("pre"); code = document.createElement("code");
      code.textContent = token.text; pre.append(code); element.append(pre);
    }
    field(code, query ? "Card query" : diagram ? "Diagram code" : "Code block", { plain: true });
    // The fence's info string; its first word is the language.
    let info = token.lang || "";
    serialize = () => {
      const text = ([...code.childNodes].every(node=>node.nodeType===Node.TEXT_NODE)?code.textContent:code.innerText).replace(/\n$/, "");
      if (token.codeBlockStyle === "indented" && !info) return text.split("\n").map(line => "    " + line).join("\n");
      const fence = documentCodeFence(text);
      return `${fence}${info}\n${text}\n${fence}`;
    };
    if (!diagram) {
      // Choose the language from a menu instead of editing the fence.
      // An alias selects its menu entry; the fence keeps its text until changed.
      const known = codeLanguageEntry(info);
      const current = known ? known[0] : codeLanguageName(info);
      const options = known ? codeLanguages : [...codeLanguages, [current, current]];
      const head = document.createElement("div");
      head.className = "document-code-head";
      head.contentEditable = "false";
      head.innerHTML = `<select class="document-code-language" aria-label="Code language" title="Code language">${options.map(([name, label]) => `<option value="${esc(name)}" ${name === current ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
      element.prepend(head);
      const picker = head.querySelector("select");
      picker.addEventListener("change", () => {
        const rest = info.trim().split(/\s+/).slice(1).join(" ");
        info = picker.value ? [picker.value, rest].filter(Boolean).join(" ") : "";
        code.className = picker.value ? `language-${picker.value}` : "";
        commit(code);
        void highlightCode(code, picker.value);
      });
      let timer = 0;
      code.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => highlightCode(code, codeLanguageName(info)), 120);
      });
    }
    if (diagram) code.addEventListener("blur", () => {
      const preview = element.querySelector("[data-document-diagram], [data-document-task-query]");
      // Unchanged source keeps the rendered result (and any focused control in it).
      if (preview.dataset.query === code.innerText || (!query && preview.textContent === code.innerText && preview.dataset.rendered)) return;
      preview.textContent = code.innerText; delete preview.dataset.rendered; delete preview.dataset.query; hydrate(element);
    });
  } else if (kind === "documentMathBlock") {
    const formula = document.createElement("div"); formula.textContent = token.text;
    formula.className = "document-formula-input";
    field(formula, "Math formula", { plain: true }); element.append(formula);
    serialize = () => `$$\n${formula.innerText}\n$$`;
    formula.addEventListener("blur", () => {
      element.querySelector(".document-math").outerHTML = renderer.render(source);
    });
  } else if (kind === "html") {
    const content = document.createElement("div");
    while (element.firstChild) content.append(element.firstChild);
    element.append(content); field(content, "Formatted content");
    serialize = () => toMarkdown(content);
  }
  // Native editing stays inside the widget; CodeMirror must not expose its source.
  element.addEventListener("click", event => {
    const link = event.target.closest("[data-document-ref]");
    if (link && (event.ctrlKey || event.metaKey || link.contentEditable === "false" || link.closest(".document-transclusion"))) {
      event.preventDefault(); onLink(link.dataset.documentRef);
    }
  });
  for (const event of ["mousedown", "pointerdown", "click", "input", "paste", "compositionstart", "compositionend"])
    element.addEventListener(event, e => e.stopPropagation());
  element.documentComponent = api;
  return api;
}
