import { documentSearchPanel } from "./document-search.js";
import {
  EditorState, EditorSelection, StateEffect, StateField, Compartment, EditorView, Decoration, WidgetType,
  keymap, placeholder, drawSelection, highlightActiveLine, lineNumbers,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo,
  syntaxTree, syntaxHighlighting, HighlightStyle, tags, foldGutter, foldKeymap, bracketMatching,
  markdown, markdownKeymap, markdownLanguage, languages, search, searchKeymap, openSearchPanel, closeSearchPanel,
  autocompletion, completionKeymap,
} from "/vendor/editor/deps.js";
import { documentReference } from "./document-model.js";
import { editableDocumentComponent } from "./document-components.js";
import { focusOnOpen } from "./open-focus.js";
import { spreadsheetRows, markdownTable } from "./document-tables.js";
import { insertCategories } from "./document-insert.js";
import { highlightCodeBlocks } from "./document-code.js";
import { listCallouts, listCalloutAfterMarker, setListCallout, listCalloutLabel } from "./document-list-callouts.js";

export function markdownDocumentEditor({ parent, text, mode = "live", renderer, documents, cards = () => [], hidden = [], taskQueries, onChange, onError, onLink, onInsert, onComment, onSketch, icon, panel, toast }) {
  const presentation = new Compartment();
  let view, alive = true, focusedComponent = null;
  const hoverEffect = StateEffect.define();
  const focusEffect = StateEffect.define();
  // Commented text (document-comments.js), highlighted in every mode and moved along with edits.
  const commentsEffect = StateEffect.define();
  const commentField = StateField.define({
    create: () => Decoration.none,
    update(value, tr) {
      value = value.map(tr.changes);
      for (const effect of tr.effects) if (effect.is(commentsEffect))
        value = Decoration.set(effect.value.filter(r => r.from < r.to && r.to <= tr.state.doc.length).map(({ from, to, id }) =>
          Decoration.mark({ class: "document-comment-mark", attributes: { "data-comment-thread": id } }).range(from, to)), true);
      return value;
    },
    provide: field => EditorView.decorations.from(field),
  });
  const revealField = StateField.define({
    create: () => ({ hover: null, focused: false }),
    update(value, tr) {
      let { hover, focused } = value;
      if (tr.docChanged && hover) hover = { from: tr.changes.mapPos(hover.from), to: tr.changes.mapPos(hover.to) };
      for (const effect of tr.effects) {
        if (effect.is(hoverEffect)) hover = effect.value;
        if (effect.is(focusEffect)) focused = effect.value;
      }
      return { hover, focused };
    },
  });
  let hoverTimer;
  const active = (state, from, to) => {
    const { hover, focused } = state.field(revealField);
    return (focused && state.selection.ranges.some(r => r.from <= to && r.to >= from)) ||
      (hover && hover.from < to && hover.to > from);
  };
  function hydrate(element) {
    highlightCodeBlocks(element);
    if (element.querySelector("[data-document-task-query]")) taskQueries?.(element);
    if (element.querySelector("[data-document-diagram]"))
      import("/vendor/editor/diagrams.js").then(m => alive && m.renderDiagrams(element)).catch(() => {});
  }
  class Preview extends WidgetType {
    constructor(raw, from, block = false, kind = null) { super(); this.raw = raw; this.from = from; this.block = block; this.kind = kind; }
    eq(other) { return this.raw === other.raw && this.from === other.from && this.block === other.block && this.kind === other.kind; }
    updateDOM(element) {
      return element.dataset.componentType === this.kind &&
        !!element.documentComponent?.update(this.from, this.raw);
    }
    toDOM(editor) {
      const element = document.createElement(this.block ? "div" : "span");
      element.className = this.block ? "document-block-preview document-prose" : "document-inline-preview";
      element.innerHTML = renderer.render(this.raw, !this.block);
      if (["table", "blockquote", "code", "documentMathBlock", "html"].includes(this.kind)) {
        editableDocumentComponent({
          element, raw: this.raw, from: this.from, kind: this.kind, editor, renderer, onError, hydrate, icon, panel, toast, onLink,
          onSearch: () => openSearchPanel(editor),
          onFocus: component => { focusedComponent = component; },
          history: backwards => backwards ? redo(editor) : undo(editor),
        });
      } else if (this.block) {
        element.addEventListener("click", event => {
          const link = event.target.closest("[data-document-ref]");
          if (link) { event.preventDefault(); onLink(link.dataset.documentRef); }
        });
      } else {
      // A link in the text opens on click instead of placing the caret (which would reveal its Markdown).
      element.addEventListener("click", event => {
        const link = event.target.closest("[data-document-ref]");
        if (link) { event.preventDefault(); onLink(link.dataset.documentRef); }
      });
      element.addEventListener("mousedown", e => {
        // A sketch opens in the sketch pad instead of revealing its Markdown.
        const sketch = e.target.closest("img[data-document-sketch]");
        if (sketch) { e.preventDefault(); onSketch?.(sketch.dataset.documentSketch); return; }
        if (e.target.closest("a,button,input,summary")) return;
        e.preventDefault();
        editor.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
        editor.focus();
      });
      }
      hydrate(element);
      return element;
    }
    ignoreEvent(event) { return this.block || !!event.target?.closest?.("a, img[data-document-sketch]"); }
  }
  class Checkbox extends WidgetType {
    constructor(checked, from) { super(); this.checked = checked; this.from = from; }
    eq(other) { return this.checked === other.checked && this.from === other.from; }
    toDOM(editor) {
      const input = document.createElement("input");
      input.type = "checkbox"; input.checked = this.checked; input.className = "document-checkbox";
      input.setAttribute("aria-label", listCalloutLabel(editor.state.doc.lineAt(this.from).text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "")) || "Checklist item");
      input.addEventListener("mousedown", e => e.stopPropagation());
      const save = () => editor.dispatch({ changes: { from: this.from, to: this.from + 3, insert: input.checked ? "[x]" : "[ ]" } });
      input.addEventListener("change", save);
      // A tap toggles the box without focusing the editor: iOS places a caret
      // and opens the keyboard when the tap completes. Cancelling touchend
      // stops that (and the click); a touch that moves stays a scroll.
      let tap = null;
      input.addEventListener("touchstart", e => {
        tap = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      }, { passive: true });
      input.addEventListener("touchmove", e => {
        const t = e.touches[0];
        if (tap && (!t || Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10)) tap = null;
      }, { passive: true });
      input.addEventListener("touchcancel", () => { tap = null; });
      input.addEventListener("touchend", e => {
        if (!tap) return;
        tap = null;
        e.preventDefault();
        input.checked = !input.checked;
        save();
      });
      return input;
    }
    ignoreEvent() { return true; }
  }
  // A list callout's character shows as its icon, even with the caret on the line (as in Obsidian).
  class ListCalloutMark extends WidgetType {
    constructor(callout) { super(); this.callout = callout; }
    eq(other) { return this.callout === other.callout; }
    toDOM() {
      const mark = document.createElement("span");
      mark.className = "document-list-callout-mark";
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", this.callout.label);
      mark.innerHTML = icon(this.callout.icon);
      return mark;
    }
  }
  const previewField = StateField.define({
    create: state => decorate(state),
    update: (value, tr) => tr.docChanged || tr.selection || tr.reconfigured || tr.effects.some(e => e.is(hoverEffect) || e.is(focusEffect)) || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? decorate(tr.state) : value,
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
      if (["code", "table", "documentTableLayout", "blockquote", "documentMathBlock", "html", "hr"].includes(token.type) ||
          token.type === "paragraph" && /^!\[\[[^\]\n]+\]\]\s*$/.test(token.raw)) {
        {
          let end = to;
          while (end > from && source[end - 1] === "\n") end--;
          if (end > from) {
            // A table with its layout comment is edited as a table.
            const kind = token.type === "documentTableLayout" ? "table" : token.type;
            ranges.push(Decoration.replace({ widget: new Preview(token.raw, from, true, kind), block: true }).range(from, end));
            blocked.push([from, to]);
          }
        }
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
        if (name === "ListMark") {
          const line = state.doc.lineAt(node.from), found = listCalloutAfterMarker(source.slice(node.to, line.to));
          if (found) {
            const at = node.to + found.offset;
            ranges.push(Decoration.line({ class: "document-list-callout", attributes: { "data-list-callout": found.callout.name } }).range(line.from));
            ranges.push(Decoration.replace({ widget: new ListCalloutMark(found.callout) }).range(at, at + 1));
          }
        }
        // Reveal delimiters for this inline span only. A caret elsewhere in the
        // same paragraph leaves checkboxes, links and other formatting rendered.
        const span = ["EmphasisMark", "StrikethroughMark", "CodeMark"].includes(name) ? node.node.parent : node;
        if (active(state, span.from, span.to)) return;
        if (name === "Escape" && source[node.from] === "\\")
          ranges.push(Decoration.replace({}).range(node.from, node.from + 1));
        if (["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark"].includes(name)) {
          // A heading's opening "#" hides with the space after it, so heading
          // text starts at the same edge as paragraphs.
          const opening = name === "HeaderMark" && /^\s*$/.test(source.slice(state.doc.lineAt(node.from).from, node.from));
          const end = opening && /[ \t]/.test(source[node.to] || "") ? node.to + 1 : node.to;
          ranges.push(Decoration.replace({}).range(node.from, end));
        }
        if (name === "TaskMarker") {
          ranges.push(Decoration.replace({ widget: new Checkbox(source[node.from + 1].toLowerCase() === "x", node.from) }).range(node.from, node.to));
          return false;
        }
        if (["Link", "Image", "Autolink"].includes(name)) {
          // The parser reads the inside of a "[[…]]" wiki link as a link; the wiki link is handled below.
          if (/^\[\[[^\]\n]+\]\]$/.test(source.slice(node.from - 1, node.to + 1)) || /^!\[\[[^\]\n]+\]\]/.test(source.slice(node.from, node.to + 1))) return false;
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
    // Cards follow documents; a card is linked by its key, which Obsidian resolves through its aliases.
    const cardOptions = cards().map(t => ({
      label: `${t.key || t.id} ${t.title}`, detail: "Card", glyph: t.type || "task", boost: -1,
      apply(editor, _completion, from, to) {
        const suffix = editor.state.doc.sliceString(to, to + 2) === "]]" ? 2 : 0;
        const insert = `${t.key || t.id}]]`;
        editor.dispatch({ changes: { from, to: to + suffix, insert }, selection: { anchor: from + insert.length } });
      },
    }));
    return {
      from: before.from + 2,
      options: [...documents().map(d => ({
        label: d.title, detail: "Document", glyph: "file",
        apply(editor, _completion, from, to) {
          const suffix = editor.state.doc.sliceString(to, to + 2) === "]]" ? 2 : 0;
          const insert = `${documentReference(d)}|${d.title}]]`;
          editor.dispatch({ changes: { from, to: to + suffix, insert }, selection: { anchor: from + insert.length } });
        },
      })), ...cardOptions],
      validFor: /^[^\]\n]*$/,
    };
  };
  // "/" at the start of a line or after a space offers the Insert panel's
  // elements, as in Obsidian. Typing filters; choosing one replaces "/query".
  const slashOptions = insertCategories.flatMap(([section, items], rank) => items.filter(([command]) => !hidden.includes(command)).map(([command, label, glyph], index) => ({
    label, glyph, section: { name: section, rank },
    // Keep the Insert panel's order while nothing is typed.
    boost: 50 - index,
    apply(editor, _completion, from, to) {
      editor.dispatch({ changes: { from: from - 1, to }, selection: { anchor: from - 1 } });
      if (["attach", "card", "comment", "sketch"].includes(command)) onInsert?.(command);
      else format(command);
    },
  })));
  const slash = context => {
    const line = context.state.doc.lineAt(context.pos);
    const match = /(?:^|\s)\/([A-Za-z0-9 ]{0,24})$/.exec(line.text.slice(0, context.pos - line.from));
    if (!match) return null;
    const from = context.pos - match[1].length;
    for (let node = syntaxTree(context.state).resolveInner(from - 1, -1); node; node = node.parent)
      if (/Code|HTML|Link|URL/.test(node.name)) return null;
    return { from, options: slashOptions, validFor: /^[A-Za-z0-9 ]*$/ };
  };
  const liveExtensions = () => mode === "source"
    ? [lineNumbers(), highlightActiveLine()]
    : [previewField, highlightActiveLine()];
  const shortcut = (key, command) => ({ key, run: () => { format(command); return true; } });
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        revealField, history(), drawSelection(), bracketMatching(), EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }), syntaxHighlighting(HighlightStyle.define([
          // Headings take their line's colour (project-documents.css), which Style settings and themes may set.
          { tag: tags.heading, fontWeight: "650", color: "inherit" },
          { tag: tags.strong, fontWeight: "700" },
          { tag: tags.emphasis, fontStyle: "italic" },
          { tag: tags.strikethrough, textDecoration: "line-through" },
          { tag: [tags.link, tags.url], color: "var(--green)", textDecoration: "underline" },
          { tag: [tags.monospace, tags.literal], fontFamily: "var(--font-mono, monospace)" },
          { tag: [tags.keyword, tags.tagName, tags.attributeName], color: "var(--green)" },
          { tag: [tags.comment, tags.processingInstruction, tags.meta], color: "var(--markdown-mark, var(--muted))" },
        ])),
        foldGutter(), autocompletion({
          override: [completion, slash], icons: false,
          // The app's icons instead of CodeMirror's type glyphs.
          addToOptions: [{ position: 20, render: option => {
            const glyph = document.createElement("span");
            glyph.className = "document-completion-icon";
            glyph.innerHTML = option.glyph ? icon(option.glyph) : "";
            return glyph;
          } }],
        }),
        search({ top: true, createPanel: editor => documentSearchPanel(editor, icon) }),
        keymap.of([
          shortcut("Mod-b", "bold"), shortcut("Mod-i", "italic"), shortcut("Mod-k", "link"),
          ...completionKeymap, ...markdownKeymap, ...defaultKeymap, ...historyKeymap,
          ...searchKeymap, ...foldKeymap, indentWithTab,
        ]),
        placeholder("Start writing…"),
        EditorView.contentAttributes.of({ "aria-label": "Document content", spellcheck: "true", tabindex: "0" }),
        EditorState.transactionFilter.of(tr => {
          if (tr.newDoc.length <= 200000) return tr;
          onError("Documents can contain up to 200,000 characters.");
          return [];
        }),
        EditorView.updateListener.of(update => { if (update.docChanged) onChange(update.state.doc.toString()); }),
        EditorView.domEventHandlers({
          focusin(event) {
            view.dispatch({ effects: focusEffect.of(true) });
            if (!event.target.closest(".document-editable-component")) focusedComponent = null;
          },
          focusout() { view.dispatch({ effects: focusEffect.of(false) }); },
          mousemove(event) {
            if (mode !== "live" || !event.target.closest(".cm-line")) return;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos == null) return;
            const word = view.state.wordAt(pos), previous = view.state.field(revealField).hover;
            if (previous && previous.from <= pos && previous.to >= pos) return;
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
              if (alive) view.dispatch({ effects: hoverEffect.of(word ? { from: word.from, to: word.to } : null) });
            }, 80);
          },
          paste(event) {
            // Cells copied from a spreadsheet become a table, on lines of its own.
            const rows = mode === "live" && spreadsheetRows(event.clipboardData?.getData("text/plain") || "");
            if (!rows) return false;
            event.preventDefault();
            const { from, to } = view.state.selection.main, doc = view.state.doc, start = doc.lineAt(from), end = doc.lineAt(to);
            const before = doc.sliceString(start.from, from).trim() ? "\n\n" : start.number > 1 && doc.line(start.number - 1).text.trim() ? "\n" : "";
            const after = doc.sliceString(to, end.to).trim() ? "\n\n" : end.number < doc.lines && doc.line(end.number + 1).text.trim() ? "\n" : "";
            const table = markdownTable(rows);
            view.dispatch({ changes: { from, to, insert: before + table + after }, selection: { anchor: from + before.length + table.length }, userEvent: "input.paste", scrollIntoView: true });
            return true;
          },
          mouseleave() {
            clearTimeout(hoverTimer);
            if (view.state.field(revealField).hover) view.dispatch({ effects: hoverEffect.of(null) });
          },
          click(event) {
            const link = event.target.closest("[data-document-ref]");
            if (link) { event.preventDefault(); onLink(link.dataset.documentRef); return true; }
            const comment = event.target.closest("[data-comment-thread]");
            if (comment) onComment?.(comment.dataset.commentThread);
          },
        }),
        commentField,
        presentation.of(liveExtensions()),
      ],
    }),
  });
  function format(command) {
    if (command === "undo") return undo(view);
    if (command === "redo") return redo(view);
    if (focusedComponent?.element.isConnected && focusedComponent.format(command)) return;
    const range = view.state.selection.main;
    const selected = view.state.sliceDoc(range.from, range.to);
    const listCallout = listCallouts.find((callout) => command === `list-${callout.name}`);
    if (listCallout) {
      const start = view.state.doc.lineAt(range.from).number, end = view.state.doc.lineAt(range.to).number;
      const changes = [];
      let caret = null;
      for (let n = start; n <= end; n++) {
        const line = view.state.doc.line(n), change = setListCallout(line.text, listCallout.char);
        changes.push({ from: line.from + change.from, to: line.from + change.to, insert: change.insert });
        if (range.empty) caret = line.from + change.insert.length + Math.max(0, range.from - line.from - change.to);
      }
      view.dispatch(caret === null ? { changes } : { changes, selection: { anchor: caret } });
      view.focus();
      return;
    }
    const wraps = { bold: ["**", "**"], italic: ["*", "*"], strike: ["~~", "~~"], highlight: ["==", "=="], code: ["`", "`"], link: ["[", "](https://)"], wiki: ["[[", "]]"], math: ["$", "$"] };
    if (wraps[command]) {
      const [before, after] = wraps[command], inside = selected || (command === "wiki" ? "" : "text");
      view.dispatch({ changes: { from: range.from, to: range.to, insert: before + inside + after }, selection: { anchor: range.from + before.length, head: range.from + before.length + inside.length } });
    } else {
      const inserts = {
        table: "|  |  |\n| --- | --- |\n|  |  |",
        codeblock: "```text\nCode\n```",
        mermaid: "```mermaid\nflowchart LR\n  Start --> Finish\n```",
        taskquery: "```tasks\nnot done\nsort by due\n```",
        callout: "> [!note] Note\n> Write your note.",
        footnote: "Text[^note]\n\n[^note]: Footnote text.",
        rule: "---",
      };
      if (inserts[command]) {
        const line = view.state.doc.lineAt(range.from);
        // A blank line after text above, which would otherwise take a divider as a heading underline.
        const gap = line.number > 1 && view.state.doc.line(line.number - 1).text.trim() ? "\n" : "", from = line.from + gap.length;
        view.dispatch({ changes: { from: line.from, insert: gap + inserts[command] + "\n\n" }, selection: { anchor: from } });
        // A new table starts empty, with the caret in its first cell (Live preview, not on touch).
        const first = command === "table" && view.dom.querySelector(`[data-component-from="${from}"] th`);
        if (first) return void focusOnOpen(first, view.contentDOM);
      } else {
        const prefix = command === "bullet" ? "- " : command === "number" ? "1. " : command === "check" ? "- [ ] " : command === "quote" ? "> " : /^h[1-6]$/.test(command) ? "#".repeat(Number(command[1])) + " " : "";
        const start = view.state.doc.lineAt(range.from).number, end = view.state.doc.lineAt(range.to).number;
        const changes = [];
        let caret = null;
        for (let n = start; n <= end; n++) {
          const line = view.state.doc.line(n);
          const existing = /^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s*)/.exec(line.text);
          const old = existing?.[0].length || 0;
          changes.push({ from: line.from, to: line.from + old, insert: prefix });
          // A caret keeps its place in the text, after the new prefix.
          if (range.empty) caret = line.from + prefix.length + Math.max(0, range.from - line.from - old);
        }
        view.dispatch(caret === null ? { changes } : { changes, selection: { anchor: caret } });
      }
    }
    view.focus();
  }
  return {
    view, format, hydrate,
    value: () => view.state.doc.toString(),
    focus: () => view.focus(),
    setComments: (ranges) => view.dispatch({ effects: commentsEffect.of(ranges) }),
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
      view.dispatch({ selection: EditorSelection.cursor(anchor), scrollIntoView: true });
      focusOnOpen(view.contentDOM, parent.closest("form")?.querySelector('[data-document-action="tools"]'));
    },
    insert(value) {
      if (focusedComponent?.element.isConnected && focusedComponent.insert(value)) return;
      view.dispatch(view.state.replaceSelection(value)); view.focus();
    },
    destroy() { alive = false; clearTimeout(hoverTimer); view.destroy(); },
    flush() { if (focusedComponent?.element.isConnected) focusedComponent.commit(); },
  };
}
