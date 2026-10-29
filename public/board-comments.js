import { canvasRichText, richToolbar } from "./canvas-rich-text.js";
import { positionBoardObjectPanel } from "./board-object-panel.js";
import { taskColorAttributes } from "./task-colors.js";
import { focusOnOpen } from "./open-focus.js";
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
  const savedSize = ctx.storage?.get('comments-panel-size', {}) || {};
  let panelSize = {
    width: Math.max(300, Math.min(1000, Number(savedSize.width) || 360)),
    height: Math.max(300, Math.min(1200, Number(savedSize.height) || 480)),
  };
  function resizeComments(width, height) {
    panelSize = { width: Math.max(Math.min(300, innerWidth - 24), Math.min(width, innerWidth - 24)), height: Math.max(Math.min(300, innerHeight - 24), Math.min(height, innerHeight - 24)) };
    position();
    composer?.positionMenus();
  }
  function bindResize() {
    if (embedded) return;
    const grip = panel.querySelector('[data-comments-resize]');
    let drag = null;
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', event => {
      if (drag && grip.hasPointerCapture(event.pointerId)) resizeComments(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y);
    });
    const finish = () => { if (drag) { drag = null; ctx.storage?.set('comments-panel-size', panelSize); } };
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
    grip.addEventListener('lostpointercapture', finish);
    grip.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? 80 : 20;
      resizeComments(panelSize.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), panelSize.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
      ctx.storage?.set('comments-panel-size', panelSize);
    });
  }

  let panel = null,
    target = null,
    boardId = null,
    projectId = null,
    replyTo = null, composer = null;
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
  const focusComposer = () => focusOnOpen(panel?.querySelector('[data-editor-mode="source"] textarea, [data-editor-mode="rich"] .inline-rich'), panel?.querySelector('[data-comments-close]'));
  const authorName = (name) => `<strong class="comment-author" ${taskColorAttributes(state, 'assignee', name)}>${esc(name || 'Workspace')}</strong>`;
  function replyPreview(comment) {
    if (comment.deleted) return 'Comment deleted';
    if (comment.format !== 'markdown') return String(comment.text || '').replace(/\s+/g, ' ').slice(0, 160);
    const template = document.createElement('template');
    template.innerHTML = ctx.markdown(comment.text || '');
    return template.content.textContent.replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  function timestamp(created) {
    const date = new Date(created);
    if (!created || Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const short = date.toDateString() === today.toDateString() ? time : `${date.toLocaleDateString([], { day: 'numeric', month: 'short', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })} · ${time}`;
    const full = date.toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
    return `<time datetime="${esc(created)}" title="${esc(full)}" aria-label="${esc(full)}">${esc(short)}</time>`;
  }
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
    panel.querySelector(".inline-rich").dataset.placeholder = field.placeholder;
    const submit = panel.querySelector("[data-comment-submit]"), action = parent ? "Send reply" : "Add comment";
    submit.setAttribute("aria-label", action);
    submit.title = action;
  }
  function close(focus = false) {
    if (!panel) return;
    composer?.flush(); composer?.destroy(); composer = null;
    drafts.set(key(), { text: panel.querySelector("textarea").value, replyTo });
    panel.remove();
    panel = null;
    if (!embedded && state.dialog === "board-comments") state.dialog = null;
    adapter?.onClose?.(focus);
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
        width = Math.min(panelSize.width, innerWidth - 24);
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${innerHeight - 24}px`;
      panel.style.height = `${Math.min(panelSize.height, innerHeight - 24)}px`;
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
    positionBoardObjectPanel(panel, n, canvas, state.camera, panelSize);
  }
  function sync(scroll = false) {
    if (!panel) return;
    position();
    if (!panel) return;
    const n = node();
    const list = panel.querySelector(".board-comments-list");
    const context = panel.querySelector(".board-comments-context"), contextHTML = adapter?.context?.() || "";
    if (context && context.innerHTML !== contextHTML) context.innerHTML = contextHTML;
    const actorId = actor();
    const byId = new Map((n.comments || []).map(c => [c.id, c]));
    const openThreads = new Map([...list.querySelectorAll('[data-comment-thread]')].map(el => [el.dataset.commentThread, el.open]));
    const groups = [];
    for (const item of commentThreads(n.comments)) {
      if (!item.depth || !groups.length) groups.push([]);
      groups.at(-1).push(item);
    }
    const renderComment = ({ comment: c, depth }) => {
          const parent = byId.get(c.replyTo);
          const quote = parent ? `<button type="button" class="comment-reply-quote" data-comment-jump="${esc(parent.id)}" aria-label="${esc(parent.deleted ? 'Go to deleted comment' : `Go to comment by ${parent.author || 'Workspace'}: ${replyPreview(parent)}`)}">${icon('reply')}${parent.deleted ? '' : authorName(parent.author)}<span class="comment-quote-text">${esc(replyPreview(parent))}</span></button>` : c.replyTo ? '<span class="comment-reply-label">Original comment unavailable</span>' : '';
          const reactionButton = ([emoji, label]) => {
            const people = (c.reactions || []).filter(r => r.emoji === emoji);
            const active = people.some(r => r.actor === actorId);
            return `<button type="button" class="comment-reaction" data-comment-react="${esc(c.id)}" data-emoji="${emoji}" aria-label="${label}${people.length ? ` (${people.length})` : ""}" aria-pressed="${active}" title="${esc(label + (people.length ? ` · ${people.map(r => r.author || "Workspace").join(", ")}` : ""))}"><span aria-hidden="true">${emoji}</span>${people.length ? `<span>${people.length}</span>` : ""}</button>`;
          };
          const reactions = commentReactions.filter(([emoji]) => c.reactions?.some(r => r.emoji === emoji)).map(reactionButton).join("");
          return `<article class="board-comment ${depth ? "board-comment-reply" : ""}" data-comment-id="${esc(c.id)}" tabindex="-1">${c.deleted ? '<p class="comment-deleted">Comment deleted</p>' : `${quote}<header><div>${authorName(c.author)}<div class="comment-actions"><button type="button" class="icon-button comment-reply" data-comment-reply="${esc(c.id)}" aria-label="Reply" title="Reply">${icon("reply")}</button><details class="comment-emoji-menu"><summary class="icon-button" aria-label="Add reaction" title="Add reaction">${icon("smile")}</summary><div class="comment-emoji-picker" role="group" aria-label="Choose an emoji reaction">${commentReactions.map(reactionButton).join("")}</div></details><button type="button" class="icon-button comment-delete" data-comment-delete="${esc(c.id)}" aria-label="Delete comment" title="Delete comment">${icon("trash")}</button></div></div></header><div class="comment-body canvas-markdown">${c.format === "markdown" ? ctx.markdown(c.text) : `<p>${esc(c.text)}</p>`}</div><footer class="comment-footer">${reactions ? `<div class="comment-reactions" role="group" aria-label="Emoji reactions">${reactions}</div>` : ""}${timestamp(c.created)}</footer>`}</article>`;
    };
    const markup = groups.map(([root, ...replies]) => {
      const id = root.comment.id;
      return `<section class="comment-thread">${renderComment(root)}${replies.length ? `<details class="comment-thread-replies" data-comment-thread="${esc(id)}" ${openThreads.get(id) !== false ? 'open' : ''}><summary>${icon('chevron')}<span>${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}</span></summary><div class="comment-thread-messages">${replies.map(renderComment).join('')}</div></details>` : ''}</section>`;
    }).join('') ||
      '<p class="field-hint">No comments yet. Start the conversation.</p>';
    if (list.innerHTML !== markup) list.innerHTML = markup;
    composerState();
    if (scroll) list.scrollTop = list.scrollHeight;
    position();
  }
  function open(n) {
    if (!n) return;
    if (panel && target === n.id && boardId === (adapter ? null : board().id))
      return focusComposer();
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
    // `adapter.context()` may add a line under the heading, such as the text a thread is about.
    panel.innerHTML = `<header class="board-comments-head"><strong>Comments</strong><button type="button" class="icon-button" data-comments-close aria-label="Close comments">${icon("close")}</button></header>${adapter?.context ? '<div class="board-comments-context"></div>' : ""}<div class="board-comments-list" role="log" aria-label="Object comments" aria-live="polite"></div><${embedded ? "div" : "form"} id="board-comment-form"><div class="comment-reply-context" hidden><span></span><button type="button" class="icon-button" data-comment-reply-cancel aria-label="Cancel reply" title="Cancel reply">${icon("close")}</button></div><div class="comment-rich-tools task-rich-tools" role="toolbar" aria-label="Format comment">${richToolbar(icon, { alignment: null, previewAction: "data-rich-preview", idPrefix: "comment", responsive: true })}</div><div class="inline-rich comment-input canvas-markdown" contenteditable="true" role="textbox" aria-label="Comment" aria-multiline="true" data-placeholder="Write a comment…" spellcheck="true"></div><textarea class="markdown-source hidden" id="board-comment-text" name="text" ${embedded ? 'form="task-comment-composer"' : ""} aria-label="Comment Markdown" rows="3" maxlength="10000" placeholder="Write a comment…"></textarea><div class="inline-preview canvas-markdown hidden"></div><p class="comment-compose-error" role="alert" hidden></p><button class="button primary small comment-send" data-comment-submit type="${embedded ? "button" : "submit"}" aria-label="Add comment" title="Add comment">${icon("send")}</button></${embedded ? "div" : "form"}>`;
    if (!embedded) panel.insertAdjacentHTML('beforeend', '<button type="button" class="comment-panel-resize" data-comments-resize aria-label="Resize comments" title="Drag to resize comments, or use arrow keys"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 20 11-11m-5 11 5-5"/></svg></button>');
    bindResize();
    const draft = drafts.get(key());
    replyTo = draft?.replyTo || null;
    panel.querySelector("textarea").value = draft?.text || "";
    (adapter?.mount || adapter?.host || document.body).append(panel);
    if (!embedded) panel.showPopover();
    composer = canvasRichText(panel.querySelector("#board-comment-form"), ctx.markdown, { controls: panel.querySelector(".comment-rich-tools") });
    adapter?.onOpen?.();
    if (!embedded) state.dialog = "board-comments";
    sync(true);
    focusComposer();
    panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        const menu = panel.querySelector('.comment-emoji-menu[open]');
        if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
        else if (!composer.escape()) close(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (embedded) submitComment();
        else panel.querySelector("form").requestSubmit();
      }
    });
    panel.addEventListener("click", (e) => {
      if (e.target.closest("[data-comments-close]")) return close(true);
      const jump = e.target.closest('[data-comment-jump]');
      if (jump) {
        const original = panel.querySelector(`[data-comment-id="${CSS.escape(jump.dataset.commentJump)}"]`);
        if (original) {
          const thread = original.closest('.comment-thread-replies');
          if (thread) thread.open = true;
          original.scrollIntoView({ block: 'nearest' });
          original.focus({ preventScroll: true });
        }
        return;
      }
      if (e.target.closest("[data-comment-reply-cancel]")) {
        replyTo = null;
        composerState();
        return focusComposer();
      }
      const reply = e.target.closest("[data-comment-reply]");
      if (reply) {
        replyTo = reply.dataset.commentReply;
        composerState();
        return focusComposer();
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
        focusComposer();
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
        panel.querySelector(`[data-comment-id="${CSS.escape(id)}"] .comment-emoji-menu summary`)?.focus({ preventScroll: true });
      }
    });
    function submitComment(e) {
      e?.preventDefault();
      e?.stopPropagation();
      composer.flush();
      const field = panel.querySelector("textarea"),
        text = field.value.trim();
      const error = panel.querySelector('.comment-compose-error');
      const empty = panel.querySelector('#board-comment-form').dataset.editorMode === 'rich' && !panel.querySelector('.inline-rich').textContent.trim();
      error.textContent = text.length > 10000 ? 'Comments can contain up to 10,000 characters.' : !text || empty ? 'Write a comment before sending.' : '';
      error.hidden = !error.textContent;
      if (error.textContent || !node()) { focusComposer(); return; }
      const replies = replyTo && panel.querySelector(`[data-comment-id="${CSS.escape(replyTo)}"]`)?.closest('.comment-thread')?.querySelector('.comment-thread-replies');
      if (replies) replies.open = true;
      const commentId = uid('comment');
      changeBoard(() => {
        node().comments ||= [];
        node().comments.push({
          id: commentId,
          author: author(),
          text, format: "markdown",
          ...(replyTo ? { replyTo } : {}),
          created: new Date().toISOString(),
        });
      });
      field.value = "";
      composer.reload();
      replyTo = null;
      drafts.delete(key());
      sync();
      panel.querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`)?.scrollIntoView({ block: 'nearest' });
      focusComposer();
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
          !(embedded && adapter.host.contains(e.target))
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
