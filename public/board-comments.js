import { positionBoardObjectPanel } from "./board-object-panel.js";
import {
  commentReactions,
  commentThreads,
  deleteComment,
} from "./comment-model.js";
// A nonmodal thread anchored to its board object; drafts survive light dismiss.
export function boardComments(ctx, author, uid, adapter = null) {
  const listeners = new AbortController();
  const { $, state, board, task, esc, icon } = ctx;
  const changeBoard = (mutate) => {
    if (adapter) return adapter.change(mutate);
    const record = linkedTask();
    if (!record) return ctx.changeBoard(mutate);
    const base = structuredClone(record);
    mutate();
    void ctx.sync.enqueue(ctx.route("tasks", record.id), base, { comments: record.comments });
    ctx.renderView(true);
  };
  const embedded = !!adapter?.mount;
  let panel = null,
    target = null,
    boardId = null,
    projectId = null,
    replyTo = null;
  const drafts = new Map();
  const key = () => `${projectId}:${boardId}:${target}`;
  const object = () => board()?.nodes.find((n) => n.id === target);
  const linkedTask = () => !adapter && object()?.type === "task" ? task(object().task) : null;
  const node = () => adapter ? adapter.item() : linkedTask() || object();
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
    panel.querySelector("[data-comment-submit]").textContent = parent
      ? "Reply"
      : "Add comment";
  }
  function close(focus = false) {
    if (!panel) return;
    drafts.set(key(), { text: panel.querySelector("textarea").value, replyTo });
    panel.remove();
    panel = null;
    if (!adapter && state.dialog === "board-comments") state.dialog = null;
    adapter?.onClose?.();
    if (adapter && focus)
      adapter.host
        .querySelector(adapter.trigger)
        ?.focus({ preventScroll: true });
    if (focus && !adapter)
      ($(`[data-node="${CSS.escape(target)}"]`) || $("#canvas"))?.focus({
        preventScroll: true,
      });
  }
  function position() {
    if (!panel) return;
    if (embedded) {
      if (!adapter.host.isConnected || !node()) close();
      return;
    }
    if (adapter) {
      const anchor = adapter.anchor();
      if (!anchor?.isConnected || !node()) return close();
      const r = anchor.getBoundingClientRect(),
        width = Math.min(300, innerWidth - 24);
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${Math.min(520, innerHeight - 24)}px`;
      panel.style.left = `${Math.max(12, Math.min(r.right + 12, innerWidth - width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(r.top, innerHeight - panel.offsetHeight - 12))}px`;
      return;
    }
    if (
      !["board", "drawing"].includes(state.view) ||
      state.project?.id !== projectId ||
      board()?.id !== boardId ||
      !node()
    )
      return close();
    const canvas = $("#canvas"),
      n = object();
    if (!canvas) return close();
    positionBoardObjectPanel(panel, n, canvas, state.camera);
  }
  function sync(scroll = false) {
    if (!panel) return;
    position();
    if (!panel) return;
    const n = node();
    panel.querySelector(".board-comments-object").textContent =
      adapter?.title?.() ||
      n.title ||
      task(n.task)?.title ||
      n.draft?.title ||
      n.text ||
      n.file ||
      n.type;
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
    if (panel && target === n.id && boardId === (adapter ? null : board().id))
      return panel.querySelector("textarea").focus();
    close();
    target = n.id;
    boardId = adapter ? null : board().id;
    projectId = state.project.id;
    // Import legacy object discussions once, keeping their IDs, replies and
    // reactions stable. Originals stay on the board as a recoverable copy.
    const record = linkedTask();
    if (record && n.comments?.length) {
      const prefix = `board:${boardId}:${n.id}:`;
      const existing = new Set((record.comments || []).map((c) => c.id));
      const legacy = n.comments.filter((c) => !existing.has(prefix + c.id)).map((c) => ({
        ...structuredClone(c), id: prefix + c.id,
        ...(c.replyTo ? { replyTo: prefix + c.replyTo } : {}),
      }));
      if (legacy.length) changeBoard(() => { record.comments = [...(record.comments || []), ...legacy]; });
    }
    panel = document.createElement("section");
    panel.className = `board-comments${embedded ? " task-comments-panel" : ""}`;
    if (!embedded) panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Comments on this object");
    panel.setAttribute("aria-modal", "false");
    // An embedded composer must not participate in task-form validation.
    panel.innerHTML = `<header class="board-comments-head"><strong>Comments</strong><button type="button" class="icon-button" data-comments-close aria-label="Close comments">${icon("close")}</button></header><div class="board-comments-object"></div><div class="board-comments-list" role="log" aria-label="Object comments" aria-live="polite"></div><${embedded ? "div" : "form"} id="board-comment-form"><div class="comment-reply-context" hidden><span></span><button type="button" class="icon-button" data-comment-reply-cancel aria-label="Cancel reply" title="Cancel reply">${icon("close")}</button></div><label class="sr-only" for="board-comment-text">Comment</label><textarea id="board-comment-text" name="text" ${embedded ? 'form="task-comment-composer"' : ""} rows="3" maxlength="10000" required placeholder="Write a comment…"></textarea><button class="button primary small" data-comment-submit type="${embedded ? "button" : "submit"}">Add comment</button></${embedded ? "div" : "form"}>`;
    const draft = drafts.get(key());
    replyTo = draft?.replyTo || null;
    panel.querySelector("textarea").value = draft?.text || "";
    (adapter?.mount || adapter?.host || document.body).append(panel);
    if (!embedded) panel.showPopover();
    adapter?.onOpen?.();
    if (!adapter) state.dialog = "board-comments";
    sync(true);
    panel.querySelector("textarea").focus({ preventScroll: true });
    panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (embedded) submitComment();
        else panel.querySelector("form").requestSubmit();
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
    function submitComment(e) {
      e?.preventDefault();
      e?.stopPropagation();
      if (!panel.querySelector("textarea").reportValidity()) return;
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
    }
    if (embedded) {
      panel
        .querySelector("[data-comment-submit]")
        .addEventListener("click", submitComment);
      for (const event of ["input", "change"])
        panel.addEventListener(event, (e) => e.stopPropagation());
    } else
      panel.querySelector("form").addEventListener("submit", submitComment);
  }
  for (const type of ["pointerdown", "click"])
    document.addEventListener(
      type,
      (e) => {
        if (
          panel &&
          !panel.contains(e.target) &&
          !e.target.closest(adapter?.trigger || '[data-pro="comments"]') &&
          !(adapter && adapter.host.contains(e.target))
        )
          close();
      },
      { capture: true, signal: listeners.signal },
    );
  window.addEventListener("resize", position, { signal: listeners.signal });
  document.addEventListener(
    "scroll",
    (e) => {
      if (panel && !panel.contains(e.target)) position();
    },
    { capture: true, signal: listeners.signal },
  );
  return {
    open,
    sync,
    position,
    close,
    destroy() {
      close();
      listeners.abort();
    },
  };
}
