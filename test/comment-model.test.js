import test from "node:test";
import assert from "node:assert/strict";
import { commentThreads, deleteComment } from "../public/comment-model.js";

test("replies stay with their parents regardless of append order", () => {
  const comments = [
    { id: "a" },
    { id: "b" },
    { id: "reply", replyTo: "a" },
    { id: "nested", replyTo: "reply" },
  ];
  assert.deepEqual(
    commentThreads(comments).map(({ comment, depth }) => [comment.id, depth]),
    [
      ["a", 0],
      ["reply", 1],
      ["nested", 2],
      ["b", 0],
    ],
  );
});
test("deleting a parent preserves replies, and deleting the last reply removes empty placeholders", () => {
  let comments = [
    { id: "a", text: "Remove this", reactions: [{ emoji: "👍" }] },
    { id: "reply", text: "Keep this", replyTo: "a" },
    { id: "other", text: "Also keep" },
  ];
  comments = deleteComment(comments, "a");
  assert.equal(comments[0].deleted, true);
  assert.equal(comments[0].text, "");
  assert.equal(comments[0].reactions, undefined);
  assert.equal(comments[1].text, "Keep this");
  comments = deleteComment(comments, "reply");
  assert.deepEqual(comments, [{ id: "other", text: "Also keep" }]);
});
test("orphaned, cyclic and previously resolved comments remain readable", () => {
  const comments = [
    { id: "a", replyTo: "b" },
    { id: "b", replyTo: "a" },
    { id: "orphan", replyTo: "missing", resolved: true },
  ];
  assert.deepEqual(
    new Set(commentThreads(comments).map(({ comment }) => comment.id)),
    new Set(["a", "b", "orphan"]),
  );
});
