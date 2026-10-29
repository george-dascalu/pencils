import { listCallouts } from "./document-list-callouts.js";

// Settings → You → Style (owner request, 29 Oct 2026, like Obsidian's Style Settings): fixed options
// that set CSS tokens through public/appearance.js and stay in this browser with the other
// appearance choices. Each shows its default and resets on its own; Reset all restores them all.
// [option, label, the token it replaces, its default in words]. An unset colour's picker starts
// from what the token shows in the current theme.
const colours = [
  ["accent", "Accent colour", "--green", "theme green"],
  ["headingColor", "Heading colour", "--ink", "text colour"],
  ["calloutColor", "Callout colour", "--line", "border grey"],
];
const listTints = { important: "red", question: "orange", bookmark: "gold", idea: "violet", person: "teal", cost: "theme green", aside: "grey" };
const rendered = (token, attributes = {}) => {
  const probe = Object.assign(document.createElement("span"), { hidden: true });
  for (const [name, value] of Object.entries(attributes)) probe.setAttribute(name, value);
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue(token).trim();
  probe.remove();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#808080";
};
const ranges = [["textSize", "Document text size"], ["lineWidth", "Readable line width"], ["lineHeight", "Line height"], ["roundness", "Corner roundness"]];
const codeFonts = [["", "System monospace"], ["modern", "Modern monospace"], ["courier", "Courier"]];

export function styleSettings({ esc, colorPicker, toast }) {
  const prefs = window.PencilsAppearance;
  const shown = (name, value) => `${value}${prefs.styles[name].unit || (name === "roundness" ? "×" : "")}`;
  const reset = (name, label) => `<button type="button" class="button small" data-style-reset="${name}" aria-label="Reset ${label.toLowerCase()}">Reset</button>`;
  const option = (name, label, control, initial) => `<div class="style-option">${control}<span class="field-hint">Default: ${esc(initial)}</span>${reset(name, label)}</div>`;
  const colour = (style, name, label, initial, described) => option(name, label, `<div class="field">${esc(label)}${colorPicker({ value: style[name] || initial, name: `style-${name}`, label })}</div>`, described);
  const select = (style, name, label, choices) => option(name, label, `<label class="field">${label}<select data-style-option="${name}">${choices.map(([value, text]) => `<option value="${esc(value)}" ${(style[name] || "") === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`, choices[0][1]);
  function html() {
    const style = prefs.read().style;
    return `<fieldset class="appearance-group style-settings" data-style-settings><legend>Style</legend><p class="field-hint">Fine-tune colours, documents and corners. These choices stay in this browser.</p>${colours.map(([name, label, token, described]) => colour(style, name, label, rendered(token), described)).join("")}${ranges.map(([name, label]) => {
      const r = prefs.styles[name], value = style[name] ?? r.initial;
      // Touch screens keep text you edit at 16px or more, so iOS doesn't zoom into it.
      return option(name, label, `<label class="field">${label} <output>${shown(name, value)}</output><input type="range" data-style-option="${name}" aria-label="${label}" min="${r.min}" max="${r.max}" step="${r.step}" value="${value}"></label>`, shown(name, r.initial) + (name === "textSize" && matchMedia("(pointer: coarse)").matches ? ", never below 16px on this screen" : ""));
    }).join("")}${select(style, "documentFont", "Document font", [["", "Workspace font"], ...prefs.fonts.map(([id, name]) => [id, name])])}${select(style, "codeFont", "Code font", codeFonts)}<details class="style-list-callouts"><summary>List callout colours</summary>${listCallouts.map((c) => colour(style, `list-${c.name}`, c.label, rendered("--list-callout-color", { "data-list-callout": c.name }), listTints[c.name])).join("")}</details><div class="style-actions"><button type="button" class="button" data-style-reset-all aria-label="Reset all style options">Reset all</button></div></fieldset>`;
  }
  const save = (change) => {
    try {
      const style = { ...prefs.read().style };
      for (const [name, value] of Object.entries(change)) value === "" || value === null ? delete style[name] : (style[name] = value);
      prefs.write({ style });
    } catch {
      toast("Browser storage is unavailable. Your preference could not be saved.", true);
    }
  };
  // Draws the section again, keeping the list callouts open and focus on the button used.
  const redraw = (box, button) => {
    const open = box.querySelector(".style-list-callouts").open, again = button.dataset.styleReset;
    box.outerHTML = html();
    const fresh = document.querySelector("[data-style-settings]");
    fresh.querySelector(".style-list-callouts").open = open;
    fresh.querySelector(again ? `[data-style-reset="${CSS.escape(again)}"]` : "[data-style-reset-all]")?.focus();
  };
  document.addEventListener("input", (event) => {
    const range = event.target.closest('[data-style-settings] input[type="range"][data-style-option]');
    if (!range) return;
    range.previousElementSibling.textContent = shown(range.dataset.styleOption, range.value);
    save({ [range.dataset.styleOption]: Number(range.value) });
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-style-settings] select[data-style-option]")) save({ [event.target.dataset.styleOption]: event.target.value });
    else if (event.target.name?.startsWith("style-") && event.target.closest("[data-style-settings]")) save({ [event.target.name.slice(6)]: event.target.value });
  });
  document.addEventListener("click", (event) => {
    const box = event.target.closest("[data-style-settings]");
    if (!box) return;
    const one = event.target.closest("[data-style-reset]"), all = event.target.closest("[data-style-reset-all]");
    if (one) save({ [one.dataset.styleReset]: null });
    else if (all) {
      try {
        prefs.write({ style: {} });
      } catch {
        toast("Browser storage is unavailable. Your preference could not be saved.", true);
      }
    } else return;
    redraw(box, one || all);
  });
  return { html };
}
