// Safari's screen-edge history gesture is not covered by overscroll-behavior.
// Cancel only starts in the narrow edge gutter; ordinary scrolling, controls,
// text selection and the canvas's Pointer Events remain available.
export function installEdgeSwipeGuard() {
  const start = event => {
    if (event.touches.length !== 1 || !event.cancelable) return;
    if (event.target.closest('button, a, input, textarea, select, summary, [role="button"], [contenteditable]:not([contenteditable="false"])')) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const right = left + (viewport?.width || innerWidth);
    const x = event.touches[0].clientX;
    if (x - left < 20 || right - x < 20) event.preventDefault();
  };
  document.addEventListener("touchstart", start, { passive: false });
  return () => document.removeEventListener("touchstart", start);
}

// Touch devices stay at page scale. CSS touch-action covers Chromium, but iOS
// Safari still zooms the page for a pinch that starts in a dialog or a
// scrolling panel, or spans a dialog and the board. Its gesture events and
// scaled touch moves are cancelled; the board zooms itself through Pointer
// Events, which these do not affect.
export function installPageZoomGuard() {
  if (!(navigator.maxTouchPoints > 0) && !matchMedia("(pointer: coarse)").matches) return () => {};
  const cancel = event => { if (event.cancelable) event.preventDefault(); };
  const move = event => {
    if (event.touches.length > 1 && typeof event.scale === "number" && event.scale !== 1) cancel(event);
  };
  const gestures = ["gesturestart", "gesturechange", "gestureend"];
  for (const type of gestures) document.addEventListener(type, cancel, { passive: false });
  document.addEventListener("touchmove", move, { passive: false });
  return () => {
    for (const type of gestures) document.removeEventListener(type, cancel);
    document.removeEventListener("touchmove", move);
  };
}

// One axis per swipe in a container that scrolls both ways (the Table). iOS
// scrolls such a container diagonally, so touch and pen scrolling is driven
// here (CSS gives the container touch-action: none on touch screens): the
// first 8px of movement pick the axis, the other axis stays put, and a flick
// keeps its momentum along that axis. Mouse, trackpad and wheel input keep
// native scrolling. Drag handles with their own touch-action: none, and the
// text field being edited, keep their gestures.
export function installAxisLockedScroll(selector) {
  const SLOP = 8, FRICTION = 0.998, MIN_SPEED = 0.02;
  let gesture = null, glide = null, swallowClick = 0;
  const stopGlide = () => {
    if (glide) cancelAnimationFrame(glide.frame);
    glide = null;
  };
  const ownGesture = (target, scroller) => {
    if (target === document.activeElement && target.matches?.('input, textarea, [contenteditable]:not([contenteditable="false"])')) return true;
    for (let el = target; el && el !== scroller; el = el.parentElement)
      if (getComputedStyle(el).touchAction === "none") return true;
    return false;
  };
  const down = event => {
    if (event.pointerType === "mouse") return;
    stopGlide();
    if (gesture) { gesture = null; return; } // A second finger ends the swipe.
    const scroller = event.target.closest?.(selector);
    if (!scroller || ownGesture(event.target, scroller)) return;
    gesture = { id: event.pointerId, scroller, x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, axis: null, samples: [] };
  };
  const move = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.hypot(dx, dy) < SLOP) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      // Count from here so the axis starts without a jump.
      gesture.x = event.clientX; gesture.y = event.clientY;
      gesture.left = gesture.scroller.scrollLeft; gesture.top = gesture.scroller.scrollTop;
    }
    event.preventDefault();
    const { scroller, axis } = gesture;
    if (axis === "x") scroller.scrollLeft = gesture.left - (event.clientX - gesture.x);
    else scroller.scrollTop = gesture.top - (event.clientY - gesture.y);
    gesture.samples.push({ t: event.timeStamp, v: axis === "x" ? event.clientX : event.clientY });
    while (gesture.samples.length > 2 && event.timeStamp - gesture.samples[0].t > 100) gesture.samples.shift();
  };
  const up = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const { scroller, axis, samples } = gesture;
    gesture = null;
    if (!axis) return;
    swallowClick = event.timeStamp + 500;
    const first = samples[0], last = samples[samples.length - 1];
    const span = last && first ? last.t - first.t : 0;
    if (event.type === "pointercancel" || span <= 0 || event.timeStamp - last.t > 80) return;
    const velocity = -(last.v - first.v) / span; // px per ms in scroll direction
    if (Math.abs(velocity) < 0.1) return;
    const property = axis === "x" ? "scrollLeft" : "scrollTop";
    let speed = velocity, previous = performance.now(), position = scroller[property], expected = position;
    const step = now => {
      // Anything else that scrolls the table (a jump to a cell, a restored
      // position) ends the glide instead of being overridden.
      if (Math.abs(scroller[property] - expected) > 1) { glide = null; return; }
      const dt = Math.min(48, now - previous);
      previous = now;
      position += speed * dt;
      speed *= FRICTION ** dt;
      const before = scroller[property];
      scroller[property] = position;
      expected = scroller[property];
      // Stop at an edge or when the glide has nearly stopped.
      if (Math.abs(speed) < MIN_SPEED || scroller[property] === before) { glide = null; return; }
      glide.frame = requestAnimationFrame(step);
    };
    glide = { frame: requestAnimationFrame(step) };
  };
  const click = event => {
    if (event.timeStamp > swallowClick) return;
    swallowClick = 0;
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move, { capture: true, passive: false });
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);
  document.addEventListener("click", click, true);
  return () => {
    stopGlide();
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, { capture: true });
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", up, true);
    document.removeEventListener("click", click, true);
  };
}

