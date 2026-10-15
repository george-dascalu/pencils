import {
  commentReactions,
  commentThreads,
  deleteComment,
} from "./comment-model.js";
// A nonmodal thread anchored to its board object; drafts survive light dismiss.
export function boardComments(ctx, author, uid) {
  const { $, state, board, task, esc, icon, changeBoard } = ctx;
  let panel = null,
    target = null,
    boardId = null,
    projectId = null,
    replyTo = null;
  const drafts = new Map();
  const key = () => `${projectId}:${boardId}:${target}`;
  const node = () => board()?.nodes.find((n) => n.id === target);
  const actor = () => {
    if (state.session?.user?.username)
      return `user:${state.session.user.username}`;
    let id = localStorage.getItem("pencils:comment-reactor");
    if (!id) {
      id = uid("reactor");
      localStorage.setItem("pencils:comment-reactor", id);
    }
    return id;
  };
  function composerState() {
    const parent = node()?.comments?.find(
      (c) => c.id === replyTo && !c.deleted,
    );
    if (!parent) replyTo = null;
    const context = panel.querySelector(".comment-reply-context");
    context.hidden = !parent;
    context.querySelector("span").textContent = parent
      ? `Replying to ${parent.author || "Workspace"}`
      : "";
    const field = panel.querySelector("textarea");
    field.placeholder = parent ? "Write a reply…" : "Write a comment…";
    panel.querySelector('[type="submit"]').textContent = parent
      ? "Reply"
      : "Add comment";
  }
  function close(focus = false) {
    if (!panel) return;
    drafts.set(key(), { text: panel.querySelector("textarea").value, replyTo });
    panel.remove();
    panel = null;
    if (state.dialog === "board-comments") state.dialog = null;
    if (focus)
      ($(`[data-node="${CSS.escape(target)}"]`) || $("#canvas"))?.focus({
        preventScroll: true,
      });
  }
  function position() {
    if (!panel) return;
    if (
      state.view !== "board" ||
      state.project?.id !== projectId ||
      board()?.id !== boardId ||
      !node()
    )
      return close();
    const canvas = $("#canvas"),
      n = node();
    if (!canvas) return close();
    const c = canvas.getBoundingClientRect(),
      z = state.camera.z;
    const right = c.left + state.camera.x + (n.x + n.w) * z;
    const top = c.top + state.camera.y + n.y * z;
    const width = Math.min(300, innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.min(520, innerHeight - 24)}px`;
    panel.style.left = `${Math.max(12, Math.min(right + 12, innerWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(top, innerHeight - panel.offsetHeight - 12))}px`;
  }
  function sync(scroll = false) {
    if (!panel) return;
    position();
    if (!panel) return;
    const n = node();
    panel.querySelector(".board-comments-object").textContent =
      task(n.task)?.title || n.text || n.file || n.type;
    const list = panel.querySelector(".board-comments-list");
    const actorId = actor();
    const markup =
      commentThreads(n.comments)
        .map(({ comment: c, depth }) => {
          const date =
            c.created && !Number.isNaN(Date.parse(c.created))
              ? new Date(c.created).toLocaleString()
              : "";
          const parent = depth && n.comments.find((p) => p.id === c.replyTo);
          const reactions = commentReactions
            .map(([emoji, label]) => {
              const people = (c.reactions || []).filter(
                (r) => r.emoji === emoji,
              );
              const active = people.some((r) => r.actor === actorId);
              return `<button type="button" class="comment-reaction" data-comment-react="${esc(c.id)}" data-emoji="${emoji}" aria-label="${label}${people.length ? ` (${people.length})` : ""}" aria-pressed="${active}" title="${esc(label + (people.length ? ` · ${people.map((r) => r.author || "Workspace").join(", ")}` : ""))}"><span aria-hidden="true">${emoji}</span>${people.length ? `<span>${people.length}</span>` : ""}</button>`;
            })
            .join("");
          return `<article class="board-comment ${depth ? "board-comment-reply" : ""}" data-comment-id="${esc(c.id)}">${c.deleted ? '<p class="comment-deleted">Comment deleted</p>' : `<header><div><strong>${esc(c.author || "Workspace")}</strong><button type="button" class="comment-delete" data-comment-delete="${esc(c.id)}" aria-label="Delete comment" title="Delete comment">${icon("trash")}</button></div><time datetime="${esc(c.created || "")}">${esc(date)}</time></header>${parent && !parent.deleted ? `<small class="comment-reply-label">Reply to ${esc(parent.author || "Workspace")}</small>` : ""}<p>${esc(c.text)}</p><div class="comment-actions"><button type="button" class="comment-reply" data-comment-reply="${esc(c.id)}">Reply</button><div class="comment-reactions" role="group" aria-label="Emoji reactions">${reactions}</div></div>`}</article>`;
        })
        .join("") ||
      '<p class="field-hint">No comments yet. Start the conversation.</p>';
    if (list.innerHTML !== markup) list.innerHTML = markup;
    composerState();
    if (scroll) list.scrollTop = list.scrollHeight;
    position();
  }
  function open(n) {
    if (!n) return;
    if (panel && target === n.id && boardId === board().id)
      return panel.querySelector("textarea").focus();
    close();
    target = n.id;
    boardId = board().id;
    projectId = state.project.id;
    panel = document.createElement("section");
    panel.className = "board-comments";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Comments on this object");
    panel.setAttribute("aria-modal", "false");
    panel.innerHTML = `<header class="board-comments-head"><strong>Comments</strong><button type="button" class="icon-button" data-comments-close aria-label="Close comments">${icon("close")}</button></header><div class="board-comments-object"></div><div class="board-comments-list" role="log" aria-label="Object comments" aria-live="polite"></div><form id="board-comment-form"><div class="comment-reply-context" hidden><span></span><button type="button" class="icon-button" data-comment-reply-cancel aria-label="Cancel reply" title="Cancel reply">${icon("close")}</button></div><label class="sr-only" for="board-comment-text">Comment</label><textarea id="board-comment-text" name="text" rows="3" maxlength="10000" required placeholder="Write a comment…"></textarea><button class="button primary small" type="submit">Add comment</button></form>`;
    const draft = drafts.get(key());
    replyTo = draft?.replyTo || null;
    panel.querySelector("textarea").value = draft?.text || "";
    document.body.append(panel);
    panel.showPopover();
    state.dialog = "board-comments";
    sync(true);
    panel.querySelector("textarea").focus({ preventScroll: true });
    panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        panel.querySelector("form").requestSubmit();
      }
    });
    panel.addEventListener("click", (e) => {
      if (e.target.closest("[data-comments-close]")) return close(true);
      if (e.target.closest("[data-comment-reply-cancel]")) {
        replyTo = null;
        composerState();
        return panel.querySelector("textarea").focus();
      }
      const reply = e.target.closest("[data-comment-reply]");
      if (reply) {
        replyTo = reply.dataset.commentReply;
        composerState();
        return panel.querySelector("textarea").focus();
      }
      const remove = e.target.closest("[data-comment-delete]");
      if (remove) {
        changeBoard(() => {
          node().comments = deleteComment(
            node().comments || [],
            remove.dataset.commentDelete,
          );
        });
        sync();
        panel.querySelector("textarea").focus({ preventScroll: true });
        return;
      }
      const reaction = e.target.closest("[data-comment-react]");
      if (
        reaction &&
        commentReactions.some(([emoji]) => emoji === reaction.dataset.emoji)
      ) {
        const id = reaction.dataset.commentReact,
          emoji = reaction.dataset.emoji;
        changeBoard(() => {
          const c = node()?.comments?.find((c) => c.id === id && !c.deleted);
          if (!c) return;
          const actorId = actor();
          c.reactions ||= [];
          const existing = c.reactions.find(
            (r) => r.emoji === emoji && r.actor === actorId,
          );
          if (existing)
            c.reactions = c.reactions.filter((r) => r.id !== existing.id);
          else
            c.reactions.push({
              id: `${actorId}:${emoji}`,
              emoji,
              actor: actorId,
              author: author(),
            });
        });
        sync();
        panel
          .querySelector(
            `[data-comment-react="${CSS.escape(id)}"][data-emoji="${emoji}"]`,
          )
          ?.focus({ preventScroll: true });
      }
    });
    panel.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const field = panel.querySelector("textarea"),
        text = field.value.trim();
      if (!text || !node()) return;
      changeBoard(() => {
        node().comments ||= [];
        node().comments.push({
          id: uid("comment"),
          author: author(),
          text,
          ...(replyTo ? { replyTo } : {}),
          created: new Date().toISOString(),
        });
      });
      field.value = "";
      replyTo = null;
      drafts.delete(key());
      sync(true);
      field.focus({ preventScroll: true });
    });
  }
  for (const type of ["pointerdown", "click"])
    document.addEventListener(
      type,
      (e) => {
        if (
          panel &&
          !panel.contains(e.target) &&
          !e.target.closest('[data-pro="comments"]')
        )
          close();
      },
      true,
    );
  window.addEventListener("resize", position);
  document.addEventListener(
    "scroll",
    (e) => {
      if (panel && !panel.contains(e.target)) position();
    },
    true,
  );
  return { open, sync, position, close };
}
