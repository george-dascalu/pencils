export const commentReactions = [
  ["👍", "Thumbs up"],
  ["❤️", "Heart"],
  ["😂", "Laugh"],
  ["🎉", "Celebrate"],
  ["👀", "Eyes"],
];

// Flat IDs make replies and reactions merge independently in board saves.
export function commentThreads(comments = []) {
  const ids = new Set(comments.map((c) => c.id));
  const children = new Map();
  for (const c of comments) {
    const parent = ids.has(c.replyTo) && c.replyTo !== c.id ? c.replyTo : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(c);
  }
  const ordered = [],
    seen = new Set();
  const visit = (c, depth) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    ordered.push({ comment: c, depth });
    for (const child of children.get(c.id) || []) visit(child, depth + 1);
  };
  for (const c of children.get(null) || []) visit(c, 0);
  // Keep manually edited orphaned/cyclic threads readable too.
  for (const c of comments) visit(c, 0);
  return ordered;
}

export function deleteComment(comments, id) {
  const comment = comments.find((c) => c.id === id);
  if (!comment) return comments;
  if (comments.some((c) => c.replyTo === id)) {
    comment.deleted = true;
    comment.text = "";
    delete comment.reactions;
    delete comment.resolved;
  } else comments = comments.filter((c) => c.id !== id);
  // Remove empty placeholders when their final reply is deleted.
  let empty;
  while (
    (empty = comments.find(
      (c) => c.deleted && !comments.some((r) => r.replyTo === c.id),
    ))
  )
    comments = comments.filter((c) => c.id !== empty.id);
  return comments;
}
