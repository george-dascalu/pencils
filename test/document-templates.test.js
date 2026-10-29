import test from "node:test";
import assert from "node:assert/strict";
import { formatDate, templatePrompts, expandTemplate, templateDocuments } from "../public/document-templates.js";

const now = new Date(2026, 9, 9, 7, 5, 3); // Friday 9 October 2026, 07:05:03

test("dates and times use moment-style tokens, with [literal] text", () => {
  assert.equal(formatDate(now, "YYYY-MM-DD"), "2026-10-09");
  assert.equal(formatDate(now, "dddd D MMMM YY"), "Friday 9 October 26");
  assert.equal(formatDate(now, "ddd, MMM D [at] HH:mm:ss"), "Fri, Oct 9 at 07:05:03");
});

test("variables fill in, prompts are listed once, and the caret goes to {{cursor}}", () => {
  const body = "# {{title}}\n{{project}} · {{date}} {{time}} · {{date:D MMMM}}\nWith {{prompt:Who}} ({{prompt:Who}}), {{prompt:Where}}\n\n{{cursor}}\n{{unknown}}";
  assert.deepEqual(templatePrompts(body), ["Who", "Where"]);
  const result = expandTemplate(body, { title: "Standup", project: "Web", now, answers: { Who: "Sam", Where: "Online" } });
  assert.equal(result.body, "# Standup\nWeb · 2026-10-09 07:05 · 9 October\nWith Sam (Sam), Online\n\n\n{{unknown}}");
  assert.equal(result.cursor, result.body.indexOf("\n\n\n") + 2);
  assert.equal(expandTemplate("No caret", {}).cursor, null);
});

test("templates are the documents in a folder named Templates, or inside one", () => {
  const folders = [{ id: "f-t", title: "templates", parent: null }, { id: "f-m", title: "Meetings", parent: "f-t" }, { id: "f-o", title: "Other", parent: null }];
  const docs = [{ id: "a", folder: "f-t" }, { id: "b", folder: "f-m" }, { id: "c", folder: "f-o" }, { id: "d" }];
  assert.deepEqual(templateDocuments(docs, folders).map((d) => d.id), ["a", "b"]);
});

test("the caret comes from the template, not from a title or answer that contains {{cursor}}, and long prompts are asked", () => {
  const question = "What should this meeting decide before the end of the quarter, in one sentence?";
  const body = `# {{title}}\n{{prompt:${question}}}\n{{cursor}}\nEnd`;
  assert.deepEqual(templatePrompts(body), [question]);
  const result = expandTemplate(body, { title: "Notes {{cursor}}", answers: { [question]: "Ship {{cursor}}" } });
  assert.equal(result.body, "# Notes {{cursor}}\nShip {{cursor}}\n\nEnd");
  assert.equal(result.cursor, result.body.indexOf("\n\nEnd") + 1);
});
