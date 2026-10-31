import { confirmAction } from "./confirm-popover.js";
import { deferredController } from "./deferred-controller.js";
import { DEFAULT_TASK_TYPES } from "./task-types.js";
import { kanbanGroup, kanbanGroups } from "./kanban-model.js";
import { priorityLabel } from "./task-priority.js";
import { randomUUID } from "./uuid.js";
import {projectAutomations} from "./project-automations.js";
import { projectSettings } from "./project-settings.js";
import {projectSources} from "./project-sources.js";
import { showSchedulePreview } from "./schedule-preview.js";
import { localDate } from "./task-visibility.js";
import { draftAutosave } from "./draft-autosave.js";
import { installBottomBar } from "./bottom-bar.js";
import { taskAutosave } from "./task-autosave.js";
import { boardComments } from "./board-comments.js";
import { workflowEditor } from "./workflow-editor.js";
import { organisationTeams, projectTeamControls } from "./teams.js";
import { taskModalControls } from "./task-modal.js";
import { taskAttachments } from "./task-attachments.js";
import { taskRelationshipsEditor } from "./task-relationships.js";
import { taskDocumentsEditor } from "./task-documents.js";
import { taskDescription } from "./task-description.js";
import { projectLayout } from "./project-layout.js";
import { personalSettings } from "./personal-settings.js";
import { planning } from "./planning.js";
import { grid } from "./grid.js";
import { taskReorder } from "./task-reorder.js";
import { taskRowEditor } from "./task-row-editor.js";
import { recoveryUI } from "./recovery-ui.js";

