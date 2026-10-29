import test from "node:test";
import assert from "node:assert/strict";
import { plainMentions, linkMentions, unlinkedMentions, cardMentions } from "../public/document-mentions.js";

const texts = (body, name) => plainMentions(body, name).map((m) => body.slice(m.index, m.index + m.length));

test("plain mentions match whole words in any case and skip links, code and comments", () => {
  const body = "Brief notes. See [[Brief]], `Brief`, [Brief](x) and %%Brief%%.\n```\nBrief\n```\nBriefing differs; brief again.";
  assert.deepEqual(texts(body, "Brief"), ["Brief", "brief"]);
  assert.deepEqual(texts("Fix WEB-12 today, not WEB-123.", "WEB-12"), ["WEB-12"]);
  assert.deepEqual(texts("ab ab", "ab"), [], "names under three characters are ignored");
  assert.deepEqual(texts("_Brief_ and **Brief**", "Brief"), ["Brief", "Brief"], "emphasis still counts");
});

test("code, math, URLs, addresses and tags are not mentions", () => {
  const body = "````\nBrief\n```\nBrief\n````\n``a Brief b`` $Brief$ https://x.com/brief brief@x.com #brief a/brief Brief";
  assert.deepEqual(texts(body, "Brief"), ["Brief"], "only the last word");
  assert.deepEqual(texts("Cost (C++) here", "C++"), ["C++"], "names with regular-expression characters");
});

test("a card linked only inside code is not linked", () => {
  const card = { id: "t-1", key: "WEB-12", aliases: ["WEB-12"], title: "Ship" };
  assert.deepEqual(cardMentions(card, [{ id: "d-1", title: "A", body: "`[[WEB-12]]` and WEB-12" }]).map((m) => m.linked), [false]);
});

test("linking mentions keeps each matched text as the label", () => {
  const body = "See brief now and the Brief later";
  assert.equal(linkMentions(body, plainMentions(body, "Brief"), "Projects/p/documents/d-1"),
    "See [[Projects/p/documents/d-1|brief]] now and the [[Projects/p/documents/d-1|Brief]] later");
  assert.equal(linkMentions("Fix WEB-12 today", plainMentions("Fix WEB-12 today", "WEB-12"), "WEB-12"), "Fix [[WEB-12]] today");
  assert.equal(linkMentions("See Notes [draft] now", plainMentions("See Notes [draft] now", "Notes [draft]"), "d-1"), "See [[d-1]] now",
    "a label with link syntax is left out");
});

test("unlinked mentions list other documents only", () => {
  const docs = [{ id: "d-1", title: "Brief", body: "Brief itself" }, { id: "d-2", title: "Notes", body: "Read the brief." }, { id: "d-3", title: "Other", body: "[[Brief]]" }];
  assert.deepEqual(unlinkedMentions(docs, "Brief", "d-1").map((m) => [m.document.id, m.mentions.length]), [["d-2", 1]]);
});

test("a card is mentioned by a link to it or by its key in plain text", () => {
  const card = { id: "t-1", key: "WEB-12", aliases: ["WEB-12", "Ship it"], title: "Ship it" };
  const docs = [
    { id: "d-1", title: "Plan", body: "Next: [[WEB-12]]." },
    { id: "d-2", title: "Log", body: "Done WEB-12 today." },
    { id: "d-3", title: "Ship it", body: "Unrelated." },
    { id: "d-4", title: "Ref", body: "See [[Ship it]]." },
  ];
  assert.deepEqual(cardMentions(card, docs).map((m) => [m.document.id, m.linked]), [["d-1", true], ["d-2", false]],
    "a title link names the document of that title first");
});
