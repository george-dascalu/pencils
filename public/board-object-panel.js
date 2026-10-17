// Shared placement for compact board-object panels such as comments and review.
export function positionBoardObjectPanel(panel, node, canvas, camera) {
  const c = canvas.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0,
    top = viewport?.offsetTop || 0;
  const width = viewport?.width || innerWidth,
    height = viewport?.height || innerHeight;
  const right = c.left + camera.x + (node.x + node.w) * camera.z;
  const y = c.top + camera.y + node.y * camera.z;
  const panelWidth = Math.min(300, width - 24);
  panel.style.width = `${panelWidth}px`;
  panel.style.maxHeight = `${Math.min(520, height - 24)}px`;
  panel.style.left = `${Math.max(left + 12, Math.min(right + 12, left + width - panelWidth - 12))}px`;
  panel.style.top = `${Math.max(top + 12, Math.min(y, top + height - panel.offsetHeight - 12))}px`;
}

export function boardObjectDialog(
  dialog,
  { state, board, closeDialog, nodeId },
) {
  const events = new AbortController();
  const projectId = state.project.id,
    boardId = board()?.id;
  let frame;
  const close = () => closeDialog(false, { confirmDirty: false });
  function position() {
    const node = board()?.nodes.find((n) => n.id === nodeId);
    const canvas = document.querySelector("#canvas");
    if (!dialog.isConnected) return;
    if (
      !node ||
      !canvas ||
      state.project?.id !== projectId ||
      board()?.id !== boardId
    )
      return close();
    positionBoardObjectPanel(dialog, node, canvas, state.camera);
  }
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  };
  dialog.setAttribute("aria-modal", "false");
  dialog.show();
  position();
  const observer = new MutationObserver(schedule);
  const world = document.querySelector("#canvas-world");
  if (world)
    observer.observe(world, { attributes: true, attributeFilter: ["style"] });
  const resize = new ResizeObserver(schedule);
  resize.observe(dialog);
  window.addEventListener("resize", schedule, { signal: events.signal });
  window.addEventListener("scroll", schedule, {
    capture: true,
    signal: events.signal,
  });
  window.visualViewport?.addEventListener("resize", schedule, {
    signal: events.signal,
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!dialog.contains(event.target)) close();
    },
    { signal: events.signal },
  );
  dialog.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        document
          .querySelector(
            `[data-node="${CSS.escape(nodeId)}"] [data-pro="convert"]`,
          )
          ?.focus({ preventScroll: true });
      }
    },
    { signal: events.signal },
  );
  dialog
    .querySelector(
      "#draft-finalise-confirm:not(:disabled),[data-action=dialog-close]",
    )
    ?.focus({ preventScroll: true });
  return {
    destroy() {
      events.abort();
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
