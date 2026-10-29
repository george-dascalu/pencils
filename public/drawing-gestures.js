export const gestureDefaults = {
  doubleTap: "toggle-eraser",
  twoFingerTap: "undo",
  penButton: "toggle-eraser",
};
export const gestureActions = {
  none: "Do nothing",
  undo: "Undo",
  redo: "Redo",
  "toggle-eraser": "Switch pen / eraser",
  fit: "Fit canvas",
};
export function normaliseGestures(value = {}) {
  return Object.fromEntries(
    Object.entries(gestureDefaults).map(([key, fallback]) => [
      key,
      Object.hasOwn(gestureActions, value?.[key]) ? value[key] : fallback,
    ]),
  );
}
export function readGestures() {
  try {
    return normaliseGestures(
      JSON.parse(localStorage.getItem("pencils:drawing-gestures")),
    );
  } catch {
    return { ...gestureDefaults };
  }
}
export function gestureSettingsHTML({ compact = false } = {}) {
  const prefs = readGestures();
  return `<fieldset class="appearance-group drawing-gesture-settings"><legend>Board gestures</legend>
    ${compact ? "" : '<p class="field-hint">Pencil draws. Drag empty space with one finger to pan; tap or drag an object to select or move it. Pinch with two fingers to zoom.</p>'}
    ${[
      ["doubleTap", "Double-tap canvas"],
      ["twoFingerTap", "Two-finger tap"],
      ["penButton", "Pen side button (supported pens)"],
    ]
      .map(
        ([key, title]) =>
        `<label class="field">${title}<select data-drawing-gesture="${key}" aria-label="${title}">${Object.entries(
            gestureActions,
          )
            .map(
              ([action, name]) =>
                `<option value="${action}" ${prefs[key] === action ? "selected" : ""}>${name}</option>`,
            )
            .join("")}</select></label>`,
      )
      .join("")}
    ${compact ? "" : '<p class="field-hint">Apple Pencil barrel taps are unavailable in this browser app. The side-button shortcut works only with pens that send a button event. Use a canvas gesture or the pen/eraser buttons with Apple Pencil.</p>'}
    <small data-gesture-save role="status" ${compact ? 'class="sr-only"' : ""}>${compact ? "" : "Changes apply immediately on this browser."}</small>
  </fieldset>`;
}
export function installGestureSettings() {
  const syncFields = () => {
    const prefs = readGestures();
    for (const field of document.querySelectorAll("[data-drawing-gesture]"))
      field.value = prefs[field.dataset.drawingGesture];
  };
  window.addEventListener("storage", (event) => {
    if (event.key === "pencils:drawing-gestures" || event.key === null)
      syncFields();
  });
  document.addEventListener("change", (event) => {
    const key = event.target.dataset.drawingGesture;
    if (!Object.hasOwn(gestureDefaults, key)) return;
    const prefs = normaliseGestures({
      ...readGestures(),
      [key]: event.target.value,
    });
    const status = event.target
      .closest(".drawing-gesture-settings")
      ?.querySelector("[data-gesture-save]");
    try {
      localStorage.setItem("pencils:drawing-gestures", JSON.stringify(prefs));
      syncFields();
      if (status) status.textContent = "Saved in this browser.";
    } catch {
      if (status)
        status.textContent =
          "Browser storage unavailable; this change could not be saved.";
    }
  });
}

// Coordinates are screen pixels, so tap tolerances do not change with zoom.
export function tapGestures() {
  const points = new Map();
  let session = null,
    last = null;
  const reset = () => {
    points.clear();
    session = last = null;
  };
  function down(e, target = "canvas") {
    if (!points.size)
      session = { start: e.timeStamp, max: 0, valid: true, target };
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    session.max = Math.max(session.max, points.size);
    if (
      points.size > 2 ||
      (points.size > 1 && e.timeStamp - session.start > 150)
    )
      session.valid = false;
  }
  function move(e) {
    const p = points.get(e.pointerId);
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6)
      session.valid = false;
  }
  function up(e, cancel = false) {
    if (!points.has(e.pointerId)) return null;
    move(e);
    if (cancel) session.valid = false;
    points.delete(e.pointerId);
    if (points.size) return null;
    const s = session;
    session = null;
    if (!s.valid || e.timeStamp - s.start > 350) {
      last = null;
      return null;
    }
    if (s.max === 2) {
      last = null;
      return "twoFingerTap";
    }
    const tap = {
      x: e.clientX,
      y: e.clientY,
      time: e.timeStamp,
      target: s.target,
    };
    if (
      last &&
      s.start - last.time <= 350 &&
      last.target === tap.target &&
      Math.hypot(tap.x - last.x, tap.y - last.y) <= 24
    ) {
      last = null;
      return "doubleTap";
    }
    last = tap;
    return null;
  }
  return { down, move, up, reset };
}
