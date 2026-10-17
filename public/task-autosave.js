import { saveState } from "./save-state.js";
// Field edits join the durable save queue without rebuilding the active editor.
export function taskAutosave(
  form,
  {
    read,
    flushEditor,
    task,
    sync,
    url,
    onSaved,
    save,
    includeSubtasks = false,
  },
) {
  let last = read(),
    timer,
    disposed = false,
    flushing = false,
    queued = false;
  let pending = Promise.resolve(true);
  const status = form.querySelector("[data-autosave-status]");
  function say(message, error = false) {
    if (disposed || !status) return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
  }
  function syncChanged() {
    if (!queued) return;
    const entry = sync.entries.get(url);
    if (entry) {
      say(
        saveState([entry], {
          storageError: sync.storageError,
          online: navigator.onLine,
        }),
        !!(entry.conflict || entry.error),
      );
      return;
    }
    queued = false;
    pending = Promise.resolve(true);
    if (JSON.stringify(read()) !== JSON.stringify(last)) return;
    if (!disposed) {
      form.dataset.revision = task()?.revision || form.dataset.revision;
      say("Saved automatically");
    }
    onSaved?.({ disposed });
  }
  function flush() {
    clearTimeout(timer);
    if (flushing || disposed) return pending;
    flushing = true;
    flushEditor();
    clearTimeout(timer);
    flushing = false;
    if (!form.checkValidity() || !form.elements.title.value.trim()) {
      say("Complete the required fields to save.", true);
      return Promise.resolve(false);
    }
    const current = read();
    const changes = Object.fromEntries(
      Object.entries(current).filter(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(last[key]),
      ),
    );
    const changed = Object.keys(changes).length > 0;
    const entry = sync.entries.get(url);
    if (!changed && !entry) {
      form.dataset.revision = task()?.revision || form.dataset.revision;
      say("Saved automatically");
      onSaved?.({ disposed });
      return Promise.resolve(true);
    }
    const previous = last,
      wasQueued = queued;
    last = structuredClone(current);
    queued = true;
    say("Saving…");
    let write;
    try {
      write = changed
        ? save
          ? save(changes, current)
          : sync.enqueue(url, structuredClone(task()), changes)
        : sync.run(entry);
    } catch (error) {
      last = previous;
      queued = wasQueued;
      say(error.message, true);
      return Promise.resolve(false);
    }
    pending = Promise.resolve(write)
      .then(() => {
        syncChanged();
        return !sync.entries.has(url);
      })
      .catch((error) => {
        say(error.message, true);
        return false;
      });
    return pending;
  }
  function schedule(event) {
    if (
      disposed ||
      flushing ||
      event?.target.closest(".task-history-panel") ||
      (!includeSubtasks && event?.target.closest(".task-subtasks")) ||
      event?.target.name === "new-comment"
    )
      return;
    clearTimeout(timer);
    say("Unsaved changes…");
    timer = setTimeout(flush, event?.type === "change" ? 0 : 450);
  }
  const submit = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void flush();
  };
  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  form.addEventListener("submit", submit);
  window.addEventListener("pagehide", flush);
  return {
    flush,
    schedule,
    syncChanged,
    destroy() {
      flush();
      disposed = true;
      clearTimeout(timer);
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
      form.removeEventListener("submit", submit);
      window.removeEventListener("pagehide", flush);
    },
  };
}
