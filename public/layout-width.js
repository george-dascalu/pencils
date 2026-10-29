// Width of the workspace column (.main) rather than the window, so JavaScript
// layout decisions account for an open sidebar. The matching CSS expresses the
// same thresholds as viewport media queries combined with the sidebar state
// (:root[data-sidebar]), which keeps style changes synchronous with resizes.
export function mainWidth() {
  const main = document.querySelector(".main");
  return main ? main.getBoundingClientRect().width || innerWidth : innerWidth;
}

const queries = new Set();
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  const update = () => { for (const q of queries) q.update(); };
  addEventListener("resize", update);
  addEventListener("pencils-appearance", () => requestAnimationFrame(update));
}

// A matchMedia-like object for a maximum .main width: `matches` plus
// `addEventListener("change", fn)`.
export function mainQuery(maxWidth) {
  install();
  const listeners = new Set();
  const query = {
    get matches() {
      return mainWidth() <= maxWidth;
    },
    addEventListener(_type, fn) {
      listeners.add(fn);
    },
    removeEventListener(_type, fn) {
      listeners.delete(fn);
    },
  };
  let last = query.matches;
  queries.add({
    update() {
      const next = query.matches;
      if (next === last) return;
      last = next;
      for (const fn of listeners) fn(query);
    },
  });
  return query;
}
