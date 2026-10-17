// Append-only, velocity-adaptive filtering. Settled segments never move when
// later samples arrive; faster movements reduce filtering to keep the pen close.
const cache = new WeakMap();
export function smoothInk(samples, amount = 0.35) {
  if (samples.length < 3 || amount <= 0) return samples;
  let entry = cache.get(samples);
  if (
    !entry ||
    entry.amount !== amount ||
    entry.points.length > samples.length
  ) {
    entry = { amount, points: [] };
    cache.set(samples, entry);
  }
  while (entry.points.length < samples.length) {
    const i = entry.points.length,
      p = samples[i],
      previous = entry.points[i - 1],
      raw = samples[i - 1];
    if (i < 2) {
      entry.points.push({ ...p });
      continue;
    }
    const dt = Math.max(
        1,
        Math.min(50, (p.time || i * 8) - (raw.time || (i - 1) * 8)),
      ),
      velocity = Math.hypot(p.x - raw.x, p.y - raw.y) / dt;
    const alpha = Math.max(0.25, Math.min(1, 1 - amount / (1 + velocity * 4)));
    entry.points.push({
      ...p,
      x: previous.x + (p.x - previous.x) * alpha,
      y: previous.y + (p.y - previous.y) * alpha,
    });
  }
  return entry.points;
}
