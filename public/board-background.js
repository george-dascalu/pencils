const hex = (value) => /^#[\da-f]{6}$/i.test(value || "");
export function backgroundStyle(settings = {}) {
  const color = hex(settings.color) ? settings.color : "var(--board-paper)",
    line = hex(settings.lineColor)
      ? settings.lineColor
      : hex(settings.color)
        ? parseInt(settings.color.slice(1, 3), 16) * 0.299 +
            parseInt(settings.color.slice(3, 5), 16) * 0.587 +
            parseInt(settings.color.slice(5, 7), 16) * 0.114 >
          140
          ? "#00000026"
          : "#ffffff30"
        : "var(--board-line)";
  const pattern = settings.pattern || "dots";
  const image =
    pattern === "plain"
      ? "none"
      : pattern === "lines"
        ? `linear-gradient(to bottom, ${line} 1px, transparent 1px)`
        : pattern === "grid"
          ? `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`
          : `radial-gradient(${line} 1px, transparent 1px)`;
  return { color, image, spacing: settings.spacing || 20 };
}
export function paintBoardBackground(
  element,
  settings,
  camera = { x: 0, y: 0, z: 1 },
) {
  if (!element) return;
  const style = backgroundStyle(settings),
    size = style.spacing * camera.z;
  Object.assign(element.style, {
    backgroundColor: style.color,
    backgroundImage: style.image,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${camera.x}px ${camera.y}px`,
  });
}
export function boardSettings(ctx, controls) {
  const {
    $,
    esc,
    board,
    showDialog,
    closeDialog,
    dialogHead,
    colorPicker,
    changeBoard,
  } = ctx;
  function values(form) {
    const data = new FormData(form);
    return {
      pattern: data.get("pattern"),
      color: data.has("theme-color") ? "auto" : data.get("background-color"),
      lineColor: data.has("auto-line") ? "auto" : data.get("line-color"),
      spacing: Number(form.elements.spacing.value),
    };
  }
  function preview(form) {
    const settings = values(form);
    paintBoardBackground(form.querySelector(".background-preview"), {
      ...settings,
      pattern: form.elements["show-pattern"].checked
        ? settings.pattern
        : "plain",
    });
    form.querySelector("output").textContent = `${settings.spacing} px`;
    form.querySelector('[name="spacing"]').disabled =
      settings.pattern === "plain";
  }
  function open() {
    const s = {
      pattern: "dots",
      color: "auto",
      lineColor: "auto",
      spacing: 20,
      ...board().settings?.background,
    };
    const display = controls.display();
    showDialog(
      `<dialog class="dialog board-settings-dialog"><form id="board-settings-form">${dialogHead("Board settings")}<div class="dialog-body"><section class="board-settings-section"><label class="field">Board name<input name="title" value="${esc(board().title)}" required maxlength="300" autocomplete="off"></label></section><section class="board-settings-section" aria-labelledby="board-snapping-heading"><h3 id="board-snapping-heading">Snapping</h3><label class="board-setting-toggle"><input id="canvas-snap" name="snap" type="checkbox" ${board().settings?.snap !== false ? "checked" : ""}><span>Snap to grid<small>Place and resize objects in 20 px steps.</small></span></label><label class="board-setting-toggle"><input id="canvas-align" name="align-objects" type="checkbox" ${board().settings?.alignObjects !== false ? "checked" : ""}><span>Align with nearby objects<small>Snap to edges, centres, equal spacing and matching sizes. Hold Alt while dragging to bypass snapping.</small></span></label></section><section class="board-settings-section" aria-labelledby="board-background-heading"><h3 id="board-background-heading">Background</h3><fieldset class="background-patterns"><legend>Pattern</legend>${[
        ["plain", "Plain"],
        ["dots", "Dots"],
        ["grid", "Grid"],
        ["lines", "Lines"],
      ]
        .map(
          ([value, label]) =>
            `<label><input type="radio" name="pattern" value="${value}" ${s.pattern === value ? "checked" : ""}><span class="pattern-sample pattern-${value}" aria-hidden="true"></span><span>${label}</span></label>`,
        )
        .join(
          "",
        )}</fieldset><div class="field-row"><div class="field">Background colour${colorPicker({ value: s.color === "auto" ? "#f5f6ee" : s.color, name: "background-color", label: "Background colour" })}<label class="background-auto"><input type="checkbox" name="theme-color" ${s.color === "auto" ? "checked" : ""}> Use theme colour</label></div><div class="field">Pattern colour${colorPicker({ value: s.lineColor === "auto" ? "#ced6c1" : s.lineColor, name: "line-color", label: "Pattern colour" })}<label class="background-auto"><input type="checkbox" name="auto-line" ${s.lineColor === "auto" ? "checked" : ""}> Automatic contrast</label></div></div><label class="field">Pattern spacing <output>${s.spacing} px</output><input name="spacing" type="range" min="8" max="160" step="4" value="${s.spacing}"></label><div class="background-preview" role="img" aria-label="Background preview"><span>Preview</span></div><p class="field-hint">Snapping and background are saved with this board for everyone. Pattern spacing is visual and does not change the snapping distance.</p></section><section class="board-settings-section" aria-labelledby="board-display-heading"><h3 id="board-display-heading">Display</h3><label class="board-setting-toggle"><input name="show-pattern" type="checkbox" ${display.grid ? "checked" : ""}><span>Show background pattern<small>Toggle with G while on the board.</small></span></label><label class="board-setting-toggle"><input name="show-minimap" type="checkbox" ${display.minimap ? "checked" : ""}><span>Show minimap<small>Toggle with M while on the board.</small></span></label><p class="field-hint">Display preferences are remembered for this board in this browser.</p></section></div><div class="dialog-foot"><button type="button" class="button" data-board-settings-reset>Reset</button><button type="button" class="button" data-action="dialog-close">Cancel</button><button type="submit" class="button primary">Apply settings</button></div></form></dialog>`,
      "board-settings",
    );
    preview($("#board-settings-form"));
  }
  document.addEventListener("input", (e) => {
    const form = e.target.closest("#board-settings-form");
    if (form && e.target.name === "spacing") preview(form);
    if (form && e.target.name === "title") e.target.setCustomValidity("");
  });
  document.addEventListener("change", (e) => {
    const form = e.target.closest("#board-settings-form");
    if (!form) return;
    if (e.target.name === "background-color")
      form.elements["theme-color"].checked = false;
    if (e.target.name === "line-color")
      form.elements["auto-line"].checked = false;
    if (e.target.name === "pattern")
      form.elements["show-pattern"].checked = true;
    preview(form);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-board-settings-reset]")) return;
    const form = $("#board-settings-form");
    form.elements.pattern.value = "dots";
    form.elements["theme-color"].checked = true;
    form.elements["auto-line"].checked = true;
    form.elements.spacing.value = 20;
    for (const name of [
      "snap",
      "align-objects",
      "show-pattern",
      "show-minimap",
    ])
      form.elements[name].checked = true;
    preview(form);
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "board-settings-form") return;
    e.preventDefault();
    const form = e.target,
      background = values(form);
    const title = form.elements.title.value.trim();
    if (!title) {
      form.elements.title.setCustomValidity("Give this board a name.");
      form.elements.title.reportValidity();
      return;
    }
    const snap = form.elements.snap.checked,
      alignObjects = form.elements["align-objects"].checked;
    const display = {
      grid: form.elements["show-pattern"].checked,
      minimap: form.elements["show-minimap"].checked,
    };
    changeBoard((b) => {
      b.title = title;
      b.settings = { ...b.settings, snap, alignObjects, background };
    });
    controls.setDisplay(display);
    closeDialog(true);
  });
  return { open };
}
