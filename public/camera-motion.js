// Ease zoom in logarithmic space so mouse wheels and trackpads feel consistent.
export function smoothZoom({
  camera,
  apply,
  changed,
  reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  request = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  now = () => performance.now(),
}) {
  let target = null,
    frame = null,
    last = 0,
    anchor = null;
  function cancel() {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    target = null;
    changed(false);
  }
  function step(time) {
    frame = null;
    if (target === null) return;
    const c = camera(),
      remaining = Math.log(target / c.z);
    const alpha = 1 - Math.exp(-Math.min(64, Math.max(1, time - last)) / 55);
    last = time;
    const done = Math.abs(remaining) < 0.001;
    const z = done ? target : c.z * Math.exp(remaining * alpha);
    apply({
      x: anchor.x - anchor.worldX * z,
      y: anchor.y - anchor.worldY * z,
      z,
    });
    if (done) cancel();
    else frame = request(step);
  }
  function zoom(multiplier, x, y) {
    const c = camera();
    target = Math.min(3, Math.max(0.15, (target ?? c.z) * multiplier));
    anchor = { x, y, worldX: (x - c.x) / c.z, worldY: (y - c.y) / c.z };
    if (reduced()) {
      apply({
        x: x - anchor.worldX * target,
        y: y - anchor.worldY * target,
        z: target,
      });
      cancel();
      return;
    }
    changed(true);
    if (frame === null) {
      last = now();
      frame = request(step);
    }
  }
  return { zoom, cancel };
}
