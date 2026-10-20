import { gestureSettingsHTML, installGestureSettings } from "./drawing-gestures.js";
export function personalSettings(ctx) {
  installGestureSettings();
  const { state, $, $$, esc, showDialog, dialogHead, toast } = ctx;
  const prefs = window.PencilsAppearance;
  const mobile = matchMedia("(max-width: 780px)");
  function render() {
    const hidden = prefs.read().collapsed && !mobile.matches;
    const sidebar = $(".sidebar");
    if (sidebar) sidebar.inert = hidden;
    for (const button of $$('[data-personal="sidebar"]')) {
      button.setAttribute("aria-expanded", String(!hidden));
      button.setAttribute(
        "aria-label",
        hidden ? "Expand sidebar" : "Collapse sidebar",
      );
      button.title = hidden ? "Expand sidebar" : "Collapse sidebar";
    }
  }
  function open() {
    const value = prefs.read();
    const workspace = `<fieldset class="appearance-group"><legend>Workspace</legend><div class="personal-workspace-actions"><button type="button" class="button" data-feature="global-search">Search all projects <span class="field-hint">⌘/Ctrl K</span></button><button type="button" class="button" data-feature="recovery">Recovery &amp; backups</button>${state.session?.required && !state.session.automatic && state.session.user?.admin ? '<button type="button" class="button" data-feature="accounts">Accounts &amp; access</button>' : ""}${state.session?.required && !state.session.automatic ? '<button type="button" class="button" data-feature="logout">Sign out</button>' : ""}<label><input type="checkbox" id="show-archived-projects" ${state.showArchived ? "checked" : ""}> Archived projects</label></div></fieldset>`;
    showDialog(
      `<dialog class="dialog personal-dialog">${dialogHead("Personal settings")}<div class="dialog-body">${state.session?.required && state.session.user ? `<p class="field-hint" data-current-user><strong>${esc(state.session.user.username)}</strong> · ${state.session.user.admin ? "Administrator" : "Member"}${state.session.automatic ? " · Automatic local sign-in" : ""}</p>` : ""}<p class="field-hint">Your appearance preferences are saved in this browser, across projects. Other devices keep their own preferences.</p>${workspace}<fieldset class="appearance-group"><legend>Appearance</legend><div class="theme-options">${["light", "dark", "system"].map((theme) => `<label><input type="radio" name="personal-theme" value="${theme}" ${value.theme === theme ? "checked" : ""}><span>${theme[0].toUpperCase() + theme.slice(1)}</span></label>`).join("")}</div></fieldset><fieldset class="appearance-group"><legend>Display density</legend><label class="field">Spacing<select name="personal-density"><option value="comfortable" ${value.density === "comfortable" ? "selected" : ""}>Comfortable</option><option value="compact" ${value.density === "compact" ? "selected" : ""}>Compact</option></select></label></fieldset><fieldset class="appearance-group"><legend>Board controls</legend><label class="field">Navigation<select name="personal-navigation"><option value="mouse" ${value.navigation === "mouse" ? "selected" : ""}>Mouse: wheel to zoom</option><option value="trackpad" ${value.navigation === "trackpad" ? "selected" : ""}>Trackpad: scroll to pan, pinch to zoom</option></select></label><label><input type="checkbox" name="personal-singleKeys" ${value.singleKeys ? "checked" : ""}> Enable single-letter shortcuts</label><p class="field-hint">Tab moves between objects. Alt + Up/Down moves to a parent/child. Alt + Shift + arrows resizes by 10 pixels.</p></fieldset>${gestureSettingsHTML()}<fieldset class="appearance-group"><legend>Workspace font</legend><p class="field-hint">All eight fonts are included locally and work without internet.</p><div class="font-options">${prefs.fonts.map(([id, name, description]) => `<label class="font-option" style="font-family:'${name}',sans-serif"><input type="radio" name="personal-font" value="${id}" ${value.font === id ? "checked" : ""}><span><strong>${name}</strong><small>${description}</small><span class="font-sample">A little space for good work. 012345</span></span></label>`).join("")}</div></fieldset><p class="field-hint" role="status" id="appearance-saved">Changes apply immediately.</p></div><div class="dialog-foot"><button type="button" class="button primary" data-action="dialog-close">Done</button></div></dialog>`,
      "personal",
    );
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-personal]");
    if (!button) return;
    if (button.dataset.personal === "settings") open();
    else if (button.dataset.personal === "sidebar") {
      try {
        prefs.write({ collapsed: !prefs.read().collapsed });
      } catch {
        toast(
          "Browser storage is unavailable. Your preference could not be saved.",
          true,
        );
      }
    }
  });
  document.addEventListener("change", (event) => {
    const name = event.target.name;
    if (
      ![
        "personal-theme",
        "personal-density",
        "personal-font",
        "personal-navigation",
        "personal-singleKeys",
      ].includes(name)
    )
      return;
    try {
      prefs.write({
        [name.slice(9)]:
          event.target.type === "checkbox"
            ? event.target.checked
            : event.target.value,
      });
      $("#appearance-saved").textContent = "Saved in this browser.";
    } catch {
      toast(
        "Browser storage is unavailable. Your preference could not be saved.",
        true,
      );
    }
    state.dirty = false;
  });
  window.addEventListener("pencils-appearance", render);
  mobile.addEventListener("change", render);
  return { render };
}
