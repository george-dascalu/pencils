import { taskAutosave } from "./task-autosave.js";
import { draftTaskData, draftTaskFields } from "./draft-task.js";

// Drafts use the same editor/save feedback as tasks, persisted in their board.
export function draftAutosave(
  ctx,
  form,
  editor,
  { readExtra, onSaved, refreshNode },
) {
  const { state, board, sync } = ctx;
  const projectId = state.project.id,
    boardId = form.dataset.board;
  const url = ctx.route("boards", boardId);
  const node = () =>
    board()?.nodes.find((n) => n.id === form.dataset.draftNode);
  const read = () => {
    const data = Object.fromEntries(new FormData(form));
    const subtasks = JSON.parse(data.pendingSubtasks || "[]");
    if (data.subtaskTitle?.trim())
      subtasks.push({
        title: data.subtaskTitle.trim(),
        type: data.subtaskType,
      });
    return {
      ...draftTaskFields({
        ...data,
        ...readExtra(),
        title: data.title.trim(),
        parent: data.parent || null,
        due: data.due || null,
        subtasks,
      }),
      body: data.body || "",
    };
  };
  return taskAutosave(form, {
    read,
    flushEditor: () => editor.flush(),
    sync,
    url,
    includeSubtasks: true,
    task: () => (node() ? draftTaskData(node()) : {}),
    save(changes, current) {
      if (
        state.project?.id !== projectId ||
        board()?.id !== boardId ||
        state.boardConflict
      )
        throw new Error(
          "Return to this board and resolve its save conflict to save the draft.",
        );
      if (form.dataset.draftNode === "new") {
        const created = ctx.addNode("draft", null, null, current);
        form.dataset.draftNode = created.id;
        form
          .closest("dialog")
          .querySelector(".board-task-editor-heading strong").textContent =
          "Draft task";
      } else {
        const n = node();
        if (!n || n.type !== "draft" || n.locked)
          throw new Error("This draft is no longer editable.");
        ctx.changeBoard(
          () => {
            n.draft = { ...n.draft, ...draftTaskFields(changes) };
            if (changes.body !== undefined) n.text = changes.body;
          },
          { render: false },
        );
      }
      refreshNode(form.dataset.draftNode);
      return ctx.flushBoard();
    },
    onSaved,
  });
}
