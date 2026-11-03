import { documentSearchPanel } from "./document-search.js";
import {
  EditorState, EditorSelection, StateEffect, StateField, Compartment, EditorView, Decoration, WidgetType,
  keymap, placeholder, highlightActiveLine, lineNumbers,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, isolateHistory,
  syntaxTree, syntaxHighlighting, HighlightStyle, tags, foldGutter, foldKeymap, bracketMatching,
  markdown, markdownKeymap, markdownLanguage, languages, search, searchKeymap, openSearchPanel, closeSearchPanel,
  autocompletion, completionKeymap,
} from "/vendor/editor/deps.js";
import { documentReference } from "./document-model.js";
import { editableDocumentComponent, documentComponentChange } from "./document-components.js";
import { focusOnOpen } from "./open-focus.js";
import { spreadsheetRows, markdownTable } from "./document-tables.js";
import { insertCategories } from "./document-insert.js";
import { highlightCodeBlocks, releaseCodeHighlights } from "./document-code.js";
import { listCallouts, listCalloutAfterMarker, setListCallout, listCalloutLabel } from "./document-list-callouts.js";
import { colorSelection, textColorSpans, inlineWrapChange } from './document-text-color.js';
import { documentSelectionTools } from './document-selection-tools.js';
import { installDocumentWebLinks, webURL } from './document-web-links.js';
import { DOCUMENT_CHARACTERS, documentEditAllowed, documentBlockCache, documentRangeIndex } from './document-performance.js';
import { editableDocumentTable } from './document-inline-table.js';
import { incrementalDocumentParagraphs } from './document-language.js';

