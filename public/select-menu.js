import { selectSymbol } from "./select-symbols.js";
import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from './open-focus.js';
// Keep native selects as the form controls; share a themed menu across every view.
export function installSelectMenus({ esc, icon, taskColor = () => "" }) {
  let source,
    anchorEl,
    lastPointerType = "mouse",
    menu,
    frame,
    query = "",
    typedAt = 0,
    touchStart,
    touchClick;
  let searchQuery = '', category = 'all', filters = [];
  const searchable = () => !!source?.hasAttribute('data-select-search') && !source.multiple;
  // A label around (or for) a select activates it; route that through the app menu too.
  const controlOf = (target) => {
    if (!(target instanceof Element)) return null;
    const trigger = target.closest('[data-multi-select]');
    if (trigger) return document.getElementById(trigger.dataset.multiSelect);
    if (target instanceof HTMLSelectElement) return target;
    const label = target.closest("label");
    const control = label?.control;
    return control instanceof HTMLSelectElement && !target.closest("select, button, input, a") ? control : null;
  };
  const eligible = (el) =>
    el instanceof HTMLSelectElement &&
    (el.multiple ? el.hasAttribute('data-checkbox-menu') : el.size <= 1) &&
    (!el.hidden || el.hasAttribute('data-checkbox-menu')) &&
    !el.parentElement.closest("[hidden], [data-task-picker]") &&
    !el.matches(":disabled");
  const anchorOf = select => select.multiple ? document.querySelector(`[data-multi-select="${CSS.escape(select.id)}"]`) || select : select;
  const options = () => [
    ...menu.querySelectorAll('[role="option"]:not(:disabled), input[data-select-index]:not(:disabled)'),
  ];
  const label = (select) =>
    select.getAttribute("aria-label") ||
    select.labels?.[0]?.textContent.trim().split("\n")[0] ||
    select.title ||
    select.name ||
    "Choose an option";
  // A closing menu fades out when the device allows motion (select-menu.css), then goes.
  function remove(closing) {
    if (parseFloat(getComputedStyle(closing).transitionDuration) < 0.05) return closing.remove();
    // Fading, it is no longer the open menu that the rest of the app looks for by id.
    closing.removeAttribute("id");
    closing.classList.add("closing");
    closing.addEventListener("transitionend", (event) => { if (event.target === closing) closing.remove(); });
    setTimeout(() => closing.remove(), 300);
  }
  function close(focus = false) {
    if (!menu) return;
    const target = source, anchor = anchorEl || source;
    remove(menu);
    menu = source = anchorEl = null;
    cancelAnimationFrame(frame);
    target.removeAttribute("aria-controls");
    target.setAttribute("aria-expanded", "false");
    if (anchor !== target) {
      anchor.removeAttribute("aria-controls");
      anchor.setAttribute("aria-expanded", "false");
    }
    // Focus returns to the control for keyboard and mouse users. After a touch
    // choice the select stays unfocused: iOS opens its own picker on focus.
    const restore =
      focus && anchor.isConnected &&
      !(anchor instanceof HTMLSelectElement && lastPointerType === "touch");
    if (restore) anchor.focus({ preventScroll: true });
  }
  function position() {
    if (!menu) return;
    const anchor = anchorEl || source;
    if (
      !anchor.isConnected ||
      !anchor.getClientRects().length ||
      source.matches(":disabled") ||
      anchor.closest("dialog:not([open]), details:not([open]), [hidden]")
    )
      return close();
    const r = anchor.getBoundingClientRect();
    positionPopover(menu, r, {
      width: Math.max(r.width, searchable() ? 360 : source.dataset.selectSymbol ? 116 : 220),
    });
  }
  function track() {
    position();
    if (menu) frame = requestAnimationFrame(track);
  }
  function paint() {
    const focused = menu.querySelector(":focus")?.dataset.selectIndex;
    if (source.multiple) {
      menu.innerHTML = `<header class="select-checkbox-header"><strong>${esc(label(source))}</strong><button type="button" class="icon-button" data-select-close aria-label="Close ${esc(label(source))}">${icon('close')}</button></header>` + [...source.options].map((option,index)=>option.hidden ? '' : `<label class="select-checkbox-row"><input type="checkbox" data-select-index="${index}" ${option.selected ? 'checked' : ''} ${option.disabled ? 'disabled' : ''}><span>${esc(option.label)}</span></label>`).join('');
      if (!source.options.length) menu.insertAdjacentHTML('beforeend','<p class="select-checkbox-empty">No options available.</p>');
      position();
      if (focused != null) menu.querySelector(`input[data-select-index="${focused}"]`)?.focus({preventScroll:true});
      return;
    }
    let group, count = 0;
    const words = searchQuery.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = [...source.options]
      .map((option, index) => {
        if (option.hidden || option.parentElement.hidden) return "";
        if (searchable() && (category !== 'all' && !option.dataset.selectCategories?.split(' ').includes(category) ||
          !words.every(word => `${option.label} ${option.dataset.selectDescription || ''} ${option.dataset.selectKeywords || ''}`.toLocaleLowerCase().includes(word)))) return '';
        count++;
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
        const text = `<span class="select-option-label${sample ? ' sr-only' : ''}">${esc(option.label)}</span>`;
        const copy = option.dataset.selectDescription ? `<span class="select-option-copy">${text}<small class="select-option-description">${esc(option.dataset.selectDescription)}</small></span>` : text;
        return `${heading}<button type="button" role="option" tabindex="-1" ${color ? `data-task-color="${esc(colorField)}" style="--task-field-color:${color}"` : ""} data-select-index="${index}" aria-selected="${option.selected}" title="${esc([option.label,option.dataset.selectDescription].filter(Boolean).join(' — '))}" ${option.disabled || parent.disabled ? "disabled" : ""}>${color && colorField !== "priority" ? '<span class="task-color-dot" aria-hidden="true"></span>' : ""}${sample || (symbol ? icon(symbol) : "")}${copy}${icon("check")}</button>`;
      })
      .join("");
    if (searchable()) {
      if (!menu.querySelector('[data-select-search-input]')) menu.innerHTML = `<div class="select-search-header"><input type="search" data-select-search-input aria-label="${esc(source.dataset.selectSearchLabel || 'Search options')}" placeholder="${esc(source.dataset.selectSearch || 'Search…')}" autocomplete="off" spellcheck="false"><button type="button" class="icon-button" data-select-clear aria-label="Clear search" title="Clear search">${icon('eraser')}</button><button type="button" class="icon-button" data-select-close aria-label="Close ${esc(label(source))}" title="Close">${icon('close')}</button></div>${filters.length ? `<div class="select-search-filters" role="group" aria-label="${esc(source.dataset.selectFilterLabel || 'Filters')}">${filters.map(filter => `<button type="button" class="icon-button" data-select-filter="${esc(filter.id)}" aria-label="${esc(filter.label)}" title="${esc(filter.label)}">${icon(filter.icon)}</button>`).join('')}</div>` : ''}<div class="select-search-options" role="listbox" aria-label="${esc(label(source))}"></div><output class="select-search-count" role="status"></output>`;
      menu.querySelector('.select-search-options').innerHTML = rows;
      const input = menu.querySelector('[data-select-search-input]');
      if (input.value !== searchQuery) input.value = searchQuery;
      menu.querySelector('[data-select-clear]').hidden = !searchQuery;
      for (const button of menu.querySelectorAll('[data-select-filter]')) button.setAttribute('aria-pressed', String(button.dataset.selectFilter === category));
      menu.querySelector('output').textContent = count ? `${count} ${source.dataset.selectItemLabel || 'option'}${count === 1 ? '' : 's'}` : source.dataset.selectEmpty || 'No matching options.';
    } else menu.innerHTML = rows;
    position();
    if (focused != null)
      menu
        .querySelector(`[data-select-index="${focused}"]:not(:disabled)`)
        ?.focus({ preventScroll: true });
  }
  function open(select, anchor = anchorOf(select)) {
    if (source === select) return close(true);
    close();
    source = select;
    anchorEl = anchor;
    query = "";
    searchQuery = ''; category = 'all'; filters = [];
    select.dispatchEvent(new Event('selectopen'));
    if (searchable()) { try { filters = JSON.parse(select.dataset.selectFilters || '[]'); } catch { /* no optional filters */ } }
    // One menu at a time: a menu still fading out goes at once.
    for (const stale of document.querySelectorAll("#shared-select-menu, .select-menu.closing")) stale.remove();
    menu = document.createElement("div");
    // A menu opened from the sidebar takes the sidebar's dark colours (select-menu.css).
    menu.className = `select-menu${select.closest(".sidebar") ? " sidebar-select-menu" : ""}${searchable() ? ' select-menu-searchable' : ''}`;
    menu.id = "shared-select-menu";
    menu.setAttribute("popover", "manual");
    menu.setAttribute("role", select.multiple || searchable() ? "dialog" : "listbox");
    if (select.multiple) menu.setAttribute('aria-modal','false');
    menu.setAttribute("aria-label", label(select));
    // Stay inside the owning dialog/date picker; top-layer positioning escapes clipping and board zoom.
    (select.closest("dialog, [popover]") || document.body).append(menu);
    select.setAttribute("aria-controls", menu.id);
    select.setAttribute("aria-expanded", "true");
    if (searchable()) select.setAttribute('aria-haspopup', 'dialog');
    if (anchor !== select) {
      anchor.setAttribute("aria-controls", menu.id);
      anchor.setAttribute("aria-expanded", "true");
    }
    menu.showPopover();
    // One picker at a time: the date editor closes when a menu opens (task-date-editor.js).
    document.dispatchEvent(new CustomEvent("picker-open", { detail: menu }));
    paint();
    const current =
      menu.querySelector('[aria-selected="true"]:not(:disabled)') ||
      options()[0] || menu.querySelector('[data-select-close]');
    if (searchable()) focusOnOpen(menu.querySelector('[data-select-search-input]'), current || menu.querySelector('[data-select-close]'));
    else current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: "nearest" });
    track();
  }
  function choose(button) {
    if (button.disabled) return;
    const target = source,
      index = Number(button.dataset.selectIndex);
    if (target.multiple) {
      target.options[index].selected = !target.options[index].selected;
      target.dispatchEvent(new Event('input',{bubbles:true}));
      target.dispatchEvent(new Event('change',{bubbles:true}));
      // Filtering rebuilds the toolbar: keep this checkbox menu on the replacement control.
      source = document.getElementById(target.id) || target;
      anchorEl = anchorOf(source);
      if (!source.isConnected || !anchorEl.isConnected) return close();
      source.setAttribute('aria-controls',menu.id); source.setAttribute('aria-expanded','true');
      anchorEl.setAttribute('aria-controls',menu.id); anchorEl.setAttribute('aria-expanded','true');
      paint(); menu.querySelector(`input[data-select-index="${index}"]`)?.focus({preventScroll:true});
      return;
    }
    const changed = target.selectedIndex !== index;
    target.selectedIndex = index;
    close(true);
    if (changed) {
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    } else target.dispatchEvent(new Event("reselect", { bubbles: true })); // as a sort reverses (app.js)
  }
  // Cancel the platform picker before it opens, including touch and Firefox mousedown.
  for (const type of ["pointerdown", "mousedown"])
    document.addEventListener(
      type,
      (event) => {
        const control = controlOf(event.target);
        if (type === "pointerdown") {
          lastPointerType = event.pointerType || "mouse";
          touchStart =
            control && eligible(control) && event.pointerType === "touch"
              ? {
                  target: control,
                  x: event.clientX,
                  y: event.clientY,
                  id: event.pointerId,
                }
              : null;
          touchClick = null;
        }
        if (
          control && eligible(control) &&
          (event.button == null || event.button === 0)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          // Touch keeps focus on the menu itself: focusing a select on iOS opens the platform picker.
          if (event.pointerType !== "touch") anchorOf(control).focus({ preventScroll: true });
        } else if (menu?.contains(event.target)) {
          event.stopImmediatePropagation();
        } else if (type === "pointerdown" && !anchorEl?.contains(event.target)) close();
        // A tap on the menu's own anchor reaches open(), which toggles it closed.
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
  // A tap handled above must not also activate the platform picker: cancel the
  // touch sequence's default (and its synthesised click), and swallow double-clicks.
  document.addEventListener(
    "touchend",
    (event) => {
      const control = controlOf(event.target);
      if (!control || !eligible(control)) return;
      if (touchClick?.target === control && performance.now() < touchClick.until && event.cancelable)
        event.preventDefault();
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "dblclick",
    (event) => {
      const control = controlOf(event.target);
      if (control && eligible(control)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
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
      const control = controlOf(event.target);
      if (control && eligible(control)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          touchClick?.target === control &&
          performance.now() < touchClick.until &&
          event.detail !== 0
        ) {
          touchClick = null;
          return;
        }
        open(control);
      } else if (menu?.contains(event.target)) {
        if (event.target.matches('[data-select-search-input]')) { event.stopImmediatePropagation(); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.target.closest('[data-select-close]')) return close(true);
        if (event.target.closest('[data-select-clear]')) {
          searchQuery = ''; paint(); focusOnOpen(menu.querySelector('[data-select-search-input]'), menu.querySelector('[data-select-close]')); return;
        }
        const filter = event.target.closest('[data-select-filter]');
        if (filter) { category = filter.dataset.selectFilter; paint(); return; }
        const button = event.target.closest("[data-select-index]") || event.target.closest('.select-checkbox-row')?.querySelector('[data-select-index]');
        if (button) choose(button);
      }
    },
    true,
  );
  document.addEventListener('input', event => {
    if (!menu?.contains(event.target) || !event.target.matches('[data-select-search-input]')) return;
    searchQuery = event.target.value; paint();
  }, true);
  document.addEventListener(
    "keydown",
    (event) => {
      lastPointerType = "keyboard";
      const inside = menu?.contains(event.target);
      const control = controlOf(event.target) || event.target;
      if (
        !inside &&
        eligible(control) &&
        ["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open(control);
        return;
      }
      if (!inside) return;
      if (searchable()) {
        const input = menu.querySelector('[data-select-search-input]');
        if (event.key === 'Tab') return;
        if (event.key === 'Escape' && searchQuery) {
          event.preventDefault(); event.stopImmediatePropagation(); searchQuery = ''; paint(); focusOnOpen(input, menu.querySelector('[data-select-close]')); return;
        }
        if (event.target === input) {
          event.stopImmediatePropagation();
          if (event.key === 'Escape') { event.preventDefault(); close(true); }
          else if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); (event.key === 'ArrowDown' ? options()[0] : options().at(-1))?.focus({preventScroll:true}); }
          else if (event.key === 'Enter') { event.preventDefault(); const first = options()[0]; if (first) choose(first); }
          return;
        }
        if (event.target.closest('[data-select-filter],[data-select-clear]') && ['Enter',' '].includes(event.key)) { event.stopImmediatePropagation(); return; }
        if (event.key === 'ArrowUp' && event.target === options()[0]) { event.preventDefault(); event.stopImmediatePropagation(); focusOnOpen(input, menu.querySelector('[data-select-close]')); return; }
      }
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
      if (event.target.closest('[data-select-close]') && ['Enter',' '].includes(event.key)) {
        event.preventDefault(); close(true); return;
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
      if (menu && event.target !== source && !anchorEl?.contains(event.target) && !menu.contains(event.target))
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
  return { open };
}
