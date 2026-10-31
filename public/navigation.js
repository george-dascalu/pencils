// Browser history contains locations and view preferences, never task/board data.
const marker = "pencils-navigation-v1";
const projectViews = new Set([
  "overview",
  "documents",
  "list",
  "tree",
  "table",
  "kanban",
  "board",
  "drawing",
  "calendar",
  "timeline",
  "capacity",
  "settings",
]);

export function readLocation(hash = location.hash) {
  const help = /^#help(?:\/([\w-]+))?$/.exec(hash);
  if (help) return { page: "help", article: help[1] || "start" };
  const settings =
    /^#project\/([\w-]+)\/settings(?:\/([\w-]+)(?:\/([\w-]+))?)?$/.exec(hash);
  if (settings)
    return {
      project: settings[1],
      view: "settings",
      settingsSection: settings[2] || "general",
      settingsDetail: settings[3] || "",
    };
  const project =
    /^#project\/([\w-]+)\/([\w-]+)(?:\/([\w-]+)(?:\/frame\/([\w-]+))?)?$/.exec(
      hash,
    );
  if (project && projectViews.has(project[2])) {
    const view = project[2] === "drawing" ? "board" : project[2];
    return {
      project: project[1],
      view,
      document: view === "documents" ? project[3] || null : null,
      board:
        view === "board" && project[3] !== "gallery"
          ? project[3] || null
          : null,
      gallery: view === "board" && project[3] === "gallery",
      frame: project[4] || null,
    };
  }
  const organisation = /^#organisation\/([\w-]+)\/(home|teams|people|settings)(?:\/([\w-]+))?$/.exec(
    hash,
  );
  if (organisation)
    return { organisation: organisation[1], page: organisation[2], settingsSection: organisation[3] || null };
  if (hash === "#home") return { page: "home" };
  return null;
}

function locationFor(route) {
  if (route.page === "help") return `#help/${route.article || "start"}`;
  if (route.project && route.view === "settings")
    return `#project/${route.project}/settings/${route.settingsSection || "general"}${route.settingsDetail ? `/${route.settingsDetail}` : ""}`;
  if (route.project)
    return `#project/${route.project}/${route.view}${route.view === "documents" && route.document ? `/${route.document}` : route.view === "board" ? (route.gallery ? "/gallery" : route.board ? `/${route.board}` : "") : ""}`;
  return route.organisation
    ? `#organisation/${route.organisation}/${route.page || "home"}${route.page === "settings" && route.settingsSection ? `/${route.settingsSection}` : ""}`
    : "#home";
}
const identity = (entry) => locationFor(entry.route);
const scrollPosition = () => ({
  x: scrollX,
  y: scrollY,
  content: document.querySelector("#view-content")?.scrollTop || 0,
  tableX:
    document.querySelector("#view-content > .table-scroll")?.scrollLeft || 0,
  tableY:
    document.querySelector("#view-content > .table-scroll")?.scrollTop || 0,
  treeX:
    document.querySelector("#view-content > .tree-wrapper")?.scrollLeft || 0,
  treeY:
    document.querySelector("#view-content > .tree-wrapper")?.scrollTop || 0,
  kanbanX: document.querySelector("#view-content > .kanban")?.scrollLeft || 0,
  kanbanY: document.querySelector("#view-content > .kanban")?.scrollTop || 0,
  kanbanColumns: Object.fromEntries(
    [...document.querySelectorAll(".kanban-column[data-drop-status]")].map(
      (column) => [column.dataset.dropStatus, column.scrollTop],
    ),
  ),
});
const sameView = (a, b) =>
  JSON.stringify([a.route, a.preferences, a.scroll]) ===
  JSON.stringify([b.route, b.preferences, b.scroll]);

