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
    offBoard = new Set(),
    taps = tapGestures();
  let pen = null,
    pan = null,
    multi = false,
    identity = null,
    lastTouch = -Infinity,
    buttonHeld = false,
    hold = null,
    cameraFrame = null,
    cameraDirty = false;
  const active = () => state.view === "board" && !!$("#canvas");
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  function cancelHold() {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  }
  function selectAfterHold(e) {
    const origin = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    const key = identity;
    hold = { ...origin, timer: setTimeout(() => {
      hold = null;
      if (!active() || state.dialog || state.canvasEditing || key !== `${state.project.id}:${board().id}` ||
          state.tool !== "cursor" || touches.size !== 1 || !touches.has(origin.pointerId)) return;
      basic.cancel();
      pan = null;
      taps.reset();
      basic.startMarquee(origin);
    }, 450) };
  }
  const reset = () => {
    cancelHold();
    if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
    cameraDirty = false;
    touches.clear();
    blocked.clear();
    offBoard.clear();
    taps.reset();
    pen = pan = null;
    multi = buttonHeld = false;
  };
  // Fingers already on the board stop steering it: they are ignored until lifted.
  function abandonTouches() {
    cancelHold();
    for (const id of touches.keys()) blocked.add(id);
    if (touches.size) basic.cancel();
    if (cameraDirty) paintCamera(true);
    touches.clear();
    taps.reset();
    pan = null;
    multi = false;
  }
  function rebase() {
    pan = touches.size
      ? {
          points: [...touches.values()].map((p) => ({ ...p })),
          camera: { ...state.camera },
          rect: $("#canvas").getBoundingClientRect(),
        }
      : null;
  }
  // Pointer events from both fingers may arrive several times per display
  // frame. Apply only the latest camera and persist once contact ends.
  function paintCamera(persist = false) {
    if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
    updateCamera(false, { persist, navigating: !persist });
    if (persist) cameraDirty = false;
  }
  function scheduleCamera() {
    cameraDirty = true;
    if (cameraFrame === null)
      cameraFrame = requestAnimationFrame(() => paintCamera());
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
      if (!active()) return;
      // The board pans and zooms only while every finger is on it. A finger on
      // a dialog, a panel or other page chrome ends the board's touch gesture,
      // and board fingers landing meanwhile are ignored until lifted.
      if (e.pointerType === "touch") {
        if (e.isPrimary) offBoard.clear();
        if (!e.target.closest("#canvas") || state.dialog) {
          offBoard.add(e.pointerId);
          if (touches.size) abandonTouches();
          return;
        }
        if (offBoard.size) {
          blocked.add(e.pointerId);
          stop(e);
          return;
        }
      }
      if (!e.target.closest("#canvas") || state.dialog) return;
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
        cancelHold();
        taps.reset();
        return;
      }
      if (e.pointerType === "pen") {
        cancelHold();
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
        abandonTouches();
        pen = e.pointerId;
        return;
      }
      if (e.pointerType !== "touch") return;
      lastTouch = e.timeStamp;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      let node = e.target.closest("[data-node],[data-edge]");
      if ((!node || node.matches(".frame")) && canvasPointerTool(state.tool, e.pointerType) === "cursor")
        node = basic.hitTest?.(e) || node;
      const placeOnTap = ["sticky", "text", "shape", "grid"].includes(
        state.tool,
      );
      const placing = !["cursor", "hand", "draw", "erase", "lasso"].includes(
        state.tool,
      );
      if (placing) taps.reset();
      else taps.down(e, node?.dataset?.node || node?.dataset?.edge || node?.id || "canvas");
      if (touches.size >= 2) {
        cancelHold();
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
      // Quick swipes still pan. Holding empty canvas (including a frame's
      // interior) starts the same marquee used by mouse and bitmap selection.
      const frame = node?.type === "frame" ? node : node?.matches?.(".frame") ? board().nodes.find(n => n.id === node.dataset.node) : null;
      if (touches.size === 1 && state.tool === "cursor" &&
          (!node || (frame && !frame.collapsed && !e.target.closest(".frame-title,.resize-handle,.connection-port"))))
        selectAfterHold(e);
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
      if (hold && Math.hypot(e.clientX - hold.clientX, e.clientY - hold.clientY) > 6) cancelHold();
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
          r = pan.rect;
        const z = Math.max(
          0.001,
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
      scheduleCamera();
    },
    true,
  );
  function end(e, cancel = false) {
    offBoard.delete(e.pointerId);
    if (hold?.pointerId === e.pointerId) cancelHold();
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
      if (navigated) paintCamera(true);
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
  const settle = () => {
    if (cameraDirty && active()) paintCamera(true);
    reset();
  };
  window.addEventListener("blur", settle);
  window.addEventListener("pagehide", settle);
  // iPad must not turn a canvas hold into native text selection. Editors retain
  // the browser's selection and copy/paste behaviour.
  window.addEventListener("selectstart", e => {
    if (active() && e.target.closest?.("#canvas") && !e.target.closest(chrome)) e.preventDefault();
  }, true);
  return { busy: () => active() && (pen !== null || touches.size > 0), reset };
}
