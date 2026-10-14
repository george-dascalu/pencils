// Drag a tool onto the canvas without creating anything until a valid drop.
export function canvasToolDrag(ctx, place) {
  const { state, $ } = ctx;
  let drag = null,
    suppressClickUntil = 0;
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  function valid(x, y) {
    const target = document.elementFromPoint(x, y);
    return (
      target?.closest("#canvas") &&
      !target.closest(
        ".board-tools,.board-controls,.canvas-panel,.canvas-find,.canvas-filters,#selection-tools,#canvas-presence,#canvas-minimap",
      )
    );
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6)
      return;
    stop(e);
    const canvas = $("#canvas");
    if (!canvas) {
      cancel();
      return;
    }
    drag.active = true;
    state.toolDragging = true;
    if (!drag.preview) {
      drag.preview = document.createElement("div");
      drag.preview.className = "sticky-drop-preview";
      drag.preview.textContent = "Drop to add a note";
      drag.preview.setAttribute("aria-hidden", "true");
      canvas.append(drag.preview);
    }
    const r = canvas.getBoundingClientRect(),
      z = state.camera.z;
    drag.offsetX = 30 * z;
    drag.offsetY = 24 * z;
    Object.assign(drag.preview.style, {
      left: `${e.clientX - r.left - drag.offsetX}px`,
      top: `${e.clientY - r.top - drag.offsetY}px`,
      width: `${220 * z}px`,
      height: `${180 * z}px`,
    });
    drag.preview.classList.toggle("invalid", !valid(e.clientX, e.clientY));
  }
  function cancel() {
    const old = drag;
    drag = null;
    state.toolDragging = false;
    old?.preview?.remove();
    if (old?.button.hasPointerCapture(old.id))
      old.button.releasePointerCapture(old.id);
    if (old?.active) suppressClickUntil = Date.now() + 500;
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      suppressClickUntil = 0;
      const button = e.target.closest(".board-tools [data-tool=sticky]");
      if (!button || e.button !== 0 || state.canvasEditing || state.dialog)
        return;
      e.stopImmediatePropagation();
      drag = {
        id: e.pointerId,
        button,
        x: e.clientX,
        y: e.clientY,
        active: false,
      };
      button.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener("pointermove", move, true);
  document.addEventListener(
    "pointerup",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const old = drag,
        drop = old.active && valid(e.clientX, e.clientY);
      if (old.active) stop(e);
      cancel();
      if (drop) {
        state.tool = "sticky";
        place({
          clientX: e.clientX - old.offsetX,
          clientY: e.clientY - old.offsetY,
        });
      }
    },
    true,
  );
  for (const name of ["pointercancel", "lostpointercapture"])
    document.addEventListener(
      name,
      (e) => {
        if (drag?.id === e.pointerId) cancel();
      },
      true,
    );
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        stop(e);
        cancel();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (Date.now() < suppressClickUntil && e.target.closest("#canvas")) {
        stop(e);
        suppressClickUntil = 0;
      }
    },
    true,
  );
  window.addEventListener("blur", cancel);
  return { busy: () => !!drag?.active };
}
