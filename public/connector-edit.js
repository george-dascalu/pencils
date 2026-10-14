export function connectorEdit(ctx, point, selectEdge) {
  const {
    state,
    board,
    boardSnapshot,
    remember,
    saveBoard,
    renderView,
    updateEdges,
    changeBoard,
    toast,
  } = ctx;
  let drag = null;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target.closest("[data-bend],[data-edge-label]");
      if (!target || e.button !== 0) return;
      const edge = board()?.edges.find((x) => x.id === target.dataset.edge);
      if (!edge) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      selectEdge(edge.id, additive);
      if (additive) return;
      drag = {
        id: e.pointerId,
        capture: document.querySelector("#canvas"),
        edge,
        before: boardSnapshot(),
        original: structuredClone(edge),
        start: point(e),
        bend: target.dataset.bend,
        label: target.dataset.edgeLabel,
      };
      state.toolDragging = true;
      drag.capture.setPointerCapture(e.pointerId);
      if (drag.bend === "new") {
        edge.bends ||= [];
        if (edge.bends.length >= 20) {
          toast("A connector supports 20 bends.");
          if (drag.capture.hasPointerCapture(drag.id))
            drag.capture.releasePointerCapture(drag.id);
          drag = null;
          state.toolDragging = false;
          return;
        }
        drag.bend = String(edge.bends.length);
        edge.bends.push(point(e));
      }
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const p = point(e),
        d = drag;
      if (d.bend != null) d.edge.bends[+d.bend] = p;
      else if (d.label === "main")
        d.edge.labelOffset = {
          x: (d.original.labelOffset?.x || 0) + p.x - d.start.x,
          y: (d.original.labelOffset?.y || 0) + p.y - d.start.y,
        };
      else {
        const l = d.edge.labels[+d.label],
          old = d.original.labels[+d.label];
        l.x = old.x + p.x - d.start.x;
        l.y = old.y + p.y - d.start.y;
      }
      updateEdges();
    },
    true,
  );
  function finish(e, cancel = false) {
    if (!drag || (e?.pointerId != null && e.pointerId !== drag.id)) return;
    e?.stopImmediatePropagation();
    const d = drag;
    drag = null;
    state.toolDragging = false;
    if (d.capture?.hasPointerCapture(d.id))
      d.capture.releasePointerCapture(d.id);
    if (cancel) {
      for (const k of Object.keys(d.edge)) delete d.edge[k];
      Object.assign(d.edge, d.original);
    } else if (JSON.stringify(d.edge) !== JSON.stringify(d.original)) {
      remember(d.before);
      saveBoard();
    }
    renderView();
  }
  document.addEventListener("pointerup", (e) => finish(e), true);
  document.addEventListener("pointercancel", (e) => finish(e, true), true);
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        e.preventDefault();
        finish(e, true);
      }
    },
    true,
  );
  window.addEventListener("blur", () => finish(null, true));
  document.addEventListener(
    "dblclick",
    (e) => {
      const h = e.target.closest("[data-bend]");
      if (!h || h.dataset.bend === "new") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      changeBoard((b) =>
        b.edges
          .find((x) => x.id === h.dataset.edge)
          ?.bends.splice(+h.dataset.bend, 1),
      );
    },
    true,
  );
  document.addEventListener("change", (e) => {
    if (e.target.dataset.extraLabel == null) return;
    const edge = board()?.edges.find((x) => x.id === state.selectedEdge);
    if (edge?.labels?.[+e.target.dataset.extraLabel])
      changeBoard(
        () =>
          (edge.labels[+e.target.dataset.extraLabel].text =
            e.target.value.slice(0, 500)),
      );
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-delete-label]");
    if (!el) return;
    const edge = board()?.edges.find((x) => x.id === state.selectedEdge);
    if (edge?.labels)
      changeBoard(() => edge.labels.splice(+el.dataset.deleteLabel, 1));
  });
  document.addEventListener("click", (e) => {
    const cmd = e.target.closest("[data-connector-command]")?.dataset
      .connectorCommand;
    if (!cmd) return;
    const edge = board()?.edges.find((x) => x.id === state.selectedEdge);
    if (!edge) return;
    if (cmd === "reset-bends") changeBoard(() => delete edge.bends);
    if (cmd === "add-label") {
      if ((edge.labels?.length || 0) >= 10)
        return toast("A connector supports 10 additional labels.");
      const text = "Label";
      changeBoard(() => {
        edge.labels ||= [];
        edge.labels.push({
          text: text.slice(0, 500),
          x: 0,
          y: 24 * (edge.labels.length + 1),
        });
      });
    }
  });
}
