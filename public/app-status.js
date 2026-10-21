import { saveIssue } from "./save-state.js";
import { positionPopover } from "./popover-position.js";

export function appStatus({ state, sync, version, icon, esc }) {
  const getIssue = () => saveIssue([...sync.entries.values()], { storageError: sync.storageError, online: state.online });
  const panel = () => document.querySelector("#save-warning-details");
  const trigger = () => document.querySelector("#save-warning-toggle");
  let closeTimer, pinned = false;
  function versionHTML() {
    const outdated = state.serverAppVersion && state.serverAppVersion !== version;
    const title = outdated ? `Version ${state.serverAppVersion} is available. Refresh when your changes are saved.` : `Pencils ${version}${state.serverAppVersion ? " · Up to date" : ""}`;
    return `<span class="app-version" title="${esc(title)}" aria-label="${esc(title)}">v${version}${outdated ? `<span class="app-update-available">${icon("refresh")}<span class="app-update-label">Update available</span></span>` : ""}</span>`;
  }
  function details(issue) {
    return `<header><strong id="save-warning-title">${esc(issue.title)}</strong><button type="button" class="icon-button" data-save-warning-close aria-label="Close save warning">${icon("close")}</button></header><p id="save-warning-cause">${esc(issue.cause)}</p><p><strong>How to resolve it</strong><br>${esc(issue.action)}</p><button type="button" class="button" data-feature="recovery">${icon("clock")}Recovery & backups</button>`;
  }
  function position() {
    if (panel()?.matches(":popover-open") && trigger())
      positionPopover(panel(), trigger().getBoundingClientRect(), { width: 360, maxHeight: 460, gap: 6 });
  }
  function show() {
    clearTimeout(closeTimer);
    if (!getIssue() || !panel()) return;
    panel().showPopover();
    trigger()?.setAttribute("aria-expanded", "true");
    position();
  }
  function hide() {
    pinned = false;
    clearTimeout(closeTimer);
    if (panel()?.matches(":popover-open")) panel().hidePopover();
    trigger()?.setAttribute("aria-expanded", "false");
  }
  function leave() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      const warning = trigger()?.closest(".app-save-warning");
      if (!pinned && warning && !warning.matches(":hover, :focus-within")) hide();
    }, 180);
  }
  document.addEventListener("pointerover", event => {
    if (event.pointerType !== "touch" && event.target.closest("#save-warning-toggle")) show();
    else if (event.target.closest("#save-warning-details")) clearTimeout(closeTimer);
  });
  document.addEventListener("pointerout", event => {
    if (event.target.closest(".app-save-warning")) leave();
  });
  document.addEventListener("focusin", event => {
    if (event.target.matches("#save-warning-toggle:focus-visible")) show();
  });
  document.addEventListener("focusout", event => {
    if (event.target.closest(".app-save-warning")) leave();
  });
  document.addEventListener("click", event => {
    if (event.target.closest("#save-warning-toggle")) {
      event.preventDefault();
      if (pinned) hide();
      else { show(); pinned = true; }
    }
    if (event.target.closest("[data-save-warning-close], #save-warning-details [data-feature=recovery]")) hide();
  });
  document.addEventListener("toggle", event => {
    if (event.target.id === "save-warning-details") {
      if (event.newState !== "open") pinned = false;
      trigger()?.setAttribute("aria-expanded", String(event.newState === "open"));
      position();
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.target.closest(".app-save-warning")) {
      // Keep native Enter, Space, Tab and Escape away from board shortcuts.
      event.stopImmediatePropagation();
    } else if (event.key === "Escape" && panel()?.matches(":popover-open")) {
      hide(); event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener("resize", position);
  return {
    html() {
      const issue = getIssue();
      return `${versionHTML()}<div class="app-save-warning" ${issue ? "" : "hidden"}><button type="button" class="icon-button app-save-warning-toggle" id="save-warning-toggle" popovertarget="save-warning-details" aria-controls="save-warning-details" aria-expanded="false" aria-label="${esc(issue ? `Save warning: ${issue.title}` : "Save warning")}" aria-describedby="save-warning-cause">${icon("warning")}</button><section id="save-warning-details" class="app-save-warning-panel" popover="auto" aria-labelledby="save-warning-title">${issue ? details(issue) : ""}</section></div><span class="sr-only" data-save-announcement role="status">${esc(issue?.title || "")}</span>`;
    },
    update() {
      const root = document.querySelector("#save-state");
      if (!root) return;
      const issue = getIssue(), versionEl = root.querySelector(".app-version");
      if (versionEl?.outerHTML !== versionHTML()) versionEl.outerHTML = versionHTML();
      const warning = root.querySelector(".app-save-warning");
      if (!issue) hide();
      warning.hidden = !issue;
      if (issue) {
        trigger().setAttribute("aria-label", `Save warning: ${issue.title}`);
        if (panel().innerHTML !== details(issue)) panel().innerHTML = details(issue);
      }
      const announcement = root.querySelector("[data-save-announcement]");
      if (announcement.textContent !== (issue?.title || "")) announcement.textContent = issue?.title || "";
      position();
    },
  };
}