// Keep native momentum scrolling in a contextual panel. Header/footer gestures
// scroll its content; exhausted or non-scrollable areas never scroll the page.
export function containPanelScroll(panel, contentScroller) {
  function scroll(event, dx, dy) {
    if (event.defaultPrevented || !event.cancelable || (!dx && !dy)) return;
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const delta = vertical ? dy : dx;
    const position = vertical ? "scrollTop" : "scrollLeft";
    const size = vertical ? "scrollHeight" : "scrollWidth";
    const client = vertical ? "clientHeight" : "clientWidth";
    const overflow = vertical ? "overflowY" : "overflowX";
    let withinScroller = false;
    for (let el = event.target; el instanceof Element && panel.contains(el); el = el.parentElement) {
      if (!/^(auto|scroll)$/.test(getComputedStyle(el)[overflow])) continue;
      const max = el[size] - el[client];
      if (max <= 0) continue;
      withinScroller = true;
      if (delta < 0 ? el[position] > 0 : el[position] < max - 1) return;
      // A nested scroller with containment must not hand off to its parent.
      const boundary = getComputedStyle(el)[vertical ? "overscrollBehaviorY" : "overscrollBehaviorX"];
      if (boundary === "contain" || boundary === "none") break;
    }
    event.preventDefault();
    if (vertical && !withinScroller) {
      const content = contentScroller();
      if (content) content.scrollTop += dy;
    }
  }
  const wheel = event => {
    if (event.ctrlKey || event.metaKey) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panel.clientHeight : 1;
    scroll(event, event.deltaX * unit, event.deltaY * unit);
  };
  let touch = null;
  const start = event => {
    touch = event.touches.length === 1 ? event.touches[0] : null;
  };
  const move = event => {
    if (!touch || event.touches.length !== 1) { touch = null; return; }
    const next = event.touches[0];
    const dx = touch.clientX - next.clientX, dy = touch.clientY - next.clientY;
    touch = next;
    scroll(event, dx, dy);
  };
  const end = () => { touch = null; };
  panel.addEventListener("wheel", wheel, { passive: false });
  panel.addEventListener("touchstart", start, { passive: true });
  panel.addEventListener("touchmove", move, { passive: false });
  panel.addEventListener("touchend", end);
  panel.addEventListener("touchcancel", end);
  return () => {
    panel.removeEventListener("wheel", wheel);
    panel.removeEventListener("touchstart", start);
    panel.removeEventListener("touchmove", move);
    panel.removeEventListener("touchend", end);
    panel.removeEventListener("touchcancel", end);
  };
}
