import { positionPopover } from "./popover-position.js";
import { phoneBoardTools } from "./phone-board-tools.js";
// Group the existing controls without replacing their handlers or save state.
export function projectLayout(ctx) {
  const { $, state, icon, label, viewLabel, taskViews, planningViews, openView, openSelectMenu } = ctx;
  const narrow = matchMedia("(max-width: 600px)");
  const phoneBoard = phoneBoardTools({ icon, state });
  let moved = [], compact = null;
  function restoreToolbar() {
    if (compact?.isConnected) state.mobileViewOptions = compact.open;
    for (const [element, slot] of moved) {
      if (element.matches("details[data-expanded]")) {
        element.removeAttribute("data-expanded");
        element.open = false;
      }
      if (slot.isConnected) slot.replaceWith(element);
      else element.remove();
    }
    moved = [];
    compact?.remove();
    compact = null;
    $("[data-phone-sort]")?.remove();
  }
  function compactToolbar() {
    restoreToolbar();
    phoneBoard.sync();
    const toolbar = $(".toolbar-left") || $(".board-toolbar");
    if (!narrow.matches || !toolbar) return;
    compact = document.createElement("details");
    compact.className = "mobile-view-options";
    compact.open = !!state.mobileViewOptions;
    compact.innerHTML = `<summary class="button" aria-label="View options" title="View options">${icon("filter")}</summary><div class="mobile-view-options-panel" aria-label="View options"><header><strong>View options</strong><button type="button" class="icon-button" aria-label="Close view options">${icon("close")}</button></header></div>`;
    const panel = compact.lastElementChild;
    const selectors = toolbar.classList.contains("board-toolbar")
      ? ".board-toolbar > .board-menu, .board-toolbar > .board-settings-button, .board-toolbar > .board-save, .board-toolbar > [data-feature=recovery]"
      : ".shared-query-controls, .toolbar-left > .filter:not(#sort), .toolbar-left > .board-menu, .toolbar-right, .table-view-tools, .grid-tools, #view-content [data-phone-options]";
    for (const element of document.querySelectorAll(selectors)) {
      const slot = document.createComment("view control position");
      element.before(slot);
      moved.push([element, slot]);
      panel.append(element);
    }
    // Phones list the filters directly instead of behind a Filters dropdown (PEN-9).
    for (const details of panel.querySelectorAll('details.board-menu[data-board-menu="filters"]')) {
      details.open = true;
      details.dataset.expanded = "true";
    }
    // Sorting is its own icon button beside the view options; the (hidden) select
    // stays as the data source and may render after this toolbar is composed.
    if (toolbar.classList.contains("toolbar-left") && taskViews.includes(state.view)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button";
      button.setAttribute("data-phone-sort", "");
      button.setAttribute("aria-label", "Sort");
      button.title = "Sort";
      button.setAttribute("aria-haspopup", "listbox");
      button.innerHTML = icon("sort");
      button.addEventListener("click", () => {
        const sort = $("#sort");
        if (sort && !sort.hidden) openSelectMenu?.(sort, button);
      });
      toolbar.append(button);
    }
    toolbar.append(compact);
    compact.addEventListener("toggle", event => {
      if (event.target !== compact) return;
      state.mobileViewOptions = compact?.open;
      positionCompact();
    });
    panel.querySelector("header button").onclick = closeCompact;
    positionCompact();
  }
  function closeCompact() {
    if (!compact?.open) return;
    compact.open = state.mobileViewOptions = false;
    compact.querySelector("summary").focus({ preventScroll: true });
  }
  function positionCompact() {
    if (compact?.open) positionPopover(compact.lastElementChild, compact.querySelector("summary").getBoundingClientRect(), { width: 360, maxHeight: 600 });
  }
  narrow.addEventListener("change", compactToolbar);
  window.addEventListener("resize", positionCompact);
  document.addEventListener("click", event => {
    const inside = event.composedPath().some(el => el.classList?.contains("mobile-view-options"));
    if (compact?.open && !inside && !event.target.closest(".select-menu,.date-picker-popover,.task-dates-popover,#dialogs")) {
      compact.open = state.mobileViewOptions = false;
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && compact?.open && compact.contains(event.target) && !event.defaultPrevented && !event.target.closest(".board-menu[open]:not([data-expanded])")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeCompact();
    }
  }, true);
  function menu(host, key, title) {
    let el = host.querySelector(`[data-board-menu="${key}"]`);
    if (!el) {
      host.insertAdjacentHTML(
        "beforeend",
        `<details class="board-menu" data-board-menu="${key}"><summary>${title}<svg class="icon menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></summary><div class="board-menu-panel"></div></details>`,
      );
      el = host.lastElementChild;
    }
    return el.querySelector(".board-menu-panel");
  }
  function move(panel, selector) {
    const el = $(selector);
    if (el) panel.append(el);
  }
  function projectHeader() {
    restoreToolbar();
    if (!state.project || !$(".tabs")) return;
    $(".shared-query-controls")?.remove();
    const features = $("#feature-toolbar");
    const queryHost = $(".toolbar-left");
    if (features) {
      const controls = document.createElement("div");
      controls.className = "shared-query-controls";
      controls.append(...features.children);
      if ($(".board-toolbar")) {
        controls.dataset.boardPersistent = "true";
        menu($(".board-toolbar"), "board", viewLabel("board"));
        menu($(".board-toolbar"), "more", "More").prepend(controls);
      } else if (queryHost) queryHost.prepend(controls);
      else {
        const host = $(".overview-toolbar") || $("#view-toolbar");
        host.prepend(controls);
      }
      features.remove();
    }
    $(".view-layout-switcher")?.remove();
    const taskLayout = taskViews.includes(state.view);
    const layouts = taskLayout ? taskViews : planningViews.includes(state.view) ? planningViews : [];
    if (queryHost && layouts.length)
      queryHost.insertAdjacentHTML("afterbegin", `<div class="view-layout-switcher ${taskLayout ? "task" : "planning"}-view-switcher" role="group" aria-label="${taskLayout ? "Task" : "Planning"} layout">${layouts.map((view) => `<button type="button" data-action="view" data-view="${view}" aria-label="${label(view)}" aria-pressed="${state.view === view}" title="${label(view)} layout">${icon(view)}<span>${label(view)}</span></button>`).join("")}</div>`);
    const toolbar = $(".toolbar-left");
    const advanced = $(".advanced-filters");
    if (toolbar && advanced) {
      const panel = menu(toolbar, "filters", "Filters");
      const primaryFilters = ["filter-type", "filter-status"].map(id => document.getElementById(id)).filter(Boolean);
      panel.replaceChildren(...advanced.children);
      advanced.remove();
      // Shared filters keep the same location in Tasks and Planning layouts.
      for (const control of primaryFilters) {
        const field = document.createElement("label");
        field.className = "field";
        field.textContent = control.id === "filter-status" ? "Status" : "Type";
        field.append(control);
        panel.prepend(field);
      }
      const f = state.extraFilters || {};
      const count = [
        state.status !== "all" && state.status,
        state.type !== "all" && state.type,
        f.assignee,
        f.tag,
        f.due,
        f.blocked,
        f.archived,
        f.completion,
      ].filter(Boolean).length;
      panel.parentElement.querySelector("summary").innerHTML =
        `Filters${count ? ` (${count})` : ""}<svg class="icon menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>`;
    }
    restoreMenus();
    compactToolbar();
  }
  function render() {
    restoreToolbar();
    const toolbar = $(".board-toolbar");
    if (!$("#canvas") || !toolbar) return;
    const boards = menu(toolbar, "board", viewLabel("board"));
    move(boards, '[data-action="board-new"]');

    const more = menu(toolbar, "more", "More");
    // Dynamic tools are recreated on each board render; remove their old copies.
    for (const panel of [boards, more])
      for (const el of [...panel.children]) if (!el.dataset.action && !el.dataset.boardPersistent) el.remove();
    const extras = $("#canvas-extras");
    const addFeatures = ["grid-add", "frame-add", "draw-tool", "image-add"];
    const addPro = ["note-add", "query-add"];
    if (extras)
      for (const el of [...extras.children]) {
        const feature = el.dataset.feature,
          pro = el.dataset.pro;
        const panel =
          addFeatures.includes(feature) || addPro.includes(pro)
            ? more
            : feature === "canvas-delete"
              ? boards
              : more;
        if (pro === "shortcuts") el.textContent = "Keyboard shortcuts";
        panel.append(el);
      }
    extras?.remove();
    toolbar.querySelector(".spacer")?.remove();
    const settings = toolbar.querySelector(".board-settings-button");
    if (settings) toolbar.append(settings);
    if ($("#board-save")) toolbar.append($("#board-save"));
    const recovery = toolbar.querySelector('[data-feature="recovery"]');
    if (recovery) toolbar.append(recovery);
    restoreMenus();
    compactToolbar();
  }
  function positionMenus() {
    for (const details of document.querySelectorAll(".board-menu[open]:not([data-expanded])")) {
      const panel = details.querySelector(".board-menu-panel");
      panel.style.position = "fixed";
      const anchor = details.querySelector("summary").getBoundingClientRect(),
        toolbar = details
          .closest(".table-view-tools,.toolbar-left,.board-toolbar")
          ?.getBoundingClientRect();
      positionPopover(
        panel,
        {
          left: anchor.left,
          top: toolbar ? Math.min(anchor.top, toolbar.top) : anchor.top,
          bottom: toolbar
            ? Math.max(anchor.bottom, toolbar.bottom)
            : anchor.bottom,
        },
        { width: details.classList.contains("table-header-menu") ? 240 : 320, maxHeight: 560 },
      );
    }
  }
  document.addEventListener(
    "toggle",
    (e) => {
      if (e.target.matches(".board-menu")) positionMenus();
    },
    true,
  );
  window.addEventListener("resize", positionMenus);
  window.addEventListener("scroll", positionMenus, true);
  window.visualViewport?.addEventListener("resize", positionMenus);
  function restoreMenus() {
    document.querySelectorAll(".board-menu").forEach((el) => {
      el.open = el.dataset.boardMenu === state.headerMenu;
    });
    requestAnimationFrame(positionMenus);
  }
  document.addEventListener("change", (event) => {
    if (event.target.id === "project-view-switcher") {
      openView(event.target.value);
      const switcher = $("#project-view-switcher");
      switcher.value = taskViews.includes(state.view) ? "tasks" : planningViews.includes(state.view) ? "planning" : state.view;
      switcher.focus({ preventScroll: true });
    }
  });
  // Native disclosures support keyboard activation and keep controls reachable.
  document.addEventListener(
    "click",
    (event) => {
      const el = event.target.closest(".board-menu");
      if (el && event.target.closest("summary")) {
        state.headerMenu = el.open ? null : el.dataset.boardMenu || null;
        document.querySelectorAll(".board-menu[open]:not([data-expanded])").forEach((other) => {
          if (other !== el) other.open = false;
        });
        // Position after the native disclosure toggles, before its first paint.
        requestAnimationFrame(positionMenus);
      }
      if (!el) {
        state.headerMenu = null;
        document
          .querySelectorAll(".board-menu[open]:not([data-expanded])")
          .forEach((menu) => (menu.open = false));
      } else if (
        event.target.closest("button") &&
        !event.target.closest("form, [data-menu-keep-open]")
      ) {
        state.headerMenu = null;
        el.open = false;
        el.querySelector("summary").focus({ preventScroll: true });
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (state.dialog) return;
      const menu = event.target.closest(".board-menu:not([data-expanded])");
      if (event.key === "Tab" && menu?.open) {
        requestAnimationFrame(() => {
          if (menu.contains(document.activeElement)) return;
          menu.open = false;
          if (state.headerMenu === menu.dataset.boardMenu) state.headerMenu = null;
        });
      }
      const summary = event.target.matches(".board-menu > summary");
      const actions = menu ? [...menu.querySelectorAll(":scope > .board-menu-panel > button:not(:disabled)")].filter((el) => !el.hidden && el.getClientRects().length) : [];
      // Arrow keys navigate action rows, while form fields keep their native keys.
      if (menu && (summary || actions.includes(event.target)) &&
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const buttons = menu.querySelectorAll(":scope > .board-menu-panel > button:not(:disabled):not([hidden])");
        if (buttons.length && (menu.open || ["ArrowDown", "ArrowUp"].includes(event.key))) {
          event.preventDefault();
          event.stopImmediatePropagation();
          for (const other of document.querySelectorAll(".board-menu[open]:not([data-expanded])"))
            if (other !== menu) other.open = false;
          menu.open = true;
          state.headerMenu = menu.dataset.boardMenu || null;
          positionMenus();
          const items = [...buttons].filter((el) => el.getClientRects().length);
          const current = items.indexOf(event.target);
          const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : current < 0 ? (event.key === "ArrowUp" ? items.length - 1 : 0)
              : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[index]?.focus();
          return;
        }
      }
      const open = document.querySelector(".board-menu[open]:not([data-expanded])");
      if (event.key === "Escape" && open && !state.canvasEditing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.headerMenu = null;
        open.open = false;
        open.querySelector("summary").focus();
      } else if (
        event.key !== "Escape" &&
        !(event.ctrlKey || event.metaKey || event.altKey) &&
        (event.target.closest(".board-menu")?.open ||
          event.target.matches(".board-menu > summary"))
      ) {
        // Keep native Tab/Enter/Space and select navigation away from canvas shortcuts.
        // Modified keys are app shortcuts (Ctrl+K, Ctrl+Z) and pass through.
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  return { render, projectHeader, compactToolbar };
}