export function installFeatures(ctx) {
  const {
    state,
    storage,
    sync,
    api,
    route,
    esc,
    icon,
    label,
    viewLabel,
    options,
    $,
    $$,
    toast,
    task,
    board,
    renderApp,
    renderView,
    refresh,
    openProject,
    taskDialog,
    showDialog,
    closeDialog,
    dialogHead,
    patchTask,
    clearProject,
  } = ctx;
  const documentFeature = deferredController(() => import("./project-documents.js").then(m => m.projectDocuments(ctx)));
  const documents = documentFeature.controller;
  let settings;
  const settingsContext = (section) => ({ ...ctx,
    openSettings: (detail = "", opts) => settings.open(section, detail, opts),
    presentSettings: (html, kind) => settings.present(html, kind, section),
    settingsSaved: () => settings.clean(),
    settingsCurrent: () => settings.current(section),
    openDiagnostics: () => settings.open("diagnostics"),
  });
  const sources = projectSources(settingsContext("sources")),
    automations = projectAutomations(settingsContext("automation")),
    drawingFeature = deferredController(() => import("./drawing-view.js").then(m => m.drawingView(ctx)), { ready: false }, ["enter", "settled"]),
    drawings = drawingFeature.controller;
  settings = projectSettings(ctx, { sources, automations, personal: () => personal, organisationEditor: (form) => dialogOpened("organisation", form) });
  const plan = planning(ctx),
    sheet = grid(ctx),
    recovery = recoveryUI(ctx),
    layout = projectLayout(ctx),
    canvasFeature = deferredController(() => import("./canvas.js").then(m => m.canvasFeatures({ ...ctx, layout, openBoard: drawings.enter })), { visible: () => [], edges: "", busy: false, click: false }),
    canvas = canvasFeature.controller,
    bottomBar = (ctx.bottomBar = installBottomBar({ ...ctx, commands })),
    personal = personalSettings(ctx);
  taskReorder(ctx, sheet);
  taskRowEditor(ctx);
  const formBases = new WeakMap();
  let reloadWorkflow = null,
    reloadTeams = null,
    taskModal = null,
    taskEditor = null,
    attachments = null,
    relationships = null,
    documentsEditor = null,
    autosave = null,
    taskComments = null,
    activeDraft = null,
    boot,
    events,
    refreshTimer,
    refreshInteraction = 0,
    lastVersion = -1,
    refreshing = false;
  const button = (key, title, extra = "") =>
    `<button type="button" class="button small" data-feature="${key}" ${extra}>${title}</button>`;
  const field = (name, title, value = "", type = "text", extra = "") =>
    `<label class="field">${esc(title)}<input name="${esc(name)}" type="${type}" value="${esc(value ?? "")}" ${extra}></label>`;
  function config() {
    return (
      state.config || {
        statuses: ["backlog", "todo", "in-progress", "review", "done"],
        types: [...DEFAULT_TASK_TYPES],
        done: ["done"],
        fields: [],
      }
    );
  }
  function progress() {
    const active = state.tasks.filter((t) => !t.archived),
      parents = new Set(active.map((t) => t.parent)),
      leaves = active.filter((t) => !parents.has(t.id)),
      done = leaves.filter((t) => config().done.includes(t.status)),
      weight = (t) => (t.estimate > 0 ? t.estimate : 1);
    return {
      done: done.length,
      total: leaves.length,
      percent: leaves.length
        ? Math.round(
            (done.reduce((s, t) => s + weight(t), 0) /
              leaves.reduce((s, t) => s + weight(t), 0)) *
              100,
          )
        : 0,
    };
  }
  function filter(t) {
    const f = state.extraFilters || {},
      done = config().done.includes(t.status),
      now = localDate(),
      soon = localDate(new Date(Date.now() + 7 * 86400000));
    return (
      (!t.archived || f.archived) &&
      (!f.completion || (f.completion === "done" ? done : !done)) &&
      (!f.assignee ||
        String(t.assignee || "")
          .toLowerCase()
          .includes(f.assignee.toLowerCase())) &&
      (!f.tag ||
        (t.tags || []).some((tag) =>
          tag.toLowerCase().includes(f.tag.toLowerCase()),
        )) &&
      (!f.due ||
        (f.due === "overdue" && t.due && t.due < now && !done) ||
        (f.due === "week" && t.due && t.due >= now && t.due <= soon && !done) ||
        (f.due === "none" && !t.due)) &&
      (!f.blocked ||
        (t.dependencies || []).some(
          (id) => !config().done.includes(task(id)?.status),
        ))
    );
  }
  async function saveProject(changes) {
    const fresh = await api(route());
    const result = await api(route(), {
      method: "PATCH",
      body: { ...changes, revision: fresh.project.revision },
    });
    state.project = result;
    return result;
  }
  function viewToolbar() {
    $(".advanced-filters")?.remove();
    const host = $("#view-toolbar");
    if (!host) return;
    const f = state.extraFilters || {};
    host.insertAdjacentHTML(
      "afterbegin",
      `${["board", "drawing", "overview"].includes(state.view) ? "" : `<div class="advanced-filters"><label class="field">Assignee<input id="filter-assignee" placeholder="Anyone" value="${esc(f.assignee || "")}"></label><label class="field">Tag<input id="filter-tag" placeholder="Any tag" value="${esc(f.tag || "")}"></label><label class="field">Deadline<select id="filter-due">${options(["", "overdue", "week", "none"], f.due || "", { "": "Any deadline", overdue: "Overdue", week: "Next 7 days", none: "No deadline" })}</select></label><label class="field">Completion<select id="filter-completion">${options(["", "open", "done"], f.completion || "", { "": "Any completion", open: "Open", done: "Completed" })}</select></label>${state.view === "list" ? `<label class="field">Group by<select id="group-by">${options(["status", "type", "assignee", "priority", "none"], state.groupBy || "status", { status: "Status", type: "Type", assignee: "Assignee", priority: "Priority", none: "No grouping" })}</select></label>` : ""}<div class="filter-checks"><label><input type="checkbox" id="filter-blocked" ${f.blocked ? "checked" : ""}> Blocked</label><label><input type="checkbox" id="filter-archived" ${f.archived ? "checked" : ""}> Include archived</label></div><div class="menu-footer"><button type="button" class="button" data-action="filters-reset">Clear filters</button></div></div>`}`,
    );
    if (state.view === "table") {
      $(".toolbar-right")?.setAttribute("hidden", "");
    } else $(".toolbar-right")?.removeAttribute("hidden");
    if (["calendar", "timeline", "capacity"].includes(state.view)) {
      // Planning views have their own ordering; task sort does not apply.
      $("#sort")?.setAttribute("hidden", "");
      $(".toolbar-right")?.setAttribute("hidden", "");
    }
    $(".kanban-group-control")?.remove();
    $(".kanban-id-control")?.remove();
    if (state.view === "kanban") {
      $(".toolbar-right")?.insertAdjacentHTML("afterbegin", `<label class="kanban-group-control">Swimlanes<select id="kanban-group" class="filter" aria-label="Kanban swimlanes">${options(kanbanGroups, kanbanGroup(state.kanbanGroupBy), { none: "None", assignee: "Assignee", priority: "Priority", type: "Task type" })}</select></label><label class="kanban-group-control kanban-id-control"><input type="checkbox" id="kanban-show-ids" ${storage.get(`kanban-show-ids:${state.project.id}`, false) === true ? "checked" : ""}>Show card IDs</label>`);
    }
    layout.projectHeader();
  }
  function pagination(total) {
    $("#pagination")?.remove();
    if (
      total <= 100 ||
      [
        "calendar",
        "timeline",
        "capacity",
        "kanban",
        "board",
        "overview",
      ].includes(state.view)
    )
      return;
    $("#view-content")?.insertAdjacentHTML(
      "beforeend",
      `<div id="pagination" class="pagination">${button("page-prev", `${icon("chevron-left")}<span>Previous</span>`, state.page ? "" : "disabled")}<span>Page ${(state.page || 0) + 1} of ${Math.ceil(total / 100)} · ${total} ${state.view === "tree" ? "root groups" : "tasks"}</span>${button("page-next", `<span>Next</span>${icon("chevron-right")}`, (state.page || 0) + 1 >= Math.ceil(total / 100) ? "disabled" : "")}</div>`,
    );
  }
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-kanban-collapse]");
    if (toggle && state.view === "kanban") {
      const key = toggle.dataset.kanbanCollapse;
      const collapsed = new Set(state.kanbanCollapsed || []);
      if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
      state.kanbanCollapsed = [...collapsed];
      storage.set(`kanban-collapsed:${state.project.id}`, state.kanbanCollapsed);
      renderView(true);
      [...document.querySelectorAll("[data-kanban-collapse]")].find(el => el.dataset.kanbanCollapse === key)?.focus({ preventScroll: true });
      return;
    }
    const el = event.target.closest("[data-kanban-more]");
    if (!el || state.view !== "kanban") return;
    state.kanbanLimits ||= {};
    const key = `${state.project.id}/${el.dataset.kanbanMore}`;
    state.kanbanLimits[key] = (state.kanbanLimits[key] || 100) + 100;
    renderView(true);
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "filter-completion") {
      state.extraFilters ||= {};
      state.extraFilters.completion = event.target.value;
      state.page = 0;
      renderView(true);
    }
  });
  function afterRender() {
    if (state.view !== "board") drawings.reset();
    connectEvents();
    personal.render();
    if (!state.project && !state.directoryPage && !state.helpArticle)
      plan.dashboard().catch((e) => toast(e.message, true));
    const metric = $(".stats-strip");
    if (metric)
      metric.title =
        "Progress counts leaf tasks only, weighted by estimate when provided (otherwise 1). Parent tasks are not counted twice.";
    if (state.project?.archived)
      $(".hero")?.insertAdjacentHTML(
        "afterend",
        '<div class="connection-banner">This project is archived. Restore it in Project settings to include it in active planning.</div>',
      );
    ctx.updateEdges();
  }
  function taskData(form) {
    const data = new FormData(form),
      id = form.dataset.id,
      t = task(id) || formBases.get(form) || {},
      fields = { ...(t.fields || {}) };
    const comment = String(data.get("new-comment") || "").trim();
    return {
      start: data.get("start") || null,
      estimate: t.estimate ?? null,
      dependencies: data.getAll("dependencies"),
      related_records: data.getAll("related_records"),
      documents: data.getAll("documents"),
      recurrence: t.recurrence ?? null,
      fields,
      comments: [
        ...(t.comments || []),
        ...(comment
          ? [
              {
                id: `c-${Date.now()}`,
                author: state.session?.user?.username || "Workspace",
                created: new Date().toISOString(),
                text: comment,
              },
            ]
          : []),
      ],
    };
  }
  function draftKey(form) {
    // Organisation drafts (people and teams) belong to the organisation, whichever project is open.
    const scope = form.id === "organisation-form" ? state.organisation?.id : state.project?.id || state.organisation?.id;
    return `draft:${state.session?.user?.username || "shared"}:${scope || "workspace"}:${form.id}:${form.dataset.draftNode ? `board:${form.dataset.board}:draft:${form.dataset.draftNode}` : form.dataset.id || form.dataset.edit || "new"}`;
  }
  function dialogOpened(kind, pageForm) {
    relationships?.destroy();
    relationships = null;
    documentsEditor?.destroy();
    documentsEditor = null;
    autosave?.destroy();
    autosave = null;
    taskComments?.destroy();
    taskComments = null;
    taskModal?.destroy();
    taskModal = null;
    attachments?.destroy();
    attachments = null;
    taskEditor?.destroy();
    taskEditor = null;
    const form = pageForm || $("dialog form");
    activeDraft = null;
    reloadWorkflow = null;
    reloadTeams =
      kind === "organisation" && form
        ? organisationTeams(
            form,
            form.dataset.id ? state.organisation : null,
            esc,
          )
        : kind === "project" && form
          ? projectTeamControls(form, state, esc)
          : null;
    if (kind === "organisation" && form?.dataset.id)
      formBases.set(form, structuredClone(state.organisation));
    if (kind === "task" && form) {
      const t = task(form.dataset.id) || state.dialogTask || {};
      formBases.set(form, structuredClone(t));
      sources.decorateTask(form,t);
      const linkedDrawings=state.boards.filter(b=>b.settings?.linked_tasks?.includes(t.id));
      if(linkedDrawings.length)form.querySelector('.dialog-body').insertAdjacentHTML('beforeend',`<section><h3>Canvases</h3>${linkedDrawings.map(b=>`<a class="button small" href="#project/${state.project.id}/board/${b.id}" target="_blank">${esc(b.title)} ↗</a>`).join('')}</section>`);
      taskEditor = taskDescription(form, ctx.markdown, ctx.icon, state.project.id);
      attachments = taskAttachments(ctx, form, taskEditor);
      taskModal = taskModalControls(ctx, form, async (version) => {
        if (
          !(await confirmAction({ title: "Restore this version?", message: "Your current edits are saved in history first.", confirmLabel: "Restore" }))
        )
          return;
        if (autosave && !(await autosave.flush())) return;
        await api("/history", {
          method: "POST",
          body: { file: t.file, version, revision: form.dataset.revision },
        });
        clearDraft();
        await refresh(false);
        taskDialog(t.id, {}, true);
        await taskModal.history();
      });
    }
    if (kind === "task" && form?.dataset.draftNode) {
      const savedDraftKey = draftKey(form);
      autosave = draftAutosave(ctx, form, taskEditor, {
        readExtra: () => taskData(form),
        onSaved: ({ disposed }) => {
          storage.set(savedDraftKey, null);
          if (!disposed) state.dirty = false;
        },
        refreshNode: (id) => canvas.nodeSaved(id),
      });
    }
    if (kind === "task" && form?.dataset.id) {
      const id = form.dataset.id,
        url = route("tasks", id),
        projectId = state.project.id;
      const editor = taskEditor,
        savedDraftKey = draftKey(form);
      const read = () => {
        const data = new FormData(form);
        const result = { ...taskData(form) };
        delete result.comments;
        for (const key of [
          "title",
          "body",
          "type",
          "status",
          "priority",
          "assignee",
          "parent",
          "due",
        ])
          result[key] =
            data.get(key) || (["parent", "due"].includes(key) ? null : "");
        result.title = result.title.trim();
        return result;
      };
      autosave = taskAutosave(form, {
        read,
        flushEditor: () => editor.flush(),
        task: () => task(id),
        sync,
        url,
        onSaved: ({ disposed }) => {
          storage.set(savedDraftKey, null);
          if (state.project?.id !== projectId || !task(id)) return;
          if (["board", "drawing"].includes(state.view)) canvas.taskSaved(id);
          else if (state.view !== "settings") renderView(true);
          if (disposed) return;
          formBases.set(form, structuredClone(task(id)));
          state.dirty = false;
          taskModal?.refreshStatuses();
          canvas.saved();
        },
      });
      const trigger = form.querySelector('[data-feature="task-comments"]');
      taskComments = boardComments(
        ctx,
        () => state.session?.user?.username || "Workspace",
        (prefix) => `${prefix}-${randomUUID()}`,
        {
          host: form.closest("dialog"),
          mount: form.querySelector(".task-editor-content"),
          onOpen: () =>
            form.closest("dialog").classList.add("with-task-comments"),
          item: () => (state.project?.id === projectId ? task(id) : null),
          title: () => task(id)?.title || "Task",
          change: (mutate) => {
            const base = structuredClone(task(id));
            mutate();
            void sync.enqueue(url, base, { comments: task(id).comments });
          },
          onClose: () => {
            trigger.setAttribute("aria-expanded", "false");
            form.closest("dialog")?.classList.remove("with-task-comments");
          },
          trigger: '[data-feature="task-comments"]',
        },
      );
    }
    if (kind === "task" && form && !form.dataset.draftNode) {
      relationships = taskRelationshipsEditor(ctx, form, {
        flush: () => (form.dataset.id ? autosave?.flush() || Promise.resolve(false) : Promise.resolve(true)),
        changed: (id) => {
          if (["board", "drawing"].includes(state.view)) canvas.taskSaved(id);
          else if (state.view !== "settings") renderView(true);
        },
      });
      documentsEditor = taskDocumentsEditor({ ...ctx, features: { openDocument: (id) => documentFeature.load().then(() => documents.openDocument(id)) } }, form, {
        flush: () => (form.dataset.id ? autosave?.flush() || Promise.resolve(false) : Promise.resolve(true)),
      });
    }
    if (kind === "project" && form) {
      const c =
        form.dataset.edit === "true"
          ? config()
          : {
              statuses: ["backlog", "todo", "in-progress", "review", "done"],
              done: ["done"],
              types: [...DEFAULT_TASK_TYPES],
              fields: [],
            };
      form.dataset.schema = JSON.stringify(c);
      reloadWorkflow = workflowEditor(
        form,
        c,
        form.dataset.edit === "true" ? state.tasks : [],
        ctx,
      );
    }
    if (kind === "project" && form?.dataset.edit === "true")
      $(".dialog-body", form).insertAdjacentHTML(
        "beforeend",
        `<div class="task-actions">${button("project-history", "Version history")}${button("project-archive", state.project.archived ? "Unarchive project" : "Archive project")}${button("project-delete", "Delete project")}</div>`,
      );
    if (!form || !["task", "project", "organisation"].includes(kind)) return;
    const key = draftKey(form),
      draft = storage.get(key, null);
    activeDraft = key;
    if (draft && Date.now() - draft.time < 30 * 86400000) {
      $(".dialog-body", form)?.insertAdjacentHTML(
        "afterbegin",
        `<div class="draft-notice">A browser draft is available. ${button("form-restore", "Restore draft")}${button("form-discard", "Discard draft")}</div>`,
      );
    }
    const save = () => {
      const data = {};
      for (const input of form.elements) {
        if (!input.name) continue;
        data[input.name] =
          input.type === "checkbox"
            ? input.checked
            : input.multiple
              ? [...input.selectedOptions].map((o) => o.value)
              : input.value;
      }
      storage.set(key, { time: Date.now(), data, base: formBases.get(form) });
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
  }
  function clearDraft() {
    if (activeDraft) storage.set(activeDraft, null);
    activeDraft = null;
  }
  async function session() {
    state.session = await api("/session");
    if (state.session.required && !state.session.user) {
      $("#app").innerHTML =
        `<main class="login"><img src="/icon.svg" alt="Pencils"><h1>Welcome to Pencils</h1><form id="login-form">${field("username", "Username", "", "text", 'autocomplete="username" required')}${field("password", "Password", "", "password", 'autocomplete="current-password" required')}<p id="login-error" role="alert"></p><button type="submit" class="button primary">Sign in</button></form><p>Ask your workspace administrator for access.</p></main>`;
      return false;
    }
    sync.load(state.session.user?.username || "shared");
    ctx.bookmarks.load();
    bottomBar.load();
    return true;
  }
  function start(fn) {
    boot = fn;
    for (const event of ["pointerdown", "keydown"])
      document.addEventListener(event, () => refreshInteraction++, true);
    // A component that already used the key (the document editor's Ctrl/⌘ K link) keeps it.
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.defaultPrevented) {
        e.preventDefault();
        searchDialog();
      }
    });
    connectEvents();
  }
  let eventProject;
  function connectEvents(){
    const project=state.project?.id || "";if(events && eventProject===project)return;eventProject=project;events?.close();
    events = new EventSource(`/api/events${project?`?project=${project}`:""}`);
    events.onmessage = (e) => {
      const version = JSON.parse(e.data).version;
      if (version !== lastVersion) {
        lastVersion = version;
        if (version !== state.snapshotVersion) scheduleRefresh();
      }
    };
    events.onerror = () => {};
  }
  function refreshBlocked() {
    return (
      state.loading ||
      state.settingsDirty ||
      state.settingsSaving ||
      state.dialog ||
      state.boardTaskEditor ||
      state.canvasEditing ||
      canvas.busy() ||
      state.headerMenu ||
      state.selectionToolbarOpen ||
      state.kanbanDragging ||
      state.timelineSelecting ||
      state.taskReordering ||
      state.toolDragging ||
      sync.entries.size ||
      document.activeElement?.matches(
        "input,textarea,select,[contenteditable=true]",
      ) ||
      document.querySelector(
        "#shared-select-menu,#attachment-preview,button:active,summary:active,.board-node:active,[data-edge]:active",
      ) ||
      (["board", "drawing"].includes(state.view) && !["cursor", "hand"].includes(state.tool))
    );
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      // A save response may already have applied the event's version while
      // this timer waited. Do not replace focused controls with identical DOM.
      if (lastVersion === state.snapshotVersion) return;
      if (refreshing || refreshBlocked()) {
        scheduleRefresh();
        return;
      }
      refreshing = true;
      const interaction = refreshInteraction;
      try {
        await refresh(true, () => {
          if (refreshBlocked() || interaction !== refreshInteraction) {
            scheduleRefresh();
            return false;
          }
          return true;
        }, { quiet: true });
      } catch {
      } finally {
        refreshing = false;
      }
    }, 700);
  }
  let searchViewport;
  // Search is for typing, so its field takes focus at once, on touch screens too: opened within the
  // tap, so phones show the keyboard. Phones get a compact sheet with the field at the bottom.
  function searchDialog() {
    showDialog(
      `<dialog class="dialog wide-dialog search-dialog" aria-label="Search and commands"><div class="dialog-body"><div class="search-dialog-field"><label class="field"><span>Search</span><input id="global-search-input" type="search" placeholder="Search or type a command…" autofocus></label><button type="button" class="icon-button search-dialog-clear" aria-label="Close search" title="Close search">${icon("close")}</button></div><div class="search-dialog-results"><div id="bookmark-results"></div><div id="command-results"></div><div id="global-search-results"></div></div></div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button></div></dialog>`,
      "search",
    );
    const dialog = $("dialog.search-dialog");
    if (!dialog) return; // the open card kept its dialog (for example, a cleared title)
    const input = $("#global-search-input"), clear = dialog.querySelector(".search-dialog-clear");
    // Without preventScroll iOS pans the page to the field while the sheet moves above the keyboard.
    input.focus({ preventScroll: true });
    // The ✕ clears the text, or closes the sheet when there is none.
    const name = () => {
      const label = input.value ? "Clear search" : "Close search";
      clear.setAttribute("aria-label", label);
      clear.title = label;
    };
    input.addEventListener("input", name);
    clear.addEventListener("click", () => {
      if (!input.value) return closeDialog();
      input.value = "";
      name();
      input.focus();
      clearTimeout(searchTimer);
      searchResults("");
    });
    // A press that starts and ends outside closes it; a drag out of the field (selecting text) doesn't.
    const outside = (event) => {
      const r = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
    };
    let pressedOutside = false;
    dialog.addEventListener("pointerdown", (event) => { pressedOutside = outside(event); });
    dialog.addEventListener("click", (event) => { if (pressedOutside && outside(event)) closeDialog(); });
    // iOS keeps the layout viewport tall under the keyboard: keep the sheet in the visible part.
    // The listeners end with the next search or once the sheet is gone.
    const viewport = window.visualViewport;
    searchViewport?.abort();
    searchViewport = new AbortController();
    const fit = () => {
      if (!dialog.isConnected) return searchViewport.abort();
      dialog.style.setProperty("--search-bottom", `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop)}px`);
      dialog.style.setProperty("--search-height", `${viewport.height}px`);
      dialog.style.setProperty("--search-top", `${viewport.offsetTop}px`);
    };
    if (viewport) {
      fit();
      viewport.addEventListener("resize", fit, { signal: searchViewport.signal });
      viewport.addEventListener("scroll", fit, { signal: searchViewport.signal });
    }
    bookmarked = ctx.bookmarks.list().catch(() => []);
    clearTimeout(searchTimer); // a search typed in the last dialog doesn't fill this one
    searchResults("");
  }
  // The commands that work here, or all of them (for choosing the bottom bar's buttons).
  function commands(all = false) {
    return [
      { id: "today", title: "Today's note", run: () => document.querySelector('.sidebar [data-action="today"]')?.click() },
      ...(all || (state.project && !state.project.personal)
        ? [
            { id: "new-task", title: "New card", run: () => taskDialog(null) },
            ...[["workflow", "Statuses & workflow"], ["import", "Import notes"], ["templates", "Task templates"], ["quick-capture", "Quick capture"]].map(([id, title]) => ({ id, title, run: () => click(id) })),
            ...[
              "overview",
              "list",
              "tree",
              "table",
              "kanban",
              "board",
              "calendar",
              "timeline",
              "capacity",
            ].map((view) => ({
              id: `view-${view}`,
              title: `Open ${viewLabel(view)} view`,
              run: () => ctx.openView(view),
            })),
            {
              id: "project-settings",
              title: "Project settings",
              run: () =>
                document.querySelector('[data-action="project-edit"]')?.click(),
            },
          ]
        : []),
      {
        id: "recovery",
        title: "Recovery and backups",
        run: () => click("recovery", {}),
      },
      {
        id: "personal",
        title: "Your settings",
        run: () => settings.open("personal"),
      },
    ];
  }
  let searchSequence=0, bookmarked=Promise.resolve([]);
  const searchKinds = { card: ["Card", "task"], doc: ["Document", "file"], board: ["Board", "board"] };
  // Excerpts arrive with \u0002 and \u0003 around each match; everything else is escaped.
  const excerptHTML = (text) => esc(text).replace(/\u0002/g, "<mark>").replace(/\u0003/g, "</mark>");
  const where = (r) => [state.organisations.find((o) => o.id === r.organisation)?.title, r.project_title].filter(Boolean).map(esc).join(" / ");
  const resultTitle = (r) => r.kind === "view" ? viewLabel(r.id) : r.title;
  function resultHTML(r) {
    const [kind, glyph] = searchKinds[r.kind] || ["View", r.id];
    return `<button class="search-result" data-feature="search-open" data-kind="${r.kind}" data-id="${esc(r.id)}" data-project="${esc(r.project)}" data-key="${esc(r.key || "")}" data-title="${esc(resultTitle(r))}"><strong>${icon(glyph)}${r.key ? `${esc(r.key)} ` : ""}${esc(resultTitle(r))}</strong><span>${kind} · ${where(r)}${r.status ? ` · ${esc(r.status)}` : ""}${r.archived ? " · Archived" : ""}</span>${r.excerpt ? `<span class="search-excerpt">${excerptHTML(r.excerpt)}</span>` : ""}</button>`;
  }
  async function searchResults(query) {
    if (!$("#command-results")) return; // closed while the search waited
    const words = query.toLowerCase().trim().split(/\s+/);
    const found = (text) => words.every((word) => text.toLowerCase().includes(word));
    const matches = commands().filter((command) => found(command.title));
    $("#command-results").innerHTML =
      `<p class="field-hint">Commands</p>${matches.map((command) => `<button class="search-result command-result" data-feature="command-run" data-command="${esc(command.id)}">${esc(command.title)}</button>`).join("") || "<p>No matching commands.</p>"}`;
    const sequence=++searchSequence;
    // Bookmarks first, in their own list as soon as they arrive: all of them before typing, the
    // ones matching the query's plain words as you type (quotes dropped; -word, #tag and in: are
    // left to the server).
    const plain = query.toLowerCase().replace(/"/g, " ").split(/\s+/).filter((word) => word && !/^(-|#|in:)/.test(word));
    void bookmarked.then((all) => {
      if (sequence !== searchSequence || !$("#bookmark-results")) return;
      const marks = all.filter((b) => plain.every((word) => `${b.key || ""} ${resultTitle(b)} ${b.project_title}`.toLowerCase().includes(word)));
      $("#bookmark-results").innerHTML = marks.length ? `<p class="field-hint">Bookmarks</p>${marks.map(resultHTML).join("")}` : "";
    });
    if (!query.trim()) { $("#global-search-results").innerHTML = ""; return; }
    // One ranked list from the server: cards, documents and boards in every project you can open.
    let data;try{data=await api(`/search?q=${encodeURIComponent(query)}`);}catch(error){if(sequence===searchSequence && $("#global-search-results"))$("#global-search-results").textContent=error.message;return;}
    if(sequence!==searchSequence || !$("#global-search-results"))return;
    $("#global-search-results").innerHTML = `<p class="field-hint">Cards, documents and boards</p>${
      data.results.map(resultHTML).join("") || (data.suggestion ? `<p class="search-suggestion">No results. Did you mean <button type="button" class="text-link" data-feature="search-suggestion" data-query="${esc(data.suggestion)}">${esc(data.suggestion)}</button>?</p>` : "<p>No results.</p>")
    }<p class="field-hint">Enter opens · Alt+Enter links it in the open document · "phrase", -word, #tag, in:cards, in:docs, in:boards</p>`;
  }
  document.addEventListener("keydown", (event) => {
    if (
      state.dialog !== "search" ||
      !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    )
      return;
    const results = [
      ...document.querySelectorAll(
        "#bookmark-results button, #command-results button, #global-search-results button",
      ),
    ];
    if (!results.length) return;
    const index = results.indexOf(document.activeElement);
    // Alt+Enter: a [[link]] to the focused (or first) result at the open document's caret.
    if (event.key === "Enter" && event.altKey) {
      const chosen = document.activeElement?.closest?.('[data-feature="search-open"]') || $('#global-search-results [data-feature="search-open"]');
      if (!chosen) return;
      event.preventDefault();
      const { kind, id, project, key, title } = chosen.dataset;
      // Documents resolve links to cards and documents of their own project only.
      if (kind === "board" || kind === "view" || project !== state.project?.id) { toast("Alt+Enter links cards and documents of this project.", true); return; }
      const link = kind === "card" ? `[[${key || id}]]` : `[[Projects/${project}/documents/${id}|${title.replace(/[[\]|]/g, "")}]]`;
      closeDialog();
      if (!documents.insertText(link)) toast("Open a document to insert a link.", true);
    } else if (event.key === "Enter" && event.target.id === "global-search-input") {
      event.preventDefault();
      results[0].click();
    } else if (event.key !== "Enter") {
      event.preventDefault();
      // From the field, ArrowDown goes to the first result and ArrowUp to the last.
      const step = event.key === "ArrowDown" ? 1 : -1;
      results[index < 0 ? (step > 0 ? 0 : results.length - 1) : (index + step + results.length) % results.length].focus();
    }
  });
  function templates() {
    showDialog(
      `<dialog class="dialog">${dialogHead("Task templates")}<div class="dialog-body"><p>Save an existing task as a template from its editor. Templates belong to this project.</p>${(state.project.templates || []).map((t, i) => `<div class="recovery-item"><strong>${esc(t.name)}</strong>${button("template-use", "Use template", `data-index="${i}"`)}${button("template-delete", "Delete", `data-index="${i}"`)}</div>`).join("") || "<p>No templates yet.</p>"}</div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button></div></dialog>`,
      "templates",
    );
  }
  async function accounts() {
    const data = await api("/accounts");
    showDialog(
      `<dialog class="dialog wide-dialog"><form id="account-form">${dialogHead("Accounts & organisation access")}<div class="dialog-body"><p>Admins can manage every organisation and restore the vault. Editors can change assigned organisations; viewers have read access.</p><div>${data.accounts.map((u) => `<button type="button" class="button small" data-feature="account-edit" data-account="${esc(u.username)}">${esc(u.username)}${u.admin ? " · Admin" : ""}</button>`).join("")}</div>${field("username", "Username", "", "text", 'required autocomplete="off"')}${field("password", "New password (12+ characters); blank keeps existing", "", "password", 'autocomplete="new-password"')}<label><input name="admin" type="checkbox"> Administrator</label><h3>Organisation membership</h3>${state.organisations.map((o) => `<label class="field">${esc(o.title)}<select name="org:${o.id}">${options(["", "viewer", "editor"], "", { "": "No access" })}</select></label>`).join("")}<div class="form-error" role="alert"></div></div><div class="dialog-foot"><button type="submit" class="button primary">Save account</button></div></form></dialog>`,
      "accounts",
    );
    state.accounts = data.accounts;
  }
  async function click(action, el) {
    // Before any wait, so the field's focus stays within the tap that opened it.
    if (action === "global-search") return searchDialog();
    if (
      (await recovery.click(action, el)) ||
      (await sheet.click(action, el)) ||
      (await canvas.click(action, el)) ||
      plan.click(action, el)
    )
      return;
    if (action === "dashboard") {
      clearProject();
      renderApp();
    }
    if (action === "schedule-preview") {
      if (autosave && !(await autosave.flush())) return;
      showSchedulePreview(ctx);
    }
    if (action === "command-run") {
      const command = commands().find(
        (command) => command.id === el.dataset.command,
      );
      closeDialog();
      if (!state.dialog) await command?.run();
    }
    if (action === "search-open") {
      closeDialog();
      if (state.dialog) return;
      const { kind, id, project } = el.dataset;
      if (state.project?.id !== project && !(await openProject(project))) return;
      if (kind === "card") taskDialog(id);
      else if (kind === "view") ctx.openView(id);
      else if (kind === "board") await drawings.enter(id);
      else {
        await documentFeature.load();
        await documents.openDocument(id);
      }
    }
    if (action === "search-suggestion") {
      const input = $("#global-search-input");
      input.value = el.dataset.query;
      input.focus();
      await searchResults(input.value);
    }
    if (action === "global-open" || action === "note-open") {
      closeDialog();
      if (state.dialog) return;
      if (state.project?.id !== el.dataset.project)
        await openProject(el.dataset.project);
      taskDialog(el.dataset.id);
    }
    if (action === "quick-capture")
      showDialog(`<dialog class="dialog">${dialogHead("Quick capture")}<form id="quick-capture" class="dialog-body"><label class="field">Title<input name="title" aria-label="Card title" placeholder="Card title…" required maxlength="300" autofocus></label><button class="button primary" type="submit">Add card</button></form></dialog>`, "quick-capture");
    if (action === "workflow") settings.open("workflow");
    if (action === "page-prev" || action === "page-next") {
      state.page = Math.max(
        0,
        (state.page || 0) + (action === "page-next" ? 1 : -1),
      );
      renderView(true);
    }
    if (action === "form-restore") {
      const form =
          $("dialog form") || $("#project-form") || $("#organisation-form"),
        draft = storage.get(activeDraft, null);
      if (draft) {
        for (const input of form.elements) {
          if (!(input.name in draft.data)) continue;
          if (input.type === "checkbox")
            input.checked = draft.data[input.name] === true;
          else if (input.multiple) {
            for (const o of input.options)
              o.selected = draft.data[input.name].includes(o.value);
          } else input.value = draft.data[input.name];
        }
        if (draft.base) {
          formBases.set(form, draft.base);
          if (form.id === "organisation-form" && draft.base.revision)
            form.dataset.revision = draft.base.revision;
        }
        taskEditor?.reload();
        taskModal?.reload();
        relationships?.refresh();
        reloadTeams?.();
        reloadWorkflow?.();
        if (form.id === "organisation-form" || (form.id === "project-form" && state.view === "settings"))
          state.settingsDirty = true;
        state.dirty = true;
        $(".draft-notice")?.remove();
        autosave?.schedule();
        toast(
          autosave
            ? "Browser draft restored. Changes save automatically."
            : "Browser draft restored. Save to update the vault.",
        );
      }
    }
    if (action === "form-discard") {
      storage.set(activeDraft, null);
      $(".draft-notice")?.remove();
    }
    // A second tap on the open pane returns to the details: wide screens have no Info button.
    // Read before the save below, which may wait, and skip it when only closing the pane.
    if (["task-comments", "task-history"].includes(action) && el?.getAttribute("aria-pressed") === "true") action = "task-details";
    if (
      [
        "task-duplicate",
        "task-archive",
        "task-history",
      ].includes(action) &&
      autosave &&
      !(await autosave.flush())
    )
      return;
    if (action === "draft-finalise") {
      if (!autosave || !(await autosave.flush())) return;
      const id = $("#task-form")?.dataset.draftNode;
      if (!id || id === "new") return;
      closeDialog(false, { confirmDirty: false });
      await canvas.finaliseDraft(id);
      return;
    }
    const currentTask = task($("#task-form")?.dataset.id);
    if (action === "task-details" && currentTask) {
      taskComments?.close();
      taskModal?.hideHistory();
      const info = $("[data-feature=task-details]");
      (info?.getClientRects().length ? info : el)?.focus({ preventScroll: true });
    }
    if (action === "task-comments" && currentTask) {
      taskModal?.hideHistory();
      taskComments?.open(currentTask);
      $("[data-feature=task-comments]")?.setAttribute("aria-expanded", "true");
    }
    if (action === "task-duplicate" && currentTask) {
      const {
        id,
        key,
        aliases,
        revision,
        canvas_source,
        creation_request,
        ...copyData
      } = currentTask;
      const copy = await api(route("tasks"), {
        method: "POST",
        body: {
          ...copyData,
          title: `${currentTask.title} (copy)`,
          comments: [],
          archived: false,
        },
      });
      closeDialog(true);
      await refresh();
      taskDialog(copy.id);
    }
    if (action === "task-history" && currentTask) {
      taskComments?.close();
      await taskModal?.history();
    }
    if (action === "project-history") {
      closeDialog();
      if (!state.dialog) await recovery.history(state.project);
    }
    if (action === "canvas-history") await recovery.history(board());
    if (action === "task-archive" && currentTask) {
      await patchTask(
        currentTask.id,
        { archived: !currentTask.archived },
        false,
      );
      closeDialog(true);
      renderApp();
    }
    if (action === "project-archive") {
      await saveProject({ archived: !state.project.archived });
      closeDialog(true);
      await refresh();
    }
    if (
      action === "project-delete" &&
      (await confirmAction({ anchor: el, title: "Move this project to Trash?", message: `${state.project.title} and all its cards and boards move to Trash. Recover it from Settings → Recovery & backups.`, confirmLabel: "Move to Trash", danger: true }))
    ) {
      await api(route(), {
        method: "DELETE",
        body: { revision: state.project.revision },
      });
      closeDialog(true);
      clearProject();
      await refresh();
    }
    if (
      action === "canvas-delete" &&
      board() &&
      (await confirmAction({ anchor: el, title: "Delete this board?", message: `${board().title} moves to Trash.`, confirmLabel: "Delete board", danger: true }))
    ) {
      await api(route("boards", board().id), {
        method: "DELETE",
        body: { revision: board().revision },
      });
      await refresh();
    }
    if (action === "templates") templates();
    if (action === "template-use") {
      const template = state.project.templates[Number(el.dataset.index)];
      closeDialog(true);
      taskDialog(null, template.task);
      const form = $("#task-form");
      for (const [key, value] of Object.entries(template.task.fields || {})) {
        const input = $(`[name="custom:${key}"]`, form);
        if (input) input.value = String(value);
      }
    }
    if (action === "template-delete") {
      await saveProject({
        templates: state.project.templates.filter(
          (_, i) => i !== Number(el.dataset.index),
        ),
      });
      templates();
    }
    if (action === "import") {
      settings.open("import");
      return;
    }
    if (action === "accounts") await accounts();
    if (action === "account-edit") {
      const account = state.accounts.find(
          (u) => u.username === el.dataset.account,
        ),
        form = $("#account-form");
      form.elements.username.value = account.username;
      form.elements.admin.checked = account.admin;
      for (const o of state.organisations)
        form.elements[`org:${o.id}`].value = account.organisations[o.id] || "";
    }
    if (action === "logout") {
      await api("/session", { method: "DELETE", body: {} });
      events?.close();
      location.reload();
    }
  }
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-feature]");
    if (el) click(el.dataset.feature, el).catch((e) => toast(e.message, true));
    const note = event.target.closest('[data-action="note-open"]');
    if (note) click("note-open", note).catch((e) => toast(e.message, true));
  });
  // Searches start once typing pauses; searchSequence drops answers that arrive late.
  let searchTimer;
  document.addEventListener("input", (event) => {
    if (event.target.id !== "global-search-input") return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchResults(event.target.value), 150);
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (
      [
        "filter-assignee",
        "filter-tag",
        "filter-due",
        "filter-blocked",
        "filter-archived",
      ].includes(el.id)
    ) {
      state.extraFilters ||= {};
      state.extraFilters[el.id.slice(7)] =
        el.type === "checkbox" ? el.checked : el.value;
      state.page = 0;
      renderView(true);
    }
    if (el.id === "kanban-show-ids") {
      storage.set(`kanban-show-ids:${state.project.id}`, el.checked);
      renderView(true);
      $("#kanban-show-ids")?.focus({ preventScroll: true });
    }
    if (el.id === "kanban-group") {
      state.kanbanGroupBy = kanbanGroup(el.value);
      storage.set(`kanban-group:${state.project.id}`, state.kanbanGroupBy);
      renderView(true);
      $("#kanban-group")?.focus({ preventScroll: true });
    }
    if (el.id === "group-by") {
      state.groupBy = el.value;
      storage.set(`group-by:${state.project.id}`, state.groupBy);
      renderView(true);
    }
    if (el.id === "show-archived-projects") {
      state.showArchived = el.checked;
      if (state.dialog === "personal") state.dirty = false;
      renderApp();
    }
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.hasAttribute("data-settings-form")) return;
    if (
      ![
        "quick-capture",
        "account-form",
        "login-form",
      ].includes(form.id)
    )
      return;
    event.preventDefault();
    const submit = $('[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      const data = new FormData(form);
      if (form.id === "login-form") {
        await api("/session", {
          method: "POST",
          body: Object.fromEntries(data),
        });
        location.reload();
      }
      if (form.id === "quick-capture") {
        await api(route("tasks"), {
          method: "POST",
          body: { title: data.get("title") },
        });
        await refresh();
        form.reset();
        $("#quick-capture input")?.focus();
      }
      if (form.id === "account-form") {
        const organisations = {};
        for (const o of state.organisations) {
          const role = data.get(`org:${o.id}`);
          if (role) organisations[o.id] = role;
        }
        await api("/accounts", {
          method: "POST",
          body: {
            username: data.get("username"),
            password: data.get("password"),
            admin: data.has("admin"),
            organisations,
          },
        });
        toast(
          "Account saved. Password or access changes end its existing sessions.",
        );
        closeDialog(true);
      }
    } catch (error) {
      const output = $(".form-error", form) || $("#login-error");
      if (output) {
        output.textContent = error.message;
        output.classList.remove("hidden");
      } else toast(error.message, true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  return {
    bottomBar,
    viewReady: () => state.view === "documents" ? documentFeature.ready()
      : ["board", "drawing"].includes(state.view) ? canvasFeature.ready() && drawingFeature.ready() : true,
    prepareView: () => state.view === "documents" ? documentFeature.load()
      : Promise.all([canvasFeature.load(), drawingFeature.load()]),
    documentsRender: documents.render,
    documentsReset: documents.reset,
    documentsSyncChanged: documents.syncChanged,
    settingsRender: settings.render,
    settingsOpen: settings.open,
    settingsCanLeave: settings.canLeave,
    afterRender,
    drawingReady: drawings.ready,
    drawingReset: drawings.reset,
    drawingGallery: drawings.gallery,
    drawingEnter: drawings.enter,
    drawingSettled: drawings.settled,
    drawingRender: drawings.render,
    boardSidebar: drawings.sidebar,
    boardFolder: drawings.folder,
    drawingCheckpoint: drawings.checkpoint,
    viewToolbar,
    adaptToolbar: layout.compactToolbar,
    documentStar: layout.documentStar,
    pagination,
    filter,
    progress,
    dialogOpened,
    flushTask: () => autosave?.flush() || Promise.resolve(true),
    commitRelationships: (id) => relationships?.commit(id) || Promise.resolve(),
    createDocument: async (title) => {
      await documentFeature.load();
      return documents.create(title);
    },
    openDocument: async (id) => {
      await documentFeature.load();
      return documents.openDocument(id);
    },
    today: async () => {
      await documentFeature.load();
      return documents.today();
    },
    documentTemplate: async (anchor) => {
      await documentFeature.load();
      return documents.templatePanel(anchor);
    },
    taskSyncChanged: () => {
      autosave?.syncChanged();
      relationships?.refresh();
    },
    dialogClosed: () => {
      relationships?.destroy();
      relationships = null;
      documentsEditor?.destroy();
      documentsEditor = null;
      autosave?.destroy();
      autosave = null;
      taskComments?.destroy();
      taskComments = null;
      taskModal?.destroy();
      taskModal = null;
      attachments?.destroy();
      attachments = null;
      taskEditor?.destroy();
      taskEditor = null;
    },
    clearDraft,
    taskData,
    formBase: (form) => formBases.get(form),
    session,
    start,
    table: sheet.render,
    tablePreferences: sheet.preferences,
    tablePersist: sheet.persist,
    cellValue: sheet.value,
    cellPatch: sheet.patch,
    overview: () => plan.overview(progress()),
    calendar: plan.calendar,
    timeline: plan.timeline,
    timelineRender: plan.timelineRender,
    capacity: plan.capacity,
    canvasRender: canvas.render,
    canvasEdit: canvas.edit,
    canvasSaved: canvas.saved,
    canvasBeforeRender: canvas.beforeRender,
    canvasSelection: canvas.selection,
    canvasNodes: canvas.visible,
    canvasEdges: canvas.edges,
    canvasCamera: canvas.camera,
    groupedList(tasks, fallback, row) {
      const key = state.groupBy || "status";
      if (key === "status") return fallback(tasks);
      const groups = new Map();
      for (const t of tasks) {
        const name = key === "none" ? "All tasks" : t[key] || "Unassigned";
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(t);
      }
      return [...groups]
        .map(
          ([name, items]) =>
            `<section class="list-group"><h2 class="section-title">${esc(key === "priority" ? priorityLabel(name) : label(name))}<span class="count">${items.length}</span></h2>${items.map((t) => row(t)).join("")}</section>`,
        )
        .join("");
    },
  };
}
