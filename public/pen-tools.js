import { penStyle } from "./pen-model.js";
import { gestureSettingsHTML } from "./drawing-gestures.js";
import { positionPopover } from "./popover-position.js";
export const penActive = (tool) => ["draw", "erase", "lasso"].includes(tool);
export function penTools(ctx) {
  const { state, storage, $, icon, colorPicker, renderView } = ctx;
  const defaults = [
    {
      color:
        document.documentElement.dataset.theme === "dark"
          ? "#d6e4d3"
          : "#263c34",
      strokeWidth: 3,
      brush: "pen",
      opacity: 1,
      pressure: true,
    },
    {
      color: "#b64087",
      strokeWidth: 5,
      brush: "pen",
      opacity: 1,
      pressure: true,
    },
    {
      color: "#f4cb48",
      strokeWidth: 18,
      brush: "highlighter",
      opacity: 0.32,
      pressure: false,
    },
  ];
  const saved = storage.get("pen-preferences", {});
  const presets = defaults.map((d, i) => penStyle(saved?.presets?.[i] || d));
  let active =
    Number.isInteger(saved?.active) && saved.active >= 0 && saved.active < 3
      ? saved.active
      : 0;
  const profiles =
    saved.profiles && typeof saved.profiles === "object" ? saved.profiles : {};
  let hand = saved.hand === "left" ? "left" : "right",
    position = saved.position || null,
    curve = Number(saved.curve) || 1;
  let partial = saved.partial === true,
    recognise = saved.recognise === true;
  const save = () =>
    storage.set("pen-preferences", {
      active,
      presets,
      partial,
      recognise,
      profiles,
      hand,
      position,
      curve,
    });
  const style = () => ({ ...presets[active], pressureCurve: curve });
  function setMode(mode) {
    if (["erase", "lasso"].includes(mode)) state.tool = mode;
    else {
      state.tool = "draw";
      profiles[`${active}:${presets[active].brush}`] = { ...presets[active] };
      presets[active] = penStyle(
        profiles[`${active}:${mode}`] || {
          ...presets[active],
          brush: mode,
          strokeWidth: mode === "highlighter" ? 18 : 3,
          opacity: mode === "highlighter" ? 0.32 : 1,
          pressure: mode !== "highlighter",
        },
      );
    }
    save();
    renderView(true);
  }
  function positionPreferences() {
    const preferences = $(".pen-preferences[open]");
    if (!preferences) return;
    positionPopover(preferences.querySelector(".selection-popover"), preferences.querySelector("summary").getBoundingClientRect(), { width: 340, maxHeight: 620 });
  }
  window.addEventListener("resize", positionPreferences);
  window.visualViewport?.addEventListener("resize", positionPreferences);
  window.addEventListener("keydown", event => {
    if (state.dialog) return;
    const preferences = $(".pen-preferences[open]");
    if (event.key === "Escape" && preferences && !$("#shared-select-menu")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      preferences.open = false;
      preferences.querySelector("summary").focus();
    } else if (event.target.matches(".pen-preferences > summary") && ["Enter", " "].includes(event.key)) {
      // Preserve native disclosure keys instead of starting canvas shortcuts.
      event.stopImmediatePropagation();
    }
  }, true);
  function render() {
    $("#pen-tools")?.remove();
    const canvas = $("#canvas");
    if (!canvas) return;
    canvas.dataset.drawingHand = hand;
    canvas.classList.toggle("pen-mode", penActive(state.tool));
    canvas.classList.toggle("pen-eraser", state.tool === "erase");
    const button = $('.board-tools [data-feature="draw-tool"]');
    button?.classList.toggle("active", penActive(state.tool));
    if (!penActive(state.tool)) return;
    const s = style(),
      mode = ["erase", "lasso"].includes(state.tool) ? state.tool : s.brush;
    const btn = (key, title, glyph) =>
      `<button type="button" class="selection-action ${mode === key ? "active" : ""}" data-pen-mode="${key}" title="${title}" aria-label="${title}" aria-pressed="${mode === key}">${icon(glyph)}</button>`;
    canvas.insertAdjacentHTML(
      "beforeend",
      `<div id="pen-tools" role="toolbar" aria-label="Pen tools"><button type="button" class="selection-action" data-pen-move aria-label="Move drawing tools" title="Drag to move tools">⠿</button><div class="selection-group">${btn("pen", "Pen", "pencil")}${btn("highlighter", "Highlighter", "highlighter")}${btn("erase", "Eraser (drawings only)", "eraser")}${btn("lasso", "Lasso selection", "group")}</div><div class="selection-group pen-presets">${presets.map((p, i) => `<button type="button" class="pen-preset ${i === active && mode !== "erase" ? "active" : ""}" data-pen-preset="${i}" title="Preset ${i + 1}: ${p.brush}, ${p.strokeWidth}px" aria-label="Pen preset ${i + 1}" aria-pressed="${i === active && mode !== "erase"}"><span style="background:${p.color};height:${Math.min(12, p.strokeWidth + 2)}px"></span></button>`).join("")}</div>${mode !== "erase" ? `<div class="selection-group">${colorPicker({ value: s.color, label: "Pen colour", name: "pen-color" })}<label class="pen-width">${icon("stroke-width")}<select aria-label="Pen thickness" data-pen-width>${[1, 2, 3, 5, 8, 12, 18, 24, 32].map((w) => `<option value="${w}" ${w === s.strokeWidth ? "selected" : ""}>${w} px</option>`).join("")}</select></label></div><label class="pen-pressure" title="Vary line width with stylus pressure"><input type="checkbox" data-pen-pressure ${s.pressure ? "checked" : ""} ${mode === "highlighter" ? "disabled" : ""}>Pressure</label>` : `<label><input type="checkbox" data-pen-partial ${partial ? "checked" : ""}>Partial eraser</label>`}<label><input type="checkbox" data-pen-recognise ${recognise ? "checked" : ""}>Recognise shapes</label><details class="pen-preferences"><summary title="Pen preferences" aria-label="Pen preferences">⚙</summary><div class="selection-popover"><label>Drawing hand<select data-pen-hand><option value="right" ${hand === "right" ? "selected" : ""}>Right</option><option value="left" ${hand === "left" ? "selected" : ""}>Left</option></select></label><label>Stabilisation<input type="range" data-pen-smoothing min="0" max="0.8" step="0.05" value="${s.smoothing}"></label><label>Pressure response<input type="range" data-pen-curve min="0.4" max="2" step="0.1" value="${curve}"></label><output data-pen-pressure-reading>Draw with Pencil to test pressure.</output>${gestureSettingsHTML()}</div></details><button type="button" class="selection-action" data-pen-done title="Select tool (V)" aria-label="Finish drawing">${icon("check")}</button></div>`,
    );
    const tools = $("#pen-tools");
    tools.querySelector(".pen-preferences").addEventListener("toggle", positionPreferences);
    if (position) {
      tools.style.left = `${Math.max(8, Math.min(position.x, canvas.clientWidth - tools.offsetWidth - 8))}px`;
      tools.style.top = `${Math.max(8, Math.min(position.y, canvas.clientHeight - tools.offsetHeight - 8))}px`;
      tools.style.transform = "none";
      tools.style.bottom = "auto";
    }
    const help = $(".board-help");
    if (help)
      help.textContent =
        mode === "erase"
          ? "Erase drawings · Undo restores · Esc to select"
          : state.view === "board"
            ? "Pencil draws · Fingers select, move, pan and pinch · Gesture shortcuts in Pen preferences"
            : "Drag to draw · Shift for a straight line · P pen · E eraser · Esc to select";
  }
  document.addEventListener("click", (e) => {
    const root = e.target.closest("#pen-tools");
    if (!root) return;
    const mode = e.target.closest("[data-pen-mode]"),
      preset = e.target.closest("[data-pen-preset]");
    if (mode) setMode(mode.dataset.penMode);
    else if (preset) {
      active = +preset.dataset.penPreset;
      state.tool = "draw";
      save();
      renderView(true);
    } else if (e.target.closest("[data-pen-done]")) {
      state.tool = "cursor";
      renderView(true);
    }
  });
  document.addEventListener("change", (e) => {
    if (!e.target.closest("#pen-tools")) return;
    if (e.target.matches("[data-pen-hand]")) {
      hand = e.target.value;
      position = null;
      save();
      render();
      return;
    }
    if (e.target.matches("[data-pen-curve]")) {
      curve = +e.target.value;
      save();
      return;
    }
    if (e.target.matches("[data-pen-partial]")) {
      partial = e.target.checked;
      save();
      return;
    }
    if (e.target.matches("[data-pen-recognise]")) {
      recognise = e.target.checked;
      save();
      return;
    }
    const s = presets[active];
    if (e.target.name === "pen-color") s.color = e.target.value;
    else if (e.target.matches("[data-pen-width]"))
      s.strokeWidth = +e.target.value;
    else if (e.target.matches("[data-pen-smoothing]"))
      s.smoothing = Number(e.target.value);
    else if (e.target.matches("[data-pen-pressure]"))
      s.pressure = e.target.checked;
    else return;
    save();
    render();
  });
  let moving = null;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const handle = e.target.closest("[data-pen-move]");
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      const box = $("#pen-tools").getBoundingClientRect(),
        canvas = $("#canvas").getBoundingClientRect();
      moving = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: box.left - canvas.left,
        top: box.top - canvas.top,
      };
      handle.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "pen") {
        const out = $("[data-pen-pressure-reading]");
        if (out)
          out.textContent = `Pressure ${Math.round(e.pressure * 100)}% · tilt ${Math.round(e.tiltX)}°, ${Math.round(e.tiltY)}°`;
      }
      if (!moving || e.pointerId !== moving.id) return;
      const tools = $("#pen-tools"),
        canvas = $("#canvas");
      if (!tools || !canvas) return;
      position = {
        x: Math.max(
          8,
          Math.min(
            moving.left + e.clientX - moving.x,
            canvas.clientWidth - tools.offsetWidth - 8,
          ),
        ),
        y: Math.max(
          8,
          Math.min(
            moving.top + e.clientY - moving.y,
            canvas.clientHeight - tools.offsetHeight - 8,
          ),
        ),
      };
      tools.style.left = position.x + "px";
      tools.style.top = position.y + "px";
      tools.style.bottom = "auto";
      tools.style.transform = "none";
    },
    true,
  );
  const finishMove = (e) => {
    if (e.pointerId === moving?.id) {
      moving = null;
      save();
    }
  };
  document.addEventListener("pointerup", finishMove, true);
  document.addEventListener("pointercancel", finishMove, true);
  let lastBrush = presets[active].brush;
  return {
    render, style, partial: () => partial, recognise: () => recognise,
    busy: () => !!moving || !!$(".pen-preferences[open]"),
    toggleEraser() {
      if (state.tool === "erase") setMode(lastBrush);
      else { lastBrush = presets[active].brush; setMode("erase"); }
    },
  };
}
