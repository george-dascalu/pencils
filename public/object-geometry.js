import {
  noteStyles,
  noteStyleControls,
  paintNoteStyle,
  isNote,
} from "./note-style.js";
import { selectSymbol } from "./select-symbols.js";
export const shapeTypes = [
  "rectangle",
  "rounded",
  "ellipse",
  "diamond",
  "triangle",
  "parallelogram",
  "hexagon",
];
export function shapeSVG(n, esc) {
  const w = n.w,
    h = n.h,
    s = n.shape || "rectangle",
    attrs = `fill="${esc(n.color || "#ffffff")}" stroke="${esc(n.borderColor || "#82937d")}" stroke-width="${n.borderWidth ?? 2}" ${n.borderStyle === "dashed" ? 'stroke-dasharray="10 6"' : n.borderStyle === "dotted" ? 'stroke-dasharray="2 5"' : ""}`;
  const points = {
    diamond: `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`,
    triangle: `${w / 2},2 ${w - 2},${h - 2} 2,${h - 2}`,
    parallelogram: `${w * 0.2},2 ${w - 2},2 ${w * 0.8},${h - 2} 2,${h - 2}`,
    hexagon: `${w * 0.25},2 ${w * 0.75},2 ${w - 2},${h / 2} ${w * 0.75},${h - 2} ${w * 0.25},${h - 2} 2,${h / 2}`,
  };
  return s === "ellipse"
    ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" ${attrs}/>`
    : points[s]
      ? `<polygon points="${points[s]}" ${attrs}/>`
      : `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${s === "rounded" ? Math.min(w, h) * 0.18 : 0}" ${attrs}/>`;
}
export function validObjectGeometry(n) {
  return (
    (n.noteStyle == null ||
      noteStyles.some(([value]) => value === n.noteStyle)) &&
    (n.borderColor == null || /^#[a-f0-9]{6}$/i.test(n.borderColor)) &&
    (n.rotation == null ||
      (Number.isFinite(n.rotation) && Math.abs(n.rotation) <= 360)) &&
    (n.shape == null || shapeTypes.includes(n.shape)) &&
    (n.borderWidth == null || [0, 1, 2, 3, 5, 8].includes(n.borderWidth)) &&
    (n.borderStyle == null ||
      ["solid", "dashed", "dotted"].includes(n.borderStyle)) &&
    (n.crop == null ||
      (Array.isArray(n.crop) &&
        n.crop.length === 4 &&
        n.crop.every((v) => Number.isFinite(v) && v >= 0 && v < 1) &&
        n.crop[0] + n.crop[2] < 0.95 &&
        n.crop[1] + n.crop[3] < 0.95))
  );
}
export function objectGeometryControls(n, ctx) {
  if (["frame", "grid", "query"].includes(n.type)) return "";
  const { icon } = ctx;
  const field = (label, glyph, control, extra = "") =>
    `<label class="geometry-field ${extra}" title="${label}">${icon(glyph)}${control}</label>`;
  const select = (key, label, options, value, suffix = "") =>
    `<span class="symbol-select"><span data-select-symbol-preview aria-hidden="true">${selectSymbol(key, value)}</span>${icon("chevron")}<select data-object-geometry="${key}" data-select-symbol="${key}" aria-label="${label}" title="${label}: ${value}${suffix}">${options.map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${typeof v === "string" ? v[0].toUpperCase() + v.slice(1) : v}${suffix}</option>`).join("")}</select></span>`;
  return `<details class="selection-menu" data-selection-menu="geometry">
    <summary aria-label="Shape, border and rotation" title="Shape, border and rotation">${icon("shape")}${icon("chevron")}</summary>
    <div class="selection-popover geometry-popover" role="group" aria-label="Object appearance">
      ${noteStyleControls(n, ctx)}
      ${n.type === "shape" ? field("Shape", "shape", select("shape", "Shape", shapeTypes, n.shape || "rectangle"), "geometry-wide") : ""}
      ${field("Rotation (degrees)", "rotate", `<input data-object-geometry="rotation" aria-label="Object rotation" type="number" min="-360" max="360" value="${n.rotation || 0}"><span aria-hidden="true">°</span>`)}
      ${field("Border width", "stroke-width", select("borderWidth", "Border width", [0, 1, 2, 3, 5, 8], n.borderWidth ?? 2, " px"))}
      ${field("Border style", "shape", select("borderStyle", "Border style", ["solid", "dashed", "dotted"], n.borderStyle || "solid"), "geometry-wide")}
      <div class="geometry-footer geometry-wide">
        <button type="button" data-pro="object-style" aria-label="Parent frame and appearance" title="Parent frame and appearance">${icon("frame")}<span>Frame</span></button>
        ${ctx.colorPicker({ name: "object-border", label: "Border colour", value: n.borderColor || "#82937d" })}
      </div>
      ${n.type === "image" ? `<div class="geometry-crop geometry-wide"><strong>Crop (%)</strong>${["Left", "Top", "Right", "Bottom"].map((label, i) => `<label title="Crop ${label.toLowerCase()}">${label}<input aria-label="Crop ${label.toLowerCase()}" data-crop-side="${i}" type="range" min="0" max="90" value="${(n.crop?.[i] || 0) * 100}" aria-valuetext="${Math.round((n.crop?.[i] || 0) * 100)}%"></label>`).join("")}<div class="geometry-footer"><button type="button" data-image-command="reset" title="Reset crop">${icon("rotate")} Reset</button><button type="button" data-image-command="replace" title="Replace image">${icon("image")} Replace</button></div></div>` : ""}
    </div>
  </details>`;
}
export function paintObjectGeometry(el, n, esc) {
  paintNoteStyle(el, n, esc);
  el.style.rotate = n.rotation ? `${n.rotation}deg` : "";
  if (n.borderStyle) el.style.borderStyle = n.borderStyle;
  if (n.borderWidth != null) el.style.borderWidth = `${n.borderWidth}px`;
  if (n.borderColor) el.style.borderColor = n.borderColor;
  if (n.type === "shape") {
    el.classList.add("flow-shape");
    el.querySelector(".shape-art")?.remove();
    el.insertAdjacentHTML(
      "afterbegin",
      `<svg class="shape-art" viewBox="0 0 ${n.w} ${n.h}" preserveAspectRatio="none" aria-hidden="true">${shapeSVG(n, esc)}</svg>`,
    );
  }
  const img = el.querySelector("img");
  if (n.type === "image" && img) {
    let wrapper = img.parentElement;
    if (!wrapper.classList.contains("image-crop")) {
      wrapper = document.createElement("div");
      wrapper.className = "image-crop";
      img.before(wrapper);
      wrapper.append(img);
    }
    const [l, t, r, b] = n.crop || [0, 0, 0, 0];
    Object.assign(img.style, {
      position: "absolute",
      width: `${100 / (1 - l - r)}%`,
      height: `${100 / (1 - t - b)}%`,
      maxWidth: "none",
      left: `${(-l * 100) / (1 - l - r)}%`,
      top: `${(-t * 100) / (1 - t - b)}%`,
      objectFit: n.crop?.some(Boolean) ? "fill" : "contain",
    });
  }
}
export function objectGeometry(ctx, pick) {
  const { changeBoard, toast, api, route } = ctx;
  document.addEventListener("change", (e) => {
    const key = e.target.dataset.objectGeometry,
      side = e.target.dataset.cropSide,
      border = e.target.name === "object-border";
    if (!key && side == null && !border) return;
    const nodes = pick().filter((n) => !n.locked);
    if (!nodes.length) return;
    const changes = nodes.map((n) => {
      const next = structuredClone(n);
      if (key)
        next[key] = ["rotation", "borderWidth"].includes(key)
          ? +e.target.value
          : e.target.value;
      if (border) next.borderColor = e.target.value;
      if (side != null) {
        next.crop ||= [0, 0, 0, 0];
        next.crop[+side] = +e.target.value / 100;
      }
      return next;
    });
    if (changes.some((n) => !validObjectGeometry(n))) {
      toast("Keep at least 5% of the image visible.");
      return;
    }
    changeBoard(() => nodes.forEach((n, i) => Object.assign(n, changes[i])));
  });
  document.addEventListener("click", (e) => {
    const style = e.target.closest("[data-note-style]")?.dataset.noteStyle;
    if (style && noteStyles.some(([value]) => value === style)) {
      const notes = pick().filter((n) => !n.locked && isNote(n));
      if (notes.length)
        changeBoard(() =>
          notes.forEach((n) => {
            n.noteStyle = style;
          }),
        );
      return;
    }
    const action = e.target.closest("[data-image-command]")?.dataset
        .imageCommand,
      n = pick()[0];
    if (!action || !n || n.locked) return;
    if (action === "reset") changeBoard(() => delete n.crop);
    if (action === "replace") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.onchange = async () => {
        try {
          const f = input.files[0];
          if (!f) return;
          if (f.size > 10000000) throw Error("Use images under 10 MB.");
          const data = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.onerror = reject;
            r.readAsDataURL(f);
          });
          const a = await api(route("attachments"), {
            method: "POST",
            body: { name: f.name, data },
          });
          changeBoard(() => {
            n.src = a.path;
          });
        } catch (err) {
          toast(err.message, true);
        }
      };
      input.click();
    }
  });
}
