import { selectSymbol } from "./select-symbols.js";
import { positionPopover } from "./popover-position.js";
// Keep native selects as the form controls; share a themed menu across every view.
export function installSelectMenus({ esc, icon, taskColor = () => "" }) {
  let source,
    menu,
    frame,
    query = "",
    typedAt = 0,
    touchStart,
    touchClick;
  const eligible = (el) =>
    el instanceof HTMLSelectElement &&
    !el.multiple &&
    el.size <= 1 &&
    !el.hidden &&
    !el.closest("[hidden], [data-task-picker]") &&
    !el.matches(":disabled");
  const options = () => [
    ...menu.querySelectorAll('[role="option"]:not(:disabled)'),
  ];
  const label = (select) =>
    select.getAttribute("aria-label") ||
    select.labels?.[0]?.textContent.trim().split("\n")[0] ||
    select.title ||
    select.name ||
    "Choose an option";
  function close(focus = false) {
    if (!menu) return;
    const target = source;
    menu.remove();
    menu = source = null;
    cancelAnimationFrame(frame);
    target.removeAttribute("aria-controls");
    target.setAttribute("aria-expanded", "false");
    if (focus && target.isConnected) target.focus({ preventScroll: true });
  }
  function position() {
    if (!menu) return;
    if (
      !source.isConnected ||
      !source.getClientRects().length ||
      source.matches(":disabled") ||
      source.closest("dialog:not([open]), details:not([open]), [hidden]")
    )
      return close();
    const r = source.getBoundingClientRect();
    positionPopover(menu, r, {
      width: Math.max(r.width, source.dataset.selectSymbol ? 116 : 220),
    });
  }
  function track() {
    position();
    if (menu) frame = requestAnimationFrame(track);
  }
  function paint() {
    const focused = menu.querySelector(":focus")?.dataset.selectIndex;
    let group;
    menu.innerHTML = [...source.options]
      .map((option, index) => {
        if (option.hidden || option.parentElement.hidden) return "";
        const parent = option.parentElement;
        const heading =
          parent.tagName === "OPTGROUP" && parent !== group
            ? `<div class="select-menu-group" role="presentation">${esc(parent.label)}</div>`
            : "";
        group = parent;
        const field =
          source.dataset.taskField ||
          source.dataset.canvasTaskField ||
          source.name;
        const symbol =
          option.dataset.icon ||
          (field === "priority" ? `priority-${option.value}` : "");
        const sample = selectSymbol(source.dataset.selectSymbol, option.value);
        const colorField =
          source.closest("[data-task-color]")?.dataset.taskColor || field;
        const color = taskColor(colorField, option.value);
        return `${heading}<button type="button" role="option" tabindex="-1" ${color ? `data-task-color="${esc(colorField)}" style="--task-field-color:${color}"` : ""} data-select-index="${index}" aria-selected="${option.selected}" title="${esc(option.label)}" ${option.disabled || parent.disabled ? "disabled" : ""}>${color && colorField !== "priority" ? '<span class="task-color-dot" aria-hidden="true"></span>' : ""}${sample || (symbol ? icon(symbol) : "")}<span class="select-option-label${sample ? " sr-only" : ""}">${esc(option.label)}</span>${icon("check")}</button>`;
      })
      .join("");
    position();
    if (focused != null)
      menu
        .querySelector(`[data-select-index="${focused}"]:not(:disabled)`)
        ?.focus({ preventScroll: true });
  }
  function open(select) {
    if (source === select) return close(true);
    close();
    source = select;
    query = "";
    menu = document.createElement("div");
    menu.className = "select-menu";
    menu.id = "shared-select-menu";
    menu.setAttribute("popover", "manual");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", label(select));
    // Stay inside the owning dialog/date picker; top-layer positioning escapes clipping and board zoom.
    (select.closest("dialog, [popover]") || document.body).append(menu);
    select.setAttribute("aria-controls", menu.id);
    select.setAttribute("aria-expanded", "true");
    menu.showPopover();
    paint();
    const current =
      menu.querySelector('[aria-selected="true"]:not(:disabled)') ||
      options()[0];
    current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: "nearest" });
    track();
  }
  function choose(button) {
    if (button.disabled) return;
    const target = source,
      index = Number(button.dataset.selectIndex);
    const changed = target.selectedIndex !== index;
    target.selectedIndex = index;
    close(true);
    if (changed) {
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  // Cancel the platform picker before it opens, including touch and Firefox mousedown.
  for (const type of ["pointerdown", "mousedown"])
    document.addEventListener(
      type,
      (event) => {
        if (type === "pointerdown") {
          touchStart =
            eligible(event.target) && event.pointerType === "touch"
              ? {
                  target: event.target,
                  x: event.clientX,
                  y: event.clientY,
                  id: event.pointerId,
                }
              : null;
          touchClick = null;
        }
        if (
          eligible(event.target) &&
          (event.button == null || event.button === 0)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          event.target.focus({ preventScroll: true });
        } else if (menu?.contains(event.target)) {
          event.stopImmediatePropagation();
        } else if (type === "pointerdown") close();
      },
      true,
    );
  // WebKit may omit the synthetic click after a native select's pointerdown
  // is cancelled. Open on a completed tap, while allowing scroll gestures.
  document.addEventListener(
    "pointercancel",
    () => {
      touchStart = null;
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      const start = touchStart;
      touchStart = null;
      if (
        !start ||
        start.id !== event.pointerId ||
        !eligible(start.target) ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      touchClick = { target: start.target, until: performance.now() + 700 };
      open(start.target);
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (eligible(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          touchClick?.target === event.target &&
          performance.now() < touchClick.until &&
          event.detail !== 0
        ) {
          touchClick = null;
          return;
        }
        open(event.target);
      } else if (menu?.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const button = event.target.closest("[data-select-index]");
        if (button) choose(button);
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      const inside = menu?.contains(event.target);
      if (
        !inside &&
        eligible(event.target) &&
        ["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open(event.target);
        return;
      }
      if (!inside) return;
      if (event.key === "Tab") {
        close(true);
        return;
      }
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      const buttons = options(),
        active = buttons.indexOf(document.activeElement);
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (active >= 0) choose(buttons[active]);
        return;
      }
      let next;
      if (event.key === "ArrowDown")
        next = buttons[(active + 1) % buttons.length];
      else if (event.key === "ArrowUp")
        next = buttons[(active - 1 + buttons.length) % buttons.length];
      else if (event.key === "Home") next = buttons[0];
      else if (event.key === "End") next = buttons.at(-1);
      else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const now = Date.now();
        query =
          (now - typedAt > 700 ? "" : query) + event.key.toLocaleLowerCase();
        typedAt = now;
        const needle = [...query].every((c) => c === query[0])
          ? query[0]
          : query;
        const ordered = [
          ...buttons.slice(active + 1),
          ...buttons.slice(0, active + 1),
        ];
        next = ordered.find((b) =>
          b
            .querySelector(".select-option-label")
            .textContent.trim()
            .toLocaleLowerCase()
            .startsWith(needle),
        );
      } else return;
      event.preventDefault();
      next?.focus({ preventScroll: true });
      next?.scrollIntoView({ block: "nearest" });
    },
    true,
  );
  document.addEventListener(
    "focusin",
    (event) => {
      if (menu && event.target !== source && !menu.contains(event.target))
        close();
    },
    true,
  );
  document.addEventListener(
    "change",
    (event) => {
      const preview = event.target
        .closest(".symbol-select")
        ?.querySelector("[data-select-symbol-preview]");
      if (preview) {
        preview.innerHTML = selectSymbol(
          event.target.dataset.selectSymbol,
          event.target.value,
        );
        event.target.title = `${label(event.target)}: ${event.target.selectedOptions[0]?.label || ""}`;
      }
      if (event.target === source) paint();
    },
    true,
  );
  window.addEventListener("blur", () => close());
  new MutationObserver((records) => {
    if (!menu) return;
    if (!source.isConnected || !menu.isConnected) return close();
    if (
      records.some(
        (record) => record.target === source || source.contains(record.target),
      )
    )
      paint();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "selected", "label"],
    characterData: true,
  });
}
