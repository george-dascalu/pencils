import { helpArticles, helpArticle } from "./help-content.js";
import { mainWidth } from "./layout-width.js";

export function helpPageHTML(id, { esc, icon }) {
  const article = helpArticle(id);
  const content = (html) =>
    html
      .replaceAll("<pre>", '<pre tabindex="0" aria-label="Code example">')
      .replaceAll(
        '<div class="help-table">',
        '<div class="help-table" tabindex="0" role="region" aria-label="Reference table">',
      );
  return `<section class="help-page" aria-label="Help wiki">
    <header class="help-page-heading"><button class="button small" data-action="help-back">${icon("arrow")}Back</button><span>Help centre</span></header>
    <div class="help-layout">
      <aside class="help-sidebar">
        <label class="field" for="help-search">Search help<input id="help-search" type="search" placeholder="Search guides…" autocomplete="off" aria-controls="help-navigation"></label>
        <p id="help-search-status" class="field-hint" role="status" aria-live="polite"></p>
        <details class="help-navigation" ${mainWidth() > 780 ? "open" : ""}><summary>Browse guides</summary><nav id="help-navigation" aria-label="Help articles">
          ${[...new Set(helpArticles.map((a) => a.group))]
            .map(
              (group) =>
                `<div class="help-nav-group"><h2>${esc(group)}</h2>${helpArticles
                  .filter((a) => a.group === group)
                  .map(
                    (a) =>
                      `<a href="#help/${a.id}" data-action="help-article" data-id="${a.id}" ${a.id === article.id ? 'aria-current="page"' : ""}>${esc(a.title)}</a>`,
                  )
                  .join("")}</div>`,
            )
            .join("")}
        </nav></details>
      </aside>
      <article class="help-article" aria-labelledby="help-title">
        <div class="help-breadcrumb"><a href="#help/start" data-action="help-article" data-id="start">Help</a><span aria-hidden="true">/</span><span>${esc(article.group)}</span></div>
        <h1 id="help-title" tabindex="-1">${esc(article.title)}</h1><p class="help-intro">${esc(article.summary)}</p>
        <nav class="help-contents" aria-label="On this page"><strong>On this page</strong>${article.sections.map((s) => `<button type="button" data-help-section="${s.id}">${esc(s.title)}</button>`).join("")}</nav>
        ${article.sections.map((s) => `<section class="help-section"><h2 id="help-section-${s.id}" tabindex="-1">${esc(s.title)}</h2>${content(s.html)}</section>`).join("")}
        <footer class="help-article-footer">Guides for this installation · Documentation checked ${esc(article.updated || "17 October 2026")}</footer>
      </article>
    </div>
  </section>`;
}

const searchable = new Map(
  helpArticles.map((a) => {
    const body = document.createElement("div");
    body.innerHTML = a.sections.map((s) => `${s.title} ${s.html}`).join(" ");
    return [a.id, `${a.title} ${a.summary} ${body.textContent}`.toLowerCase()];
  }),
);
document.addEventListener("input", (event) => {
  if (event.target.id !== "help-search") return;
  const query = event.target.value.trim().toLowerCase(),
    words = query.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const a of document.querySelectorAll("#help-navigation a")) {
    a.hidden = !words.every((word) =>
      searchable.get(a.dataset.id).includes(word),
    );
    if (!a.hidden) count++;
  }
  for (const group of document.querySelectorAll(".help-nav-group"))
    group.hidden = !group.querySelector("a:not([hidden])");
  document.querySelector("#help-search-status").textContent = query
    ? count
      ? `${count} matching ${count === 1 ? "guide" : "guides"}`
      : "No guides found. Try a provider name or “sync”."
    : "";
  if (query) document.querySelector(".help-navigation").open = true;
});
document.addEventListener("keydown", (event) => {
  if (event.target.id !== "help-search") return;
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#help-navigation a:not([hidden])")?.click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.target.value = "";
    event.target.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-help-section]");
  if (!button) return;
  const heading = document.getElementById(
    `help-section-${button.dataset.helpSection}`,
  );
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: "start" });
});
