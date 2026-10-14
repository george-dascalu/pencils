// Shared, selection-aware controls; existing action handlers own edits and undo.
export function selectionToolbar(ctx, pick) {
  const { $, esc, icon, state, changeBoard } = ctx;
  let menuKey = null,
    selectionKey = "";
  function button(kind, key, label, glyph, disabled = false, extra = "") {
    const shortcut = {
      inline: "Enter",
      "zoom-selection": "Alt / Option + 2",
      duplicate: "Ctrl / ⌘ + D",
      group: "Ctrl / ⌘ + G",
      ungroup: "Ctrl / ⌘ + Shift + G",
      lock: "Ctrl / ⌘ + Shift + L",
      "selection-delete": "Delete",
    }[key];
    return `<button type="button" class="selection-action" data-${kind}="${key}" aria-label="${esc(label)}" title="${esc(label + (shortcut ? ` (${shortcut})` : ""))}" ${disabled ? "disabled" : ""} ${extra}>${icon(glyph)}<span class="selection-action-label">${esc(label)}</span></button>`;
  }
  function menu(key, label, glyph, body, disabled = false) {
    return `<details class="selection-menu" data-selection-menu="${key}"><summary aria-label="${label}" title="${label}" ${disabled ? 'aria-disabled="true"' : ""}>${glyph}${icon("chevron")}</summary><div class="selection-popover" role="group" aria-label="${label}">${body}</div></details>`;
  }
  const group = (name, body) =>
    `<div class="selection-group" role="group" aria-label="${name}">${body}</div>`;
  function html() {
    const nodes = pick(),
      n = nodes[0],
      single = nodes.length === 1;
    const locked = nodes.every((n) => n.locked),
      editable = nodes.filter((n) => !n.locked);
    const pro = (key, label, glyph, disabled = false) =>
      button("pro", key, label, glyph, disabled);
    const feature = (key, label, glyph, disabled = false, extra = "") =>
      button("feature", key, label, glyph, disabled, extra);
    const fill = /^#[\da-f]{6}$/i.test(n.color || "") ? n.color : "#ffffff";
    const mixed = nodes.some((node) => node.color !== n.color);
    const color = ctx.colorPicker({
      value: fill,
      label: "Object colour",
      mixed,
      disabled: locked,
      selection: true,
    });
    const arrange = menu(
      "arrange",
      "Arrange objects",
      icon("arrange"),
      `<strong>Align</strong><div class="selection-align-grid">${[
        ["align-left", "Align left", "align-left"],
        ["align-center", "Align centres horizontally", "align-center"],
        ["align-right", "Align right", "align-right"],
        ["align-top", "Align top", "align-top"],
        ["align-middle", "Align centres vertically", "align-middle"],
        ["align-bottom", "Align bottom", "align-bottom"],
      ]
        .map(([key, label, glyph]) =>
          feature(key, label, glyph, nodes.length < 2 || locked),
        )
        .join(
          "",
        )}</div>${feature("distribute", "Space evenly horizontally", "distribute", editable.length < 3)}${feature("distribute-vertical", "Space evenly vertically", "distribute-vertical", editable.length < 3)}<hr>${feature("group", "Group", "group", nodes.length < 2 || locked)}${feature("ungroup", "Ungroup", "ungroup", !nodes.some((n) => n.group && !n.locked))}${feature("frame-selection", "Create frame around selection", "frame", locked)}`,
    );
    const more = menu(
      "more",
      "More object actions",
      icon("more"),
      `${single && n.type === "sticky" ? pro("convert", "Make task", "task", locked) : ""}${single && ["task", "file"].includes(n.type) ? pro("embed", "Choose heading or block", "file", locked) + pro("backlinks", "Backlinks", "connect") : ""}${single && n.type === "query" ? pro("query-edit", "Edit live task view", "table", locked) : ""}${feature("bring-front", "Bring to front", "front", locked)}${feature("send-back", "Send to back", "back", locked)}<hr>${feature("selection-delete", "Delete", "trash", locked)}`,
    );
    return `<div id="selection-tools" class="selection-tools" role="toolbar" aria-label="Selected objects"><span class="selection-kind" title="${nodes.length} selected">${icon(single ? { frame: "frame", query: "table", draw: "pencil", image: "image" }[n.type] || n.type : "group")}<span>${single ? esc(({ sticky: "Note", query: "Live view", draw: "Drawing" }[n.type] || n.type).replace(/^./, (c) => c.toUpperCase())) : `${nodes.length} objects`}</span></span>${group("Edit and appearance", `${single ? pro("inline", "Edit", "pencil", locked) : ""}${color}${single ? pro("object-style", "Appearance and parent frame", "settings", locked) : ""}`)}${group("Collaboration", single ? pro("comments", "Comment", "comment") : "")}${group("Organise", arrange + pro("zoom-selection", "Focus selection", "fit"))}${group("Object actions", feature("duplicate", "Duplicate", "duplicate") + feature("lock", locked ? "Unlock selection" : "Lock selection", locked ? "unlock" : "local", false, `aria-pressed="${locked}"`) + more)}</div>`;
  }
  function render() {
    const key = pick()
      .map((n) => n.id)
      .sort()
      .join(",");
    if (key !== selectionKey) menuKey = null;
    selectionKey = key;
    $("#selection-tools")?.remove();
    if (key) $("#canvas")?.insertAdjacentHTML("beforeend", html());
    const open =
      menuKey && $(`#selection-tools [data-selection-menu="${menuKey}"]`);
    if (open) open.open = true;
    state.selectionToolbarOpen = !!open;
    requestAnimationFrame(positionMenus);
  }
  function close(focus = false) {
    menuKey = null;
    const open = $("#selection-tools details[open]");
    if (open) {
      open.open = false;
      if (focus) open.querySelector("summary").focus();
    }
    state.selectionToolbarOpen = false;
  }
  function positionMenus() {
    const canvas = $("#canvas"),
      menu = $("#selection-tools details[open]");
    if (!canvas || !menu) return;
    const panel = menu.querySelector(".selection-popover");
    const c = canvas.getBoundingClientRect(),
      m = menu.getBoundingClientRect();
    panel.style.left = `${Math.max(c.left + 8, Math.min(m.left, c.right - panel.offsetWidth - 8)) - m.left}px`;
    const below = c.bottom - m.bottom - 12,
      above = m.top - c.top - 12;
    const up = below < Math.min(panel.scrollHeight, 320) && above > below;
    panel.style.top = up ? "auto" : "calc(100% + 8px)";
    panel.style.bottom = up ? "calc(100% + 8px)" : "auto";
    panel.style.maxHeight = `${Math.max(80, up ? above : below)}px`;
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest("#selection-tools")) e.stopImmediatePropagation();
      else close();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const root = e.target.closest("#selection-tools");
      if (!root) {
        close();
        return;
      }
      const summary = e.target.closest("summary");
      if (summary) {
        if (summary.getAttribute("aria-disabled") === "true") {
          e.preventDefault();
          return;
        }
        const menu = summary.parentElement,
          opening = !menu.open;
        close();
        // Native details toggling happens after click dispatch.
        menu.open = !opening;
        menuKey = opening ? menu.dataset.selectionMenu : null;
        state.selectionToolbarOpen = opening;
        requestAnimationFrame(positionMenus);
      } else if (e.target.closest("button")) close();
    },
    true,
  );
  function setColor(color) {
    if (!/^#[\da-f]{6}$/i.test(color)) return;
    changeBoard(() =>
      pick()
        .filter((n) => !n.locked)
        .forEach((n) => (n.color = color)),
    );
  }
  document.addEventListener(
    "change",
    (e) => {
      if (e.target.matches("[data-selection-custom-color]")) {
        e.stopImmediatePropagation();
        close();
        setColor(e.target.value);
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const root = $("#selection-tools");
      if (
        !root ||
        state.dialog ||
        state.canvasEditing ||
        $("#canvas")?.classList.contains("presenting")
      )
        return;
      if (e.key === "Escape" && root.querySelector("details[open]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(true);
        return;
      }
      if (!e.target.closest("#selection-tools")) return;
      if (e.key === "Escape" || e.ctrlKey || e.metaKey) return;
      e.stopImmediatePropagation();
      if (e.target.matches("input,select,textarea")) return;
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        e.preventDefault();
        const host = e.target.closest(".selection-popover") || root;
        const items = [
          ...host.querySelectorAll(
            "button:not(:disabled),summary:not([aria-disabled=true])",
          ),
        ].filter((el) => el.getClientRects().length);
        const i = items.indexOf(e.target),
          next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : (i +
                    (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) +
                    items.length) %
                  items.length;
        items[next]?.focus();
      }
    },
    true,
  );
  return { render, positionMenus, close };
}
