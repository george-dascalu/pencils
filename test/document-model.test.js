import test from "node:test";
import assert from "node:assert/strict";
import { documentHeadings, documentSection, documentReference, resolveDocument, resolveCard, obsidianDocumentURI } from "../public/document-model.js";

test("document references resolve stable vault paths and avoid ambiguous titles", () => {
  const a = { id: "d-a", file: "Projects/p-a/documents/d-a.md", title: "Brief" };
  const b = { id: "d-b", file: "Projects/p-a/documents/d-b.md", title: "Brief" };
  assert.equal(documentReference(a), "Projects/p-a/documents/d-a");
  assert.equal(resolveDocument("Projects/p-a/documents/d-a#Goals|Plan", [a, b]), a);
  assert.equal(resolveDocument("d-a.md", [a, b]), a);
  assert.equal(resolveDocument("Brief", [a, b]), null);
  assert.equal(resolveDocument("brief", [a]), a);
});

test("outline and heading transclusions ignore fenced code and include nested sections", () => {
  const text = "# One\nBody\n```md\n# Not a heading\n```\n## Child\nDetails\n# Two\nEnd";
  assert.deepEqual(documentHeadings(text).map(h => h.title), ["One", "Child", "Two"]);
  assert.equal(documentSection(text, "#One"), text.slice(0, text.indexOf("# Two")));
  assert.equal(documentSection(text, "#Child"), "## Child\nDetails\n");
  assert.equal(documentSection(text, "#Unknown"), "");
});

test("Obsidian URI opens the exact file and safely encodes device vault names and folders", () => {
  const record = { file: "Projects/p-a/documents/d-a.md" };
  const value = obsidianDocumentURI(record, { vault: "My & work #vault", folder: "Work notes/Pencils" });
  const url = new URL(value);
  assert.equal(url.protocol, "obsidian:");
  assert.equal(url.searchParams.get("vault"), "My & work #vault");
  assert.equal(url.searchParams.get("file"), "Work notes/Pencils/Projects/p-a/documents/d-a.md");
  assert.equal(obsidianDocumentURI(record, {}), "");
  assert.throws(() => obsidianDocumentURI(record, { vault: "Work", folder: "../../Other" }));
});
import { documentOutline } from "../public/document-model.js";
test("outline groups headings under their nearest ancestor, including skipped levels", () => {
  const tree = documentOutline("# Root\n### Child\n##### Deep\n## Sibling\n# Next\n```\n# Not a heading\n```");
  assert.deepEqual(tree.map(h => h.title), ["Root", "Next"]);
  assert.deepEqual(tree[0].children.map(h => h.title), ["Child", "Sibling"]);
  assert.equal(tree[0].children[0].children[0].title, "Deep");
});

test("card mentions resolve by key, an older key, id or alias", () => {
  const card = { id: "t-1", key: "WEB-12", aliases: ["WEB-12", "Fix login", "OLD-3"], title: "Fix login" };
  const tasks = [card, { id: "t-2", key: "WEB-13", aliases: ["WEB-13", "Other"], title: "Other" }];
  assert.equal(resolveCard("WEB-12", tasks), card);
  assert.equal(resolveCard("web-12|the login fix", tasks), card);
  assert.equal(resolveCard("OLD-3", tasks), card);
  assert.equal(resolveCard("Projects/p-a/tasks/t-1.md", tasks), card);
  assert.equal(resolveCard("fix login", tasks), card, "titles resolve through aliases, as in Obsidian");
  assert.equal(resolveCard("Missing", tasks), null);
  assert.equal(resolveCard("", tasks), null);
});
