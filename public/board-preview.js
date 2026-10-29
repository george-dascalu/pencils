import { nodeFill, visualNodeType } from './node-layout.js';

// Share the card's silhouette with its low-detail preview. This keeps a fade
// from briefly revealing a different-coloured, square placeholder underneath.
export function paintNodePreview(g, n, camera, selected, theme) {
  const type = visualNodeType(n), z = camera.z;
  const x = n.x * z + camera.x, y = n.y * z + camera.y;
  const w = Math.max(2, n.w * z), h = Math.max(2, (n.collapsed ? 48 : n.h) * z);
  const rotated = !!n.rotation;
  if (rotated) {
    g.save(); g.translate(x + w / 2, y + h / 2);
    g.rotate(n.rotation * Math.PI / 180); g.translate(-x - w / 2, -y - h / 2);
  }
  g.fillStyle = nodeFill(n, type === 'shape' ? '#ffffff' : theme.surface);
  g.strokeStyle = selected ? theme.selection : n.borderColor || theme.border;
  // Keep small objects legible even before their text can be displayed.
  g.lineWidth = selected ? 2 : Math.max(1, (n.borderWidth ?? 1) * z);
  g.beginPath();
  const polygon = points => {
    points.forEach(([a, b], i) => i ? g.lineTo(x + a * w, y + b * h) : g.moveTo(x + a * w, y + b * h));
    g.closePath();
  };
  const shape = type === 'shape' ? n.shape : null;
  if (shape === 'ellipse') g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'diamond') polygon([[.5, 0], [1, .5], [.5, 1], [0, .5]]);
  else if (shape === 'triangle') polygon([[.5, 0], [1, 1], [0, 1]]);
  else if (shape === 'parallelogram') polygon([[.2, 0], [1, 0], [.8, 1], [0, 1]]);
  else if (shape === 'hexagon') polygon([[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]]);
  else {
    const radius = type === 'sticky' ? (n.noteStyle === 'rounded' ? 20 : n.noteStyle === 'square' ? 0 : 2)
      : type === 'grid' ? 6 : type === 'shape' ? (shape === 'rounded' ? Math.min(n.w, n.h) * .18 : 0)
        : ['task', 'file', 'query', 'link', 'image'].includes(type) ? 8 : 0;
    if (radius && g.roundRect) g.roundRect(x, y, w, h, Math.min(radius * z, w / 2, h / 2));
    else g.rect(x, y, w, h);
  }
  g.fill();
  if (w > 5 && (selected || n.borderWidth !== 0)) g.stroke();
  if (rotated) g.restore();
}