export function browserNavigation({ capture, restore, onError }) {
  let started = false,
    current = null,
    scheduled = false,
    running = false,
    pending = null,
    active = null,
    initialEntry = null,
    bouncing = false;
  const stored = () => {
    const entry = history.state;
    return entry?.kind === marker &&
      Number.isInteger(entry.index) &&
      entry.url === location.hash
      ? entry
      : null;
  };
  const write = (entry, push = false) => {
    history[push ? "pushState" : "replaceState"](
      entry,
      "",
      `${location.pathname}${location.search}${entry.url}`,
    );
    current = entry;
    // Some browsers drop history.state on reload. Keep a tab-local fallback,
    // used only for reloading this exact location, never for a fresh link.
    try {
      sessionStorage.setItem("pencils:current-location", JSON.stringify(entry));
    } catch {}
  };
  function record() {
    if (!started || running || bouncing) return;
    const next = capture();
    const changed = current && identity(next) !== identity(current);
    const entry = {
      ...next,
      kind: marker,
      index: current.index + (changed ? 1 : 0),
      url: locationFor(next.route),
      scroll: scrollPosition(),
    };
    if (!sameView(current, entry)) write(entry, changed);
  }
  function schedule() {
    if (!started || running || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      record();
    });
  }
  // Remember filters and scroll position before a click or keyboard shortcut leaves.
  function rememberCurrent() {
    if (!started || running || bouncing || stored()?.index !== current.index)
      return;
    const next = capture();
    const entry = { ...current, ...next, scroll: scrollPosition() };
    if (identity(next) === identity(current) && !sameView(current, entry))
      write(entry);
  }
  async function traverse() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const target = pending;
        active = target;
        pending = null;
        const stillCurrent = () =>
          !pending &&
          location.hash === target.url &&
          (!stored() || stored().index === target.index);
        let applied = false;
        try {
          applied = await restore(target, stillCurrent);
        } catch (error) {
          if (stillCurrent()) onError(error);
        }
        if (!stillCurrent()) continue;
        if (!applied) {
          if (stored() && target.index !== current.index) {
            bouncing = true;
            history.go(current.index - target.index);
          } else write(current);
          break;
        }
        const next = capture();
        write({
          ...target,
          ...next,
          kind: marker,
          url: locationFor(next.route),
        });
        requestAnimationFrame(() => {
          if (pending || stored()?.index !== target.index) return;
          const content = document.querySelector("#view-content");
          if (content) content.scrollTop = target.scroll?.content || 0;
          const table = document.querySelector("#view-content > .table-scroll");
          if (table) {
            table.scrollLeft = target.scroll?.tableX || 0;
            table.scrollTop = target.scroll?.tableY || 0;
          }
          const tree = document.querySelector("#view-content > .tree-wrapper");
          if (tree) {
            tree.scrollLeft = target.scroll?.treeX || 0;
            tree.scrollTop = target.scroll?.treeY || 0;
          }
          const kanban = document.querySelector("#view-content > .kanban");
          if (kanban) {
            kanban.scrollLeft = target.scroll?.kanbanX || 0;
            kanban.scrollTop = target.scroll?.kanbanY || 0;
            for (const column of kanban.querySelectorAll("[data-drop-status]"))
              column.scrollTop =
                target.scroll?.kanbanColumns?.[column.dataset.dropStatus] || 0;
          }
          window.scrollTo(target.scroll?.x || 0, target.scroll?.y || 0);
        });
      }
    } finally {
      running = false;
      active = null;
    }
  }
  function onLocationChange() {
    if (!started) return;
    const saved = stored();
    if (bouncing) {
      if (saved?.index === current.index) bouncing = false;
      return;
    }
    if (
      !running &&
      saved?.index === current.index &&
      location.hash === current.url
    )
      return;
    const route = saved?.route || readLocation();
    if (!route) {
      write(current);
      return;
    }
    const target = saved || {
      route,
      index: current.index + 1,
      url: location.hash,
    };
    // Hash changes also emit popstate. Avoid replaying the same destination twice.
    if (pending?.index === target.index && pending.url === target.url) return;
    if (active?.index === target.index && active.url === target.url && !pending)
      return;
    pending = target;
    void traverse();
  }
  window.addEventListener("popstate", onLocationChange);
  window.addEventListener("hashchange", onLocationChange);
  for (const event of ["click", "change", "keydown"])
    document.addEventListener(event, rememberCurrent, true);
  window.addEventListener("pagehide", rememberCurrent);
  let scrollTimer;
  document.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(rememberCurrent, 120);
    },
    { capture: true, passive: true },
  );
  return {
    initial() {
      initialEntry = stored();
      if (
        !initialEntry &&
        performance.getEntriesByType("navigation")[0]?.type === "reload"
      ) {
        try {
          const cached = JSON.parse(
            sessionStorage.getItem("pencils:current-location"),
          );
          if (cached?.kind === marker && cached.url === location.hash)
            initialEntry = cached;
        } catch {}
      }
      return (
        initialEntry || (readLocation() ? { route: readLocation() } : null)
      );
    },
    start() {
      if (started) return;
      const previous = stored() || initialEntry;
      const next = capture();
      current = {
        ...next,
        kind: marker,
        index: previous?.index || 0,
        url: locationFor(next.route),
        scroll: previous?.scroll || scrollPosition(),
      };
      started = true;
      history.scrollRestoration = "manual";
      write(current);
    },
    schedule,
  };
}
