// Fade only mounted detail, with the bitmap visible underneath. No snapshots,
// cloned cards or canvas animation loop; zoom reversals reuse the same element.
export function boardDetailTransition({ park, changed }) {
  const active = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function cancel(entry) {
    entry.animation.onfinish = null;
    entry.animation.cancel();
    delete entry.el.dataset.detailTransition;
    active.delete(entry.el);
  }
  function show(el, visible, fresh = false) {
    const old = active.get(el);
    if (old?.visible === visible || (!old && visible && !fresh)) return;
    let from = fresh ? 0 : 1;
    if (old) {
      const progress = old.animation.effect.getComputedTiming().progress ?? 0;
      from = old.from + ((old.visible ? 1 : 0) - old.from) * progress;
      cancel(old);
    }
    if (reduced.matches) {
      if (!visible) park(el);
      return;
    }
    const animation = el.animate([{ opacity: from }, { opacity: visible ? 1 : 0 }], {
      duration: visible ? 180 : 140,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    });
    const entry = { el, visible, from, animation };
    active.set(el, entry);
    el.dataset.detailTransition = visible ? 'in' : 'out';
    animation.onfinish = () => {
      if (active.get(el) !== entry) return;
      cancel(entry);
      if (!visible) park(el);
      changed();
    };
  }
  return {
    show,
    // Bitmap stays underneath both incoming and outgoing detail until settled.
    bitmap: () => new Set([...active.keys()].map(el => el.dataset.node)),
    finish(el) { const entry = active.get(el); if (entry) cancel(entry); },
    clear() {
      for (const entry of active.values()) {
        cancel(entry);
        if (!entry.visible) entry.el.remove();
      }
    },
  };
}
