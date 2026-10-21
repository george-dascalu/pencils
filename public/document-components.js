import TurndownService from "/vendor/turndown.js";
import { gfm } from "/vendor/turndown-gfm.js";

const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
converter.use(gfm);
converter.addRule("documentSource", {
  filter: node => node.hasAttribute?.("data-document-source"),
  replacement: (_content, node) => node.dataset.documentSource,
});
converter.addRule("documentHighlight", { filter: "mark", replacement: content => `==${content}==` });
converter.addRule("documentLink", {
  filter: node => node.tagName === "A" && node.hasAttribute("data-document-href"),
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
const toMarkdown = element => converter.turndown(element).trim();
const callout = raw => /^>\s*\[!([\w-]+)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n|$)/.exec(raw);

// A rendered block owns editable DOM, while every edit remains a CodeMirror
// transaction. Only this block changes; the rest of the Markdown is untouched.
export function editableDocumentComponent({ element, raw, from, kind, editor, renderer, onError, onFocus, onLink, onSearch, history, hydrate, icon }) {
  let source = trim(raw), position = from, writing = false, composing = false;
  let savedRange = null, focusedField = null;
  const token = renderer.tokens(source)[0];
  element.dataset.componentType = kind;
  element.dataset.componentFrom = String(from);
  element.classList.add("document-editable-component");
  const fields = [];
  let serialize;
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
        editor.dispatch({ selection: { anchor: Math.min(position + source.length + 1, editor.state.doc.length) } });
        editor.focus();
      } else if (event.key === "Enter" && (!multiline || plain || node.matches("td,th"))) {
        event.preventDefault();
        if (multiline) { document.execCommand("insertText", false, "\n"); commit(node); }
      } else if (event.key === "Tab" && kind === "table") {
        const next = fields[fields.indexOf(node) + (event.shiftKey ? -1 : 1)];
        if (next) { event.preventDefault(); next.focus(); }
      }
      event.stopPropagation();
    });
    return node;
  }
  function commit(changedField) {
    if (!serialize || composing) return;
    try {
      for (const field of fields)
        for (const checkbox of field.querySelectorAll('input[type="checkbox"]')) checkbox.disabled = false;
      const next = trim(serialize(changedField));
      if (next === source) return;
      if (editor.state.doc.sliceString(position, position + source.length) !== source)
        throw new Error("This component changed. Reopen the document before editing it.");
      writing = true;
      editor.dispatch({ changes: { from: position, to: position + source.length, insert: next }, userEvent: "input" });
      if (editor.state.doc.sliceString(position, position + next.length) === next) source = next;
      editor.requestMeasure();
    } catch (error) { onError(error.message); }
    finally { writing = false; }
  }
  const api = {
    element,
    update(nextFrom, nextRaw) {
      const next = trim(nextRaw);
      if (!writing && source !== next) return false;
      position = nextFrom; source = next;
      element.dataset.componentFrom = String(position);
      return true;
    },
    format(command) {
      const node = fields.find(node => node.contains(document.activeElement) || node === document.activeElement)
        || focusedField;
      if (!node) return false;
      node.focus();
      if (savedRange && node.contains(savedRange.commonAncestorContainer)) {
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange);
      }
      if (node.contentEditable === "plaintext-only") return true;
      const commands = { bold: "bold", italic: "italic", strike: "strikeThrough",
        bullet: "insertUnorderedList", number: "insertOrderedList" };
      if (commands[command]) document.execCommand(commands[command]);
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
      commit(node); return true;
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
    const table = element.querySelector("table");
    const aligns = token.align || [];
    const originalRows = [token.header, ...token.rows].map(row => row.map(cell => cell.text));
    for (const row of table.rows) for (const cell of row.cells) {
      const rowIndex = row.rowIndex, column = cell.cellIndex;
      cell.dataset.originalHtml = cell.innerHTML;
      cell.dataset.originalMarkdown = originalRows[rowIndex]?.[column] || "";
      field(cell, `${rowIndex ? `Row ${rowIndex}` : "Header"}, column ${column + 1}`);
      if (aligns[column]) cell.style.textAlign = aligns[column];
    }
    serialize = () => {
      const rows = [...table.rows].map(row => [...row.cells].map(cell =>
        cell.innerHTML === cell.dataset.originalHtml ? cell.dataset.originalMarkdown
          : toMarkdown(cell).replace(/\r?\n+/g, "<br>").replace(/(?<!\\)\|/g, "\\|")));
      const line = cells => `| ${cells.join(" | ")} |`;
      const separators = rows[0].map((_, i) => aligns[i] === "center" ? ":---:" : aligns[i] === "right" ? "---:" : aligns[i] === "left" ? ":---" : "---");
      return [line(rows[0]), line(separators), ...rows.slice(1).map(line)].join("\n");
    };
    const actions = document.createElement("div"); actions.className = "document-component-actions";
    for (const [label, action] of [
      ["Add row", () => {
        const body = table.tBodies[0] || table.createTBody(), row = body.insertRow();
        for (let i = 0; i < table.rows[0].cells.length; i++) field(row.insertCell(), `Row ${row.rowIndex}, column ${i + 1}`);
        commit(); row.cells[0].focus();
      }],
      ["Add column", () => {
        for (const row of table.rows) {
          const cell = document.createElement(row.rowIndex ? "td" : "th");
          row.append(cell); field(cell, `${row.rowIndex ? `Row ${row.rowIndex}` : "Header"}, column ${cell.cellIndex + 1}`);
        }
        commit(); table.rows[0].lastElementChild.focus();
      }],
    ]) {
      const button = document.createElement("button"); button.type = "button"; button.className = "button small";
      button.textContent = label; button.addEventListener("click", action); actions.append(button);
    }
    element.append(actions);
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
    const diagram = token.lang?.split(/\s/)[0] === "mermaid";
    let code = element.querySelector("pre code");
    if (diagram) {
      const pre = document.createElement("pre"); code = document.createElement("code");
      code.textContent = token.text; pre.append(code); element.append(pre);
    }
    field(code, diagram ? "Diagram code" : "Code block", { plain: true });
    serialize = () => {
      const text = code.innerText.replace(/\n$/, "");
      if (token.codeBlockStyle === "indented") return text.split("\n").map(line => "    " + line).join("\n");
      const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1)));
      return `${fence}${token.lang || ""}\n${text}\n${fence}`;
    };
    if (diagram) code.addEventListener("blur", () => {
      const preview = element.querySelector("[data-document-diagram]");
      preview.textContent = code.innerText; delete preview.dataset.rendered; hydrate(element);
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
