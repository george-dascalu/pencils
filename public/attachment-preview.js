import { positionPopover } from "./popover-position.js";

export function attachmentPreview({ esc, icon }, owner) {
  const lifecycle = new AbortController();
  let active = null,
    frame;
  function close(focus = false) {
    if (!active) return;
    const current = active;
    active = null;
    cancelAnimationFrame(frame);
    current.request.abort();
    current.panel.remove();
    if (current.url) URL.revokeObjectURL(current.url);
    current.anchor.setAttribute("aria-expanded", "false");
    current.anchor.removeAttribute("aria-controls");
    if (focus && current.anchor.isConnected)
      current.anchor.focus({ preventScroll: true });
  }
  function track() {
    if (!active) return;
    if (!active.anchor.isConnected || !owner.isConnected) return close();
    positionPopover(active.panel, active.anchor.getBoundingClientRect(), {
      width: 520,
      maxHeight: 520,
      gap: 8,
    });
    frame = requestAnimationFrame(track);
  }
  async function open(file, anchor) {
    if (active?.anchor === anchor) return close(true);
    close();
    const panel = document.createElement("section");
    panel.id = "attachment-preview";
    panel.className = "selection-popover attachment-preview";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "attachment-preview-title");
    panel.innerHTML = `<header><strong id="attachment-preview-title">${esc(file.name)}</strong><button type="button" class="icon-button" data-preview-close aria-label="Close attachment preview">${icon("close")}</button></header><div class="attachment-preview-content" aria-busy="true"><p role="status">Loading preview…</p></div><footer><span class="field-hint" data-preview-info></span><a class="button small" data-preview-download hidden download="${esc(file.name)}">${icon("download")}Download</a></footer>`;
    owner.append(panel);
    const current = (active = {
      panel,
      anchor,
      request: new AbortController(),
      url: null,
    });
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-controls", panel.id);
    panel.showPopover();
    track();
    const closeButton = panel.querySelector("[data-preview-close]");
    closeButton.addEventListener("click", () => close(true));
    closeButton.focus({ preventScroll: true });
    const content = panel.querySelector(".attachment-preview-content");
    try {
      const response = await fetch(file.url, {
        signal: current.request.signal,
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "This attachment could not be found."
            : "Could not load this attachment. Close the preview and try again.",
        );
      const blob = await response.blob();
      if (active !== current) return;
      current.url = URL.createObjectURL(
        file.extension === "pdf"
          ? new Blob([blob], { type: "application/pdf" })
          : blob,
      );
      const download = panel.querySelector("[data-preview-download]");
      download.href = current.url;
      download.hidden = false;
      panel.querySelector("[data-preview-info]").textContent =
        `${file.extension.toUpperCase()} · ${blob.size < 1024 ? `${blob.size} B` : blob.size < 1048576 ? `${Math.ceil(blob.size / 1024)} KB` : `${(blob.size / 1048576).toFixed(1)} MB`}`;
      content.replaceChildren();
      if (/^(png|jpe?g|gif|webp)$/.test(file.extension)) {
        const image = document.createElement("img");
        image.alt = file.name;
        image.src = current.url;
        image.addEventListener("error", () => {
          if (active === current)
            content.textContent =
              "This image cannot be previewed. You can download the file below.";
        });
        content.append(image);
      } else if (["txt", "md", "csv"].includes(file.extension)) {
        const text = await blob.text();
        if (active !== current) return;
        const pre = document.createElement("pre");
        pre.textContent = text.slice(0, 100000);
        pre.tabIndex = 0;
        pre.setAttribute("aria-label", `${file.name} contents`);
        content.append(pre);
        if (text.length > 100000) {
          const notice = document.createElement("p");
          notice.className = "field-hint";
          notice.textContent =
            "Preview shows the first 100,000 characters. Download to read the full file.";
          content.append(notice);
        }
      } else if (file.extension === "pdf" && navigator.pdfViewerEnabled) {
        const frame = document.createElement("iframe");
        frame.title = `${file.name} PDF preview`;
        frame.src = `${file.url}?preview=1`;
        content.append(frame);
        const hint = document.createElement("p");
        hint.className = "field-hint";
        hint.textContent = "If the PDF does not display, download it below.";
        content.append(hint);
      } else {
        const message = document.createElement("p");
        message.textContent =
          file.extension === "pdf"
            ? "PDF preview is not available in this browser. Download the file to open it."
            : "Download this file to open it on your device.";
        content.append(message);
      }
    } catch (error) {
      if (active !== current || error.name === "AbortError") return;
      content.textContent = error.message;
      content.setAttribute("role", "alert");
    } finally {
      content.removeAttribute("aria-busy");
    }
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        active &&
        !active.panel.contains(event.target) &&
        !active.anchor.contains(event.target)
      )
        close();
    },
    { capture: true, signal: lifecycle.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!active) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
      } else if (active.panel.contains(event.target)) event.stopPropagation();
    },
    { capture: true, signal: lifecycle.signal },
  );
  return {
    open,
    close,
    destroy() {
      close();
      lifecycle.abort();
    },
  };
}
