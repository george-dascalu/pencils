// Fade only mounted detail, with the bitmap visible underneath. No snapshots,
// cloned cards or canvas animation loop; zoom reversals reuse the same element.
export function boardDetailTransition({ park, changed }) {
  const active = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 220, exitDuration = 160;
  function cancel(entry) {
    entry.animation.onfinish = null;
    entry.animation.cancel();
    delete entry.el.dataset.detailTransition;
    active.delete(entry.el);
  }
  function show(el, visible, fresh = false) {
    const old = active.get(el);
    if (old?.visible === visible || (!old && visible && !fresh)) return;
    if (reduced.matches) {
      if (old) cancel(old);
      if (!visible) park(el);
      return;
    }
    // Retarget the same timeline, keeping its current opacity when the wheel
    // reverses. Never restart a nearly finished fade with a full new duration.
    const animation = old?.animation || el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'both',
    });
    if (!old) { animation.pause(); animation.currentTime = visible ? 0 : duration; }
    const entry = old || { el, animation };
    entry.visible = visible;
    active.set(el, entry);
    el.dataset.detailTransition = visible ? 'in' : 'out';
    animation.updatePlaybackRate(visible ? 1 : -duration / exitDuration);
    animation.play();
    animation.onfinish = () => {
      if (active.get(el) !== entry || animation.playState !== 'finished') return;
      cancel(entry);
      if (!entry.visible) park(el);
      changed();
    };
  }
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    for (const entry of active.values()) {
      cancel(entry);
      if (!entry.visible) park(entry.el);
    }
    changed();
  });
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
