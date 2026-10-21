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
    const [trash, backups] = state.session?.user?.admin
      ? await Promise.all([api("/trash"), api("/backups")])
      : [{ items: [] }, { backups: [] }];
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Recovery & backups")}<div class="dialog-body"><h3>Pending saves</h3>${[...sync.entries.values()].map((e) => `<section class="recovery-item"><strong>${esc(e.local?.title || e.url)}</strong><p>${esc(e.error || "Waiting to save")}</p>${e.conflict ? `<ul>${e.conflict.conflicts.map((c) => `<li><strong>${esc(c.path)}</strong><div class="conflict-values"><pre>Your edit: ${esc(JSON.stringify(c.local))}</pre><pre>On disk: ${esc(JSON.stringify(c.remote))}</pre></div></li>`).join("")}</ul><button class="button small" data-feature="resolve-local" data-url="${esc(e.url)}">Keep my conflicting values</button><button class="button small" data-feature="resolve-remote" data-url="${esc(e.url)}">Use disk values for conflicts</button>` : ""}<button class="button small" data-feature="draft-download" data-url="${esc(e.url)}">Export draft</button><button class="button small" data-feature="draft-retry" data-url="${esc(e.url)}">Retry</button><button class="button small danger" data-feature="draft-discard" data-url="${esc(e.url)}">Discard draft</button></section>`).join("") || "<p>All queued changes are saved.</p>"}<p class="field-hint">Editor drafts are restored when you reopen the same task or new-task editor in this browser. Drafts are separate from vault backups.</p>${
        state.session?.user?.admin
          ? `<h3>Project backups</h3><p>Includes Projects and Organisations. Accounts, history, trash and other vault folders require an installation backup. Automatic backup before the first edit each day. Keep a copy on another disk.</p><p class="field-hint">Up to 220 MB per ZIP, 200 MB expanded and 30,000 files. Verify a backup before restoring it.</p><button class="button" data-feature="backup-create">Create backup now</button> <button class="button" data-feature="backup-upload">Upload backup ZIP</button>${backups.backups
              .slice(0, 40)
              .map(
                (b) =>
                  `<div class="recovery-item"><strong>${esc(new Date(b.created).toLocaleString())}</strong><p>${esc(b.reason)} · ${b.files} files · ${(b.size / 1024).toFixed(0)} KB</p><a class="button small" href="/api/backups/${esc(b.id)}" download>Download ZIP</a><button class="button small" data-feature="backup-verify" data-id="${esc(b.id)}">Verify</button><button class="button small danger" data-feature="backup-restore" data-id="${esc(b.id)}">Restore vault</button></div>`,
              )
              .join(
                "",
              )}<h3>Trash</h3>${trash.items.map((t) => `<div class="recovery-item"><strong>${esc(t.title)}</strong> · ${esc(t.kind)}<button class="button small" data-feature="trash-restore" data-key="${esc(t.key)}">Restore</button></div>`).join("") || "<p>Trash is empty.</p>"}`
          : ""
      }</div><div class="dialog-foot"><button class="button primary" data-action="dialog-close">Close</button></div></dialog>`,
      "recovery",
    );
  }
  async function history(target) {
    record = target;
    const data = await api(`/history?file=${encodeURIComponent(target.file)}`);
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead(`History · ${target.title}`)}<div class="dialog-body"><p>Restore a previous version of this note, including its properties. The current version will remain in history.</p>${data.versions.map((v) => `<details class="recovery-item"><summary>${esc(new Date(v.updated).toLocaleString())} · ${esc(v.title)}</summary><pre>${esc(v.body)}</pre><button class="button" data-feature="version-restore" data-version="${v.revision}">Restore this version</button></details>`).join("") || "<p>No earlier versions yet.</p>"}</div><div class="dialog-foot"><button class="button" data-action="dialog-close">Close</button></div></dialog>`,
      "history",
    );
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
          toast("Backup uploaded. Choose Restore vault to apply it.");
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
        confirm(
          "Replace all projects and organisations with this backup? A backup of the current vault will be created first.",
        )
      ) {
        await api(`/backups/${el.dataset.id}`, { method: "POST", body: {} });
        closeDialog(true);
        state.project = null;
        await refresh();
        toast("Vault restored.");
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
      if (confirm(`Restore this version of ${record.title}?`)) {
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
        confirm(
          "Discard these unsaved changes? Export the draft first if you want a copy.",
        )
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
