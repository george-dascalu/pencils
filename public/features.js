import {projectAutomations} from "./project-automations.js";
import {drawingView} from "./drawing-view.js";
import {projectSources} from "./project-sources.js";
import { recurrenceControls } from "./recurrence-controls.js";
import { showSchedulePreview } from "./schedule-preview.js";
import { localDate } from "./task-visibility.js";
import { taskDependencies } from "./task-dependencies.js";
import { draftAutosave } from "./draft-autosave.js";
import { taskAutosave } from "./task-autosave.js";
import { boardComments } from "./board-comments.js";
import { workflowEditor } from "./workflow-editor.js";
import { organisationTeams, projectTeamControls } from "./teams.js";
import { taskModalControls } from "./task-modal.js";
import { taskDescription } from "./task-description.js";
import { projectLayout } from "./project-layout.js";
import { personalSettings } from "./personal-settings.js";
import { planning } from "./planning.js";
import { grid } from "./grid.js";
import { recoveryUI } from "./recovery-ui.js";
import { canvasFeatures } from "./canvas.js";

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
  projectAutomations(ctx);
  const sources = projectSources(ctx), drawings=drawingView(ctx);
  const plan = planning(ctx),
    sheet = grid(ctx),
    recovery = recoveryUI(ctx),
    layout = projectLayout(ctx),
    canvas = canvasFeatures({ ...ctx, layout }),
    personal = personalSettings(ctx);
  const formBases = new WeakMap();
  let reloadWorkflow = null,
    reloadTeams = null,
    taskModal = null,
    taskEditor = null,
    autosave = null,
    taskComments = null,
    dependencyEditor = null,
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
        types: ["epic", "milestone", "story", "task", "bug"],
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
  const personalViewKey = () =>
    `views:${state.session?.user?.username || "shared"}:${state.project.id}`;
  const personalViews = () => storage.get(personalViewKey(), []);
  const savedViews = () => [...personalViews(), ...(state.project.views || [])];
  function viewDefinition() {
    return {
      view: state.view,
      search: state.search || "",
      status: state.status || "all",
      type: state.type || "all",
      sort: state.sort || "created",
      sortDir: state.sortDir || 1,
      filters: state.extraFilters || {},
      groupBy: state.groupBy || "status",
      columns: state.tableColumns || null,
      ...(state.view === "table"
        ? { table: structuredClone(sheet.preferences()) }
        : {}),
    };
  }
  function viewChanged(view) {
    if (!view) return false;
    const current = viewDefinition();
    return Object.keys(current).some(
      (key) =>
        JSON.stringify(view[key] ?? current[key]) !==
        JSON.stringify(current[key]),
    );
  }
  function viewToolbar() {
    $("#feature-toolbar")?.remove();
    $(".advanced-filters")?.remove();
    const host = $("#view-toolbar");
    if (!host) return;
    const f = state.extraFilters || {};
    host.insertAdjacentHTML(
      "afterbegin",
      `<div class="feature-toolbar" id="feature-toolbar"><select id="saved-view" aria-label="Saved project views"><option value="">Unsaved view</option>${[
        ["Personal · this browser", personalViews()],
        ["Project · shared", state.project.views || []],
      ]
        .map(
          ([name, views]) =>
            `<optgroup label="${name}">${views.map((v) => `<option value="${esc(v.id)}" ${v.id === state.savedView ? "selected" : ""}>${esc(v.name)}${v.id === state.savedView && viewChanged(v) ? " · Unsaved changes" : ""}</option>`).join("")}</optgroup>`,
        )
        .join(
          "",
        )}</select>${button("view-save", "Save view")}${state.savedView ? button("view-save-as", "Save as…") : ""}${state.savedView ? button("view-delete", "Delete view") : ""}${button("workflow", "Workflow & fields")}${button("import", "Import notes")}${button("templates", "Templates")}<span class="spacer"></span><form id="quick-capture"><input name="title" aria-label="Quick capture task" placeholder="Quick capture…" required maxlength="300"><button class="button small" type="submit">Add</button></form></div>${["board", "drawing", "overview"].includes(state.view) ? "" : `<div class="advanced-filters"><input id="filter-assignee" aria-label="Filter assignee" placeholder="Assignee" value="${esc(f.assignee || "")}"><input id="filter-tag" aria-label="Filter tag" placeholder="Tag" value="${esc(f.tag || "")}"><select id="filter-due" aria-label="Filter deadline">${options(["", "overdue", "week", "none"], f.due || "", { "": "Any deadline", overdue: "Overdue", week: "Next 7 days", none: "No deadline" })}</select><select id="group-by" aria-label="Group tasks">${options(["status", "type", "assignee", "priority", "none"], state.groupBy || "status", { status: "Group: status", type: "Group: type", assignee: "Group: assignee", priority: "Group: priority", none: "No grouping" })}</select><label>Completion<select id="filter-completion">${options(["", "open", "done"], f.completion || "", { "": "Any completion", open: "Open", done: "Completed" })}</select></label><label><input type="checkbox" id="filter-blocked" ${f.blocked ? "checked" : ""}> Blocked</label><label><input type="checkbox" id="filter-archived" ${f.archived ? "checked" : ""}> Include archived</label></div>`}`,
    );
    if (state.view === "table") {
      $("#group-by")?.remove();
      $(".toolbar-right")?.setAttribute("hidden", "");
    } else $(".toolbar-right")?.removeAttribute("hidden");
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
      `<div id="pagination" class="pagination">${button("page-prev", "← Previous", state.page ? "" : "disabled")}<span>Page ${(state.page || 0) + 1} of ${Math.ceil(total / 100)} · ${total} ${state.view === "tree" ? "root groups" : "tasks"}</span>${button("page-next", "Next →", (state.page || 0) + 1 >= Math.ceil(total / 100) ? "disabled" : "")}</div>`,
    );
  }
  document.addEventListener("click", (event) => {
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
    const sidebar = $(".sidebar-directory") || $(".side-new");
    if (sidebar)
      sidebar.insertAdjacentHTML(
        "afterend",
        `<div class="workspace-tools">${button("dashboard", "Organisation overview")}${button("global-search", "Search all projects ⌘/Ctrl K")}${button("recovery", "Recovery & backups")}${state.session?.required && state.session.user?.admin ? button("accounts", "Accounts & access") : ""}${state.session?.required ? button("logout", "Sign out") : ""}<label><input type="checkbox" id="show-archived-projects" ${state.showArchived ? "checked" : ""}> Archived projects</label></div>`,
      );
    if (!state.project && !state.directoryPage)
      plan.dashboard().catch((e) => toast(e.message, true));
    const metric = $(".stats-strip");
    if (metric)
      metric.title =
        "Progress counts leaf tasks only, weighted by estimate when provided (otherwise 1). Parent tasks are not counted twice.";
    if (state.session?.required && state.session.user) {
      const avatar = $(".avatar");
      if (avatar) {
        avatar.textContent = state.session.user.username
          .slice(0, 2)
          .toUpperCase();
        avatar.title = state.session.user.username;
      }
    }
    if (state.project?.archived)
      $(".hero")?.insertAdjacentHTML(
        "afterend",
        '<div class="connection-banner">This project is archived. Restore it in Project settings to include it in active planning.</div>',
      );
    ctx.updateEdges();
  }
  function taskExtras(t) {
    const fields = config()
      .fields.map((f) => {
        const name = `custom:${f.id}`,
          value = t.fields?.[f.id];
        if (f.type === "select")
          return `<label class="field">${esc(f.name)}<select name="${esc(name)}"><option value="">None</option>${options(f.options, value)}</select></label>`;
        if (f.type === "checkbox")
          return `<label class="field">${esc(f.name)}<select name="${esc(name)}">${options(["false", "true"], String(value || false))}</select></label>`;
        return field(
          name,
          f.name,
          value || "",
          f.type === "number" ? "number" : f.type === "date" ? "date" : "text",
        );
      })
      .join("");
    return `<details class="task-extra"><summary>Planning</summary><div class="field-row">${field("estimate", "Estimate (hours)", t.estimate, "number", 'min="0" step="any"')}</div><div class="field-row"><label class="field">Repeat after completion<select name="recurrence-unit">${options(["", "day", "week", "month"], t.recurrence?.unit || "", { "": "Does not repeat", day: "Days", week: "Weeks", month: "Months" })}</select></label>${field("recurrence-interval", "Every", t.recurrence?.interval || 1, "number", 'min="1" max="365"')}</div>${fields ? `<h3>Custom fields</h3><div class="custom-fields">${fields}</div>` : ""}</details>${t.id ? `<div class="task-actions">${button("task-template", "Save as template")}${button("attach", "Attach file")}</div>` : ""}`;
  }
  function taskData(form) {
    const data = new FormData(form),
      id = form.dataset.id,
      t = task(id) || {},
      fields = { ...(t.fields || {}) };
    for (const f of config().fields) {
      if (!data.has(`custom:${f.id}`)) continue;
      const raw = data.get(`custom:${f.id}`);
      fields[f.id] =
        f.type === "number"
          ? raw === ""
            ? null
            : Number(raw)
          : f.type === "checkbox"
            ? raw === "true"
            : raw || null;
    }
    const comment = String(data.get("new-comment") || "").trim();
    return {
      start: data.get("start") || null,
      estimate:
        !data.has("estimate") || data.get("estimate") === ""
          ? null
          : Number(data.get("estimate")),
      dependencies: data.getAll("dependencies"),
      related_records: data.getAll("related_records"),
      recurrence: data.get("recurrence-unit")
        ? {
            unit: data.get("recurrence-unit"),
            interval: Number(data.get("recurrence-interval")),
          }
        : null,
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
    return `draft:${state.session?.user?.username || "shared"}:${state.project?.id || state.organisation?.id || "workspace"}:${form.id}:${form.dataset.draftNode ? `board:${form.dataset.board}:draft:${form.dataset.draftNode}` : form.dataset.id || form.dataset.edit || "new"}${form.dataset.directoryPage ? `:${form.dataset.directoryPage}` : ""}`;
  }
  function dialogOpened(kind, pageForm) {
    autosave?.destroy();
    autosave = null;
    taskComments?.destroy();
    taskComments = null;
    taskModal?.destroy();
    taskModal = null;
    taskEditor?.destroy();
    taskEditor = null;
    dependencyEditor = null;
    const form = pageForm || $("dialog form");
    activeDraft = null;
    reloadWorkflow = null;
    reloadTeams =
      kind === "organisation" && form
        ? organisationTeams(
            form,
            form.dataset.id ? state.organisation : null,
            esc,
            form.dataset.directoryPage || "all",
          )
        : kind === "project" && form
          ? projectTeamControls(form, state, esc)
          : null;
    if (kind === "organisation" && form?.dataset.id)
      formBases.set(form, structuredClone(state.organisation));
    if (kind === "task" && form) {
      const t = task(form.dataset.id) || state.dialogTask || {};
      formBases.set(form, structuredClone(t));
      if (t.id)
        $(".dialog-body", form).insertAdjacentHTML("beforeend", taskExtras(t));
      sources.decorateTask(form,t);
      const linkedDrawings=state.boards.filter(b=>b.settings?.linked_tasks?.includes(t.id));
      if(linkedDrawings.length)form.querySelector('.dialog-body').insertAdjacentHTML('beforeend',`<section><h3>Canvases</h3>${linkedDrawings.map(b=>`<a class="button small" href="#project/${state.project.id}/board/${b.id}" target="_blank">${esc(b.title)} ↗</a>`).join('')}</section>`);
      recurrenceControls(form, t, state.tasks, esc);
      dependencyEditor = taskDependencies(ctx, form, t);
      taskEditor = taskDescription(form, ctx.markdown, ctx.icon);
      taskModal = taskModalControls(ctx, form, async (version) => {
        if (
          !confirm(
            "Restore this version? Your current edits will be saved in history first.",
          )
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
          if (!form.elements.subtaskTitle.value.trim())
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
        (prefix) => `${prefix}-${crypto.randomUUID?.() || Date.now()}`,
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
    if (kind === "project" && form) {
      const c =
        form.dataset.edit === "true"
          ? config()
          : {
              statuses: ["backlog", "todo", "in-progress", "review", "done"],
              done: ["done"],
              types: ["epic", "milestone", "story", "task", "bug"],
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
    return true;
  }
  function start(fn) {
    boot = fn;
    for (const event of ["pointerdown", "keydown"])
      document.addEventListener(event, () => refreshInteraction++, true);
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
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
      state.dialog ||
      state.boardTaskEditor ||
      state.canvasEditing ||
      canvas.busy() ||
      state.headerMenu ||
      state.selectionToolbarOpen ||
      state.kanbanDragging ||
      state.toolDragging ||
      sync.entries.size ||
      document.activeElement?.matches(
        "input,textarea,select,[contenteditable=true]",
      ) ||
      document.querySelector(
        "#shared-select-menu,button:active,summary:active,.board-node:active,[data-edge]:active",
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
        });
      } catch {
      } finally {
        refreshing = false;
      }
    }, 700);
  }
  async function searchDialog() {
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Search and commands")}<div class="dialog-body"><label class="field">Search<input id="global-search-input" type="search" placeholder="Tasks, views or commands…" autofocus></label><div id="command-results"></div><div id="global-search-results"></div></div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button></div></dialog>`,
      "search",
    );
    searchResults("");
  }
  function commands() {
    return [
      ...(state.project
        ? [
            { id: "new-task", title: "New task", run: () => taskDialog(null) },
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
        title: "Personal settings",
        run: () =>
          document.querySelector('[data-personal="settings"]')?.click(),
      },
    ];
  }
  let searchSequence=0;
  async function searchResults(query) {
    const matches = commands().filter((command) =>
      query
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .every((word) => command.title.toLowerCase().includes(word)),
    );
    $("#command-results").innerHTML =
      `<p class="field-hint">Commands</p>${matches.map((command) => `<button class="search-result command-result" data-feature="command-run" data-command="${esc(command.id)}">${esc(command.title)}</button>`).join("") || "<p>No matching commands.</p>"}<p class="field-hint">Tasks</p>`;
    const sequence=++searchSequence;
    let results;try{results=(await api(`/search?q=${encodeURIComponent(query)}`)).tasks;}catch(error){if(sequence===searchSequence && $("#global-search-results"))$("#global-search-results").textContent=error.message;return;}
    if(sequence!==searchSequence || !$("#global-search-results"))return;
    $("#global-search-results").innerHTML =
      results
        .map(
          (t) =>
            `<button class="search-result" data-feature="global-open" data-id="${t.id}" data-project="${t.project}"><strong>${esc(t.key || "")} ${esc(t.title)}</strong><span>${esc(state.organisations.find((o) => o.id === t.organisation)?.title)} / ${esc(t.project_title)} · ${esc(t.status)}${t.archived ? " · Archived" : ""}</span></button>`,
        )
        .join("") || "<p>No matching tasks.</p>";
  }
  document.addEventListener("keydown", (event) => {
    if (
      state.dialog !== "search" ||
      !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    )
      return;
    const results = [
      ...document.querySelectorAll(
        "#command-results button, #global-search-results button",
      ),
    ];
    if (!results.length) return;
    const index = results.indexOf(document.activeElement);
    if (event.key === "Enter" && event.target.id === "global-search-input") {
      event.preventDefault();
      results[0].click();
    } else if (event.key !== "Enter") {
      event.preventDefault();
      results[
        (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) %
          results.length
      ].focus();
    }
  });
  function workflow() {
    const c = config();
    showDialog(
      `<dialog class="dialog wide-dialog"><form id="workflow-form">${dialogHead("Workflow & custom fields")}<div class="dialog-body"><p>These settings belong only to ${esc(state.project.title)}. Task types use short names separated by commas.</p>${field("types", "Task types", c.types.join(", "), "text", "required")}<h3>Custom fields</h3><div id="custom-field-list">${c.fields.map(customFieldRow).join("")}</div>${button("field-add", "Add field")}<div class="form-error" role="alert"></div></div><div class="dialog-foot"><button type="submit" class="button primary">Save workflow</button></div></form></dialog>`,
      "workflow",
    );
    workflowEditor($("#workflow-form"), c, state.tasks, ctx);
  }
  function customFieldRow(
    f = { id: `field_${Date.now()}`, name: "", type: "text", options: [] },
  ) {
    return `<div class="custom-field-row" data-field-id="${esc(f.id)}"><input class="field-name" placeholder="Field name" aria-label="Field name" value="${esc(f.name)}" required maxlength="100"><select class="field-type" aria-label="Field type">${options(["text", "number", "date", "select", "checkbox"], f.type)}</select><input class="field-options" aria-label="Select options" placeholder="Options separated by commas" value="${esc((f.options || []).join(", "))}">${button("field-remove", "Remove")}</div>`;
  }
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
    if (action === "global-search") await searchDialog();
    if (action === "global-open" || action === "note-open") {
      closeDialog();
      if (state.dialog) return;
      if (state.project?.id !== el.dataset.project)
        await openProject(el.dataset.project);
      taskDialog(el.dataset.id);
    }
    if (action === "view-save" || action === "view-save-as") {
      const current = savedViews().find((v) => v.id === state.savedView);
      state.savingViewAs = action === "view-save-as";
      showDialog(
        `<dialog class="dialog"><form id="view-form">${dialogHead("Save this view")}<div class="dialog-body">${field("name", "View name", current?.name || "", "text", 'required maxlength="100"')}<label class="field">Who can use this view<select name="scope"><option value="personal" ${current?.scope === "personal" || !current ? "selected" : ""}>Personal · this browser</option><option value="project" ${current && current.scope !== "personal" ? "selected" : ""}>Project · shared with project members</option></select></label><p>Includes filters, grouping, sorting and columns. Personal views stay in this browser.</p></div><div class="dialog-foot"><button class="button primary" type="submit">Save view</button></div></form></dialog>`,
        "view",
      );
    }
    if (action === "view-delete" && confirm("Delete this saved view?")) {
      if (personalViews().some((v) => v.id === state.savedView))
        storage.set(
          personalViewKey(),
          personalViews().filter((v) => v.id !== state.savedView),
        );
      else
        await saveProject({
          views: (state.project.views || []).filter(
            (v) => v.id !== state.savedView,
          ),
        });
      state.savedView = null;
      renderView();
    }
    if (action === "workflow") workflow();
    if (action === "field-add")
      $("#custom-field-list").insertAdjacentHTML("beforeend", customFieldRow());
    if (action === "field-remove") el.closest(".custom-field-row").remove();
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
        dependencyEditor?.refresh();
        reloadTeams?.();
        reloadWorkflow?.();
        if (
          (form.id === "project-form" && state.view === "settings") ||
          form.dataset.directoryPage
        )
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
    if (
      [
        "task-duplicate",
        "task-archive",
        "task-history",
        "task-template",
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
    if (action === "task-template" && currentTask) {
      const name = prompt("Template name", currentTask.title);
      if (name) {
        await saveProject({
          templates: [
            ...(state.project.templates || []),
            {
              name,
              task: {
                title: currentTask.title,
                body: currentTask.body,
                type: currentTask.type,
                status: currentTask.status,
                priority: currentTask.priority,
                tags: currentTask.tags,
                fields: currentTask.fields,
                estimate: currentTask.estimate,
                recurrence: currentTask.recurrence,
              },
            },
          ],
        });
        toast("Template saved.");
      }
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
      confirm(
        `Move ${state.project.title} and all its tasks and canvases to Trash?`,
      )
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
      confirm(`Move ${board().title} to Trash?`)
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
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md";
      input.multiple = true;
      input.onchange = async () => {
        try {
          const files = [...input.files];
          if (files.length > 200)
            throw new Error("Import up to 200 notes at a time.");
          const notes = await Promise.all(
            files.map(async (f) => ({ name: f.name, content: await f.text() })),
          );
          const result = await api(route("import"), {
            method: "POST",
            body: { notes },
          });
          await refresh();
          toast(`Imported ${result.tasks.length} notes.`);
        } catch (e) {
          toast(e.message, true);
        }
      };
      input.click();
    }
    if (action === "attach") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.zip";
      input.onchange = async () => {
        try {
          const file = input.files[0];
          if (!file) return;
          if (file.size > 10000000) throw new Error("Use a file under 10 MB.");
          const bytes = new Uint8Array(await file.arrayBuffer());
          let raw = "";
          for (let i = 0; i < bytes.length; i += 8192)
            raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const attachment = await api(route("attachments"), {
              method: "POST",
              body: { name: file.name, data: btoa(raw) },
            }),
            body = $('#task-form [name="body"]');
          if (body) {
            body.value += `\n${file.type.startsWith("image/") ? "!" : ""}[${file.name.replace(/[\[\]]/g, "")}](../${attachment.path})\n`;
            body.dispatchEvent(new Event("input", { bubbles: true }));
            taskEditor?.reload();
            taskModal?.reload();
            reloadTeams?.();
            reloadWorkflow?.();
            toast("Attachment added. Save the task to retain the link.");
          }
        } catch (e) {
          toast(e.message, true);
        }
      };
      input.click();
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
  document.addEventListener("input", (event) => {
    if (event.target.id === "global-search-input")
      searchResults(event.target.value);
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
    if (el.id === "group-by") {
      state.groupBy = el.value;
      renderView(true);
    }
    if (el.id === "show-archived-projects") {
      state.showArchived = el.checked;
      renderApp();
    }
    if (el.id === "saved-view") {
      const view = savedViews().find((v) => v.id === el.value);
      state.savedView = view?.id || null;
      if (view) {
        state.boardGallery = false;
        drawings.reset();
        Object.assign(state, {
          view: view.view === "drawing" ? "board" : view.view,
          search: view.search || "",
          status: view.status || "all",
          type: view.type || "all",
          sort: view.sort || "created",
          sortDir: view.sortDir || 1,
          extraFilters: structuredClone(view.filters || {}),
          tableColumns: structuredClone(view.columns || null),
          groupBy: view.groupBy || "status",
          ...(view.view === "table"
            ? {
                tablePreferences: structuredClone(
                  view.table || { groups: [], sorts: [], filters: [] },
                ),
                tableCollapsed: new Set(),
              }
            : {}),
          page: 0,
        });
      }
      if (view?.view === "table") sheet.persist();
      renderApp();
    }
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (
      ![
        "quick-capture",
        "workflow-form",
        "view-form",
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
        $("#quick-capture input")?.focus();
      }
      if (form.id === "workflow-form") {
        const list = (key) =>
          String(data.get(key))
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        const fields = $$(".custom-field-row", form).map((row) => ({
          id: row.dataset.fieldId,
          name: $(".field-name", row).value,
          type: $(".field-type", row).value,
          options: $(".field-options", row)
            .value.split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        }));
        await saveProject({
          schema: {
            ...JSON.parse(data.get("workflowSchema")),
            types: list("types"),

            fields,
          },
        });
        closeDialog(true);
        await refresh();
      }
      if (form.id === "view-form") {
        const scope = data.get("scope");
        const current = savedViews().find((v) => v.id === state.savedView);
        const sameScope = (current?.scope || "project") === scope;
        const id =
          !state.savingViewAs && sameScope && current
            ? current.id
            : `${scope === "personal" ? "pv" : "v"}-${crypto.randomUUID()}`;
        const view = {
          ...viewDefinition(),
          id,
          name: String(data.get("name")).trim(),
          scope,
        };
        if (!view.name) throw new Error("Enter a view name.");
        if (scope === "personal")
          storage.set(personalViewKey(), [
            ...personalViews().filter((v) => v.id !== id),
            view,
          ]);
        else
          await saveProject({
            views: [
              ...(state.project.views || []).filter((v) => v.id !== id),
              view,
            ],
          });
        state.savedView = id;
        closeDialog(true);
        renderView();
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
    afterRender,
    drawingReady: drawings.ready,
    drawingReset: drawings.reset,
    drawingGallery: drawings.gallery,
    drawingEnter: drawings.enter,
    drawingRender: drawings.render,
    drawingCheckpoint: drawings.checkpoint,
    viewToolbar,
    pagination,
    filter,
    progress,
    dialogOpened,
    flushTask: () => autosave?.flush() || Promise.resolve(true),
    taskSyncChanged: () => autosave?.syncChanged(),
    dialogClosed: () => {
      autosave?.destroy();
      autosave = null;
      taskComments?.destroy();
      taskComments = null;
      taskModal?.destroy();
      taskModal = null;
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
            `<section class="list-group"><h2 class="section-title">${esc(label(name))}<span class="count">${items.length}</span></h2>${items.map((t) => row(t)).join("")}</section>`,
        )
        .join("");
    },
  };
}
