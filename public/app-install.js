import { anchoredPanel } from "./anchored-panel.js";

// Owner request (F0.23-14): Pencils installs as an app of its own (manifest.json). Chromium browsers
// offer it through beforeinstallprompt, kept here for the tab bar's Install button; iPhone and iPad
// have no prompt, so there the button shows the Add to Home Screen steps. Installed, the button goes.
// The root's data-installable shows it, so the tab bar can redraw without losing it.
export function installApp({ state, esc, icon }) {
  let offer = null;
  const installed = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  // iPadOS reports a Mac with touch.
  const apple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const sync = () => document.documentElement.toggleAttribute("data-installable", !installed() && (!!offer || apple()));
  const panels = anchoredPanel({ state, esc, icon });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    offer = event;
    sync();
  });
  window.addEventListener("appinstalled", () => {
    offer = null;
    sync();
  });
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element && event.target.closest('[data-feature="install-app"]');
    if (!button) return;
    // A prompt can be shown once; the browser offers it again if it's dismissed.
    if (offer) {
      const prompt = offer;
      offer = null;
      sync();
      void prompt.prompt();
      return;
    }
    panels.show(button, "Install Pencils", '<p class="field-hint">Tap Share, then Add to Home Screen. Pencils then opens from its own icon, without the browser around it.</p>', 300);
  });
  sync();
}
