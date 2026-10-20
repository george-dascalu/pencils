import {
  EditorState, EditorSelection, StateField, Compartment, EditorView, Decoration, WidgetType,
  keymap, placeholder, drawSelection, highlightActiveLine, lineNumbers,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo,
  syntaxTree, syntaxHighlighting, HighlightStyle, tags, foldGutter, foldKeymap, bracketMatching,
  markdown, markdownKeymap, markdownLanguage, languages, search, searchKeymap, openSearchPanel, closeSearchPanel,
  autocompletion, completionKeymap,
} from "/vendor/editor/deps.js";
import { documentReference } from "./document-model.js";

export function markdownDocumentEditor({ parent, text, mode = "live", renderer, documents, onChange, onError, onLink }) {
  const presentation = new Compartment();
  let view, alive = true;
  const active = (state, from, to) => state.selection.ranges.some(r =>
    state.doc.lineAt(r.from).from <= to && state.doc.lineAt(r.to).to >= from);
  function hydrate(element) {
    if (element.querySelector("[data-document-diagram]"))
      import("/vendor/editor/diagrams.js").then(m => alive && m.renderDiagrams(element)).catch(() => {});
  }
  class Preview extends WidgetType {
    constructor(raw, from, block = false) { super(); this.raw = raw; this.from = from; this.block = block; }
    eq(other) { return this.raw === other.raw && this.from === other.from && this.block === other.block; }
    toDOM(editor) {
      const element = document.createElement(this.block ? "div" : "span");
      element.className = this.block ? "document-block-preview document-prose" : "document-inline-preview";
      element.innerHTML = renderer.render(this.raw, !this.block);
      element.addEventListener("mousedown", e => {
        if (e.target.closest("a,button,input,summary")) return;
        e.preventDefault();
        editor.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
        editor.focus();
      });
      hydrate(element);
      return element;
    }
    ignoreEvent() { return false; }
  }
  class Checkbox extends WidgetType {
    constructor(checked, from) { super(); this.checked = checked; this.from = from; }
    eq(other) { return this.checked === other.checked && this.from === other.from; }
    toDOM(editor) {
      const input = document.createElement("input");
      input.type = "checkbox"; input.checked = this.checked; input.className = "document-checkbox";
      input.setAttribute("aria-label", editor.state.doc.lineAt(this.from).text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "") || "Checklist item");
      input.addEventListener("mousedown", e => e.stopPropagation());
      input.addEventListener("change", () => editor.dispatch({ changes: { from: this.from, to: this.from + 3, insert: input.checked ? "[x]" : "[ ]" } }));
      return input;
    }
    ignoreEvent() { return true; }
  }
  const previewField = StateField.define({
    create: state => decorate(state),
    update: (value, tr) => tr.docChanged || tr.selection || tr.reconfigured || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? decorate(tr.state) : value,
    provide: field => EditorView.decorations.from(field),
  });
  function decorate(state) {
    const ranges = [], blocked = [];
    const source = state.doc.toString();
    // Block widgets are state decorations, so CodeMirror can measure their height.
    let offset = 0;
    for (const token of renderer.tokens(source)) {
      const from = offset, to = offset + token.raw.length;
      offset = to;
      if (["code", "table", "blockquote", "documentMathBlock", "html", "hr"].includes(token.type) ||
          token.type === "paragraph" && /^!\[\[[^\]\n]+\]\]\s*$/.test(token.raw)) {
        if (!active(state, from, Math.max(from, to - 1))) {
          let end = to;
          while (end > from && source[end - 1] === "\n") end--;
          if (end > from) {
            ranges.push(Decoration.replace({ widget: new Preview(token.raw, from, true), block: true }).range(from, end));
            blocked.push([from, to]);
          }
        } else if (token.type === "code") blocked.push([from, to]);
      }
    }
    const hidden = (from, to) => blocked.some(([a, b]) => from < b && to > a);
    syntaxTree(state).iterate({
      enter(node) {
        if (blocked.some(([from, to]) => node.from >= from && node.to <= to)) return false;
        const name = node.name;
        if (/^(ATXHeading|SetextHeading)/.test(name)) {
          const level = Number(name.slice(-1)) || 1;
          ranges.push(Decoration.line({ class: `document-heading-${level}` }).range(state.doc.lineAt(node.from).from));
        }
        if (active(state, node.from, node.to)) return;
        if (name === "Escape" && source[node.from] === "\\")
          ranges.push(Decoration.replace({}).range(node.from, node.from + 1));
        if (["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark"].includes(name))
          ranges.push(Decoration.replace({}).range(node.from, node.to));
        if (name === "TaskMarker") {
          ranges.push(Decoration.replace({ widget: new Checkbox(source[node.from + 1].toLowerCase() === "x", node.from) }).range(node.from, node.to));
          return false;
        }
        if (["Link", "Image", "Autolink"].includes(name)) {
          ranges.push(Decoration.replace({ widget: new Preview(source.slice(node.from, node.to), node.from) }).range(node.from, node.to));
          blocked.push([node.from, node.to]);
          return false;
        }
      },
    });
    // Obsidian extensions which are outside the CommonMark syntax tree.
    const extensions = /!?\[\[[^\]\n]+\]\]|==[^\n]+?==|%%[\s\S]*?%%|\$(?!\s|\$)(?:\\.|[^$\n])+?\$|\[\^[^\]\n]+\]/g;
    for (const match of source.matchAll(extensions)) {
      const from = match.index, to = from + match[0].length;
      const node = syntaxTree(state).resolveInner(from, 1);
      let code = false;
      for (let n = node; n; n = n.parent) if (/Code|HTML/.test(n.name)) code = true;
      if (code || hidden(from, to) || active(state, from, to)) continue;
      // Do not add overlapping replacements for standard Markdown links.
      if (ranges.some(r => r.from < to && r.to > from && r.value.widget)) continue;
      ranges.push(Decoration.replace({ widget: new Preview(match[0], from) }).range(from, to));
    }
    return Decoration.set(ranges, true);
  }
  const completion = context => {
    const before = context.matchBefore(/\[\[[^\]\n]*/);
    if (!before) return null;
    return {
      from: before.from + 2,
      options: documents().map(d => ({
        label: d.title, detail: "Document", type: "text",
        apply(editor, _completion, from, to) {
          const suffix = editor.state.doc.sliceString(to, to + 2) === "]]" ? 2 : 0;
          const insert = `${documentReference(d)}|${d.title}]]`;
          editor.dispatch({ changes: { from, to: to + suffix, insert }, selection: { anchor: from + insert.length } });
        },
      })),
      validFor: /^[^\]\n]*$/,
    };
  };
  const liveExtensions = () => mode === "source"
    ? [lineNumbers(), highlightActiveLine()]
    : [previewField];
  const shortcut = (key, command) => ({ key, run: () => { format(command); return true; } });
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(), drawSelection(), bracketMatching(), EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }), syntaxHighlighting(HighlightStyle.define([
          { tag: tags.heading, fontWeight: "650", color: "var(--ink)" },
          { tag: tags.strong, fontWeight: "700" },
          { tag: tags.emphasis, fontStyle: "italic" },
          { tag: tags.strikethrough, textDecoration: "line-through" },
          { tag: [tags.link, tags.url], color: "var(--green)", textDecoration: "underline" },
          { tag: [tags.monospace, tags.literal], fontFamily: "var(--font-mono, monospace)" },
          { tag: [tags.keyword, tags.tagName, tags.attributeName], color: "var(--green)" },
          { tag: [tags.comment, tags.processingInstruction, tags.meta], color: "var(--muted)" },
        ])),
        foldGutter(), autocompletion({ override: [completion] }),
        search({ top: true }),
        keymap.of([
          shortcut("Mod-b", "bold"), shortcut("Mod-i", "italic"), shortcut("Mod-k", "link"),
          ...completionKeymap, ...markdownKeymap, ...defaultKeymap, ...historyKeymap,
          ...searchKeymap, ...foldKeymap, indentWithTab,
        ]),
        placeholder("Start writing…"),
        EditorView.contentAttributes.of({ "aria-label": "Document content", spellcheck: "true" }),
        EditorState.transactionFilter.of(tr => {
          if (tr.newDoc.length <= 200000) return tr;
          onError("Documents can contain up to 200,000 characters.");
          return [];
        }),
        EditorView.updateListener.of(update => { if (update.docChanged) onChange(update.state.doc.toString()); }),
        EditorView.domEventHandlers({
          click(event) {
            const link = event.target.closest("[data-document-ref]");
            if (link) { event.preventDefault(); onLink(link.dataset.documentRef); return true; }
          },
        }),
        presentation.of(liveExtensions()),
      ],
    }),
  });
  function format(command) {
    if (command === "undo") return undo(view);
    if (command === "redo") return redo(view);
    const range = view.state.selection.main;
    const selected = view.state.sliceDoc(range.from, range.to);
    const wraps = { bold: ["**", "**"], italic: ["*", "*"], strike: ["~~", "~~"], highlight: ["==", "=="], code: ["`", "`"], link: ["[", "](https://)"], wiki: ["[[", "]]"], math: ["$", "$"] };
    if (wraps[command]) {
      const [before, after] = wraps[command], inside = selected || (command === "wiki" ? "" : "text");
      view.dispatch({ changes: { from: range.from, to: range.to, insert: before + inside + after }, selection: { anchor: range.from + before.length, head: range.from + before.length + inside.length } });
    } else {
      const inserts = {
        table: "| Column | Column |\n| --- | --- |\n| Value | Value |",
        codeblock: "```text\nCode\n```",
        mermaid: "```mermaid\nflowchart LR\n  Start --> Finish\n```",
        callout: "> [!note] Note\n> Write your note.",
        footnote: "Text[^note]\n\n[^note]: Footnote text.",
        rule: "---",
      };
      if (inserts[command]) {
        const from = view.state.doc.lineAt(range.from).from;
        view.dispatch({ changes: { from, insert: inserts[command] + "\n\n" }, selection: { anchor: from } });
      } else {
        const prefix = command === "bullet" ? "- " : command === "number" ? "1. " : command === "check" ? "- [ ] " : command === "quote" ? "> " : /^h[1-6]$/.test(command) ? "#".repeat(Number(command[1])) + " " : "";
        const start = view.state.doc.lineAt(range.from).number, end = view.state.doc.lineAt(range.to).number;
        const changes = [];
        for (let n = start; n <= end; n++) {
          const line = view.state.doc.line(n);
          const existing = /^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s*)/.exec(line.text);
          changes.push({ from: line.from, to: line.from + (existing?.[0].length || 0), insert: prefix });
        }
        view.dispatch({ changes });
      }
    }
    view.focus();
  }
  return {
    view, format, hydrate,
    value: () => view.state.doc.toString(),
    focus: () => view.focus(),
    find: () => { openSearchPanel(view); },
    escape: () => closeSearchPanel(view),
    setMode(next) {
      mode = next;
      view.dispatch({ effects: presentation.reconfigure(liveExtensions()) });
      view.contentDOM.setAttribute("aria-label", mode === "source" ? "Document Markdown" : "Document content");
      parent.dataset.mode = next;
      view.requestMeasure();
    },
    jump(from) {
      const anchor = Math.max(0, Math.min(from, view.state.doc.length));
      view.dispatch({ selection: EditorSelection.cursor(anchor), scrollIntoView: true }); view.focus();
    },
    insert(value) { view.dispatch(view.state.replaceSelection(value)); view.focus(); },
    destroy() { alive = false; view.destroy(); },
    flush() {},
  };
}