export function markdownDocumentEditor({ parent, text, mode = "live", renderer, documents, cards = () => [], hidden = [], taskQueries, onChange, onError, onLink, onInsert, onComment, onSketch, icon, panel, toast, colorPicker, tableLayouts }) {
  const presentation = new Compartment();
  const language = new Compartment();
  const paragraphLanguage = incrementalDocumentParagraphs();
  let view, alive = true, focusedComponent = null, selectionTools = null, selecting = false;
  const readingTables = new Set();
  const hoverEffect = StateEffect.define();
  const blocks = documentBlockCache(source => renderer.tokens(source));
  let baseDecorations = Decoration.none, cachedDocument = null, cachedSource = '';
  const linkURLs = new Map();
  function sourceText(state) { if(cachedDocument!==state.doc){cachedDocument=state.doc;cachedSource=state.doc.toString();}return cachedSource; }
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
    if (selecting || !state.selection.main.empty) return false;
    const { hover, focused } = state.field(revealField);
    return (focused && state.selection.ranges.some(r => r.from <= to && r.to >= from)) ||
      (hover && hover.from < to && hover.to > from);
  };
  function hydrate(element) {
    if(element.classList.contains('document-reading')){
      for(const table of element.querySelectorAll('table[data-document-table-id]')){
        const token=renderer.tableToken(table);if(!token)continue;
        const wrapper=document.createElement('div');wrapper.className='document-reading-table';table.before(wrapper);wrapper.append(table);
        readingTables.add(editableDocumentTable({element:wrapper,token,renderer,readOnly:true,field(){},fields:[],markdown:node=>node.innerHTML,pipe:/(?<=(?<!\\)(?:\\\\)*)\|/,icon,commit(){},activate(){},requestMeasure(){},onError, onPage:root=>{renderer.hydrate?.(root);highlightCodeBlocks(root);} }));
      }
    }
    renderer.hydrate?.(element);
    highlightCodeBlocks(element);
    if (element.querySelector("[data-document-task-query]")) taskQueries?.(element);
    if (element.querySelector("[data-document-diagram]"))
      import("/vendor/editor/diagrams.js").then(m => alive && m.renderDiagrams(element)).catch(() => {});
  }
  class Preview extends WidgetType {
    constructor(raw, from, block = false, kind = null) { super(); this.raw = raw; this.from = from; this.block = block; this.kind = kind; }
    eq(other) { return this.raw === other.raw && this.from === other.from && this.block === other.block && this.kind === other.kind; }
    updateDOM(element) {
      if (element.documentComponent) { const same=element.dataset.componentType===this.kind&&!!element.documentComponent.update(this.from,this.raw);if(!same)this.tablePage=element.documentComponent.tablePage?.();return same; }
      if (element.documentPreviewRaw !== this.raw) return false;
      element.documentPreviewFrom = this.from;
      return true;
    }
    toDOM(editor) {
      const element = document.createElement(this.block ? "div" : "span");
      element.className = this.block ? "document-block-preview document-prose" : "document-inline-preview";
      element.documentPreviewRaw = this.raw;
      element.documentPreviewFrom = this.from;
      element.innerHTML = renderer.render(this.raw, !this.block, true);
      if (["table", "blockquote", "code", "documentMathBlock", "html"].includes(this.kind)) {
        editableDocumentComponent({
          element, tableLayouts, raw: this.raw, from: this.from, kind: this.kind, editor, renderer, onError, hydrate, icon, panel, toast, onLink,
          tablePage:this.tablePage,
          onSearch: () => openSearchPanel(editor),
          onEscape: () => selectionTools?.escape() || false,
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
        if (e.target.closest('.document-transclusion')) return;
        // A sketch opens in the sketch pad instead of revealing its Markdown.
        const sketch = e.target.closest("img[data-document-sketch]");
        if (sketch) { e.preventDefault(); onSketch?.(sketch.dataset.documentSketch); return; }
        if (e.target.closest("a,button,input,summary")) return;
        e.preventDefault();
        editor.dispatch({ selection: { anchor: element.documentPreviewFrom }, scrollIntoView: true });
        editor.focus();
      });
      }
      hydrate(element);
      return element;
    }
    destroy(element) { releaseCodeHighlights(element); element.documentComponent?.destroy?.(); }
    ignoreEvent(event) { return this.block || !!event.target?.closest?.("a, img[data-document-sketch], .document-transclusion"); }
  }
  class Checkbox extends WidgetType {
    constructor(checked, from) { super(); this.checked = checked; this.from = from; }
    eq(other) { return this.checked === other.checked && this.from === other.from; }
    toDOM(editor) {
      const target = document.createElement("label"), input = document.createElement("input");
      target.className = "document-checkbox-target";
      target.append(input);
      input.type = "checkbox"; input.checked = this.checked; input.className = "document-checkbox";
      input.setAttribute("aria-label", listCalloutLabel(editor.state.doc.lineAt(this.from).text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "")) || "Checklist item");
      target.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
      const save = () => editor.dispatch({ changes: { from: this.from, to: this.from + 3, insert: input.checked ? "[x]" : "[ ]" } });
      input.addEventListener("change", save);
      // A tap toggles the box without focusing the editor: iOS places a caret
      // and opens the keyboard when the tap completes. Cancelling touchend
      // stops that (and the click); a touch that moves stays a scroll.
      let tap = null;
      target.addEventListener("touchstart", e => {
        tap = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      }, { passive: true });
      target.addEventListener("touchmove", e => {
        const t = e.touches[0];
        if (tap && (!t || Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10)) tap = null;
      }, { passive: true });
      target.addEventListener("touchcancel", () => { tap = null; });
      target.addEventListener("touchend", e => {
        if (!tap) return;
        tap = null;
        e.preventDefault();
        input.checked = !input.checked;
        save();
      });
      return target;
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
    create: state => { baseDecorations = decorate(state); return reveal(state); },
    update(value, tr) {
      const syntaxChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
      if (tr.docChanged || tr.reconfigured || syntaxChanged) baseDecorations = decorate(tr.state, tr);
      return tr.docChanged || tr.selection || tr.reconfigured || syntaxChanged || tr.effects.some(e => e.is(hoverEffect) || e.is(focusEffect)) ? reveal(tr.state) : value;
    },
    provide: field => EditorView.decorations.from(field),
  });
  function reveal(state) {
    const { hover, focused } = state.field(revealField);
    if (selecting || !state.selection.main.empty || !hover && !focused) return baseDecorations;
    const areas = [...(hover ? [hover] : []), ...(focused ? state.selection.ranges : [])];
    if (!areas.length) return baseDecorations;
    let from = Math.min(...areas.map(r => state.doc.lineAt(r.from).from)), to = Math.max(...areas.map(r => state.doc.lineAt(r.to).to));
    for (const area of areas) for (let node = syntaxTree(state).resolveInner(area.from, 1); node; node = node.parent)
      if (/Emphasis|Code|Link|Heading|Strikethrough/.test(node.name)) { from = Math.min(from, node.from); to = Math.max(to, node.to); }
    return baseDecorations.update({ filterFrom: from, filterTo: to, filter: (_a,_b,decoration) => !decoration.spec.reveal || !active(state, ...decoration.spec.reveal) });
  }
  function decorate(state, tr) {
    const ranges = [], blocked = [], nativeLinks = [];
    const source = sourceText(state), changes = [];
    tr?.changes.iterChangedRanges((fromA,toA,fromB,toB) => changes.push({fromA,toA,fromB,toB}));
    // Block widgets are state decorations, so CodeMirror can measure their height.
    const component = tr?.effects.find(effect=>effect.is(documentComponentChange))?.value;
    for (const { token, from, to } of blocks(source, changes, component)) {
      if (["code", "table", "documentTableLayout", "documentRichTable", "blockquote", "documentMathBlock", "html", "hr"].includes(token.type) ||
          token.type === "paragraph" && /^!\[\[[^\]\n]+\]\]\s*$/.test(token.raw)) {
        {
          let end = to;
          while (end > from && source[end - 1] === "\n") end--;
          if (end > from) {
            // A table with its layout comment is edited as a table.
            const kind = ["documentTableLayout", "documentRichTable"].includes(token.type) ? "table" : token.type;
            ranges.push(Decoration.replace({ widget: new Preview(token.raw, from, true, kind), block: true }).range(from, end));
            blocked.push([from, to]);
          }
        }
      }
    }
    const blockIndex = documentRangeIndex(blocked);
    const hidden = (from, to) => blockIndex.overlaps(from,to);
    for (const span of textColorSpans(source)) {
      if (hidden(span.from, span.to)) continue;
      let code = false;
      for (let node = syntaxTree(state).resolveInner(span.from, 1); node; node = node.parent) if (/Code/.test(node.name)) code = true;
      if (code) continue;
      ranges.push(Decoration.replace({}).range(span.from, span.contentFrom));
      ranges.push(Decoration.replace({}).range(span.contentTo, span.to));
      if (span.contentFrom < span.contentTo) ranges.push(Decoration.mark({ class: 'document-text-color', attributes: { style: `color: ${span.color}` } }).range(span.contentFrom, span.contentTo));
    }
    syntaxTree(state).iterate({
      enter(node) {
        if (blockIndex.encloses(node.from,node.to)) return false;
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
        const reveal = [span.from, span.to];
        if (name === "Escape" && source[node.from] === "\\")
          ranges.push(Decoration.replace({reveal}).range(node.from, node.from + 1));
        if (["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark"].includes(name)) {
          // A heading's opening "#" hides with the space after it, so heading
          // text starts at the same edge as paragraphs.
          const opening = name === "HeaderMark" && /^\s*$/.test(source.slice(state.doc.lineAt(node.from).from, node.from));
          const end = opening && /[ \t]/.test(source[node.to] || "") ? node.to + 1 : node.to;
          ranges.push(Decoration.replace({reveal}).range(node.from, end));
        }
        if (name === "TaskMarker") {
          ranges.push(Decoration.replace({ reveal, widget: new Checkbox(source[node.from + 1].toLowerCase() === "x", node.from) }).range(node.from, node.to));
          return false;
        }
        if (["Link", "Image", "Autolink"].includes(name)) {
          // The parser reads the inside of a "[[…]]" wiki link as a link; the wiki link is handled below.
          if (/^\[\[[^\]\n]+\]\]$/.test(source.slice(node.from - 1, node.to + 1)) || /^!\[\[[^\]\n]+\]\]/.test(source.slice(node.from, node.to + 1))) return false;
          const raw=source.slice(node.from,node.to),simple=name==='Link'&&/^\[([^\]\n<>$%=]+)\]\((https?:\/\/[^()\s]+)\)$/.exec(raw);
          if(simple){
            if(!linkURLs.has(simple[2])){linkURLs.set(simple[2],webURL(simple[2]));if(linkURLs.size>8192)linkURLs.delete(linkURLs.keys().next().value);}
            const href=linkURLs.get(simple[2]);
            if(href){const from=node.from+1,to=from+simple[1].length;
              nativeLinks.push([node.from,node.to]);
              ranges.push(Decoration.replace({reveal}).range(node.from,from),Decoration.mark({reveal,tagName:'a',class:'document-inline-link',attributes:{href,target:'_blank',rel:'noopener noreferrer'}}).range(from,to),Decoration.replace({reveal}).range(to,node.to));
              return;
            }
          }
          ranges.push(Decoration.replace({ reveal, widget: new Preview(source.slice(node.from, node.to), node.from) }).range(node.from, node.to));
          return false;
        }
      },
    });
    const widgets = documentRangeIndex([...nativeLinks,...ranges.filter(r => r.value.widget).map(r => [r.from,r.to])]);
    // Obsidian extensions which are outside the CommonMark syntax tree.
    const extensions = /!?\[\[[^\]\n]+\]\]|==[^\n]+?==|%%[\s\S]*?%%|\$(?!\s|\$)(?:\\.|[^$\n])+?\$|\[\^[^\]\n]+\]/g;
    for (const match of source.matchAll(extensions)) {
      const from = match.index, to = from + match[0].length;
      const node = syntaxTree(state).resolveInner(from, 1);
      let code = false;
      for (let n = node; n; n = n.parent) if (/Code|HTML/.test(n.name)) code = true;
      if (code || hidden(from, to)) continue;
      const reveal = [from,to];
      if (match[0].startsWith('==')) {
        ranges.push(Decoration.replace({reveal}).range(from, from + 2));
        ranges.push(Decoration.mark({ reveal, class: 'document-highlight-text' }).range(from + 2, to - 2));
        ranges.push(Decoration.replace({reveal}).range(to - 2, to));
        continue;
      }
      // Do not add overlapping replacements for standard Markdown links.
      if (widgets.overlaps(from,to)) continue;
      ranges.push(Decoration.replace({ reveal, widget: new Preview(match[0], from) }).range(from, to));
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
      if (["attach", "card", "comment", "sketch", "embed", "table"].includes(command)) onInsert?.(command);
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
  const liveExtensions = () => mode === 'live' ? [previewField, highlightActiveLine()] : mode === 'source' ? [lineNumbers(), highlightActiveLine()] : [];
  // Editable widgets own their table/code internals. Parsing them again in the
  // hidden Markdown layer makes a single cell edit walk the complete table.
  const languageExtensions = () => mode === 'reading' ? [] : markdown({ base: markdownLanguage, codeLanguages: mode === 'source' ? languages : [], extensions: mode === 'live' ? [{remove:['Table']},paragraphLanguage] : [] });
  const shortcut = (key, command) => ({ key, run: () => { format(command); return true; } });
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        revealField, history(), bracketMatching(), EditorView.lineWrapping,
        language.of(languageExtensions()), syntaxHighlighting(HighlightStyle.define([
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
        search({ top: true, createPanel: editor => documentSearchPanel(editor, icon,(from,to)=>{for(const cell of editor.dom.querySelectorAll('.document-table-find-current'))cell.classList.remove('document-table-find-current');if(from!==null)for(const component of editor.dom.querySelectorAll('.document-editable-component'))component.documentComponent?.revealMatch(from,to);}) }),
        keymap.of([
          shortcut("Mod-b", "bold"), shortcut("Mod-i", "italic"), shortcut("Mod-k", "link"),
          ...completionKeymap, { key: 'Escape', run: () => selectionTools?.escape() || false }, ...markdownKeymap, ...defaultKeymap, ...historyKeymap,
          ...searchKeymap, ...foldKeymap, indentWithTab,
        ]),
        placeholder("Start writing…"),
        EditorView.contentAttributes.of({ "aria-label": "Document content", spellcheck: "true", tabindex: "0" }),
        EditorState.transactionFilter.of(tr => {
          if (documentEditAllowed(tr.startState.doc.length, tr.newDoc.length)) return tr;
          onError(`Documents can contain up to ${DOCUMENT_CHARACTERS.toLocaleString('en-GB')} characters.`);
          return [];
        }),
        EditorView.updateListener.of(update => { if (update.docChanged) { const changes=[];update.changes.iterChangedRanges((fromA,toA,fromB,toB)=>changes.push({fromA,toA,fromB,toB}));onChange(sourceText(update.state),changes); } selectionTools?.update({ selectionChanged: update.selectionSet }); }),
        EditorView.domEventHandlers({
          mousedown(event) { if(event.target.closest('.document-inline-link')){event.preventDefault();return true;} },
          focusin(event) {
            view.dispatch({ effects: focusEffect.of(true) });
            if (!event.target.closest(".document-editable-component")) focusedComponent = null;
          },
          focusout() { view.dispatch({ effects: focusEffect.of(false) }); },
          mousemove(event) {
            if (mode !== "live" || selecting || !view.state.selection.main.empty || !event.target.closest(".cm-line")) return;
            if(event.target.closest('.document-inline-link')){clearTimeout(hoverTimer);return;}
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
            const external=event.target.closest('a.document-inline-link');
            if(external&&!event.ctrlKey&&!event.metaKey&&event.button===0){event.preventDefault();window.open(external.href,'_blank','noopener,noreferrer');return true;}
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
  const selectionLife = new AbortController();
  parent.addEventListener('document-embed-resize', () => view.requestMeasure(), { signal: selectionLife.signal });
  view.dom.addEventListener('mousedown', () => {
    selecting = true; clearTimeout(hoverTimer); view.dispatch({ effects: hoverEffect.of(null) });
  }, { signal: selectionLife.signal });
  document.addEventListener('mouseup', () => { if (selecting) { selecting = false; view.dispatch({ effects: hoverEffect.of(null) }); } }, { signal: selectionLife.signal });
  function selectionInfo() {
    const component = focusedComponent?.element.isConnected && focusedComponent.selectionInfo();
    if (component) return component;
    const range = view.state.selection.main;
    if (range.empty) return null;
    const start = view.domAtPos(range.from), end = view.domAtPos(range.to), native = document.createRange();
    native.setStart(start.node, start.offset); native.setEnd(end.node, end.offset);
    const formats = {}; let plain = false;
    for (let node = syntaxTree(view.state).resolveInner(range.from, 1); node; node = node.parent) {
      if (node.to < range.to) continue;
      if (node.name === 'StrongEmphasis') formats.bold = true;
      if (node.name === 'Emphasis') formats.italic = true;
      if (node.name === 'Strikethrough') formats.strike = true;
      if (node.name === 'InlineCode') formats.code = true;
      if (/^(FencedCode|IndentedCode|CodeBlock)$/.test(node.name)) plain = true;
    }
    const source = sourceText(view.state);
    formats.highlight = [...source.matchAll(/==[^\n]+?==/g)].some(m => m.index + 2 <= range.from && m.index + m[0].length - 2 >= range.to);
    const color = textColorSpans(source).filter(s => s.contentFrom <= range.from && s.contentTo >= range.to).at(-1)?.color;
    return { range: native, rect: view.coordsAtPos(range.head) || native.getBoundingClientRect(), formats, color, plain };
  }
  if (colorPicker) selectionTools = documentSelectionTools({ view, icon, colorPicker, selected: selectionInfo, format });
  function format(command, value, { focus = true } = {}) {
    if (command === "table" && onInsert) { onInsert("table"); return; }
    if (command === "undo") return undo(view);
    if (command === "redo") return redo(view);
    if (focusedComponent?.element.isConnected && focusedComponent.format(command, value, { focus })) return;
    const range = view.state.selection.main;
    const selected = view.state.sliceDoc(range.from, range.to);
    if (command === 'color') {
      const source = sourceText(view.state), protectedRanges = []; let offset = 0;
      for (const token of renderer.tokens(source)) {
        const end = offset + token.raw.length;
        if (["code", "table", "documentTableLayout", "documentRichTable", "blockquote", "documentMathBlock", "html", "hr"].includes(token.type)) protectedRanges.push([offset, end]);
        offset = end;
      }
      // Keep inline syntax outside colour spans, even when selection starts or ends inside a style.
      // This also leaves link destinations, escapes and code literal when colouring across them.
      syntaxTree(view.state).iterate({ enter(node) {
        if (protectedRanges.some(([a, b]) => a <= node.from && b >= node.to)) return false;
        if (/^(EmphasisMark|StrikethroughMark|LinkMark|LinkTitle|URL|InlineCode|Image|Autolink|Escape|HTMLTag)$/.test(node.name)) {
          protectedRanges.push([node.from, node.to]); return false;
        }
      } });
      for (const match of source.matchAll(/==[^\n]+?==/g)) protectedRanges.push([match.index, match.index + 2], [match.index + match[0].length - 2, match.index + match[0].length]);
      const change = colorSelection(source, range.from, range.to, value, protectedRanges);
      if (change) view.dispatch({ changes: { from: change.from, to: change.to, insert: change.insert }, selection: { anchor: change.anchor, head: change.head }, userEvent: 'input.format', annotations: isolateHistory.of('full') });
      if (focus) view.focus();
      return;
    }
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
      if (focus) view.focus();
      return;
    }
    const wraps = { bold: ["**", "**"], italic: ["*", "*"], strike: ["~~", "~~"], highlight: ["==", "=="], code: ["`", "`"], link: ["[", "](https://)"], wiki: ["[[", "]]"], math: ["$", "$"] };
    if (wraps[command]) {
      const [before, after] = wraps[command];
      const change = ['bold','italic','strike','highlight','code'].includes(command) ? inlineWrapChange(sourceText(view.state), range.from, range.to, before, after) : null;
      const inside = selected || (command === 'wiki' ? '' : 'text');
      view.dispatch(change ? { changes: { from: change.from, to: change.to, insert: change.insert }, selection: { anchor: change.anchor, head: change.head }, userEvent: 'input.format', annotations: isolateHistory.of('full') } : { changes: { from: range.from, to: range.to, insert: before + inside + after }, selection: { anchor: range.from + before.length, head: range.from + before.length + inside.length } });
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
    if (focus) view.focus();
  }
  const removeWebLinks = installDocumentWebLinks(view, position => {
    for (let node = syntaxTree(view.state).resolveInner(position, 1); node; node = node.parent) {
      if (!['Link', 'Autolink'].includes(node.name)) continue;
      const content = document.createElement('div');
      content.innerHTML = renderer.render(view.state.doc.sliceString(node.from, node.to), true);
      return webURL(content.querySelector('a')?.getAttribute('href'));
    }
    return null;
  });
  return {
    view, format, hydrate,
    value: () => sourceText(view.state),
    focus: () => view.focus(),
    setComments: (ranges) => view.dispatch({ effects: commentsEffect.of(ranges) }),
    find: () => { openSearchPanel(view); },
    escape: () => closeSearchPanel(view),
    setMode(next) {
      for(const table of readingTables)table.destroy();readingTables.clear();
      const changed=mode!==next;
      mode = next;
      if(changed)view.dispatch({ effects: [language.reconfigure(languageExtensions()),presentation.reconfigure(liveExtensions())] });
      view.contentDOM.setAttribute("aria-label", mode === "source" ? "Document Markdown" : "Document content");
      parent.dataset.mode = next;
      view.requestMeasure();
    },
    jump(from) {
      const anchor = Math.max(0, Math.min(from, view.state.doc.length));
      view.dispatch({ selection: EditorSelection.cursor(anchor), scrollIntoView: true });
      focusOnOpen(view.contentDOM, parent.closest("form")?.querySelector('[data-document-action="tools"]'));
    },
    insert(value, { block = false, focus = true } = {}) {
      if (!block && focusedComponent?.element.isConnected && focusedComponent.insert(value)) return;
      if (block) {
        let { from, to } = view.state.selection.main;
        if (focusedComponent?.element.isConnected) { focusedComponent.commit(); from = to = focusedComponent.end(); }
        const source = sourceText(view.state), before = source.slice(0, from), after = source.slice(to);
        const prefix = before.endsWith('\n\n') || !before ? '' : before.endsWith('\n') ? '\n' : '\n\n';
        const suffix = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
        const insert = prefix + value + suffix;
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input', annotations: isolateHistory.of('full') });
      } else view.dispatch(view.state.replaceSelection(value));
      if (focus) view.focus();
    },
    destroy() { alive = false;for(const table of readingTables)table.destroy();readingTables.clear(); clearTimeout(hoverTimer); removeWebLinks(); selectionTools?.destroy(); selectionLife.abort(); view.destroy(); },
    flush() { if (focusedComponent?.element.isConnected) focusedComponent.commit(); },
  };
}
