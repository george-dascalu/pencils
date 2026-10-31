import { positionPopover } from "./popover-position.js";
import { readableText } from "./node-layout.js";

// Opened from Boards (0.20.73); focus and position fall back to its menu, then Board appearance.
const home = () =>
  document.querySelector('.board-toolbar [data-board-menu="board"] > summary') ||
  document.querySelector('[data-feature="board-settings"]');

// A one-time import. Tokens and source snapshots never enter local storage.
export function miroImport(ctx) {
  const { state, api, esc, icon, board, toast } = ctx;
  let panel,
    opener,
    project,
    destination,
    setup,
    preview,
    result,
    busy = false,
    poll,
    authWindow,
    frame;
  const endpoint = (action = "") =>
    `/projects/${project}/miro${action ? `/${action}` : ""}`;
  const post = (action, body = {}) =>
    api(endpoint(action), { method: "POST", body });
  const options = (values, selected) =>
    values
      .map(
        (v) =>
          `<option value="${esc(v.id)}" ${v.id === selected ? "selected" : ""}>${esc(v.name || ctx.label(v.id))}</option>`,
      )
      .join("");
  const button = (action, text, extra = "") =>
    `<button type="button" class="button ${extra}" data-miro="${action}">${text}</button>`;
  function close(focus = true) {
    if (!panel) return;
    clearInterval(poll);
    poll = null;
    cancelAnimationFrame(frame);
    const old = panel;
    panel = null;
    if (old.matches(":popover-open")) old.hidePopover();
    old.remove();
    if (state.dialog === "miro-import") state.dialog = null;
    if (focus)
      (opener?.isConnected
        ? opener
        : home()
      )?.focus({ preventScroll: true });
  }
  function position() {
    if (!panel) return;
    if (
      state.project?.id !== project ||
      !["board", "drawing"].includes(state.view)
    )
      return close(false);
    const r = opener?.isConnected
      ? opener.getBoundingClientRect()
      : home()?.getBoundingClientRect();
    positionPopover(panel, r || { left: 12, top: 12, bottom: 12 }, {
      width: 700,
      maxHeight: innerHeight - 24,
      gap: 8,
    });
  }
  function track() {
    position();
    if (panel) frame = requestAnimationFrame(track);
  }
  function error(message) {
    if (!panel) return;
    panel.querySelector("[data-miro-error]").textContent = message;
    panel.querySelector("[data-miro-error]").hidden = !message;
    position();
  }
  async function work(label, fn) {
    if (busy || !panel) return;
    busy = true;
    const current = panel,
      progress = current.querySelector("[data-miro-progress]");
    error("");
    progress.textContent = label;
    const controls = [
      ...current.querySelectorAll("button,input,select"),
    ].filter((el) => el.dataset.miro !== "close");
    const before = controls.map((el) => el.disabled);
    controls.forEach((el) => (el.disabled = true));
    try {
      await fn(current);
    } catch (e) {
      if (panel === current) error(e.message);
    } finally {
      if (panel === current) busy = false;
      controls.forEach((el, i) => (el.disabled = before[i]));
      if (panel === current) {
        progress.textContent = "";
        position();
      }
    }
  }
  function layoutPreview(data) {
    if (!data.nodes.length) return "<p>No new objects in this selection.</p>";
    const nodes = data.nodes.slice(0, 600),
      ids = new Map(nodes.map((n) => [n.id, n]));
    const x = Math.min(...nodes.map((n) => n.x)) - 20,
      y = Math.min(...nodes.map((n) => n.y)) - 20;
    const w = Math.max(...nodes.map((n) => n.x + n.w)) - x + 20,
      h = Math.max(...nodes.map((n) => n.y + n.h)) - y + 20;
    return `<svg class="miro-layout-preview" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="Approximate layout of the imported objects">${nodes
      .filter((n) => n.type === "frame")
      .map(
        (n) =>
          `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="none" stroke="#82937d" stroke-width="2"/>`,
      )
      .join("")}${data.edges
      .map((e) => {
        const a = ids.get(e.from),
          b = ids.get(e.to);
        return a && b
          ? `<line x1="${a.x + a.w / 2}" y1="${a.y + a.h / 2}" x2="${b.x + b.w / 2}" y2="${b.y + b.h / 2}" stroke="#82937d" stroke-width="2"/>`
          : "";
      })
      .join("")}${nodes
      .filter((n) => n.type !== "frame")
      .map(
        (n) =>
          `<g><title>${esc(n.text || n.type)}</title><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" fill="${esc(n.color || "#ffffff")}" stroke="#82937d"/><text x="${n.x + 8}" y="${n.y + Math.min(22, n.h / 2)}" font-size="12" fill="${readableText(n.color || "#ffffff")}">${esc((n.text || n.type).replace(/\s+/g, " ").slice(0, Math.max(4, Math.floor(n.w / 8))))}</text></g>`,
      )
      .join(
        "",
      )}</svg><small>Layout preview${data.nodes.length > 600 ? " · first 600 objects shown" : ""}. Text wrapping and line routing can differ.</small>`;
  }
  function reportHTML(data) {
    return `<div class="miro-import-counts" role="status">${data.counts.objects} objects · ${data.counts.connectors} connectors${data.counts.tasks ? ` · ${data.counts.tasks} project tasks` : ""}</div>${layoutPreview(data)}<p class="field-hint">${esc(data.limitations)}</p>${data.issues.length ? `<details class="miro-import-issues"><summary>${data.issues.length} conversion notes</summary><ul>${data.issues.map((i) => `<li>${i.title ? `<strong>${esc(i.title)}</strong> — ` : ""}${esc(i.message)}</li>`).join("")}</ul></details>` : ""}`;
  }
  function render() {
    if (!panel) return;
    const body = panel.querySelector(".dialog-body");
    if (result) {
      body.innerHTML = `<p role="status">Imported ${result.objects} objects and ${result.connectors} connectors${result.tasks ? `, with ${result.tasks} project tasks` : ""}.</p><p>The content is now editable in Pencils. The temporary Miro connection has been cleared.</p>${result.issues.length ? `<details><summary>Conversion report</summary><ul>${result.issues.map((i) => `<li>${esc(i.title || "")} ${esc(i.message)}</li>`).join("")}</ul></details>` : ""}${button("done", "Open imported canvas", "primary")}`;
    } else if (preview) {
      body.innerHTML = `<div class="miro-import-source"><strong>${esc(preview.title)}</strong>${button("back", "Choose another board")}</div><form id="miro-options"><div class="miro-import-fields"><label class="field">Destination<select name="destination"><option value="">New board</option>${destination ? `<option value="${esc(destination.id)}">Current canvas · ${esc(destination.title)}</option>` : ""}</select></label><label class="field">Canvas name<input name="title" value="${esc(preview.title)}" maxlength="300" required></label><label class="field">Cards<select name="cards"><option value="draft">Draft cards on the board</option><option value="tasks">Create project tasks</option></select></label><label class="field">Task type<select name="type">${options(
        preview.types.map((id) => ({ id })),
        preview.type,
      )}</select></label><label class="field">Task status<select name="status">${options(preview.statuses, preview.status)}</select></label><div class="field"><span>Priority</span><span class="miro-default-priority">${icon("priority-medium")}Medium</span></div></div>${preview.frames.length ? `<details><summary>Frames to import</summary><label class="miro-check"><input type="checkbox" name="allFrames" checked>Whole board</label><div class="miro-frame-list">${preview.frames.map((f) => `<label class="miro-check"><input type="checkbox" name="frame" value="${esc(f.id)}" checked disabled>${esc(f.title)}</label>`).join("")}</div></details>` : ""}${
        preview.assignees.length
          ? `<details><summary>Match assignees</summary><p class="field-hint">Matching names are selected automatically. Unmatched people stay unassigned.</p>${preview.assignees
              .map((a) => {
                const matches = preview.people.filter(
                  (p) =>
                    p.name.toLocaleLowerCase() === a.name.toLocaleLowerCase(),
                );
                return `<label class="field">${esc(a.name)}<select data-miro-assignee="${esc(a.id)}"><option value="">Unassigned</option>${options(preview.people, matches.length === 1 ? matches[0].id : "")}</select></label>`;
              })
              .join("")}</details>`
          : ""
      }<div class="miro-import-review" data-miro-review>${reportHTML(preview)}</div><div class="miro-import-actions">${button("review", "Update preview")}${button("import", "Import", "primary")}</div></form>`;
    } else if (setup?.connected) {
      body.innerHTML = `<div class="miro-import-source"><span>Connected to Miro</span>${button("disconnect", "Disconnect")}</div><form id="miro-source"><label class="field">Miro board link or ID<input name="board" placeholder="https://miro.com/app/board/…" required autocomplete="off"></label><div data-miro-boards>${button("boards", "Browse available boards")}</div><button class="button primary" type="submit">Load board</button></form>`;
    } else if (setup) {
      body.innerHTML = `<p>Copy a Miro board into editable Pencils objects. Review the conversion before importing.</p>${!setup.authenticated ? `<p>Use local automatic sign-in or sign in to an account before connecting Miro.</p>` : `${setup.oauth ? button("authorize", "Connect Miro", "primary") : `<p class="field-hint">Miro sign-in is not configured on this server. An administrator can set MIRO_CLIENT_ID, MIRO_CLIENT_SECRET and APP_ORIGIN, or you can use a temporary access token below.</p>`}<details><summary>Use an access token</summary><p class="field-hint">Use a token from a Miro app with boards:read permission. It stays in server memory for up to 30 minutes and is cleared after import or disconnect.</p><form id="miro-token"><label class="field">Miro access token<input name="token" type="password" autocomplete="off" required></label><button type="submit" class="button">Connect with token</button></form></details>`}`;
    }
    if (preview && !result)
      panel.querySelector('[data-miro="import"]').disabled =
        !preview.counts.objects && !preview.counts.connectors;
    position();
  }
  function readOptions() {
    const form = panel.querySelector("#miro-options"),
      data = new FormData(form);
    return {
      preview: preview.preview,
      title: data.get("title"),
      cards: data.get("cards"),
      type: data.get("type"),
      status: data.get("status"),
      destination: data.get("destination"),
      frames:
        !form.elements.allFrames || form.elements.allFrames.checked
          ? null
          : data.getAll("frame"),
      assignees: Object.fromEntries(
        [...form.querySelectorAll("[data-miro-assignee]")].map((s) => [
          s.dataset.miroAssignee,
          s.value,
        ]),
      ),
    };
  }
  async function act(action) {
    if (action === "close") {
      close();
      return;
    }
    if (action === "done") {
      if (board()?.id === result?.board) return close();
      if (result && (await ctx.openBoard(result.board))) {
        ctx.fitBoard();
        close();
      }
      return;
    }
    if (action === "authorize") {
      if (busy) return;
      authWindow = window.open(
        "about:blank",
        "pencils-miro",
        "width=720,height=780",
      );
      return work("Opening Miro sign-in…", async (current) => {
        const data = await post("authorize");
        if (!authWindow)
          throw new Error("Allow popups to connect Miro, then try again.");
        authWindow.location = data.url;
        clearInterval(poll);
        const started = Date.now();
        poll = setInterval(async () => {
          if (panel !== current || Date.now() - started > 600000) {
            clearInterval(poll);
            return;
          }
          try {
            const connection = await api(endpoint());
            if (panel !== current) return;
            setup = connection;
            if (setup.connected) {
              clearInterval(poll);
              authWindow?.close();
              render();
            }
          } catch {
            clearInterval(poll);
          }
        }, 1500);
      });
    }
    if (action === "back") {
      preview = null;
      render();
      return;
    }
    if (action === "disconnect")
      return work("Disconnecting…", async (current) => {
        await post("disconnect");
        if (panel === current) {
          setup.connected = false;
          preview = null;
          render();
        }
      });
    if (action === "boards")
      return work("Loading boards…", async (current) => {
        const data = await api(endpoint("boards"));
        if (panel !== current) return;
        current.querySelector("[data-miro-boards]").innerHTML =
          `<label class="field">Available boards<select data-miro-board><option value="">Choose a board…</option>${options(data.boards)}</select></label>${data.more ? '<p class="field-hint">Showing 50 boards. Paste a link to import another board.</p>' : ""}`;
      });
    if (action === "review") {
      const data = readOptions();
      if (!panel.querySelector("#miro-options").reportValidity()) return;
      return work("Updating preview…", async (current) => {
        const updated = await post("preview", data);
        if (panel !== current) return;
        preview = updated;
        current.querySelector("[data-miro-review]").innerHTML =
          reportHTML(updated);
        current.querySelector('[data-miro="import"]').disabled =
          !updated.counts.objects && !updated.counts.connectors;
        current.querySelector('[data-miro="import"]').dataset.reviewed = "true";
      }).then(() => {
        const importButton = panel?.querySelector('[data-miro="import"]');
        if (importButton?.dataset.reviewed === "true")
          importButton.disabled =
            !preview.counts.objects && !preview.counts.connectors;
      });
    }
    if (action === "import") {
      if (!preview || panel.querySelector('[data-miro="import"]').disabled)
        return;
      const input = { preview: preview.preview, version: preview.version },
        projectId = project;
      return work("Importing objects and files…", async (current) => {
        const imported = await post("import", input);
        if (state.project?.id === projectId) {
          await ctx.refresh(false);
          if (
            state.project?.id === projectId &&
            panel === current &&
            (await ctx.openBoard(imported.board))
          )
            ctx.fitBoard();
        }
        if (panel === current) {
          result = imported;
          render();
        } else toast(`Imported ${imported.objects} objects from Miro.`);
      });
    }
  }
  async function open(button) {
    close(false);
    if (!state.project || !board()) return;
    project = state.project.id;
    destination = { id: board().id, title: board().title };
    opener = button?.isConnected
      ? button
      : home();
    setup = null;
    preview = null;
    result = null;
    busy = false;
    panel = document.createElement("div");
    panel.className = "board-settings-popover miro-import";
    panel.id = "miro-import-panel";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Import from Miro");
    panel.innerHTML = `<div class="dialog-head"><h2>Import from Miro</h2><button type="button" class="icon-button" data-miro="close" aria-label="Close Miro import">${icon("close")}</button></div><div class="dialog-body"><p>Loading connection…</p></div><div class="miro-import-feedback"><p data-miro-error class="form-error" role="alert" hidden></p><p data-miro-progress role="status" aria-live="polite"></p></div>`;
    document.body.append(panel);
    panel.showPopover();
    state.dialog = "miro-import";
    track();
    panel.querySelector('[data-miro="close"]').focus({ preventScroll: true });
    panel.addEventListener("click", (e) => {
      const action = e.target.closest("[data-miro]");
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        act(action.dataset.miro);
      }
    });
    panel.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.id === "miro-options") return act("review");
      const tokenForm = e.target.id === "miro-token",
        data = new FormData(e.target);
      const payload = tokenForm
        ? { token: data.get("token") }
        : { board: data.get("board") };
      if (tokenForm) e.target.elements.token.value = "";
      work(
        tokenForm ? "Connecting to Miro…" : "Reading board objects and files…",
        async (current) => {
          const value = await post(tokenForm ? "connect" : "preview", payload);
          if (panel !== current) return;
          if (tokenForm) setup = value;
          else preview = value;
          render();
          panel.querySelector("input,select")?.focus({ preventScroll: true });
        },
      );
    });
    panel.addEventListener("input", () => {
      const btn = panel?.querySelector('[data-miro="import"]');
      if (btn) {
        btn.disabled = true;
        delete btn.dataset.reviewed;
      }
    });
    panel.addEventListener("change", (e) => {
      if (e.target.matches("[data-miro-board]"))
        panel.querySelector('[name="board"]').value = e.target.value;
      if (e.target.name === "allFrames")
        panel
          .querySelectorAll('[name="frame"]')
          .forEach((el) => (el.disabled = e.target.checked));
      if (e.target.name === "destination")
        panel.querySelector('[name="title"]').disabled = !!e.target.value;
    });
    await work("Loading connection…", async (current) => {
      const connection = await api(endpoint());
      if (panel === current) {
        setup = connection;
        render();
      }
    });
  }
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        panel &&
        e.key === "Escape" &&
        !document.querySelector("#shared-select-menu")
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        panel &&
        !panel.contains(e.target) &&
        !e.target.closest('#shared-select-menu,[data-feature="miro-import"]')
      )
        close(false);
    },
    true,
  );
  window.addEventListener("resize", position);
  return { open, close, position };
}
