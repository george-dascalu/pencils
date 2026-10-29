// Bundled locally for development; the production build shares these modules.
export { EditorState, EditorSelection, StateEffect, StateField, Compartment } from "@codemirror/state";
export { EditorView, Decoration, WidgetType, keymap, placeholder, drawSelection, highlightActiveLine, lineNumbers } from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
export { syntaxTree, syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap, bracketMatching, LanguageDescription } from "@codemirror/language";
export { tags, highlightTree, classHighlighter } from "@lezer/highlight";
export { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
export { languages } from "@codemirror/language-data";
export { search, searchKeymap, openSearchPanel, closeSearchPanel, SearchQuery, getSearchQuery, setSearchQuery, findNext, findPrevious, selectMatches, replaceNext, replaceAll } from "@codemirror/search";
export { autocompletion, completionKeymap } from "@codemirror/autocomplete";
export { default as katex } from "katex";
export { default as markedFootnote } from "marked-footnote";
