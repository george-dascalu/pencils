import {
  validColor,
  hexToHSV,
  hsvToHex,
  recentColors,
  clamp,
} from "./color-model.js";
import { positionPopover } from "./popover-position.js";
// One swatch, palette and custom-hex editor for every colour field.
export function installColorPickers({ esc, icon }) {
  const colors = [
    ["#ffffff", "White"],
    ["#f5e7a2", "Yellow"],
    ["#edc48b", "Peach"],
    ["#f1a9a0", "Rose"],
    ["#d6e4d3", "Sage"],
    ["#aed7dc", "Sky"],
    ["#d4bee5", "Lilac"],
  ];
  const valid = validColor;
  const recentKey = "pencils:recent-colours";
  const drafts = new WeakMap();
  let recent = [];
  try {
    recent = recentColors(JSON.parse(localStorage.getItem(recentKey)));
  } catch {}
  const recentMarkup = (fill) =>
    Array.from({ length: 6 }, (_, index) => {
      const color = recent[index];
      return color
        ? `<button type="button" class="selection-swatch" style="--swatch:${color}" data-color-recent="${color}" aria-label="Use recent colour ${color}" title="${color}" aria-pressed="${fill === color}"></button>`
        : '<span class="selection-swatch color-recent-empty" aria-hidden="true"></span>';
    }).join("");
  function renderRecent() {
    document.querySelectorAll(".color-picker").forEach((root) => {
      root.querySelector("[data-color-recents]").innerHTML = recentMarkup(
        root.querySelector("[data-color-value]").value,
      );
      if (root.open) position(root);
    });
  }
  function remember(value) {
    recent = recentColors(recent, value);
    try {
      localStorage.setItem(recentKey, JSON.stringify(recent));
    } catch {}
    renderRecent();
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== recentKey) return;
    try {
      recent = recentColors(JSON.parse(e.newValue));
    } catch {
      recent = [];
    }
    renderRecent();
  });
  function paintDraft(root, hsv, updateHex = true) {
    drafts.set(root, hsv);
    const value = hsvToHex(hsv),
      pad = root.querySelector("[data-color-plane]");
    pad.style.setProperty("--hue", hsv.h);
    pad.style.setProperty("--saturation", `${hsv.s * 100}%`);
    pad.style.setProperty("--brightness", `${(1 - hsv.v) * 100}%`);
    pad.setAttribute("aria-valuenow", String(Math.round(hsv.v * 100)));
    pad.setAttribute(
      "aria-valuetext",
      `Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`,
    );
    root.querySelector("[data-color-hue]").value = hsv.h;
    root.querySelector(".color-custom-preview").style.backgroundColor = value;
    if (updateHex) {
      root.querySelector("[data-color-hex]").value = value;
      root.querySelector("[data-color-hex]").removeAttribute("aria-invalid");
      root.querySelector(".color-error").textContent = "";
    }
  }
  function draft(root) {
    if (!drafts.has(root))
      paintDraft(
        root,
        hexToHSV(root.querySelector("[data-color-value]").value),
      );
    return drafts.get(root);
  }
  function picker({
    value,
    label = "Colour",
    name = "color",
    mixed = false,
    disabled = false,
    selection = false,
    menuKey = selection ? "color" : null,
  }) {
    const fill = valid(value) ? value.toLowerCase() : "#ffffff",
      hsv = hexToHSV(fill);
    return `<details class="color-picker ${menuKey ? "selection-menu" : ""}" ${menuKey ? `data-selection-menu="${esc(menuKey)}"` : ""}><summary aria-label="${esc(label)}" title="${esc(label)}" ${disabled ? 'aria-disabled="true"' : ""}><span class="selection-swatch ${mixed ? "mixed" : ""}" style="--swatch:${fill}"></span>${icon("chevron")}</summary><input type="hidden" data-color-value ${selection ? "data-selection-custom-color" : `name="${esc(name)}"`} value="${fill}"><div class="color-picker-panel ${menuKey ? "selection-popover" : ""}" role="group" aria-label="${esc(label)}"><strong>${esc(label)}</strong><div class="selection-colors">${colors.map(([color, title]) => `<button type="button" class="selection-swatch" style="--swatch:${color}" data-color-choice="${color}" aria-label="${title}" title="${title}" aria-pressed="${!mixed && fill === color}"></button>`).join("")}</div><div class="selection-colors color-secondary-row" role="group" aria-label="Custom and recent colours"><button type="button" class="selection-swatch color-custom-toggle" data-color-custom-toggle aria-label="Custom colour picker" title="Custom colour picker" aria-expanded="false"></button><div class="color-recents" data-color-recents>${recentMarkup(fill)}</div></div><div class="color-custom-controls" data-color-custom-controls hidden><div class="color-visual-picker"><div class="color-plane" data-color-plane tabindex="0" role="slider" aria-label="Colour saturation and brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(hsv.v * 100)}" aria-valuetext="Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%" title="Drag to pick a colour. Arrow keys adjust saturation and brightness; Shift for larger steps." style="--hue:${hsv.h};--saturation:${hsv.s * 100}%;--brightness:${(1 - hsv.v) * 100}%"><span class="color-plane-thumb" aria-hidden="true"></span></div><label class="color-hue-label"><span class="sr-only">Colour hue</span><input type="range" data-color-hue aria-label="Colour hue" min="0" max="359" step="1" value="${Math.round(hsv.h)}"></label></div><label class="color-hex-label">Custom colour<span class="color-custom-row"><span class="color-custom-preview" style="background:${fill}" aria-hidden="true"></span><input type="text" data-color-hex aria-label="Custom colour hex" value="${fill}" placeholder="#123abc" maxlength="7" spellcheck="false" autocomplete="off"></span></label><button type="button" class="button small" data-color-apply>Apply colour</button><span class="color-error" role="status"></span></div></div></details>`;
  }
  function position(root) {
    if (root.matches(".selection-menu") && root.closest("#selection-tools"))
      return; // Canvas controls clamp top-level menus.
    const panel = root.querySelector(".color-picker-panel"),
      r = root.querySelector("summary").getBoundingClientRect();
    positionPopover(panel,r,{width:260,maxHeight:innerHeight-16,gap:8});
  }
  function close(root, focus = false) {
    root.open = false;
    if (focus) root.querySelector("summary").focus();
  }
  function choose(root, value) {
    value = value.trim().toLowerCase();
    const hex = root.querySelector("[data-color-hex]");
    if (!valid(value)) {
      hex.setAttribute("aria-invalid", "true");
      root.querySelector(".color-error").textContent =
        "Use six hex digits, for example #66856f.";
      hex.focus();
      return;
    }
    hex.removeAttribute("aria-invalid");
    root.querySelector(".color-error").textContent = "";
    hex.value = value;
    const input = root.querySelector("[data-color-value]");
    input.value = value;
    paintDraft(root, hexToHSV(value));
    remember(value);
    const swatch = root.querySelector("summary .selection-swatch");
    swatch.classList.remove("mixed");
    swatch.style.setProperty("--swatch", value);
    root
      .querySelectorAll("[data-color-choice]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.colorChoice === value),
        ),
      );
    close(root, true);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  let dragging = null;
  function dragColor(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const { pad, root } = dragging,
      rect = pad.getBoundingClientRect();
    paintDraft(root, {
      ...draft(root),
      s: clamp((e.clientX - rect.left) / rect.width),
      v: 1 - clamp((e.clientY - rect.top) / rect.height),
    });
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      const pad = e.target.closest("[data-color-plane]");
      if (!pad || e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pad.focus({ preventScroll: true });
      dragging = {
        pad,
        root: pad.closest(".color-picker"),
        pointerId: e.pointerId,
      };
      pad.setPointerCapture(e.pointerId);
      dragColor(e);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging || e.pointerId !== dragging.pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      dragColor(e);
    },
    true,
  );
  const finishDrag = (e) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const { pad, pointerId } = dragging;
    dragging = null;
    if (pad.hasPointerCapture(pointerId)) pad.releasePointerCapture(pointerId);
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    document.addEventListener(event, finishDrag, true);
  document.addEventListener(
    "input",
    (e) => {
      const root = e.target.closest(".color-picker");
      if (!root) return;
      if (e.target.matches("[data-color-hue]"))
        paintDraft(root, { ...draft(root), h: Number(e.target.value) });
      if (e.target.matches("[data-color-hex]") && valid(e.target.value))
        paintDraft(root, hexToHSV(e.target.value), false);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const pad = e.target.closest("[data-color-plane]");
      if (!pad) return;
      const root = pad.closest(".color-picker"),
        hsv = { ...draft(root) },
        step = e.shiftKey ? 0.1 : 0.01;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(root, hsvToHex(hsv));
        return;
      }
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "ArrowLeft") hsv.s = clamp(hsv.s - step);
      if (e.key === "ArrowRight") hsv.s = clamp(hsv.s + step);
      if (e.key === "ArrowUp") hsv.v = clamp(hsv.v + step);
      if (e.key === "ArrowDown") hsv.v = clamp(hsv.v - step);
      if (e.key === "Home") hsv.s = 0;
      if (e.key === "End") hsv.s = 1;
      paintDraft(root, hsv);
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      document.querySelectorAll(".color-picker[open]").forEach((root) => {
        if (!root.contains(e.target)) close(root);
      });
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const root = e.target.closest(".color-picker");
      if (!root) return;
      if (e.target.closest("summary")) {
        if (!root.open) {
          root.querySelector("[data-color-custom-controls]").hidden = true;
          root
            .querySelector("[data-color-custom-toggle]")
            .setAttribute("aria-expanded", "false");
          paintDraft(
            root,
            hexToHSV(root.querySelector("[data-color-value]").value),
          );
        }
        if (
          root.querySelector("summary").getAttribute("aria-disabled") === "true"
        ) {
          e.preventDefault();
          return;
        }
        document.querySelectorAll(".color-picker[open]").forEach((other) => {
          if (other !== root) close(other);
        });
        if (
          !root.matches(".selection-menu") ||
          !root.closest("#selection-tools")
        ) {
          e.preventDefault();
          if (root.closest("#selection-tools")) e.stopImmediatePropagation();
          root.open = !root.open;
          if (root.open) position(root);
        }
      }
      const toggle = e.target.closest("[data-color-custom-toggle]");
      if (toggle) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const controls = root.querySelector("[data-color-custom-controls]");
        controls.hidden = !controls.hidden;
        toggle.setAttribute("aria-expanded", String(!controls.hidden));
        position(root);
        root.dispatchEvent(
          new CustomEvent("color-picker-resize", { bubbles: true }),
        );
        if (!controls.hidden)
          root
            .querySelector("[data-color-plane]")
            .focus({ preventScroll: true });
        return;
      }
      const choice = e.target.closest(
        "[data-color-choice], [data-color-recent], [data-color-apply]",
      );
      if (choice) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(
          root,
          choice.dataset.colorChoice ||
            choice.dataset.colorRecent ||
            root.querySelector("[data-color-hex]").value,
        );
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const root = e.target.closest(".color-picker");
      if (!root) return;
      if (
        e.key === "Escape" &&
        root.open &&
        (!root.matches(".selection-menu") || !root.closest("#selection-tools"))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(root, true);
      } else if (e.key === "Enter" && e.target.matches("[data-color-hex]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(root, e.target.value);
      } else if (
        root.open &&
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(e.key) &&
        !e.target.matches("input")
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const buttons = [
            ...root.querySelectorAll(
              "[data-color-choice], [data-color-custom-toggle], [data-color-recent]",
            ),
          ],
          index = buttons.indexOf(e.target);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index +
                  (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) +
                  buttons.length) %
                buttons.length;
        buttons[next].focus();
      }
    },
    true,
  );
  const reposition = () =>
    document.querySelectorAll(".color-picker[open]").forEach(position);
  window.addEventListener("resize", reposition);
  document.addEventListener("scroll", reposition, true);
  return picker;
}
