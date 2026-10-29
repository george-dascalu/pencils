// Settings → You → "Capture from your phone" (server/capture.js): make, copy and revoke the tokens
// an iPhone Shortcut uses to send text to a project as a card tagged "inbox". A new token is shown
// once, in this page only.
export function captureSettings({ state, api, esc, toast }) {
  const projects = () => (state.projects || []).filter((p) => !p.personal && !p.archived);
  const projectTitle = (id) => projects().find((p) => p.id === id)?.title || "A project you can't open";
  function html() {
    const choices = projects();
    return `<fieldset class="appearance-group capture-settings" data-capture-settings><legend>Capture from your phone</legend><p class="field-hint">An iPhone Shortcut can send text to a project: the first line becomes a card's title, the rest its description, and #words its tags, with "inbox".</p>${choices.length ? `<div class="capture-make"><label class="field">Project<select data-capture-project>${choices.map((p) => `<option value="${esc(p.id)}" ${p.id === state.project?.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label><button type="button" class="button" data-capture-action="create">Make a capture token</button></div>` : '<p class="field-hint">Make a team project first.</p>'}<div class="capture-token" hidden><label class="field">New token, shown once<input readonly data-capture-token spellcheck="false" autocomplete="off"></label><button type="button" class="button" data-capture-action="copy">Copy</button></div><ul class="capture-tokens" data-capture-tokens aria-label="Capture tokens"><li class="field-hint">Loading…</li></ul><details class="capture-steps"><summary>Set up the Shortcut</summary><ol><li>In Shortcuts, make a shortcut that starts with <strong>Ask for Input</strong>, or turn on <strong>Show in Share Sheet</strong>.</li><li>Add <strong>Get Contents of URL</strong> with <code>${esc(location.origin)}/api/capture</code>, method <strong>POST</strong>, a header <code>Authorization</code> set to <code>Bearer</code>, a space and the token, and a JSON body with a text field <code>text</code> set to the input.</li><li>Run it, or share text to it. The card appears in the project, tagged inbox.</li></ol></details></fieldset>`;
  }
  async function load(host) {
    const list = host.querySelector("[data-capture-tokens]");
    if (!list) return;
    try {
      const { tokens } = await api("/capture-tokens");
      if (list.isConnected)
        list.innerHTML = tokens.map((t) => `<li><span>${esc(projectTitle(t.project))}<span class="field-hint"> · made ${esc(new Date(t.created).toLocaleDateString())}</span></span><button type="button" class="button small" data-capture-action="revoke" data-capture-id="${esc(t.id)}" aria-label="Revoke the token for ${esc(projectTitle(t.project))}">Revoke</button></li>`).join("") || '<li class="field-hint">No capture tokens yet.</li>';
    } catch (error) {
      list.innerHTML = `<li class="field-hint">${esc(error.message)}</li>`;
    }
  }
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-capture-action]");
    if (!button) return;
    const box = button.closest("[data-capture-settings]"), field = box.querySelector("[data-capture-token]");
    try {
      button.disabled = true;
      if (button.dataset.captureAction === "create") {
        field.value = (await api("/capture-tokens", { method: "POST", body: { project: box.querySelector("[data-capture-project]").value } })).token;
        field.closest(".capture-token").hidden = false;
        box.querySelector('[data-capture-action="copy"]').focus();
        await load(box);
      } else if (button.dataset.captureAction === "copy") {
        try {
          await navigator.clipboard.writeText(field.value);
          toast("Token copied.");
        } catch {
          field.select();
          toast("Copy the selected token.");
        }
      } else if (button.dataset.captureAction === "revoke") {
        await api(`/capture-tokens/${encodeURIComponent(button.dataset.captureId)}`, { method: "DELETE", body: {} });
        await load(box);
        toast("Token revoked.");
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  return { html, load };
}
