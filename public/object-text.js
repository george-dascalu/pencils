import { selectedCells, gridCell } from "./board-grid.js";
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
  "fontSize",
  "fontFamily",
  "verticalAlign",
  "autoFit",
  "textAlign",
  "align",
  "color",
  "borderColor",
  "borderWidth",
  "borderStyle",
];
export function validTextStyle(n) {
  return (
    (n.fontSize == null ||
      (Number.isFinite(n.fontSize) && n.fontSize >= 8 && n.fontSize <= 144)) &&
    (n.fontFamily == null || objectFonts.includes(n.fontFamily)) &&
    (n.verticalAlign == null ||
      ["auto", "top", "middle", "bottom"].includes(n.verticalAlign)) &&
    (n.autoFit == null || typeof n.autoFit === "boolean")
  );
}
export function textStyleControls(n, { esc, icon, state }) {
  const value =
    n.type === "grid"
      ? {
          ...n,
          ...n.grid.cells[gridCell(state, n).row][gridCell(state, n).column],
        }
      : n;
  const select = (key, label, choices, current) =>
    `<label class="object-text-control" title="${label}"><span class="sr-only">${label}</span><select data-text-style="${key}" aria-label="${label}" ${n.locked ? "disabled" : ""}>${choices.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(current) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  return `<div class="selection-group object-typography" role="group" aria-label="Text appearance">${select(
    "fontFamily",
    "Object font",
    objectFonts.map((v) => [v, v === "inherit" ? "Workspace font" : v]),
    value.fontFamily || "inherit",
  )}${select(
    "fontSize",
    "Font size",
    [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96, 144].map((v) => [
      v,
      `${v}`,
    ]),
    value.fontSize || defaultFontSize(n),
  )}${select(
    "verticalAlign",
    "Vertical alignment",
    [
      ["auto", "Auto"],
      ["top", "Top"],
      ["middle", "Middle"],
      ["bottom", "Bottom"],
    ],
    value.verticalAlign || "auto",
  )}<label class="object-fit-label" title="Shrink text to fit the object"><input type="checkbox" data-text-style="autoFit" ${value.autoFit ? "checked" : ""} ${n.locked ? "disabled" : ""}>Fit</label></div>`;
}
export function paintTextStyle(el, n) {
  if (!el) return;
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
  if (n.type === "grid") {
    el.querySelectorAll(".grid-cell").forEach((cell) => {
      const data = {
          ...n,
          ...n.grid.cells[+cell.dataset.gridRow][+cell.dataset.gridColumn],
        },
        texts = cell.querySelectorAll(".grid-cell-text"),
        text = [...texts].find((text) => !text.classList.contains("hidden"));
      cell.style.setProperty(
        "--object-font",
        objectFonts.includes(data.fontFamily) && data.fontFamily !== "inherit"
          ? `'${data.fontFamily}'`
          : font,
      );
      cell.style.setProperty("--object-font-size", `${data.fontSize || 14}px`);
      for (const text of texts) {
        text.style.fontFamily = "var(--object-font)";
        text.style.fontSize = "var(--object-font-size)";
        text.style.justifyContent =
          { top: "flex-start", middle: "center", bottom: "flex-end" }[
            data.verticalAlign
          ] || "flex-start";
      }
      if (data.autoFit && text) fit(text, data.fontSize || 14, cell);
    });
  } else if (n.autoFit && content) {
    fit(content, n.fontSize || defaultFontSize(n), el);
  }
}
function fit(content, max, root) {
  for (let size = max; size >= 8; size -= 1) {
    if (root) root.style.setProperty("--object-font-size", `${size}px`);
    else content.style.fontSize = `${size}px`;
    const overflow = [
      content,
      ...content.querySelectorAll(
        ".node-text,.note-content,.canvas-markdown,.task-title",
      ),
    ].some(
      (e) =>
        e.scrollHeight > e.clientHeight + 2 ||
        e.scrollWidth > e.clientWidth + 2,
    );
    if (!overflow) break;
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
    if (!el || state.view !== "board") return;
    const key = el.dataset.textStyle,
      value =
        key === "autoFit"
          ? el.checked
          : key === "fontSize"
            ? Number(el.value)
            : el.value;
    if (!validTextStyle({ [key]: value })) return;
    const changed = targets().filter((n) => n[key] !== value);
    if (changed.length) change(() => changed.forEach((n) => (n[key] = value)));
  }
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
    const a = e.target.closest("[data-object-style]");
    if (a) {
      a.dataset.objectStyle === "copy" ? copy() : paste();
    }
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        state.view !== "board" ||
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
