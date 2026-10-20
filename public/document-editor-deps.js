// Bundled locally for development; the production build shares these modules.
export { EditorState, EditorSelection, StateField, Compartment } from "@codemirror/state";
export { EditorView, Decoration, WidgetType, keymap, placeholder, drawSelection, highlightActiveLine, lineNumbers } from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
export { syntaxTree, syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
export { tags } from "@lezer/highlight";
export { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
export { languages } from "@codemirror/language-data";
export { search, searchKeymap, openSearchPanel, closeSearchPanel } from "@codemirror/search";
export { autocompletion, completionKeymap } from "@codemirror/autocomplete";
export { default as katex } from "katex";
export { default as markedFootnote } from "marked-footnote";
