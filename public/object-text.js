import { selectedCells, gridCell } from "./board-grid.js";
import { nodeFill, readableText, visualNodeType } from "./node-layout.js";
export const objectFonts = [
  "inherit",
  "Manrope",
  "DM Sans",
  "Space Grotesk",
  "Outfit",
  "Sora",
  "Work Sans",
  "Lora",
  "Fraunces",
];
const defaultFontSize = (n) =>
  n.type === "grid" ? 14 : n.type === "frame" ? 18 : 16;
export const styleKeys = [
  "bold",
  "italic",
  "strike",
  "fontSize",
  "fontFamily",
  "verticalAlign",
  "textAlign",
  "align",
  "color",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "noteStyle",
];
export function validTextStyle(n) {
  return (
    ["bold", "italic", "strike"].every(
      (key) => n[key] == null || typeof n[key] === "boolean",
    ) &&
    (n.fontSize == null ||
      (Number.isFinite(n.fontSize) && n.fontSize >= 8 && n.fontSize <= 144)) &&
    (n.fontFamily == null || objectFonts.includes(n.fontFamily)) &&
    (n.verticalAlign == null ||
      ["auto", "top", "middle", "bottom"].includes(n.verticalAlign)) &&
    // Accept legacy metadata without applying automatic text shrinking.
    (n.autoFit == null || typeof n.autoFit === "boolean")
  );
}
export function textStyleControls(n, { esc, icon, state, textNodes }) {
  const value =
    n.type === "grid"
      ? {
          ...n,
          ...n.grid.cells[gridCell(state, n).row][gridCell(state, n).column],
        }
      : n;
  const cells =
    n.type === "grid"
      ? selectedCells(state, n).map(([r, c]) => ({
          ...n,
          ...n.grid.cells[r][c],
        }))
      : textNodes || [n];
  const disabled =
    n.type === "grid" ? n.locked : cells.every((cell) => cell.locked);
  const emphasis =
    n.type === "grid" && !state.canvasEditing
      ? `<div class="grid-text-emphasis" role="group" aria-label="Text emphasis">${[
          ["bold", "Bold", "bold"],
          ["italic", "Italic", "italic"],
          ["strike", "Strikethrough", "strike"],
        ]
          .map(([key, label, glyph]) => {
            const count = cells.filter((cell) => cell[key]).length;
            return `<button type="button" class="selection-action" data-cell-text-toggle="${key}" aria-label="${label}" title="${label}" aria-pressed="${count === cells.length ? "true" : count ? "mixed" : "false"}" ${disabled ? "disabled" : ""}>${icon(glyph)}</button>`;
          })
          .join("")}</div>`
      : "";
  const mixed = (key) =>
    new Set(
      cells.map(
        (cell) =>
          cell[key] ??
          {
            fontFamily: "inherit",
            fontSize: defaultFontSize(n),
            verticalAlign: "auto",
          }[key],
      ),
    ).size > 1;
  const select = (key, label, choices, current) =>
    `<label class="object-text-control" title="${label}"><span class="sr-only">${label}</span><select data-text-style="${key}" aria-label="${label}" ${disabled ? "disabled" : ""}>${mixed(key) ? '<option value="" selected disabled>Mixed</option>' : ""}${choices.map(([v, t]) => `<option value="${esc(v)}" ${!mixed(key) && String(v) === String(current) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const vertical = `<div class="text-alignment-row vertical-alignment-row" role="group" aria-label="Vertical text alignment">${[
    ["top", "Align text top", "text-top"],
    ["middle", "Align text middle", "text-middle"],
    ["bottom", "Align text bottom", "text-bottom"],
    ["auto", "Automatic vertical alignment", "refresh"],
  ]
    .map(
      ([value, label, glyph]) =>
        `<button type="button" class="selection-action" data-text-style="verticalAlign" value="${value}" aria-label="${label}" title="${label}" aria-pressed="${!mixed("verticalAlign") && (cells[0].verticalAlign || "auto") === value}" ${disabled ? "disabled" : ""}>${icon(glyph)}</button>`,
    )
    .join("")}</div>`;
  return `${vertical}${emphasis}<div class="selection-group object-typography" role="group" aria-label="Text appearance">${select(
    "fontFamily",
    "Object font",
    objectFonts.map((v) => [v, v === "inherit" ? "Default font" : v]),
    value.fontFamily || "inherit",
  )}${select(
    "fontSize",
    "Font size",
    [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96, 144].map((v) => [
      v,
      `${v}`,
    ]),
    value.fontSize || defaultFontSize(n),
  )}</div>`;
}
export function paintTextStyle(el, n) {
  if (!el) return;
  if (["sticky", "shape"].includes(visualNodeType(n)))
    el.style.color = readableText(nodeFill(n));
  const font =
    objectFonts.includes(n.fontFamily) && n.fontFamily !== "inherit"
      ? `'${n.fontFamily}'`
      : "var(--app-font, sans-serif)";
  el.style.setProperty("--object-font", font);
  el.style.setProperty(
    "--object-font-size",
    `${n.fontSize || defaultFontSize(n)}px`,
  );
  const align = { top: "flex-start", middle: "center", bottom: "flex-end" }[
    n.verticalAlign
  ];
  const content = el.querySelector(".board-node-content");
  if (content) {
    content.style.justifyContent = align || "";
  }
  if (n.type === "sticky")
    el.style.setProperty(
      "--note-text-alignment",
      { top: "start", middle: "safe center", bottom: "safe end" }[
        n.verticalAlign
      ] || "safe center",
    );
  if (n.type === "grid") {
    el.querySelectorAll(".grid-cell").forEach((cell) => {
      const data = {
          ...n,
          ...n.grid.cells[+cell.dataset.gridRow][+cell.dataset.gridColumn],
        },
        texts = cell.querySelectorAll(".grid-cell-text");
      cell.style.setProperty(
        "--object-font",
        objectFonts.includes(data.fontFamily) && data.fontFamily !== "inherit"
          ? `'${data.fontFamily}'`
          : font,
      );
      cell.style.setProperty("--object-font-size", `${data.fontSize || 14}px`);
      for (const text of texts) {
        text.style.fontWeight = data.bold ? "700" : "";
        text.style.fontStyle = data.italic ? "italic" : "";
        text.style.textDecoration = data.strike ? "line-through" : "";
        text.style.fontFamily = "var(--object-font)";
        text.style.fontSize = "var(--object-font-size)";
        text.style.justifyContent =
          { top: "flex-start", middle: "center", bottom: "flex-end" }[
            data.verticalAlign
          ] || "flex-start";
      }
    });
  }
}
export function objectText(ctx, pick) {
  const { state, board, changeBoard, toast } = ctx;
  let clipboard = null;
  const targets = () => {
    const nodes = pick().filter((n) => !n.locked);
    return nodes.length === 1 && nodes[0].type === "grid"
      ? selectedCells(state, nodes[0]).map(
          ([r, c]) => nodes[0].grid.cells[r][c],
        )
      : nodes;
  };
  const change = (fn) => {
    if (state.canvasEditing) {
      ctx.remember();
      fn();
      ctx.saveBoard();
      for (const n of pick())
        paintTextStyle(
          document.querySelector(`[data-node="${CSS.escape(n.id)}"]`),
          n,
        );
    } else changeBoard(fn);
  };
  function updateStyle(e) {
    const el = e.target.closest("[data-text-style]");
    if (!el || el.disabled || !["board", "drawing"].includes(state.view)) return;
    const restoreFocus = document.activeElement === el;
    const toolbar = el.closest(".inline-floating-tools")
      ? ".inline-floating-tools"
      : "#selection-tools";
    const key = el.dataset.textStyle,
      value = key === "fontSize" ? Number(el.value) : el.value;
    if (!validTextStyle({ [key]: value })) return;
    const changed = targets().filter((n) => n[key] !== value);
    if (changed.length) change(() => changed.forEach((n) => (n[key] = value)));
    if (key === "verticalAlign") {
      if (restoreFocus)
        document
          .querySelector(
            `${toolbar} button[data-text-style="verticalAlign"][value="${value}"]`,
          )
          ?.focus({ preventScroll: true });
      document
        .querySelectorAll('button[data-text-style="verticalAlign"]')
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(
              targets().every(
                (n) => (n.verticalAlign || "auto") === button.value,
              ),
            ),
          );
        });
    }
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest('button[data-text-style="verticalAlign"]'))
      updateStyle(e);
  });
  document.addEventListener("input", updateStyle);
  document.addEventListener("change", updateStyle);
  let repaint = null;
  document.addEventListener("input", (e) => {
    if (
      !state.canvasEditing ||
      !e.target.closest("#canvas-inline-form") ||
      repaint
    )
      return;
    repaint = requestAnimationFrame(() => {
      repaint = null;
      const el = document.querySelector(".board-node.inline-editing");
      const n = board()?.nodes.find((n) => n.id === el?.dataset.node);
      if (n) paintTextStyle(el, n);
    });
  });
  function copy() {
    const n = targets()[0];
    if (!n) return;
    clipboard = Object.fromEntries(
      styleKeys.filter((k) => n[k] != null).map((k) => [k, n[k]]),
    );
    toast("Formatting copied.");
  }
  function paste() {
    if (!clipboard) return;
    change(() =>
      targets().forEach((n) => {
        for (const k of styleKeys) delete n[k];
        Object.assign(n, clipboard);
        if (n.type) {
          n.textAlign = clipboard.textAlign || clipboard.align || "left";
          delete n.align;
        } else {
          n.align = clipboard.align || clipboard.textAlign || "left";
          delete n.textAlign;
        }
      }),
    );
  }
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-cell-text-toggle]");
    if (toggle && !toggle.disabled && ["board", "drawing"].includes(state.view)) {
      const cells = targets(),
        key = toggle.dataset.cellTextToggle;
      if (!cells.length || !["bold", "italic", "strike"].includes(key)) return;
      const value = !cells.every((cell) => cell[key]);
      change(() => cells.forEach((cell) => (cell[key] = value)));
      document
        .querySelector('[data-selection-menu="text-align"] > summary')
        ?.focus({ preventScroll: true });
      return;
    }
    const a = e.target.closest("[data-object-style]");
    if (a) {
      a.dataset.objectStyle === "copy" ? copy() : paste();
    }
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        !["board", "drawing"].includes(state.view) ||
        state.dialog ||
        state.canvasEditing ||
        e.target.closest("input,textarea,[contenteditable]")
      )
        return;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.altKey &&
        ["c", "v"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.key.toLowerCase() === "c" ? copy() : paste();
      }
    },
    true,
  );
}
