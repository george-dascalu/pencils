import { inkCapture } from "./ink-capture.js";
import { strokeMarkup } from "./pen-model.js";
import { focusOnOpen } from "./open-focus.js";
import { randomUUID } from "./uuid.js";

// Document sketches (owner request, 29 Oct 2026): a pen pad over the document, full screen on
// phones, where every pointer draws. A sketch's strokes stay a draft until saved, so closing the
// pad (Escape, Close or a tap outside) keeps them for the next time it opens.
export function sketchPad({ state, icon, colorPicker, toast }) {
  const drafts = new Map(), style = { color: "#263c34", strokeWidth: 3, pressure: true };
  let pad = null, capture = null, listeners = null, strokes = [], key = null, opener = null, opening = null, camera = { x: 0, y: 0, z: 1 };
  function paint() {
    pad.querySelector(".sketch-content").innerHTML = `<g transform="translate(${camera.x} ${camera.y}) scale(${camera.z})">${strokes.map((s) => `<g data-stroke transform="translate(${s.x} ${s.y})">${strokeMarkup(s)}</g>`).join("")}</g>`;
    pad.querySelector("[data-sketch-save]").disabled = pad.querySelector("[data-sketch-undo]").disabled = !strokes.length;
  }
  // A sketch drawn on a bigger screen is shown smaller, so all of it fits.
  function fit(canvas) {
    const right = Math.max(1, ...strokes.map((s) => s.x + s.w)), bottom = Math.max(1, ...strokes.map((s) => s.y + s.h));
    camera = { x: 0, y: 0, z: Math.min(1, canvas.clientWidth / right, canvas.clientHeight / bottom) };
  }
  function close() {
    opening = null;
    if (!pad) return;
    drafts.set(key, strokes);
    capture.destroy();
    listeners.abort();
    pad.remove();
    pad = null;
    if (state.dialog === "sketch") state.dialog = null;
    if (opener?.isConnected) focusOnOpen(opener);
  }
  // `load` gives a saved sketch's strokes; `save(strokes)` stores them and updates the document.
  async function open({ id, load, save }) {
    close();
    // Only the latest request opens, and not after the documents view has closed it.
    const attempt = (opening = {}), focused = document.activeElement;
    const loaded = drafts.get(id) || (load ? (await load()).strokes.map((s) => ({ ...s, w: Math.max(...s.points.map((p) => p[0])), h: Math.max(...s.points.map((p) => p[1])) })) : []);
    if (opening !== attempt) return;
    opening = null;
    key = id;
    opener = focused;
    strokes = loaded;
    pad = document.createElement("section");
    pad.className = "sketch-pad";
    pad.setAttribute("popover", "manual");
    pad.setAttribute("role", "dialog");
    pad.setAttribute("aria-label", "Sketch");
    pad.innerHTML = `<header class="sketch-pad-head"><h2>Sketch</h2><div class="sketch-tools" role="toolbar" aria-label="Sketch tools">${colorPicker({ value: style.color, name: "sketch-color", label: "Ink colour" })}<button type="button" class="icon-button" data-sketch-undo aria-label="Undo stroke" title="Undo stroke">${icon("undo")}</button><button type="button" class="button primary" data-sketch-save aria-label="Save sketch">Save</button><button type="button" class="icon-button" data-sketch-close aria-label="Close sketch" title="Close sketch">${icon("close")}</button></div></header><div class="sketch-canvas" tabindex="0" aria-label="Drawing area: draw with a pen, a finger or the mouse"><svg class="sketch-content" aria-hidden="true"></svg><div class="sketch-ink"></div></div>`;
    document.body.append(pad);
    pad.showPopover();
    state.dialog = "sketch";
    const canvas = pad.querySelector(".sketch-canvas");
    fit(canvas);
    capture = inkCapture(canvas, pad.querySelector(".sketch-ink"), {
      style: () => style,
      camera: () => camera,
      id: () => `s-${randomUUID()}`,
      onStroke(stroke) {
        strokes = [...strokes, stroke];
        paint();
      },
    });
    paint();
    canvas.focus({ preventScroll: true });
    listeners = new AbortController();
    const { signal } = listeners;
    pad.addEventListener("click", async (event) => {
      if (event.target.closest("[data-sketch-close]")) close();
      else if (event.target.closest("[data-sketch-undo]")) {
        strokes = strokes.slice(0, -1);
        paint();
      } else if (event.target.closest("[data-sketch-save]")) {
        const button = event.target.closest("[data-sketch-save]"), saving = pad;
        // Nothing changes while it saves, so what's saved is what's on the pad.
        saving.inert = true;
        try {
          await save(strokes.map(({ x, y, color, strokeWidth, opacity, brush, pressure, points, pressures }) => ({ x, y, color, strokeWidth, opacity, brush, pressure, points, pressures })));
          close();
          drafts.delete(id);
        } catch (error) {
          toast(error.message, true);
          saving.inert = false;
          button.focus();
        }
      }
    }, { signal });
    pad.addEventListener("change", (event) => {
      if (event.target.name === "sketch-color") style.color = event.target.value;
    }, { signal });
    pad.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.target.closest("details[open]")) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }, { signal });
    document.addEventListener("pointerdown", (event) => {
      if (pad && !pad.contains(event.target)) close();
    }, { capture: true, signal });
  }
  return { open, close };
}
