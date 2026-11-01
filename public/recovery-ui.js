import { historyPages } from "./history-pages.js";
import { confirmAction } from "./confirm-popover.js";
import { BACKUP_BYTES } from "./backup-limits.js";
export function recoveryUI(ctx) {
  const {
    state,
    sync,
    api,
    esc,
    showDialog,
    closeDialog,
    dialogHead,
    $,
    toast,
    refresh,
  } = ctx;
  let record = null;
  const download = (name, content, type = "application/json") => {
    const url = URL.createObjectURL(new Blob([content], { type })),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function open() {
    let unavailable = false;
    const [trash, backups] = state.session?.user?.admin
      ? await Promise.all([api("/trash"), api("/backups")]).catch(() => {
        unavailable = true;
        return [{ items: [] }, { backups: [] }];
      })
      : [{ items: [] }, { backups: [] }];
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Recovery & backups")}<div class="dialog-body"><h3>Pending saves</h3>${[...sync.entries.values()].map((e) => `<section class="recovery-item"><strong>${esc(e.local?.title || e.url)}</strong><p>${esc(e.error || "Waiting to save to the server")}</p>${e.conflict ? `<p>This choice applies to the conflicting fields below. Other edits are combined.</p><ul>${e.conflict.conflicts.map((c) => `<li><strong>${esc(c.path)}</strong><div class="conflict-values"><pre>Your edit: ${esc(JSON.stringify(c.local))}</pre><pre>Server version: ${esc(JSON.stringify(c.remote))}</pre></div></li>`).join("")}</ul><button class="button small" data-feature="resolve-local" data-url="${esc(e.url)}">Use my edits</button><button class="button small" data-feature="resolve-remote" data-url="${esc(e.url)}">Use server edits</button>` : ""}<button class="button small" data-feature="draft-download" data-url="${esc(e.url)}">Export draft</button><button class="button small" data-feature="draft-retry" data-url="${esc(e.url)}">Retry save</button><button class="button small danger" data-feature="draft-discard" data-url="${esc(e.url)}">Discard draft</button></section>`).join("") || "<p>No pending saves in this browser.</p>"}<p class="field-hint">Editor drafts are restored when you reopen the same card, or a new card's editor, in this browser. Drafts are separate from vault backups.</p>${
        unavailable ? '<p role="status">Server backups and trash are unavailable. You can still export your browser drafts above.</p>' : state.session?.user?.admin
          ? `<h3>Project backups</h3><p>Contains projects and organisations only. Accounts, history, trash and other vault folders need an installation backup. Pencils makes a project backup before the first edit each day. Keep a copy on another disk.</p><p class="field-hint">ZIP exports support 220 MB compressed, 200 MB expanded and 30,000 files. Larger backups are stored as files on the server and can be restored here. Verify a backup before restoring it.</p><button class="button" data-feature="backup-create">Create backup now</button> <button class="button" data-feature="backup-upload">Upload backup ZIP</button>${backups.backups
              .slice(0, 40)
              .map(
                (b) =>
                  `<div class="recovery-item"><strong>${esc(new Date(b.created).toLocaleString())}</strong><p>${esc(b.reason)} · ${b.files} files · ${(b.size / 1024).toFixed(0)} KB</p>${b.format === "directory" ? `<span>Files stored on server</span>` : `<a class="button small" href="/api/backups/${esc(b.id)}" download>Download ZIP</a>`}<button class="button small" data-feature="backup-verify" data-id="${esc(b.id)}">Verify backup</button><button class="button small danger" data-feature="backup-restore" data-id="${esc(b.id)}">Restore backup</button></div>`,
              )
              .join(
                "",
              )}<h3>Trash</h3>${trash.items.map((t) => `<div class="recovery-item"><strong>${esc(t.title)}</strong> · ${esc(t.kind)}<button class="button small" data-feature="trash-restore" data-key="${esc(t.key)}">Restore</button></div>`).join("") || "<p>Trash is empty.</p>"}`
          : ""
      }</div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button></div></dialog>`,
      "recovery",
    );
  }
  async function history(target) {
    record = target;
    const pages = historyPages(api, target.file), data = await pages.more();
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead(`History · ${target.title}`)}<div class="dialog-body"><p>Restore a previous version. The current version will remain in history.</p><div data-version-list></div><button type="button" class="button small" data-older-versions>Load older versions</button><p data-history-error role="alert"></p></div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button></div></dialog>`,
      "history",
    );
    const list = document.querySelector("[data-version-list]"), more = document.querySelector("[data-older-versions]");
    const append = rows => {
      for (const row of rows) {
        const details = document.createElement("details"); details.className = "recovery-item";
        details.innerHTML = `<summary>${esc(new Date(row.updated).toLocaleString())} · ${esc(row.title)}</summary><pre>Loading version…</pre><button class="button" data-feature="version-restore" data-version="${row.revision}">Restore this version</button>`;
        let loaded = false;
        details.addEventListener("toggle", async () => {
          if (!details.open || loaded) return;
          loaded = true;
          try { const version = await pages.version(row.revision); details.querySelector("pre").textContent = version.body || (version.data.kind === "board" ? `${version.data.nodes?.length || 0} objects · ${version.data.edges?.length || 0} connectors` : "No description"); }
          catch (error) { loaded = false; details.querySelector("pre").textContent = error.message + " Close and reopen to retry."; }
        });
        list.append(details);
      }
    };
    append(data.versions); more.hidden = !data.next;
    more.onclick = async () => { more.disabled = true; try { const next = await pages.more(); append(next.versions); more.hidden = !next.next; } catch (error) { more.parentElement.querySelector("[data-history-error]").textContent = error.message; } finally { more.disabled = false; } };
  }

  async function click(action, el) {
    if (action === "recovery") {
      await open();
      return true;
    }
    if (action === "backup-upload") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip";
      input.onchange = async () => {
        try {
          const file = input.files[0];
          if (!file) return;
          if (file.size > BACKUP_BYTES)
            throw new Error("Upload a ZIP up to 220 MB.");
          const response = await fetch("/api/backups/upload", {
            method: "POST",
            headers: { "Content-Type": "application/zip" },
            body: file,
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Backup upload failed.");
          await open();
          toast("Backup uploaded. Choose Restore backup to replace projects and organisations.");
        } catch (error) {
          toast(error.message, true);
        }
      };
      input.click();
      return true;
    }
    if (action === "backup-verify") {
      el.disabled = true;
      try {
        const result = await api(`/backups/${el.dataset.id}/verify`, {
          method: "POST",
          body: {},
        });
        toast(
          `Backup verified: ${result.files} files, ${(result.bytes / 1000000).toFixed(1)} MB expanded.`,
        );
      } finally {
        el.disabled = false;
      }
      return true;
    }
    if (action === "backup-create") {
      await api("/backups", { method: "POST", body: {} });
      await open();
      toast("Backup created.");
      return true;
    }
    if (action === "backup-restore") {
      if (
        await confirmAction({ anchor: el, title: "Restore this backup?", message: "All projects and organisations will be replaced by this backup. A backup of their current contents is created first.", confirmLabel: "Restore backup", danger: true })
      ) {
        await api(`/backups/${el.dataset.id}`, { method: "POST", body: {} });
        closeDialog(true);
        state.project = null;
        await refresh();
        toast("Projects and organisations restored.");
      }
      return true;
    }
    if (action === "trash-restore") {
      await api("/trash", { method: "POST", body: { key: el.dataset.key } });
      await refresh(false);
      await open();
      return true;
    }
    if (action === "version-restore") {
      if (await confirmAction({ anchor: el, title: "Restore this version?", message: `${record.title} returns to this version.`, confirmLabel: "Restore" })) {
        await api("/history", {
          method: "POST",
          body: {
            file: record.file,
            version: el.dataset.version,
            revision: record.revision,
          },
        });
        closeDialog(true);
        await refresh();
      }
      return true;
    }
    if (action === "resolve-local" || action === "resolve-remote") {
      await sync.resolve(
        el.dataset.url,
        action === "resolve-local" ? "local" : "remote",
      );
      await open();
      return true;
    }
    if (action === "draft-download") {
      download(
        "pencils-draft.json",
        JSON.stringify(sync.entries.get(el.dataset.url), null, 2),
      );
      return true;
    }
    if (action === "draft-retry") {
      const entry = sync.entries.get(el.dataset.url);
      if (entry) {
        entry.blocked = false;
        await sync.run(entry);
      }
      await open();
      return true;
    }
    if (action === "draft-discard") {
      if (
        await confirmAction({ anchor: el, title: "Discard these unsaved changes?", message: "Export draft first if you want a copy. Discarding removes this draft from the browser.", confirmLabel: "Discard draft", danger: true })
      ) {
        sync.discard(el.dataset.url);
        await refresh(false);
        await open();
      }
      return true;
    }
    return false;
  }
  return { open, history, click, download };
}
