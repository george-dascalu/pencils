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
  const valid = (value) => /^#[\da-f]{6}$/i.test(value);
  function picker({
    value,
    label = "Colour",
    name = "color",
    mixed = false,
    disabled = false,
    selection = false,
  }) {
    const fill = valid(value) ? value.toLowerCase() : "#ffffff";
    return `<details class="color-picker ${selection ? "selection-menu" : ""}" ${selection ? 'data-selection-menu="color"' : ""}><summary aria-label="${esc(label)}" title="${esc(label)}" ${disabled ? 'aria-disabled="true"' : ""}><span class="selection-swatch ${mixed ? "mixed" : ""}" style="--swatch:${fill}"></span>${icon("chevron")}</summary><input type="hidden" data-color-value ${selection ? "data-selection-custom-color" : `name="${esc(name)}"`} value="${fill}"><div class="color-picker-panel ${selection ? "selection-popover" : ""}" role="group" aria-label="${esc(label)}"><strong>${esc(label)}</strong><div class="selection-colors">${colors.map(([color, title]) => `<button type="button" class="selection-swatch" style="--swatch:${color}" data-color-choice="${color}" aria-label="${title}" title="${title}" aria-pressed="${!mixed && fill === color}"></button>`).join("")}</div><label class="color-hex-label">Custom colour<input type="text" data-color-hex aria-label="Custom colour hex" value="${fill}" placeholder="#123abc" maxlength="7" spellcheck="false" autocomplete="off"></label><button type="button" class="button small" data-color-apply>Apply colour</button><span class="color-error" role="status"></span></div></details>`;
  }
  function position(root) {
    if (root.closest("#selection-tools")) return; // Canvas controls clamp this menu to the board.
    const panel = root.querySelector(".color-picker-panel"),
      r = root.querySelector("summary").getBoundingClientRect();
    const height = panel.offsetHeight;
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, r.bottom + height + 8 <= innerHeight ? r.bottom + 8 : r.top - height - 8)}px`;
    panel.style.maxHeight = `${innerHeight - 16}px`;
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
        if (
          root.querySelector("summary").getAttribute("aria-disabled") === "true"
        ) {
          e.preventDefault();
          return;
        }
        document.querySelectorAll(".color-picker[open]").forEach((other) => {
          if (other !== root) close(other);
        });
        requestAnimationFrame(() => position(root));
      }
      const choice = e.target.closest(
        "[data-color-choice], [data-color-apply]",
      );
      if (choice) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(
          root,
          choice.dataset.colorChoice ||
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
        !root.closest("#selection-tools")
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
        const buttons = [...root.querySelectorAll("[data-color-choice]")],
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
