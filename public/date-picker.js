import { positionPopover } from "./popover-position.js";
// One Monday-first calendar for all date fields; retain native ISO values and validation.
const key = (d) =>
  `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [y, m, d] = value.split("-").map(Number),
    date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(y, m - 1, d);
  return key(date) === value ? date : null;
};
export function installDatePickers({ icon, esc }) {
  let popup, input, trigger, month, focused;
  const allowed = (value) =>
    (!input.min || value >= input.min) && (!input.max || value <= input.max);
  function close(focus = false) {
    if (!popup) return;
    const button = trigger;
    popup.remove();
    popup = null;
    button?.setAttribute("aria-expanded", "false");
    if (focus && button?.isConnected) button.focus({ preventScroll: true });
  }
  function position() {
    if (!popup) return;
    if (!input.isConnected) return close();
    const r = input.closest(".date-field").getBoundingClientRect();
    positionPopover(popup, r, { width: popup.getBoundingClientRect().width || 320, maxHeight: innerHeight - 16, gap: 6 });
  }
  function paint(focus = true) {
    const start = new Date(month);
    start.setDate(1 - ((start.getDay() + 6) % 7));
    const today = key(new Date());
    popup.innerHTML = `<div class="date-picker-head"><button type="button" class="icon-button" data-date-month="-1" aria-label="Previous month" title="Previous month"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><label class="sr-only" for="date-picker-month">Calendar month</label><select id="date-picker-month">${Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${i === month.getMonth() ? "selected" : ""}>${new Date(2026, i, 1).toLocaleDateString(undefined, { month: "long" })}</option>`).join("")}</select><input aria-label="Calendar year" type="number" min="1" max="9999" value="${month.getFullYear()}"><button type="button" class="icon-button" data-date-month="1" aria-label="Next month" title="Next month"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button></div><table role="grid" aria-label="${esc(month.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}"><thead><tr>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<th scope="col" class="${i > 4 ? "weekend" : ""}">${d}</th>`).join("")}</tr></thead><tbody>${Array.from(
      { length: 6 },
      (_, row) =>
        `<tr>${Array.from({ length: 7 }, (_, col) => {
          const d = new Date(start);
          d.setDate(d.getDate() + row * 7 + col);
          const value = key(d);
          return `<td class="${col > 4 ? "weekend" : ""} ${d.getMonth() !== month.getMonth() ? "outside-month" : ""}" aria-selected="${input.value === value}"><button type="button" data-date-value="${value}" ${allowed(value) && d.getFullYear() > 0 && d.getFullYear() <= 9999 ? "" : "disabled"} tabindex="${value === focused ? 0 : -1}" ${today === value ? 'aria-current="date"' : ""} aria-label="${esc(d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}">${d.getDate()}</button></td>`;
        }).join("")}</tr>`,
    ).join(
      "",
    )}</tbody></table><div class="date-picker-foot"><button type="button" data-date-clear ${input.required ? "disabled" : ""}>Clear</button><button type="button" data-date-value="${today}" ${allowed(today) ? "" : "disabled"}>Today</button></div>`;
    position();
    if (focus)
      popup
        .querySelector(`table [data-date-value="${focused}"]:not(:disabled)`)
        ?.focus({ preventScroll: true });
  }
  function moveMonth(delta) {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
    month = next;
    focused = key(month);
    paint();
  }
  function choose(value) {
    if (value && !allowed(value)) return;
    const target = input;
    close(true);
    if (target.value === value) return;
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // A pointer opens the calendar without taking focus: a mouse leaves it in the field to type.
  function open(target, focus = true) {
    if (target.disabled || target.readOnly) return;
    if (popup && input === target) return close(true);
    close();
    input = target;
    trigger = input.parentElement.querySelector("[data-date-picker]");
    let date = parse(input.value) || new Date();
    if (input.min && key(date) < input.min) date = parse(input.min) || date;
    if (input.max && key(date) > input.max) date = parse(input.max) || date;
    focused = key(date);
    month = new Date(date);
    month.setDate(1);
    popup = document.createElement("div");
    popup.className = "date-picker-popover";
    popup.id = "shared-date-picker";
    popup.setAttribute("popover", "manual");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Choose date");
    (input.closest("dialog,[popover]") || document.body).append(popup);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", popup.id);
    popup.showPopover();
    paint(focus);
    popup.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-date-clear")) choose("");
      else if (b.dataset.dateValue) choose(b.dataset.dateValue);
      else if (b.dataset.dateMonth) moveMonth(+b.dataset.dateMonth);
    });
    popup.addEventListener("change", (e) => {
      if (e.target.id === "date-picker-month") month.setMonth(+e.target.value);
      else if (e.target.matches('[aria-label="Calendar year"]')) {
        if (!e.target.checkValidity()) return;
        month.setFullYear(+e.target.value);
      } else return;
      focused = key(month);
      paint();
    });
  }
  function enhance(root = document) {
    for (const date of [
      ...(root.matches?.('input[type="date"]') ? [root] : []),
      ...root.querySelectorAll('input[type="date"]'),
    ]) {
      if (date.parentElement.classList.contains("date-field")) continue;
      const wrap = document.createElement("span");
      wrap.className = "date-field";
      date.before(wrap);
      wrap.append(date);
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.datePicker = "";
      b.className = "date-picker-trigger";
      b.setAttribute(
        "aria-label",
        `Choose ${date.getAttribute("aria-label") || date.closest("label")?.textContent.trim() || "date"}`,
      );
      b.setAttribute("aria-haspopup", "dialog");
      b.setAttribute("aria-expanded", "false");
      b.innerHTML = icon("calendar");
      wrap.append(b);
    }
  }
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-date-picker]");
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        open(b.parentElement.querySelector("input"));
      }
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        popup &&
        !popup.contains(e.target) &&
        !e.target.closest(".date-field")
      )
        close();
    },
    true,
  );
  // A tap or click on the field, or its label's text, opens this calendar, never the platform's
  // picker (iOS wheels, Firefox's popup), as select-menu.js does for selects. A mouse still
  // focuses the field, so the keyboard types a date; a tap or pen leaves it unfocused, as iOS
  // opens its wheels on focus.
  const field = (target) => {
    if (!(target instanceof Element)) return null;
    const date = target.matches('input[type="date"]') ? target : target.closest("input, button, select, textarea, a") ? null : target.closest("label")?.control;
    return date?.matches('.date-field > input[type="date"]') && !date.disabled && !date.readOnly ? date : null;
  };
  let tap = null, tapped = null;
  for (const type of ["pointerdown", "mousedown"])
    document.addEventListener(
      type,
      (e) => {
        const date = field(e.target);
        if (!date || (e.button != null && e.button !== 0)) return;
        e.preventDefault();
        if (type !== "pointerdown") return;
        const mouse = !e.pointerType || e.pointerType === "mouse";
        tap = mouse ? null : { date, x: e.clientX, y: e.clientY, id: e.pointerId };
        if (mouse) date.focus({ preventScroll: true });
      },
      true,
    );
  document.addEventListener("pointercancel", () => (tap = null), true);
  // WebKit may omit the click after a cancelled pointerdown: open on a completed tap instead.
  document.addEventListener(
    "pointerup",
    (e) => {
      const start = tap;
      tap = null;
      if (!start || start.id !== e.pointerId || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return;
      tapped = { date: start.date, until: performance.now() + 700 };
      open(start.date, false);
    },
    true,
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (tapped && field(e.target) === tapped.date && performance.now() < tapped.until && e.cancelable) e.preventDefault();
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "click",
    (e) => {
      const date = field(e.target);
      if (!date) return;
      e.preventDefault();
      // A double click's second click leaves the calendar open.
      if (e.detail > 1) return;
      if (tapped?.date === date && performance.now() < tapped.until) return void (tapped = null);
      open(date, false);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.target.matches('input[type="date"]') &&
        e.altKey &&
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(e.target);
        return;
      }
      if (!popup) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(true);
        return;
      }
      if (
        !e.target.matches("table [data-date-value]") ||
        !popup.contains(e.target)
      )
        return;
      const d = parse(e.target.dataset.dateValue),
        day = (d.getDay() + 6) % 7;
      const delta = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
        Home: -day,
        End: 6 - day,
      }[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        e.stopImmediatePropagation();
        d.setDate(d.getDate() + delta);
        if (!allowed(key(d)) || d.getFullYear() < 1 || d.getFullYear() > 9999)
          return;
        focused = key(d);
        month = new Date(d);
        month.setDate(1);
        paint();
      } else if (["PageUp", "PageDown"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        moveMonth((e.key === "PageUp" ? -1 : 1) * (e.shiftKey ? 12 : 1));
      }
    },
    true,
  );
  document.addEventListener("focusin", (e) => {
    if (popup && !popup.contains(e.target) && !e.target.closest(".date-field"))
      close();
  });
  window.addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node.nodeType === 1) enhance(node);
    if (popup && !input.isConnected) close();
  }).observe(document.body, { childList: true, subtree: true });
  enhance();
}
