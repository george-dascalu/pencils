export const ZOOM_STEPS = Object.freeze([0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]);

export function normalizeZoom(value) {
  return Number.isFinite(value) ? Math.min(3, Math.max(0.5, value)) : 1;
}

export function stepZoom(value, action) {
  const current = normalizeZoom(value);
  if (action === 'reset') return 1;
  if (action === 'in') return ZOOM_STEPS.find(step => step > current + 0.001) ?? ZOOM_STEPS.at(-1);
  if (action === 'out') return ZOOM_STEPS.findLast(step => step < current - 0.001) ?? ZOOM_STEPS[0];
  return current;
}
