import { smoothInk } from "./ink-smoothing.js";
import { penStyle } from "./pen-model.js";
// Append only newly settled curve segments. The final segment is a small, replaceable tail.
// This renderer is local; committing the editable stroke remains the board model's job.
export function inkPreview(host) {
  const layers = [
    document.createElement("canvas"),
    document.createElement("canvas"),
  ];
  for (const layer of layers) {
    layer.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    host.append(layer);
  }
  const [base, tail] = layers.map((c) => c.getContext("2d"));
  let key = "",
    settled = 0;
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return (points, input, camera, straight = false) => {
    if (!points.length) return;
    const style = penStyle(input);
    if (!straight) points = smoothInk(points, style.smoothing);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const next = JSON.stringify([
      host.clientWidth,
      host.clientHeight,
      ratio,
      camera,
      style,
      straight,
    ]);
    if (next !== key || straight) {
      key = next;
      settled = 0;
      for (const layer of layers) {
        layer.width = Math.max(1, Math.round(host.clientWidth * ratio));
        layer.height = Math.max(1, Math.round(host.clientHeight * ratio));
      }
    }
    host.style.opacity = String(style.opacity);
    const pressure = style.pressure && style.brush !== "highlighter";
    const configure = (ctx) => {
      ctx.setTransform(
        ratio * camera.z,
        0,
        0,
        ratio * camera.z,
        ratio * camera.x,
        ratio * camera.y,
      );
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = ctx.fillStyle = style.color;
    };
    configure(base);
    configure(tail);
    const width = (i) =>
      style.strokeWidth *
      (pressure
        ? 0.35 + 0.9 * Math.pow(points[i].pressure ?? 0.5, style.pressureCurve)
        : 1);
    const segment = (ctx, start, control, end, i) => {
      ctx.lineWidth = width(i);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
      ctx.stroke();
    };
    const count = pressure
      ? Math.max(0, points.length - 1)
      : Math.max(0, points.length - 2);
    while (settled < count) {
      const i = pressure ? settled : settled + 1;
      const start =
        i === (pressure ? 0 : 1)
          ? points[0]
          : midpoint(points[i - 1], points[i]);
      segment(base, start, points[i], midpoint(points[i], points[i + 1]), i);
      settled++;
    }
    tail.save();
    tail.setTransform(1, 0, 0, 1, 0, 0);
    tail.clearRect(0, 0, layers[1].width, layers[1].height);
    tail.restore();
    const end = points.at(-1);
    if (points.length === 1) {
      tail.beginPath();
      tail.arc(end.x, end.y, width(0) / 2, 0, Math.PI * 2);
      tail.fill();
    } else if (pressure)
      segment(tail, midpoint(points.at(-2), end), end, end, points.length - 1);
    else {
      const start = settled ? midpoint(points.at(-2), end) : points[0];
      tail.lineWidth = style.strokeWidth;
      tail.beginPath();
      tail.moveTo(start.x, start.y);
      tail.lineTo(end.x, end.y);
      tail.stroke();
    }
  };
}
