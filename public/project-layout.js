import { positionPopover } from "./popover-position.js";
import { phoneBoardTools } from "./phone-board-tools.js";
import { mountLayoutTray, removeLayoutTray, tabBar } from "./layout-tray.js";
// Group the existing controls without replacing their handlers or save state.
export function projectLayout(ctx) {
  const { $, state, icon, label, taskViews, planningViews, openView, openSelectMenu } = ctx;
  const narrow = matchMedia("(max-width: 600px)");
  const phoneBoard = phoneBoardTools({ icon, state });
  let moved = [], compact = null, keep = null;
  // Moving a control takes the keyboard off it: remember it, and its caret, for compactToolbar to put
  // back within this repaint.
  function remember() {
    const active = document.activeElement;
    if (!active || active === document.body || keep) return;
    keep = { active, range: active.matches?.("input") ? [active.selectionStart, active.selectionEnd] : null };
    setTimeout(() => (keep = null));
  }
  function restoreToolbar() {
    if (moved.some(([element]) => element.contains(document.activeElement))) remember();
    if (compact?.isConnected) state.mobileViewOptions = compact.open;
    const tools = $(".topbar-view-tools"), kept = [];
    for (const [element, slot] of moved) {
      // The iPad's top-bar search stays put while it's being typed in, as each key repaints the
      // view: moving it would put the on-screen keyboard away (topBarTools).
      if (tools?.contains(element) && element.matches(".search") && element.contains(document.activeElement) && slot.isConnected) {
        kept.push([element, slot]);
        continue;
      }
      if (element.matches("details[data-expanded]")) {
        element.removeAttribute("data-expanded");
        element.open = false;
      }
      if (slot.isConnected) slot.replaceWith(element);
      else element.remove();
    }
    moved = kept;
    compact?.remove();
    compact = null;
    $("[data-sort-menu]")?.remove();
    removeLayoutTray();
    if (!kept.length) lowerTools();
  }
  // Puts back what the top bar still holds, once it no longer shows a view's tools.
  function lowerTools() {
    for (const [element, slot] of moved) slot.isConnected ? slot.replaceWith(element) : element.remove();
    moved = [];
    $(".topbar-view-tools")?.remove();
    $("#view-toolbar")?.removeAttribute("data-empty");
  }
  const sortIcons = { created: "clock", key: "task", title: "case-sensitive", parent: "tree", assignee: "person", priority: "flag", due: "calendar", status: "status" };
  // Focus (and the caret) go back where they were: on the control itself or, if a repaint replaced
  // it, on its replacement.
  function compactToolbar() {
    remember();
    arrangeToolbar();
    const { active, range } = keep || {};
    keep = null;
    const target = active?.isConnected ? active : active?.id && document.getElementById(active.id);
    if (target && document.activeElement !== target) {
      target.focus({ preventScroll: true });
      if (range?.[0] != null && target.value?.length >= range[1]) target.setSelectionRange(...range);
    }
  }
  function arrangeToolbar() {
    restoreToolbar();
    const ipad = tabBar.matches && !narrow.matches;
    if (!(ipad && taskViews.includes(state.view))) lowerTools();
    phoneBoard.sync();
    if (ipad && !taskViews.includes(state.view)) starBeforeTitle();
    const toolbar = $(".toolbar-left") || $(".board-toolbar");
    if (!toolbar) return;
    // Sorting is an icon button that opens the (hidden) select's options: beside the view's
    // other controls, or beside View options on phones.
    const sort = $("#sort"), sortButton = toolbar.classList.contains("toolbar-left") && taskViews.includes(state.view) && sort && !sort.closest("[hidden]") ? document.createElement("button") : null;
    if (sortButton) {
      // The button wears the active sort's icon, with an arrow for its direction, which the menu
      // shows too, as Table's column headers do; Manual order is no sort.
      const active = sort.value !== "order", up = state.sortDir === 1;
      const name = `Sort: ${sort.selectedOptions[0]?.text || ""}${active && !up ? ", reversed" : ""}`;
      for (const option of sort.options) option.label = option.selected && active ? `${option.text} ${up ? "↑" : "↓"}` : option.text;
      sortButton.type = "button";
      sortButton.id = "sort-button"; // keeps focus here when choosing a sort rebuilds the toolbar
      sortButton.className = `icon-button${active ? " sort-active" : ""}`;
      sortButton.setAttribute("data-sort-menu", "");
      sortButton.setAttribute("aria-label", name);
      sortButton.title = name;
      sortButton.setAttribute("aria-haspopup", "listbox");
      sortButton.innerHTML = active
        ? `${icon(sortIcons[sort.value] || "sort")}<span class="sort-direction" aria-hidden="true">${icon(up ? "up" : "down")}</span>`
        : icon("sort");
      sortButton.addEventListener("click", () => {
        const select = $("#sort");
        if (select && !select.hidden) openSelectMenu?.(select, sortButton);
      });
    }
    if (!narrow.matches) {
      if (sortButton) sort.after(sortButton);
      if (tabBar.matches) {
        trayLayouts();
        if (taskViews.includes(state.view)) topBarTools(toolbar, sortButton);
      } else state.layoutTray = null;
      return;
    }
    compact = document.createElement("details");
    compact.className = "mobile-view-options";
    compact.open = !!state.mobileViewOptions;
    // An icon button like sort beside it (task views), counting active filters as the Filters menu does.
    const count = Number(toolbar.querySelector('[data-board-menu="filters"] > summary > .filter-count')?.textContent || 0);
    const name = `View options${count ? ` (${count} ${count === 1 ? "filter" : "filters"} active)` : ""}`;
    compact.innerHTML = `<summary class="icon-button${count ? " filter-active" : ""}" aria-label="${name}" title="${name}">${icon("filter")}${count ? `<span class="filter-count" aria-hidden="true">${count}</span>` : ""}</summary><div class="mobile-view-options-panel" aria-label="View options"><header><strong>View options</strong><button type="button" class="icon-button" aria-label="Close view options">${icon("close")}</button></header></div>`;
    const panel = compact.lastElementChild;
    const selectors = toolbar.classList.contains("board-toolbar")
      ? ".board-toolbar > .board-menu, .board-toolbar > .bookmark-button, .board-toolbar > .board-save, .board-toolbar > [data-feature=recovery]"
      : ".toolbar-left > .filter:not(#sort), .toolbar-left > .board-menu, .toolbar-left > .bookmark-button, .toolbar-right, .table-view-tools, .grid-tools, #view-toolbar [data-phone-options], #view-content [data-phone-options]";
    for (const element of document.querySelectorAll(selectors)) {
      const slot = document.createComment("view control position");
      element.before(slot);
      moved.push([element, slot]);
      panel.append(element);
    }
    trayLayouts();
    // Phones list the filters directly instead of behind a Filters dropdown (PEN-9).
    for (const details of panel.querySelectorAll('details.board-menu[data-board-menu="filters"]')) {
      details.open = true;
      details.dataset.expanded = "true";
    }
    if (sortButton) toolbar.append(sortButton);
    toolbar.append(compact);
    compact.addEventListener("toggle", event => {
      if (event.target !== compact) return;
      state.mobileViewOptions = compact?.open;
      positionCompact();
    });
    panel.querySelector("header button").onclick = closeCompact;
    positionCompact();
  }
  // iPad (owner request, 30 Oct 2026): a task view's search, filters and sort sit in the middle of
  // the top bar, which the bottom bar's view tabs leave empty, and the bookmark star before the
  // title. The toolbar row keeps the view's other controls, or goes when none are left.
  function topBarTools(toolbar, sortButton) {
    const title = $(".topbar .breadcrumb strong");
    if (!title) return;
    let tools = $(".topbar .topbar-view-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "topbar-view-tools";
      title.closest(".breadcrumb").after(tools);
    }
    moveTo(toolbar.querySelector(":scope > .search"), (el) => tools.append(el));
    moveTo(toolbar.querySelector(':scope > details.board-menu[data-board-menu="filters"]'), (el) => tools.append(el));
    if (sortButton) tools.append(sortButton);
    moveTo(toolbar.querySelector(":scope > .bookmark-button"), (el) => title.before(el));
    const row = $("#view-toolbar");
    row?.toggleAttribute("data-empty", ![...row.querySelectorAll(".toolbar > * > *")].some((el) => el.getClientRects().length));
  }
  // iPad (owner request, 31 Oct 2026): Board, Planning and an open document put their star before
  // the title too.
  function starBeforeTitle() {
    const title = $(".topbar .breadcrumb strong");
    if (title) moveTo($("#view-toolbar .bookmark-button, .board-toolbar > .bookmark-button, .document-heading > .bookmark-button"), (el) => title.before(el));
  }
  // Documents skip the toolbar pass, which would remove their tray, so they place their star here;
  // an earlier document's star goes with its heading.
  function documentStar() {
    lowerTools();
    if (tabBar.matches && !narrow.matches) starBeforeTitle();
  }
  // Moves a control, leaving a marker for restoreToolbar to put it back.
  function moveTo(element, place) {
    if (!element) return;
    const slot = document.createComment("view control position");
    element.before(slot);
    moved.push([element, slot]);
    place(element);
  }
  // Tasks and Planning layouts move to a tray above the bottom bar, opened by tapping the open
  // tab again.
  function trayLayouts() {
    const switcher = $(".toolbar-left > .view-layout-switcher");
    if (!switcher || !$(".tabs .tab.active")) return;
    const slot = document.createComment("view control position");
    switcher.before(slot);
    moved.push([switcher, slot]);
    mountLayoutTray(switcher, trayOpen());
  }
  // The tray belongs to the view it was opened on, so leaving that view (or going Back) closes it.
  const trayOpen = () => !!state.layoutTray && state.layoutTray === state.view;
  function setLayoutTray(open) {
    state.layoutTray = open ? state.view : null;
    $(".layout-tray")?.toggleAttribute("data-open", open);
    $('.tabs .tab[aria-controls="layout-tray"]')?.setAttribute("aria-expanded", String(open));
  }
  // Tapping the open tab toggles the tray (app.js leaves the open view as it is); choosing from
  // it or tapping anywhere else closes it.
  document.addEventListener("click", (event) => {
    if (event.target.closest('.tabs .tab[aria-controls="layout-tray"]')) setLayoutTray(!trayOpen());
    else if (trayOpen() && (event.target.closest(".layout-tray button") || !event.target.closest(".layout-tray"))) setLayoutTray(false);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || state.dialog || state.menu || !$(".layout-tray[data-open]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setLayoutTray(false);
    $('.tabs .tab[aria-controls="layout-tray"]')?.focus({ preventScroll: true });
  }, true);
  function closeCompact() {
    if (!compact?.open) return;
    compact.open = state.mobileViewOptions = false;
    compact.querySelector("summary").focus({ preventScroll: true });
  }
  function positionCompact() {
    if (compact?.open) positionPopover(compact.lastElementChild, compact.querySelector("summary").getBoundingClientRect(), { width: 360, maxHeight: 600 });
  }
  narrow.addEventListener("change", compactToolbar);
  tabBar.addEventListener("change", compactToolbar);
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
        `<details class="board-menu" data-board-menu="${key}"><summary id="board-menu-${key}">${title}<svg class="icon menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></summary><div class="board-menu-panel"></div></details>`,
      );
      el = host.lastElementChild;
    }
    return el.querySelector(".board-menu-panel");
  }
  // A board menu whose summary is an icon, named for screen readers and in its tooltip.
  function iconMenu(host, key, title, glyph) {
    const panel = menu(host, key, title), summary = panel.parentElement.querySelector("summary");
    if (!summary.classList.contains("icon-summary")) {
      summary.className = "icon-summary";
      summary.setAttribute("aria-label", title);
      summary.title = title;
      summary.innerHTML = icon(glyph);
    }
    host.append(panel.parentElement);
    return panel;
  }
  function move(panel, selector) {
    const el = $(selector);
    if (el) panel.append(el);
  }
  function projectHeader() {
    restoreToolbar();
    if (!state.project || !$(".tabs")) return;
    const queryHost = $(".toolbar-left");
    $(".toolbar-left > .view-layout-switcher")?.remove();
    const taskLayout = taskViews.includes(state.view);
    const layouts = taskLayout ? taskViews : planningViews.includes(state.view) ? planningViews : [];
    if (queryHost && layouts.length)
      queryHost.insertAdjacentHTML("afterbegin", `<div class="view-layout-switcher ${taskLayout ? "task" : "planning"}-view-switcher" role="group" aria-label="${taskLayout ? "Task" : "Planning"} layout">${layouts.map((view) => `<button type="button" data-action="view" data-view="${view}" aria-label="${label(view)}" aria-pressed="${state.view === view}" title="${label(view)} layout">${icon(view)}<span>${label(view)}</span></button>`).join("")}</div>`);
    const toolbar = $(".toolbar-left");
    const advanced = $(".advanced-filters");
    if (toolbar && advanced) {
      const panel = menu(toolbar, "filters", "");
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
      // An icon with a badge counting the active filters.
      const summary = panel.parentElement.querySelector("summary"), name = `Filters${count ? ` (${count} active)` : ""}`;
      summary.className = "icon-summary";
      summary.setAttribute("aria-label", name);
      summary.title = name;
      summary.innerHTML = `${icon("filter")}${count ? `<span class="filter-count" aria-hidden="true">${count}</span>` : ""}`;
    }
    restoreMenus();
    compactToolbar();
  }
  function render() {
    restoreToolbar();
    const toolbar = $(".board-toolbar");
    if (!$("#canvas") || !toolbar) return;
    // Boards are chosen and created in the sidebar (board-explorer.js), so the bar starts with the save state.
    if ($("#board-save")) toolbar.append($("#board-save"));
    if ($("#canvas-presence")) toolbar.append($("#canvas-presence"));
    // The right side matches the document bar: Session, Version history, the star and Board tools (⋯).
    const session = iconMenu(toolbar, "session", "Session", "person");
    const history = iconMenu(toolbar, "history", "Version history", "clock");
    const star = toolbar.querySelector(":scope > .bookmark-button");
    if (star) toolbar.append(star);
    const tools = iconMenu(toolbar, "tools", "Board tools", "more");
    move(tools, '[data-action="board-rename"]');
    const panels = { session, history, tools };
    // Dynamic tools are recreated on each board render; remove their old copies.
    for (const panel of [session, history, tools])
      for (const el of [...panel.children]) if (!el.dataset.action && !el.dataset.boardPersistent) el.remove();
    const extras = $("#canvas-extras");
    if (extras) for (const el of [...extras.children]) (panels[el.dataset.menuHome] || tools).append(el);
    extras?.remove();
    // Items kept across renders (data-board-persistent) stay at the end of their menu.
    history.append(...history.querySelectorAll(":scope > [data-board-persistent]"));
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
      // The tool bar's Insert menu opens beside the bar, level with its button where it fits.
      const bar = details.closest(".board-tools")?.getBoundingClientRect();
      if (bar) positionPopover(panel, { left: bar.right + 8, top: anchor.top, bottom: anchor.top }, { width: 240, maxHeight: 240, gap: 0 });
      else positionPopover(
        panel,
        {
          left: anchor.left,
          top: toolbar ? Math.min(anchor.top, toolbar.top) : anchor.top,
          bottom: toolbar
            ? Math.max(anchor.bottom, toolbar.bottom)
            : anchor.bottom,
        },
        { width: details.classList.contains("table-header-menu") ? 240 : 320, maxHeight: 640 },
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
      const actions = menu ? [...menu.querySelectorAll(":scope > .board-menu-panel > :is(button, a):not(:disabled), :scope > .board-menu-panel > .menu-footer > button:not(:disabled)")].filter((el) => !el.hidden && el.getClientRects().length) : [];
      // Arrow keys navigate action rows, while form fields keep their native keys.
      if (menu && (summary || actions.includes(event.target)) &&
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const buttons = menu.querySelectorAll(":scope > .board-menu-panel > :is(button, a):not(:disabled):not([hidden]), :scope > .board-menu-panel > .menu-footer > button:not(:disabled):not([hidden])");
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
  return { render, projectHeader, compactToolbar, documentStar };
}
