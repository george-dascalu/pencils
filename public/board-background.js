import { syncTopbarTitle } from "./topbar-title.js";
import { positionPopover } from "./popover-position.js";
import { dependencyStyle, defaultDependencyStyle } from "./dependency-style.js";
import {
  dependencyStyleHTML,
  readDependencyStyle,
  previewDependencyStyle,
} from "./dependency-style-editor.js";
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
  const pattern = settings.pattern || "dots",
    minorLine = `color-mix(in srgb, ${line} 35%, transparent)`;
  const image =
    pattern === "plain"
      ? "none"
      : pattern === "lines"
        ? `linear-gradient(to bottom, ${line} 1px, transparent 1px)`
        : pattern === "fine-grid"
          ? `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px), linear-gradient(to right, ${minorLine} 1px, transparent 1px), linear-gradient(to bottom, ${minorLine} 1px, transparent 1px)`
          : pattern === "grid"
            ? `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`
            : `radial-gradient(${line} 1px, transparent 1px)`;
  return {
    color,
    image,
    spacing: settings.spacing || 20,
    scales: pattern === "fine-grid" ? [5, 5, 1, 1] : [1],
  };
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
    backgroundSize: style.scales
      .map((scale) => `${size * scale}px ${size * scale}px`)
      .join(", "),
    backgroundPosition: `${camera.x}px ${camera.y}px`,
  });
}
export function boardSettings(ctx, controls) {
  const { $, esc, board, state, icon, colorPicker, changeBoard } = ctx;
  let popup = null,
    trigger = null,
    boardId = null,
    timer = null,
    dirty = false;
  const visibleTrigger = () =>
    [...document.querySelectorAll('[data-feature="board-settings"]')].find(
      (el) =>
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== "hidden",
    );
  function close(focus = false) {
    if (!popup) return;
    flush();
    const old = popup;
    popup = null;
    if (old.matches(":popover-open")) old.hidePopover();
    old.remove();
    trigger?.setAttribute("aria-expanded", "false");
    if (state.dialog === "board-settings") state.dialog = null;
    if (focus)
      (trigger?.isConnected ? trigger : visibleTrigger())?.focus({
        preventScroll: true,
      });
  }
  function position() {
    if (!popup) return;
    if (!["board", "drawing"].includes(state.view) || board()?.id !== boardId) return close();
    if (!trigger?.isConnected) trigger = visibleTrigger();
    if (!trigger) return close();
    const r = trigger.getBoundingClientRect();
    const below = innerHeight - r.bottom - 20;
    const above = below < 240 && r.top > below;
    const available = Math.max(120, above ? r.top - 20 : below);
    popup.style.setProperty("--settings-height", `${available}px`);
    positionPopover(popup, r, { width: popup.offsetWidth || 420, maxHeight: available, gap: 8 });
  }
  window.addEventListener("resize", position);
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener(
    "scroll",
    (e) => {
      if (popup && !popup.contains(e.target)) position();
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        popup &&
        !popup.contains(e.target) &&
        !e.target.closest(
          '#shared-select-menu,[data-feature="board-settings"],[data-action="board-undo"],[data-action="board-redo"]',
        )
      )
        close();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (
        popup &&
        !popup.contains(e.target) &&
        !e.target.closest(
          '#shared-select-menu,[data-feature="board-settings"],[data-action="board-undo"],[data-action="board-redo"]',
        )
      )
        close();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (!popup) return;
      if (e.key === "Escape") {
        if (
          e.target.closest(".color-picker[open]") ||
          document.querySelector("#shared-select-menu")
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close(true);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        ["z", "y"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        flush();
        const redo = e.shiftKey || e.key.toLowerCase() === "y";
        $(`[data-action="board-${redo ? "redo" : "undo"}"]`)?.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        flush();
        close(true);
      }
    },
    true,
  );
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
    previewDependencyStyle(form, esc);
    const settings = values(form);
    paintBoardBackground(form.querySelector(".background-preview"), {
      ...settings,
      pattern: form.elements["show-pattern"].checked
        ? settings.pattern
        : "plain",
    });
    form.querySelector("output").textContent = `${settings.spacing} px`;
    const spacing = form.querySelector('[name="spacing"]');
    spacing.setAttribute("aria-valuetext", `${settings.spacing} px`);
    spacing.disabled = settings.pattern === "plain";
  }
  function open(button = visibleTrigger()) {
    if (popup) return close(true);
    if (!button || !board()) return;
    if (
      state.boardTaskEditor &&
      !ctx.closeDialog(false, { confirmDirty: false })
    )
      return;
    boardId = board().id;
    trigger = button;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", "board-settings-popover");
    trigger.setAttribute("aria-haspopup", "dialog");
    const s = {
      pattern: "dots",
      color: "auto",
      lineColor: "auto",
      spacing: 20,
      ...board().settings?.background,
    };
    const display = controls.display();
    popup = document.createElement("div");
    popup.id = "board-settings-popover";
    popup.className = "board-settings-popover";
    popup.setAttribute("popover", "manual");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Board settings");
    popup.innerHTML = `<form id="board-settings-form"><div class="dialog-head"><h2>Board settings</h2><button type="button" class="button" data-board-settings-reset>Reset</button><button type="button" class="icon-button" data-board-settings-close aria-label="Close board settings">${icon("close")}</button></div><div class="dialog-body"><section class="board-settings-section"><label class="field">Board name<input name="title" value="${esc(board().title)}" required maxlength="300" autocomplete="off"></label></section><section class="board-settings-section" aria-labelledby="board-snapping-heading"><h3 id="board-snapping-heading">Snapping</h3><label class="board-setting-toggle"><input id="canvas-snap" name="snap" type="checkbox" ${board().settings?.snap !== false ? "checked" : ""}><span>Snap to grid<small>Place and resize objects in 20 px steps.</small></span></label><label class="board-setting-toggle"><input id="canvas-align" name="align-objects" type="checkbox" ${board().settings?.alignObjects !== false ? "checked" : ""}><span>Align with nearby objects<small>Snap to edges, centres, equal spacing and matching sizes. Hold Alt while dragging to bypass snapping.</small></span></label></section><section class="board-settings-section" aria-labelledby="board-background-heading"><h3 id="board-background-heading">Background</h3><fieldset class="background-patterns"><legend>Pattern</legend>${[
      ["plain", "Plain"],
      ["dots", "Dots"],
      ["grid", "Grid"],
      ["fine-grid", "Fine grid"],
      ["lines", "Lines"],
    ]
      .map(
        ([value, label]) =>
          `<label><input type="radio" name="pattern" value="${value}" ${s.pattern === value ? "checked" : ""}><span class="pattern-sample pattern-${value}" aria-hidden="true"></span><span>${label}</span></label>`,
      )
      .join(
        "",
      )}</fieldset><div class="field-row"><div class="field">Background colour${colorPicker({ value: s.color === "auto" ? "#f5f6ee" : s.color, name: "background-color", label: "Background colour" })}<label class="background-auto"><input type="checkbox" name="theme-color" ${s.color === "auto" ? "checked" : ""}> Use theme colour</label></div><div class="field">Pattern colour${colorPicker({ value: s.lineColor === "auto" ? "#ced6c1" : s.lineColor, name: "line-color", label: "Pattern colour" })}<label class="background-auto"><input type="checkbox" name="auto-line" ${s.lineColor === "auto" ? "checked" : ""}> Automatic contrast</label></div></div><label class="field">Pattern spacing <output for="board-pattern-spacing">${s.spacing} px</output><input id="board-pattern-spacing" name="spacing" type="range" min="8" max="160" step="4" value="${s.spacing}" aria-valuetext="${s.spacing} px"></label><div class="background-preview" role="img" aria-label="Background preview"><span>Preview</span></div><p class="field-hint">Changes save automatically. Use Ctrl / ⌘ Z to undo. Snapping and background are saved with this board for everyone. Fine grid adds a stronger line every five squares. Pattern spacing sets the small square size; it is visual and does not change the snapping distance.</p></section>${dependencyStyleHTML(board(), ctx)}<section class="board-settings-section" aria-labelledby="board-display-heading"><h3 id="board-display-heading">Display</h3><label class="board-setting-toggle"><input name="show-pattern" type="checkbox" ${display.grid ? "checked" : ""}><span>Show background pattern<small>Toggle with G while on the board.</small></span></label><label class="board-setting-toggle"><input name="show-minimap" type="checkbox" ${display.minimap ? "checked" : ""}><span>Show minimap<small>Toggle with M while on the board.</small></span></label><p class="field-hint">Display preferences are remembered for this board in this browser.</p></section></div></form>`;
    popup.querySelector(".dialog-body").insertAdjacentHTML("afterbegin", `<section class="board-settings-section"><button type="button" class="button" data-feature="miro-import">${icon("download")}Import from Miro</button></section>`);
    document.body.append(popup);
    popup.addEventListener("toggle", (e) => {
      if (e.newState === "closed" && popup === e.target) close();
    });
    popup.showPopover();
    state.dialog = "board-settings";
    preview(popup.querySelector("form"));
    position();
    popup.querySelector('[name="title"]').focus({ preventScroll: true });
  }
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function apply(form) {
    clearTimeout(timer);
    dirty = false;
    if (!board() || board().id !== boardId) return;
    const title = form.elements.title.value.trim();
    form.elements.title.setCustomValidity(
      title ? "" : "Give this board a name.",
    );
    const settings = {
      ...board().settings,
      snap: form.elements.snap.checked,
      alignObjects: form.elements["align-objects"].checked,
      background: values(form),
      dependency_style: readDependencyStyle(form),
    };
    const beforeDisplay = controls.display();
    const display = {
      grid: form.elements["show-pattern"].checked,
      minimap: form.elements["show-minimap"].checked,
    };
    const shared =
      (title && board().title !== title) || !equal(board().settings, settings);
    if (shared)
      changeBoard(
        (b) => {
          if (title) b.title = title;
          b.settings = settings;
        },
        { render: false },
      );
    if (!equal(beforeDisplay, display)) {
      controls.rememberDisplay(beforeDisplay, display, !!shared);
      controls.setDisplay(display);
    }
    const option = $("#board-select option:checked");
    if (option) option.textContent = board().title;
    syncTopbarTitle(state);
    preview(form);
  }
  function flush() {
    clearTimeout(timer);
    if (dirty && popup) apply(popup.querySelector("form"));
    dirty = false;
  }
  function changed(e) {
    const form = e.target.closest("#board-settings-form");
    if (!form || !e.target.name) return;
    if (e.target.name === "background-color")
      form.elements["theme-color"].checked = false;
    if (e.target.name === "line-color")
      form.elements["auto-line"].checked = false;
    if (e.target.name === "pattern")
      form.elements["show-pattern"].checked = true;
    form.elements.title.setCustomValidity(
      form.elements.title.value.trim() ? "" : "Give this board a name.",
    );
    preview(form);
    // Paint continuously while typing/dragging, but save a short burst as one edit.
    const settings = values(form);
    paintBoardBackground($("#canvas"), settings, state.camera);
    dirty = true;
    clearTimeout(timer);
    if (e.type === "input" && ["title", "spacing"].includes(e.target.name))
      timer = setTimeout(() => apply(form), 350);
    else apply(form);
  }
  document.addEventListener("input", changed);
  document.addEventListener("change", changed);
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-board-settings-close]")) return close(true);
    if (!e.target.closest("[data-board-settings-reset]")) return;
    flush();
    const form = $("#board-settings-form");
    form.elements.pattern.value = "dots";
    form.elements["theme-color"].checked = true;
    form.elements["auto-line"].checked = true;
    form.elements.spacing.value = 20;
    for (const [key, value] of Object.entries(defaultDependencyStyle))
      form.elements[`dependency-${key}`].value = value;
    form.elements["dependency-color"].closest(".color-picker").outerHTML =
      colorPicker({
        name: "dependency-color",
        value: defaultDependencyStyle.color,
        label: "Dependency arrow colour",
      });
    for (const name of [
      "snap",
      "align-objects",
      "show-pattern",
      "show-minimap",
    ])
      form.elements[name].checked = true;
    apply(form);
    sync();
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "board-settings-form") return;
    e.preventDefault();
    flush();
  });
  function sync() {
    if (!popup) return;
    if (!["board", "drawing"].includes(state.view) || board()?.id !== boardId) return close();
    trigger = visibleTrigger();
    trigger?.setAttribute("aria-expanded", "true");
    trigger?.setAttribute("aria-controls", "board-settings-popover");
    position();
    if (dirty) return;
    const form = popup.querySelector("form"),
      b = board();
    const s = {
      pattern: "dots",
      color: "auto",
      lineColor: "auto",
      spacing: 20,
      ...b.settings?.background,
    };
    const arrows = dependencyStyle(b, state.project);
    for (const key of ["lineStyle", "width", "toEnd"])
      form.elements[`dependency-${key}`].value = arrows[key];
    form.elements.title.value = b.title;
    form.elements.title.setCustomValidity("");
    form.elements.snap.checked = b.settings?.snap !== false;
    form.elements["align-objects"].checked = b.settings?.alignObjects !== false;
    form.elements.pattern.value = s.pattern;
    form.elements.spacing.value = s.spacing;
    form.elements["theme-color"].checked = s.color === "auto";
    form.elements["auto-line"].checked = s.lineColor === "auto";
    const display = controls.display();
    form.elements["show-pattern"].checked = display.grid;
    form.elements["show-minimap"].checked = display.minimap;
    for (const [name, value, label] of [
      ["dependency-color", arrows.color, "Dependency arrow colour"],
      [
        "background-color",
        s.color === "auto" ? "#f5f6ee" : s.color,
        "Background colour",
      ],
      [
        "line-color",
        s.lineColor === "auto" ? "#ced6c1" : s.lineColor,
        "Pattern colour",
      ],
    ]) {
      const picker = form.elements[name].closest(".color-picker");
      if (form.elements[name].value !== value)
        picker.outerHTML = colorPicker({ name, value, label });
    }
    preview(form);
  }
  return { open, close, flush, sync };
}
