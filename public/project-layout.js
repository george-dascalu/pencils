import { positionPopover } from "./popover-position.js";
// Group the existing controls without replacing their handlers or save state.
export function projectLayout(ctx) {
  const { $, state, esc, icon, label, viewLabel, taskViews, planningViews, openView } = ctx;
  function menu(host, key, title) {
    let el = host.querySelector(`[data-board-menu="${key}"]`);
    if (!el) {
      host.insertAdjacentHTML(
        "beforeend",
        `<details class="board-menu" data-board-menu="${key}"><summary>${title}<span aria-hidden="true">⌄</span></summary><div class="board-menu-panel"></div></details>`,
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
    if (!state.project || !$(".tabs")) return;
    const tabs = $(".tabs");
    let projectTools = $("#board-project-tools");
    if (!projectTools) {
      tabs.insertAdjacentHTML(
        "afterend",
        '<div id="board-project-tools" class="board-project-tools"></div>',
      );
      projectTools = $("#board-project-tools");
    }
    let switcher = projectTools.querySelector(".mobile-view-switcher");
    if (!switcher) {
      switcher = document.createElement("label");
      switcher.className = "mobile-view-switcher";
      projectTools.prepend(switcher);
    }
    const projectView = taskViews.includes(state.view) ? "tasks" : planningViews.includes(state.view) ? "planning" : state.view;
    switcher.innerHTML = `View <select id="project-view-switcher" aria-label="Project view">${[...tabs.querySelectorAll("[data-view]")].map((button) => `<option value="${esc(button.dataset.view)}" ${button.dataset.view === projectView ? "selected" : ""}>${esc(viewLabel(button.dataset.view))}</option>`).join("")}</select>`;
    const projectPanel = menu(projectTools, "project", "Project");
    projectPanel.innerHTML = `<div class="compact-project-info"><strong>${esc(state.project.title)}</strong><p>${esc($(".hero p")?.textContent || "")}</p><p>${esc($(".stats-strip")?.textContent.replace(/\s+/g, " ").trim() || "")}</p></div>`;
    $(".shared-query-controls")?.remove();
    const features = $("#feature-toolbar");
    const queryHost = $(".toolbar-left");
    if (
      features &&
      queryHost &&
      !["board", "drawing", "overview", "settings"].includes(state.view)
    ) {
      const controls = document.createElement("div");
      controls.className = "shared-query-controls";
      for (const el of features.querySelectorAll(
        '#saved-view,[data-feature="view-save"],[data-feature="view-save-as"],[data-feature="view-delete"]',
      ))
        controls.append(el);
      queryHost.prepend(controls);
    }
    $(".view-layout-switcher")?.remove();
    const taskLayout = taskViews.includes(state.view);
    const layouts = taskLayout ? taskViews : planningViews.includes(state.view) ? planningViews : [];
    if (queryHost && layouts.length)
      queryHost.insertAdjacentHTML("afterbegin", `<div class="view-layout-switcher ${taskLayout ? "task" : "planning"}-view-switcher" role="group" aria-label="${taskLayout ? "Task" : "Planning"} layout">${layouts.map((view) => `<button type="button" data-action="view" data-view="${view}" aria-pressed="${state.view === view}" title="${label(view)} layout">${icon(view)}<span>${label(view)}</span></button>`).join("")}</div>`);
    if (features) {
      for (const el of [...features.children])
        if (!el.classList.contains("spacer")) projectPanel.append(el);
      features.remove();
    }
    if (!projectTools.querySelector('[data-action="project-edit"]')) {
      for (const el of [...($(".hero-right")?.children || [])])
        projectTools.append(el);
    }
    const toolbar = $(".toolbar-left");
    const advanced = $(".advanced-filters");
    if (toolbar && advanced) {
      const panel = menu(toolbar, "filters", "Filters");
      panel.replaceChildren(...advanced.children);
      advanced.remove();
      const f = state.extraFilters || {};
      const count = [
        f.assignee,
        f.tag,
        f.due,
        f.blocked,
        f.archived,
        f.completion,
      ].filter(Boolean).length;
      panel.parentElement.querySelector("summary").innerHTML =
        `Filters${count ? ` (${count})` : ""}<span aria-hidden="true">⌄</span>`;
    }
    restoreMenus();
  }
  function render() {
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
  }
  function positionMenus() {
    for (const details of document.querySelectorAll(".board-menu[open]")) {
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
        { width: 320, maxHeight: 560 },
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
        state.headerMenu = el.open ? null : el.dataset.boardMenu;
        document.querySelectorAll(".board-menu[open]").forEach((other) => {
          if (other !== el) other.open = false;
        });
        // Position after the native disclosure toggles, before its first paint.
        requestAnimationFrame(positionMenus);
      }
      if (!el) {
        state.headerMenu = null;
        document
          .querySelectorAll(".board-menu[open]")
          .forEach((menu) => (menu.open = false));
      } else if (
        event.target.closest("button") &&
        !event.target.closest("form, [data-menu-keep-open]")
      ) {
        state.headerMenu = null;
        el.open = false;
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (state.dialog) return;
      const open = document.querySelector(".board-menu[open]");
      if (event.key === "Escape" && open && !state.canvasEditing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.headerMenu = null;
        open.open = false;
        open.querySelector("summary").focus();
      } else if (
        event.key !== "Escape" &&
        (event.target.closest(".board-menu")?.open ||
          event.target.matches(".board-menu > summary"))
      ) {
        // Keep native Tab/Enter/Space and select navigation away from canvas shortcuts.
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  return { render, projectHeader };
}
