// Group the existing controls without replacing their handlers or save state.
export function projectLayout(ctx) {
  const { $, state, esc } = ctx;
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
    const projectPanel = menu(projectTools, "project", "Project");
    projectPanel.innerHTML = `<div class="compact-project-info"><strong>${esc(state.project.title)}</strong><p>${esc($(".hero p")?.textContent || "")}</p><p>${esc($(".stats-strip")?.textContent.replace(/\s+/g, " ").trim() || "")}</p></div>`;
    const features = $("#feature-toolbar");
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
      const count = [f.assignee, f.tag, f.due, f.blocked, f.archived].filter(
        Boolean,
      ).length;
      panel.parentElement.querySelector("summary").innerHTML =
        `Filters${count ? ` (${count})` : ""}<span aria-hidden="true">⌄</span>`;
    }
    restoreMenus();
  }
  function render() {
    const toolbar = $(".board-toolbar");
    if (!$("#canvas") || !toolbar) return;
    const boards = menu(toolbar, "board", "Board");
    move(boards, '[data-action="board-new"]');

    const more = menu(toolbar, "more", "More");
    // Dynamic tools are recreated on each board render; remove their old copies.
    for (const panel of [boards, more])
      for (const el of [...panel.children]) if (!el.dataset.action) el.remove();
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
  function restoreMenus() {
    document.querySelectorAll(".board-menu").forEach((el) => {
      el.open = el.dataset.boardMenu === state.headerMenu;
    });
  }
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
      }
      if (!el) {
        state.headerMenu = null;
        document
          .querySelectorAll(".board-menu[open]")
          .forEach((menu) => (menu.open = false));
      } else if (
        event.target.closest("button") &&
        !event.target.closest("form")
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
