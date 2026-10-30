import { tabBar } from "./layout-tray.js";
// The bottom bar's own buttons (owner request, 30 Oct 2026): each person adds commands and their
// bookmarked cards, documents, boards and views between the views and Search, in Settings → You or
// in place with a long press on the bar. Phones and touch screens such as iPad only: desktop has no
// bottom bar. They're kept for the person on the server (server/bar.js); the bar scrolls sideways
// when they don't fit (project-layout.css).
const commandIcons = { today: "pencil", "new-task": "plus", workflow: "status", import: "upload", templates: "duplicate", "quick-capture": "idea", "project-settings": "settings", recovery: "refresh", personal: "person" };
const itemIcons = { card: "task", doc: "file", board: "board" };
const LIMIT = 12;
const same = (a, b) => a.type === b.type && a.id === b.id && a.kind === b.kind && a.project === b.project;

export function installBottomBar({ api, esc, icon, toast, viewLabel, bookmarks, commands }) {
  let items = [], ready = false, loaded = null, loads = 0, choices = [], saving = Promise.resolve(), rendered = "";
  const glyph = (b) => (b.type === "command" ? (b.id.startsWith("view-") ? b.id.slice(5) : commandIcons[b.id] || "play") : b.kind === "view" ? b.id : itemIcons[b.kind]);
  const title = (b) =>
    b.type === "command" ? commands(true).find((c) => c.id === b.id)?.title || b.id : b.kind === "view" ? `${viewLabel(b.id)} · ${b.project_title}` : b.title;
  const button = (b) => {
    const name = esc(title(b));
    const action = b.type === "command" ? `data-feature="command-run" data-command="${esc(b.id)}"` : `data-feature="search-open" data-kind="${esc(b.kind)}" data-id="${esc(b.id)}" data-project="${esc(b.project)}"`;
    return `<button type="button" class="tab bar-button" ${action} aria-label="${name}" title="${name}">${icon(glyph(b))}</button>`;
  };
  // The buttons that work here: a project's commands only show in a project.
  function shown() {
    const here = new Set(commands().map((c) => c.id));
    return items.filter((b) => b.type !== "command" || here.has(b.id));
  }
  const markup = () => `<span class="bar-buttons" role="group" aria-label="Your buttons">${shown().map(button).join("")}</span>`;
  function html() {
    load();
    return (rendered = markup());
  }
  function editorHTML() {
    if (!ready) return `<div class="bar-editor"><p class="field-hint">Loading your buttons…</p></div>`;
    const row = (b, i) =>
      `<li class="bar-editor-item">${icon(glyph(b))}<span>${esc(title(b))}</span><button type="button" class="icon-button" data-bar-move="${i}" data-step="-1" aria-label="Move ${esc(title(b))} up" title="Move up" ${i ? "" : "disabled"}>${icon("up")}</button><button type="button" class="icon-button" data-bar-move="${i}" data-step="1" aria-label="Move ${esc(title(b))} down" title="Move down" ${i < items.length - 1 ? "" : "disabled"}>${icon("down")}</button><button type="button" class="icon-button" data-bar-remove="${i}" aria-label="Remove ${esc(title(b))}" title="Remove">${icon("close")}</button></li>`;
    const full = items.length >= LIMIT;
    const commandOptions = commands(true).filter((c) => !items.some((b) => same(b, { type: "command", id: c.id }))).map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
    const itemOptions = choices.map((c, i) => [{ type: "item", ...c }, i]).filter(([c]) => !items.some((b) => same(b, c))).map(([c, i]) => `<option value="${i}">${esc(title(c))}</option>`).join("");
    return `<div class="bar-editor">${items.length ? `<ol class="bar-editor-list">${items.map(row).join("")}</ol>` : '<p class="field-hint">No buttons yet.</p>'}<div class="bar-editor-add"><label class="field">Add a command<select data-bar-add="command" ${full ? "disabled" : ""}><option value="">${full ? `The bar holds ${LIMIT} buttons` : "Choose…"}</option>${commandOptions}</select></label><label class="field">Add a bookmark<select data-bar-add="item" ${full || !itemOptions ? "disabled" : ""}><option value="">${choices.length ? "Choose…" : "Bookmark a card, document or board first"}</option>${itemOptions}</select></label></div></div>`;
  }
  function paint(focus) {
    // Only when they change, so a button being pressed stays in place.
    const host = document.querySelector(".topbar .tabs .bar-buttons"), next = markup();
    if (host && next !== rendered) {
      host.closest(".tabs-scroll").style.setProperty("--bar-items", host.closest(".tabs-scroll").querySelectorAll(":scope > .view-tab-group").length + shown().length);
      host.outerHTML = rendered = next;
    }
    for (const el of document.querySelectorAll(".bar-editor")) el.outerHTML = editorHTML();
    // Repainting replaces the control just used; keep the keyboard where it was.
    if (focus) (document.querySelector(`.bar-editor ${focus}:not(:disabled)`) || document.querySelector(".bar-editor select:not(:disabled)"))?.focus({ preventScroll: true });
  }
  // The saved bar; the latest request wins, and a failed one is tried again next time.
  function load(again = false) {
    if (again) loaded = null;
    const request = ++loads;
    loaded ||= api("/bar").then((data) => {
      if (request !== loads) return;
      items = data.items;
      ready = true;
      paint();
    }).catch(() => { loaded = null; });
    return loaded;
  }
  // Changes show at once and save in order; a refused one reloads the saved bar.
  function save(next, focus) {
    if (!ready) return;
    items = next;
    paint(focus);
    const body = { items: next.map(({ type, id, kind, project }) => (type === "command" ? { type, id } : { type, kind, project, id })) };
    saving = saving.then(() => api("/bar", { method: "PATCH", body })).catch((error) => {
      toast(error.message, true);
      return load(true);
    });
  }
  // Fresh from the server, in case another device changed the bar.
  async function mountEditor() {
    [choices] = await Promise.all([bookmarks.list().catch(() => []), saving.then(() => load(true))]);
    paint();
  }
  document.addEventListener("click", (event) => {
    const move = event.target.closest?.("[data-bar-move]"), remove = event.target.closest?.("[data-bar-remove]");
    if (move) {
      const i = +move.dataset.barMove, step = +move.dataset.step, next = [...items];
      [next[i], next[i + step]] = [next[i + step], next[i]];
      save(next, `[data-bar-move="${i + step}"][data-step="${step}"]`);
    } else if (remove) save(items.filter((_, i) => i !== +remove.dataset.barRemove));
    else if (event.target.closest?.("[data-bar-done]")) closeTray(true);
  });
  document.addEventListener("change", (event) => {
    const kind = event.target.dataset?.barAdd;
    if (!kind || !event.target.value) return;
    save([...items, kind === "command" ? { type: "command", id: event.target.value } : { type: "item", ...choices[+event.target.value] }], `[data-bar-add="${kind}"]`);
  });

  // In place: a long press on the bar opens the same editor in a tray above it.
  const tray = () => document.querySelector(".bar-tray");
  function openTray() {
    closeTray();
    const nav = document.querySelector(".topbar .tabs");
    if (!nav) return;
    // One tray at a time: the Tasks or Planning layouts close.
    document.querySelector(".layout-tray")?.removeAttribute("data-open");
    document.querySelector('.tabs .tab[aria-controls="layout-tray"]')?.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.className = "bar-tray";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Your buttons");
    panel.innerHTML = `<div class="bar-tray-head"><strong>Your buttons</strong><button type="button" class="button small" data-bar-done>Done</button></div>${editorHTML()}`;
    nav.append(panel);
    requestAnimationFrame(() => {
      panel.toggleAttribute("data-open", true);
      panel.querySelector("[data-bar-done]").focus({ preventScroll: true });
    });
    mountEditor();
  }
  function closeTray(focus = false) {
    tray()?.remove();
    if (focus) document.querySelector(".topbar .tabs .tab.active")?.focus({ preventScroll: true });
  }
  let press = null;
  const release = () => {
    clearTimeout(press?.timer);
    press = null;
  };
  document.addEventListener("touchstart", (event) => {
    release();
    if (!tabBar.matches || event.touches.length > 1 || !event.target.closest?.(".topbar .tabs") || event.target.closest(".bar-tray, .layout-tray")) return;
    const { clientX: x, clientY: y } = event.touches[0];
    const current = (press = { x, y, timer: setTimeout(() => { current.fired = true; openTray(); }, 500) });
    // On the element pressed, which still hears it if a repaint takes it off the page. The press that
    // opened the tray doesn't also press the button under it, even if another finger came down since.
    event.target.addEventListener("touchend", (end) => {
      if (current.fired) end.preventDefault();
      if (press === current) release();
    }, { once: true });
  }, { passive: true });
  // Moving first scrolls the bar instead.
  document.addEventListener("touchmove", (event) => {
    const t = event.touches[0];
    if (press && !press.fired && Math.hypot(t.clientX - press.x, t.clientY - press.y) > 8) release();
  }, { passive: true });
  document.addEventListener("touchcancel", release);
  document.addEventListener("contextmenu", (event) => {
    if (tabBar.matches && event.target.closest?.(".topbar .tabs")) event.preventDefault();
  });
  document.addEventListener("pointerdown", (event) => {
    if (tray() && !event.target.closest?.(".bar-tray, #shared-select-menu")) closeTray();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && tray() && !document.querySelector("#shared-select-menu:popover-open")) {
      event.preventDefault();
      closeTray(true);
    }
  });
  return { html, editorHTML, mountEditor, count: () => shown().length, load: () => load(true) };
}
