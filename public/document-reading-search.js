// Search rendered text without moving the Markdown editor or changing its source.
export function documentReadingSearch({ form, content, icon }) {
  const bar = document.createElement("div");
  bar.className = "document-reading-search";
  bar.setAttribute("role", "search");
  bar.setAttribute("aria-label", "Search document");
  bar.hidden = true;
  bar.innerHTML = `<input type="search" aria-label="Find in document" placeholder="Find in document…" autocomplete="off" spellcheck="false">
    <span class="document-find-count" role="status" aria-live="polite" aria-atomic="true"></span>
    <div class="document-find-actions">
      <button type="button" class="icon-button document-find-previous" aria-label="Previous match" title="Previous match (Shift+Enter)">${icon("chevron")}</button>
      <button type="button" class="icon-button document-find-next" aria-label="Next match" title="Next match (Enter)">${icon("chevron")}</button>
      <button type="button" class="icon-button document-find-close" aria-label="Close search" title="Close search (Escape)">${icon("close")}</button>
    </div>`;
  form.querySelector(".document-writing").before(bar);
  const input = bar.querySelector("input"), count = bar.querySelector(".document-find-count");
  const previous = bar.querySelector(".document-find-previous"), next = bar.querySelector(".document-find-next");
  let matches = [], selected = -1, limited = false;

  function clearMarks() {
    const parents = new Set();
    for (const mark of content.querySelectorAll("mark.document-find-match")) {
      parents.add(mark.parentNode);
      mark.replaceWith(...mark.childNodes);
    }
    for (const parent of parents) parent.normalize();
    matches = []; selected = -1; limited = false;
  }
  function announce() {
    count.textContent = !input.value ? "" : matches.length ? `${selected + 1} of ${matches.length.toLocaleString()}${limited ? "+" : ""}` : "No matches";
    previous.disabled = next.disabled = !matches.length;
  }
  function select(index, scroll = true) {
    for (const mark of matches[selected] || []) mark.classList.remove("document-find-current");
    selected = matches.length ? (index + matches.length) % matches.length : -1;
    for (const mark of matches[selected] || []) mark.classList.add("document-find-current");
    const mark = matches[selected]?.[0];
    if (mark && scroll) {
      for (let element = mark.parentElement; element && element !== content; element = element.parentElement)
        if (element.tagName === "DETAILS") element.open = true;
      mark.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    }
    announce();
  }
  function update() {
    clearMarks();
    if (!input.value) { announce(); return; }
    // Keep inline formatting in one searchable run, but never join separate
    // paragraphs/cells. Map matches back to text nodes so links remain intact.
    const blocks = [], walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let block = null, node;
    while ((node = walker.nextNode())) {
      const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (parent.closest("script,style,svg,math,.katex,[data-document-diagram],[hidden],[aria-hidden=true]")) continue;
      if (node.nodeType !== Node.TEXT_NODE) {
        if (node.tagName === "BR" && block) block.text += "\n";
        continue;
      }
      if (!node.data) continue;
      const element = parent.closest("p,h1,h2,h3,h4,h5,h6,li,pre,td,th,summary,blockquote,.document-callout,.document-transclusion,.document-page");
      if (!element) continue;
      if (block?.element !== element) {
        block = { element, text: "", nodes: [] }; blocks.push(block);
      }
      const start = block.text.length;
      block.text += node.data;
      block.nodes.push({ node, start, end: block.text.length });
    }
    const pattern = new RegExp(input.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    const ranges = [];
    outer: for (const block of blocks) {
      let cursor = 0;
      for (const match of block.text.matchAll(pattern)) {
        if (ranges.length >= 5000) { limited = true; break outer; }
        const from = match.index, to = from + match[0].length, parts = [];
        while (cursor < block.nodes.length && block.nodes[cursor].end <= from) cursor++;
        for (let i = cursor; i < block.nodes.length && block.nodes[i].start < to; i++) {
          const entry = block.nodes[i];
          if (entry.end > from)
            parts.push({ node: entry.node, from: Math.max(0, from - entry.start), to: Math.min(entry.node.length, to - entry.start) });
        }
        if (parts.length) ranges.push(parts);
      }
    }
    matches = ranges.map(() => []);
    // Work backwards so splitting a text node cannot invalidate earlier offsets.
    for (let i = ranges.length - 1; i >= 0; i--) {
      for (const part of [...ranges[i]].reverse()) {
        part.node.splitText(part.to);
        const text = part.node.splitText(part.from), mark = document.createElement("mark");
        mark.className = "document-find-match";
        text.replaceWith(mark); mark.append(text); matches[i].unshift(mark);
      }
    }
    select(0);
  }
  function close(focus = false) {
    if (bar.hidden) return false;
    clearMarks(); bar.hidden = true;
    if (focus) form.querySelector("[data-document-action=tools]").focus({ preventScroll: true });
    return true;
  }
  bar.addEventListener("input", update);
  bar.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target === input) {
      event.preventDefault(); event.stopPropagation();
      select(selected + (event.shiftKey ? -1 : 1));
    }
  });
  previous.addEventListener("click", () => select(selected - 1));
  next.addEventListener("click", () => select(selected + 1));
  bar.querySelector(".document-find-close").addEventListener("click", () => close(true));
  return {
    open() {
      if (bar.hidden) { bar.hidden = false; update(); }
      input.focus({ preventScroll: true }); input.select();
    },
    close,
    destroy() { close(); bar.remove(); },
  };
}
