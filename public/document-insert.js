import { listCallouts } from "./document-list-callouts.js";

// Elements the document Insert panel and the "/" menu both offer, in the same
// groups and order. [command, label, icon]; "attach" opens the file picker,
// everything else runs the editor's format command of the same name.
// Headings 2 and 3 and the list callouts are only in the "/" menu, where typing reaches them quickly.
export const insertCategories = [
  ["Structure", [["h1", "Heading 1", "heading"], ["h2", "Heading 2", "heading", true], ["h3", "Heading 3", "heading", true], ["bullet", "Bullet list", "list"], ["number", "Numbered list", "numbered"], ["check", "Checklist", "check"], ["quote", "Quote", "quote"], ["rule", "Divider", "minus"]]],
  ["Formatting", [["strike", "Strikethrough", "strike"], ["highlight", "Highlight", "highlight"], ["code", "Inline code", "code"]]],
  ["Components", [["table", "Table", "table"], ["callout", "Callout", "comment"], ["codeblock", "Code block", "codeblock"], ["math", "Math", "math"], ["mermaid", "Mermaid diagram", "tree"], ["taskquery", "Task query", "task"]]],
  ["References & files", [["wiki", "Document link", "link"], ["card", "Card from text", "task"], ["footnote", "Footnote", "footnote"], ["attach", "Attach file", "attachment"]]],
  ["List callouts", listCallouts.map((callout) => [`list-${callout.name}`, callout.label, callout.icon, true])],
];

// The Insert panel's items (without the "/"-only extras).
export const panelCategories = () => insertCategories.map(([title, items]) => [title, items.filter((item) => !item[3])]).filter(([, items]) => items.length);
