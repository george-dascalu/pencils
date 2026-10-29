import { inkPreview } from "./ink-preview.js";
import { makeStroke } from "./pen-model.js";
// Pen input shared by the offline pad and document sketches: one pointer at a time draws into a
// live ink preview, and lifting it hands back an editable stroke. `accepts` picks the pointers that
// draw (the offline pad keeps fingers for panning); `style` and `camera` are read as they change.
export function inkCapture(canvas, layer, { style, camera, id, onStroke, accepts = () => true }) {
  const listeners = new AbortController(), signal = listeners.signal;
  let samples = null, pen = null, ink = inkPreview(layer);
  const point = (e) => {
    const r = canvas.getBoundingClientRect(), c = camera();
    return {
      x: (e.clientX - r.left - c.x) / c.z,
      y: (e.clientY - r.top - c.y) / c.z,
      pressure: e.pointerType === "pen" ? e.pressure : 0.5,
      time: e.timeStamp,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
    };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || samples || !accepts(e)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pen = e.pointerId;
    samples = [point(e)];
    ink(samples, style(), camera());
  }, { signal });
  canvas.addEventListener("pointermove", (e) => {
    if (!samples || e.pointerId !== pen) return;
    for (const sample of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e])
      if (samples.length < 10000) samples.push(point(sample));
    ink(samples, style(), camera());
  }, { signal });
  const end = (e, cancel = false) => {
    if (e.pointerId !== pen) return;
    const done = samples;
    samples = null;
    pen = null;
    layer.replaceChildren();
    ink = inkPreview(layer);
    if (done && !cancel) onStroke(makeStroke(done, style(), id()));
  };
  canvas.addEventListener("pointerup", end, { signal });
  canvas.addEventListener("pointercancel", (e) => end(e, true), { signal });
  canvas.addEventListener("lostpointercapture", (e) => end(e, true), { signal });
  window.addEventListener("blur", () => { if (pen !== null) end({ pointerId: pen }, true); }, { signal });
  return { active: () => pen !== null, destroy: () => listeners.abort() };
}
