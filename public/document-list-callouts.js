// List callouts, as in Obsidian's List Callouts plugin: a list item whose text starts
// with one of these characters and a space ("- ! Ship it", "- [ ] ? Ask"). The character
// stays in the Markdown, so the file reads as a plain list elsewhere.
export const listCallouts = [
  { char: "!", name: "important", label: "Important", icon: "warning" },
  { char: "?", name: "question", label: "Question", icon: "help" },
  { char: "&", name: "bookmark", label: "Bookmark", icon: "flag" },
  { char: "~", name: "idea", label: "Idea", icon: "idea" },
  { char: "@", name: "person", label: "Person", icon: "person" },
  { char: "$", name: "cost", label: "Cost", icon: "cost" },
  { char: "%", name: "aside", label: "Aside", icon: "quote" },
];

// `text` follows the list marker. Returns the callout and the character's offset in `text`.
export function listCalloutAfterMarker(text) {
  const match = /^[ \t]+(?:\[[ xX]\][ \t]+)?([!?&~@$%])[ \t]/.exec(text);
  return match ? { callout: listCallouts.find((c) => c.char === match[1]), offset: match[0].length - 2 } : null;
}

// The change that gives a line this callout: replaces its callout, or turns the line
// (dropping a heading or quote marker) into a list item.
export function setListCallout(line, char) {
  const match = /^(\s*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)(?:[!?&~@$%][ \t])?/.exec(line);
  if (match) return { from: 0, to: match[0].length, insert: `${match[1]}${char} ` };
  return { from: 0, to: /^(?:#{1,6}\s+|>\s*)?/.exec(line)[0].length, insert: `- ${char} ` };
}

// A checklist item's accessible name: "Question: Ask legal" for "? Ask legal".
export function listCalloutLabel(text) {
  const match = /^([!?&~@$%])\s+/.exec(text);
  const callout = match && listCallouts.find((c) => c.char === match[1]);
  return callout ? `${callout.label}: ${text.slice(match[0].length)}` : text;
}
