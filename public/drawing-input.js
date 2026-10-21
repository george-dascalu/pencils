import { readGestures, tapGestures } from "./drawing-gestures.js";

const chrome =
  "button,input,select,textarea,a,summary,[contenteditable],[data-group-resize],.inline-editing,.inline-floating-tools,.board-tools,#selection-tools,#pen-tools,.canvas-panel,.canvas-find,.canvas-filters,#canvas-minimap,#canvas-presence,.board-controls,[data-board-settings]";
// Fingers manipulate objects even while an ink tool is active. Explicit
// placement/connection tools still work by touch on the shared Board.
export const canvasPointerTool = (tool, pointerType) =>
  pointerType === "touch" && ["draw", "erase", "lasso"].includes(tool)
    ? "cursor"
    : tool;
export function drawingInput(ctx, basic) {
  const { state, $, board, updateCamera } = ctx;
  const touches = new Map(),
    blocked = new Set(),
    taps = tapGestures();
  let pen = null,
    pan = null,
    multi = false,
    identity = null,
    lastTouch = -Infinity,
    buttonHeld = false;
  const active = () => state.view === "board" && !!$("#canvas");
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const reset = () => {
    touches.clear();
    blocked.clear();
    taps.reset();
    pen = pan = null;
    multi = buttonHeld = false;
  };
  function rebase() {
    pan = touches.size
      ? {
          points: [...touches.values()].map((p) => ({ ...p })),
          camera: { ...state.camera },
        }
      : null;
  }
  function capture(e) {
    const canvas = $("#canvas");
    try {
      canvas?.setPointerCapture(e.pointerId);
    } catch {
      /* A cancelled pointer is already released. */
    }
  }
  const action = (key) => {
    const value = readGestures()[key];
    if (value && value !== "none" && active() && !state.dialog)
      basic.action(value);
  };
  // Window capture precedes the canvas' drawing and object handlers.
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!active() || !e.target.closest("#canvas") || state.dialog) return;
      const current = `${state.project.id}:${board().id}`;
      if (identity !== current) {
        reset();
        identity = current;
      }
      if (e.pointerType === "touch" && pen !== null) {
        blocked.add(e.pointerId);
        stop(e);
        return;
      }
      if (e.target.closest(chrome)) {
        taps.reset();
        return;
      }
      if (e.pointerType === "pen") {
        if (e.buttons & 2 || e.button === 2) {
          stop(e);
          taps.reset();
          if (!buttonHeld && pen === null) {
            buttonHeld = true;
            action("penButton");
          }
          return;
        }
        if (e.button !== 0 || pen !== null) return;
        for (const id of touches.keys()) blocked.add(id);
        if (touches.size) basic.cancel();
        touches.clear();
        taps.reset();
        pan = null;
        multi = false;
        pen = e.pointerId;
        return;
      }
      if (e.pointerType !== "touch") return;
      lastTouch = e.timeStamp;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const node = e.target.closest("[data-node],[data-edge]") ||
        (canvasPointerTool(state.tool, e.pointerType) === "cursor" ? basic.hitTest?.(e) : null);
      const placeOnTap = ["sticky", "text", "shape", "grid"].includes(
        state.tool,
      );
      const placing = !["cursor", "hand", "draw", "erase", "lasso"].includes(
        state.tool,
      );
      if (placing) taps.reset();
      else taps.down(e, node?.dataset?.node || node?.dataset?.edge || node?.id || "canvas");
      if (touches.size >= 2) {
        stop(e);
        multi = true;
        basic.cancel();
        rebase();
        for (const pointerId of touches.keys()) capture({ pointerId });
      } else if ((!node && !placing) || placeOnTap) {
        stop(e);
        rebase();
        if (placeOnTap) pan.place = state.tool;
        capture(e);
      }
      // Touch on an object continues to the shared select/move/resize handlers.
    },
    true,
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      if (blocked.has(e.pointerId)) {
        stop(e);
        return;
      }
      if (!active()) return;
      if (e.pointerType === "pen") {
        // Pointer Events report side-button changes during hover/contact as moves.
        if (e.buttons & 2) {
          if (pen === null) {
            stop(e);
            if (!buttonHeld) {
              buttonHeld = true;
              action("penButton");
            }
          }
        } else buttonHeld = false;
      }
      if (!touches.has(e.pointerId)) return;
      lastTouch = e.timeStamp;
      taps.move(e);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pan) return;
      stop(e);
      const p = [...touches.values()],
        old = pan.points;
      if (
        !pan.moved &&
        p.every(
          (point, i) => Math.hypot(point.x - old[i].x, point.y - old[i].y) <= 6,
        )
      )
        return;
      pan.moved = true;
      if (p.length >= 2 && old.length >= 2) {
        const distance = (points) =>
          Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        const mid = (points) => ({
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        });
        const a = mid(old),
          b = mid(p),
          r = $("#canvas").getBoundingClientRect();
        const z = Math.max(
          0.08,
          Math.min(
            3,
            (pan.camera.z * distance(p)) / Math.max(1, distance(old)),
          ),
        );
        state.camera = {
          z,
          x: b.x - r.left - ((a.x - r.left - pan.camera.x) * z) / pan.camera.z,
          y: b.y - r.top - ((a.y - r.top - pan.camera.y) * z) / pan.camera.z,
        };
      } else
        state.camera = {
          ...pan.camera,
          x: pan.camera.x + p[0].x - old[0].x,
          y: pan.camera.y + p[0].y - old[0].y,
        };
      updateCamera();
    },
    true,
  );
  function end(e, cancel = false) {
    if (blocked.delete(e.pointerId)) {
      stop(e);
      return;
    }
    if (e.pointerId === pen) {
      pen = null;
      buttonHeld = false;
      return;
    }
    if (e.pointerType === "pen") buttonHeld = false;
    if (!touches.has(e.pointerId)) return;
    lastTouch = e.timeStamp;
    const gesture = taps.up(e, cancel),
      navigated = !!pan;
    const first = pan?.points[0],
      place = pan?.place;
    const emptyTap =
      !cancel &&
      !multi &&
      !pan?.moved &&
      first &&
      Math.hypot(e.clientX - first.x, e.clientY - first.y) <= 6;
    touches.delete(e.pointerId);
    if (navigated) stop(e);
    if (touches.size) rebase();
    else {
      pan = null;
      multi = false;
      if (emptyTap && !gesture) {
        if (place && state.tool === place) basic.place(e);
        else basic.clearSelection();
      }
      if (navigated) updateCamera();
    }
    if (gesture && !cancel) {
      // Let a normal object tap finish selecting before applying its shortcut.
      const id = identity;
      queueMicrotask(() => {
        if (active() && id === `${state.project.id}:${board().id}`)
          action(gesture);
      });
    }
  }
  window.addEventListener("pointerup", (e) => end(e), true);
  window.addEventListener("pointercancel", (e) => end(e, true), true);
  window.addEventListener(
    "lostpointercapture",
    (e) => {
      if (e.pointerId === pen) pen = null;
      if (
        touches.has(e.pointerId) &&
        !$("#canvas")?.hasPointerCapture(e.pointerId)
      )
        end(e, true);
    },
    true,
  );
  window.addEventListener(
    "dblclick",
    (e) => {
      if (
        active() &&
        e.target.closest("#canvas") &&
        !e.target.closest(chrome) &&
        e.timeStamp - lastTouch < 600
      )
        stop(e);
    },
    true,
  );
  window.addEventListener("blur", reset);
  return { busy: () => active() && (pen !== null || touches.size > 0), reset };
}
