import test from "node:test";
import assert from "node:assert/strict";
import { makeAnchor, locateAnchor, threadRoots, documentThreads, validComment } from "../public/document-comments.js";

const body = "Plan the launch. Then plan the launch party.\nAfter that, rest.";

test("an anchor finds its text again by the words around it, after edits elsewhere", () => {
  const second = body.indexOf("plan the launch");
  const anchor = makeAnchor(body, second, second + "plan the launch".length);
  assert.deepEqual(anchor, { quote: "plan the launch", prefix: "Plan the launch. Then ", suffix: " party.\nAfter that, rest." });
  assert.deepEqual(locateAnchor(body, anchor), { from: second, to: second + 15 });
  const edited = `Intro.\n${body}`;
  assert.deepEqual(locateAnchor(edited, anchor), { from: second + 7, to: second + 22 });
  assert.equal(locateAnchor("Nothing here", anchor), null, "a quote that's gone leaves the comment detached");
  assert.equal(makeAnchor("x".repeat(900), 0, 900).quote.length, 500, "long selections keep their first 500 characters");
});

test("replies belong to the thread their first comment started", () => {
  const comments = [
    { id: "a", text: "Root", anchor: { quote: "rest" } },
    { id: "b", text: "Reply", replyTo: "a" },
    { id: "c", text: "Reply to reply", replyTo: "b" },
    { id: "d", text: "Other", anchor: { quote: "missing" } },
  ];
  assert.deepEqual([...threadRoots(comments)], [["a", "a"], ["b", "a"], ["c", "a"], ["d", "d"]]);
  assert.equal(threadRoots([{ id: "x", replyTo: "y" }, { id: "y", replyTo: "x" }]).size, 2, "a cycle from a hand edit still ends");
  assert.deepEqual(documentThreads(body, comments).map(({ id, range, comments: list }) => [id, range, list.length]), [
    ["a", { from: body.indexOf("rest"), to: body.indexOf("rest") + 4 }, 3],
    ["d", null, 1],
  ]);
});

test("comments save in the document's frontmatter, are checked, and don't count as a new version", async (t) => {
  const { Store } = await import("../server/store.js");
  const fs = await import("node:fs/promises"), os = await import("node:os"), path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-doc-comments-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Comments" });
  let doc = await store.createDocument(project.id, { title: "Plan", body: "Some text" });
  const comment = { id: "comment-1", author: "Ana", text: "Why?", format: "markdown", created: "2026-10-29T10:00:00.000Z", anchor: makeAnchor(doc.body, 5, 9) };
  doc = await store.updateDocument(project.id, doc.id, { ...doc, comments: [comment] });
  assert.equal(doc.comments[0].anchor.quote, "text");
  assert.equal(doc.version, 1, "a comment isn't a new version of the page");
  assert.match(await fs.readFile(path.join(root, doc.file), "utf8"), /^comments:\n {2}- id: comment-1$/m);
  for (const comments of ["x", [{ ...comment, id: "" }], [{ ...comment, anchor: { quote: "x".repeat(501) } }], [{ ...comment, text: 5 }], [null]])
    await assert.rejects(store.updateDocument(project.id, doc.id, { ...doc, comments }), (error) => error.status === 400, JSON.stringify(comments).slice(0, 40));
  // A text save sends the record's comments back unchanged, whatever Obsidian left there.
  const file = path.join(root, doc.file);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace(/comments:\n(?: .*\n)+/, "comments: see the margin\n"));
  doc = await store.getDocument(project.id, doc.id);
  doc = await store.updateDocument(project.id, doc.id, { ...doc, body: "Some text, edited" });
  assert.equal(doc.body, "Some text, edited");
  assert.equal(doc.comments, "see the margin");
});

test("only well-formed comments count, so an Obsidian edit can't break the document", () => {
  const good = { id: "a", author: "Ana", text: "Why?", anchor: { quote: "rest", prefix: "", suffix: "" } };
  assert.equal(validComment(good), true);
  assert.equal(validComment({ ...good, anchor: undefined }), true, "replies have no anchor");
  for (const bad of [null, "text", { ...good, id: "" }, { ...good, text: 5 }, { ...good, anchor: { quote: 5 } }, { ...good, anchor: null }, { ...good, anchor: { quote: "rest", prefix: null } }, { ...good, anchor: { quote: "rest", suffix: 5 } }])
    assert.equal(validComment(bad), false, JSON.stringify(bad));
});
