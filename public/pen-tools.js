import { penStyle } from "./pen-model.js";
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
  let partial = saved.partial === true,
    recognise = saved.recognise === true;
  const save = () =>
    storage.set("pen-preferences", {
      active,
      presets,
      partial,
      recognise,
      profiles,
    });
  const style = () => ({ ...presets[active] });
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
  function render() {
    $("#pen-tools")?.remove();
    const canvas = $("#canvas");
    if (!canvas) return;
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
      `<div id="pen-tools" role="toolbar" aria-label="Pen tools"><div class="selection-group">${btn("pen", "Pen", "pencil")}${btn("highlighter", "Highlighter", "highlighter")}${btn("erase", "Eraser (drawings only)", "eraser")}${btn("lasso", "Lasso selection", "group")}</div><div class="selection-group pen-presets">${presets.map((p, i) => `<button type="button" class="pen-preset ${i === active && mode !== "erase" ? "active" : ""}" data-pen-preset="${i}" title="Preset ${i + 1}: ${p.brush}, ${p.strokeWidth}px" aria-label="Pen preset ${i + 1}" aria-pressed="${i === active && mode !== "erase"}"><span style="background:${p.color};height:${Math.min(12, p.strokeWidth + 2)}px"></span></button>`).join("")}</div>${mode !== "erase" ? `<div class="selection-group">${colorPicker({ value: s.color, label: "Pen colour", name: "pen-color" })}<label class="pen-width">${icon("stroke-width")}<select aria-label="Pen thickness" data-pen-width>${[1, 2, 3, 5, 8, 12, 18, 24, 32].map((w) => `<option value="${w}" ${w === s.strokeWidth ? "selected" : ""}>${w} px</option>`).join("")}</select></label></div><label class="pen-pressure" title="Vary line width with stylus pressure"><input type="checkbox" data-pen-pressure ${s.pressure ? "checked" : ""} ${mode === "highlighter" ? "disabled" : ""}>Pressure</label>` : `<label><input type="checkbox" data-pen-partial ${partial ? "checked" : ""}>Partial eraser</label>`}<label><input type="checkbox" data-pen-recognise ${recognise ? "checked" : ""}>Recognise shapes</label><button type="button" class="selection-action" data-pen-done title="Select tool (V)" aria-label="Finish drawing">${icon("check")}</button></div>`,
    );
    const help = $(".board-help");
    if (help)
      help.textContent =
        mode === "erase"
          ? "Erase drawings · Undo restores · Esc to select"
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
    else if (e.target.matches("[data-pen-pressure]"))
      s.pressure = e.target.checked;
    else return;
    save();
    render();
  });
  return { render, style, partial: () => partial, recognise: () => recognise };
}
