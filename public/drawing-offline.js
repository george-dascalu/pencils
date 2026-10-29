import { randomUUID } from "./uuid.js";
import { localDrawings, drawingCheckpoint } from "./drawing-store.js";
import { strokeMarkup } from "./pen-model.js";
import { inkCapture } from "./ink-capture.js";
import { installColorPickers } from "./color-picker.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const picker = installColorPickers({
    esc,
    icon: (name) => (name === "chevron" ? "⌄" : name === "close" ? "×" : "●"),
  }),
  root = document.querySelector("#offline-drawings");
const owner = JSON.parse(
  localStorage.getItem("pencils:drawing-owner") || '"shared"',
);
let documents = [],
  current = null,
  camera = { x: 40, y: 40, z: 1 },
  capture = null,
  undo = [],
  redo = [],
  saveChain = Promise.resolve(),
  touches = new Map(),
  gesture = null,
  style = { color: "#263c34", strokeWidth: 3, pressure: true },
  raf;
async function gallery() {
  current = null;
  capture?.destroy();
  capture = null;
  documents = await localDrawings(owner);
  root.innerHTML = `<header><h1>Local canvases</h1><a class="button" href="/">Return to workspace</a></header><p>Device: ${esc(owner)}. Edits stay in IndexedDB until you restore a checkpoint in the connected workspace. This page never caches API responses or publishes remote edits.</p>${documents.map((d) => `<div class="local-document"><button class="button" data-open="${esc(d.key)}">${esc(d.board.title)}</button><small>${esc(new Date(d.updated).toLocaleString())} · ${d.pending ? "Pending server sync" : "Server checkpoint"}</small></div>`).join("") || "<p>Prepare offline drawing from the Boards menu while connected first.</p>"}`;
}
function say(text) {
  const el = document.querySelector("[data-save]");
  if (el) el.textContent = text;
}
async function save() {
  const doc = structuredClone(current);
  say("Saving on this device…");
  saveChain = saveChain
    .then(() => drawingCheckpoint(doc.owner, doc.project, doc.board, true))
    .then(() => say("Saved on this device · pending server sync"))
    .catch(() =>
      say("Storage unavailable — export now and keep this tab open"),
    );
  await saveChain;
}
function paint() {
  raf = null;
  if (!current) return;
  document.querySelector("#offline-content").innerHTML =
    `<g transform="translate(${camera.x} ${camera.y}) scale(${camera.z})">${current.board.nodes
      .filter((n) => !n.layerHidden && n.type === "draw")
      .map(
        (n) => `<g transform="translate(${n.x} ${n.y})">${strokeMarkup(n)}</g>`,
      )
      .join("")}</g>`;
}
function render() {
  const ignored = current.board.nodes.some((n) => n.type !== "draw");
  root.innerHTML = `<header><button type="button" class="button" data-gallery><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>Canvases</span></button><h1>${esc(current.board.title)}</h1><span data-save role="status">Local checkpoint</span></header><div class="offline-tools" role="toolbar" aria-label="Drawing tools">${picker({ value: style.color, name: "ink-color", label: "Ink colour" })}<label>Width <input type="range" min="1" max="32" value="${style.strokeWidth}" data-width></label><button type="button" class="button" data-undo aria-label="Undo stroke" title="Undo stroke"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h10a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5"/></svg></button><button type="button" class="button" data-redo aria-label="Redo stroke" title="Redo stroke"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10H11a7 7 0 0 0 0 14m10-14-5-5m5 5-5 5"/></svg></button><button type="button" class="button" data-export>Export editable canvas</button></div>${ignored ? "<p>Offline ink preview shows strokes. Image references and other objects remain in the document and are available when reconnected.</p>" : ""}<div id="offline-canvas" tabindex="0" aria-label="Drawing canvas. Pencil or mouse draws; fingers navigate."><svg id="offline-content"></svg><div id="offline-ink"></div></div>`;
  paint();
  const canvas = document.querySelector("#offline-canvas");
  // Pencil and mouse draw; fingers pan and pinch.
  capture?.destroy();
  capture = inkCapture(canvas, document.querySelector("#offline-ink"), {
    style: () => style,
    camera: () => camera,
    id: () => `n-${randomUUID()}`,
    accepts: (e) => e.pointerType !== "touch",
    onStroke(stroke) {
      undo.push(structuredClone(current.board.nodes));
      if (undo.length > 40) undo.shift();
      redo = [];
      current.board.nodes.push(stroke);
      save();
      paint();
    },
  });
  const resetGesture = () => {
    const p = [...touches.values()];
    gesture = p.length ? { points: p, camera: { ...camera } } : null;
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.pointerType !== "touch") return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    if (capture.active()) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    resetGesture();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...touches.values()],
      old = gesture?.points;
    if (!old) return;
    if (p.length === 2 && old.length === 2) {
      const dist = (a) => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y),
        mid = (a) => ({ x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }),
        a = mid(old),
        b = mid(p),
        r = canvas.getBoundingClientRect(),
        z = Math.max(
          0.1,
          Math.min(5, (gesture.camera.z * dist(p)) / Math.max(1, dist(old))),
        );
      camera = {
        z,
        x:
          b.x -
          r.left -
          ((a.x - r.left - gesture.camera.x) * z) / gesture.camera.z,
        y:
          b.y -
          r.top -
          ((a.y - r.top - gesture.camera.y) * z) / gesture.camera.z,
      };
    } else
      camera = {
        ...gesture.camera,
        x: gesture.camera.x + p[0].x - old[0].x,
        y: gesture.camera.y + p[0].y - old[0].y,
      };
    if (!raf) raf = requestAnimationFrame(paint);
  });
  const lift = (e) => {
    if (touches.delete(e.pointerId)) resetGesture();
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, lift);
  window.addEventListener(
    "blur",
    () => {
      touches.clear();
      gesture = null;
    },
    { once: true },
  );
}
root.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.open) {
    current = structuredClone(documents.find((d) => d.key === b.dataset.open));
    undo = [];
    redo = [];
    render();
  }
  if (b.hasAttribute("data-gallery")) {
    await saveChain;
    await gallery();
  }
  if (b.hasAttribute("data-undo") && undo.length) {
    redo.push(current.board.nodes);
    current.board.nodes = undo.pop();
    paint();
    save();
  }
  if (b.hasAttribute("data-redo") && redo.length) {
    undo.push(current.board.nodes);
    current.board.nodes = redo.pop();
    paint();
    save();
  }
  if (b.hasAttribute("data-export")) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(current.board, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `${current.board.title}.pencils-drawing.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
root.addEventListener("change", (e) => {
  if (e.target.name === "ink-color") style.color = e.target.value;
  if (e.target.hasAttribute("data-width")) style.strokeWidth = +e.target.value;
});
gallery().catch((error) => {
  root.textContent = `Cannot open device storage: ${error.message}`;
});
