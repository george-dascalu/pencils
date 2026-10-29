import { Marked } from "/vendor/marked.js";
import DOMPurify from "/vendor/purify.js";
import { katex, markedFootnote } from "/vendor/editor/deps.js";
import { resolveDocument, resolveCard, documentSection } from "./document-model.js";
import { listCallouts, listCalloutLabel } from "./document-list-callouts.js";

// A table may keep its columns and scroll sideways instead of fitting the page.
// The choice is an HTML comment on the line before it, invisible elsewhere.
export const TABLE_SCROLL_MARKER = "<!-- table: scroll -->";
const tableLayout = {
  name: "documentTableLayout", level: "block", start: src => src.indexOf("<!--"),
  tokenizer(src) {
    const marker = /^<!--[ \t]*table:[ \t]*scroll[ \t]*-->[ \t]*\n/.exec(src);
    if (!marker) return;
    const table = this.lexer.tokenizer.table(src.slice(marker[0].length));
    if (table) return { type: "documentTableLayout", raw: marker[0] + table.raw, layout: "scroll", tokens: [table] };
  },
  renderer(token) { return `<div class="document-table-scroll">${this.parser.parse(token.tokens)}</div>`; },
};

export function documentMarkdown({ documents, project, esc, icon, cards = () => [], cardHTML }) {
  let depth = 0, sequence = 0;
  const inlineParser = new Marked({ gfm: true, breaks: false });
  // Preview range discovery must not mutate the footnote renderer's state.
  const blockParser = new Marked({ gfm: true, breaks: false });
  blockParser.use({ extensions: [tableLayout, {
    name: "documentMathBlock", level: "block", start: src => src.indexOf("$$"),
    tokenizer(src) {
      const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:[ \t]*\n|$)/.exec(src);
      if (match) return { type: "documentMathBlock", raw: match[0], text: match[1] };
    },
  }] });
  const math = (text, displayMode) => {
    try { return katex.renderToString(text, { output: "mathml", displayMode, throwOnError: false, trust: false, strict: "ignore", maxExpand: 1000 }); }
    catch { return `<code>${esc(text)}</code>`; }
  };
  function makeParser() {
    const parser = new Marked({ gfm: true, breaks: false });
    parser.use(markedFootnote({ prefixId: `document-footnote-${++sequence}-` }));
    parser.use({
    renderer: {
      code(token) {
        // A task query lists cards; the documents view fills it in (see renderTaskQueries).
        if (token.lang?.split(/\s/)[0] === "tasks")
          return `<div class="document-task-query" data-document-task-query data-document-source="${esc(token.raw)}">${esc(token.text)}</div>`;
        if (token.lang?.split(/\s/)[0] === "mermaid")
          return `<pre data-document-diagram data-document-source="${esc(token.raw)}" role="img" aria-label="Mermaid diagram">${esc(token.text)}</pre>`;
        return `<pre><code${token.lang ? ` class="language-${esc(token.lang.split(/\s/)[0])}"` : ""}>${esc(token.text)}</code></pre>`;
      },
      blockquote(token) {
        const callout = /^\[!([\w-]+)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n|$)/.exec(token.text);
        if (!callout) return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>`;
        const title = callout[3] || callout[1].replaceAll("-", " ");
        const body = makeParser().parse(token.text.slice(callout[0].length));
        const heading = inlineParser.parseInline(title);
        return callout[2]
          ? `<details class="document-callout" data-document-callout="${esc(`[!${callout[1]}]${callout[2]}`)}" ${callout[2] === "+" ? "open" : ""}><summary>${heading}</summary>${body}</details>`
          : `<aside class="document-callout" data-document-callout="${esc(`[!${callout[1]}]`)}"><strong>${heading}</strong>${body}</aside>`;
      },
    },
    extensions: [
      tableLayout,
      {
        name: "documentMathBlock", level: "block",
        start: src => src.indexOf("$$"),
        tokenizer(src) {
          const m = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:[ \t]*\n|$)/.exec(src);
          if (m) return { type: "documentMathBlock", raw: m[0], text: m[1] };
        },
        renderer: token => `<div class="document-math" data-document-source="${esc(token.raw)}">${math(token.text, true)}</div>`,
      },
      {
        name: "documentMath", level: "inline", start: src => src.indexOf("$"),
        tokenizer(src) {
          const m = /^\$(?!\s|\$)((?:\\.|[^$\n])+?[^\s$]|\S)\$(?!\d)/.exec(src);
          if (m) return { type: "documentMath", raw: m[0], text: m[1] };
        },
        renderer: token => `<span data-document-source="${esc(token.raw)}">${math(token.text, false)}</span>`,
      },
      {
        name: "documentHighlight", level: "inline", start: src => src.indexOf("=="),
        tokenizer(src) {
          const m = /^==([^=\n](?:[^\n]*?[^=\n])?)==/.exec(src);
          if (m) return { type: "documentHighlight", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
        },
        renderer(token) { return `<mark>${this.parser.parseInline(token.tokens)}</mark>`; },
      },
      {
        name: "documentComment", level: "inline", start: src => src.indexOf("%%"),
        tokenizer(src) {
          const m = /^%%([\s\S]*?)%%/.exec(src);
          if (m) return { type: "documentComment", raw: m[0] };
        },
        renderer: token => `<span hidden data-document-source="${esc(token.raw)}">${esc(token.raw)}</span>`,
      },
      {
        name: "documentWiki", level: "inline", start: src => src.search(/!?\[\[/),
        tokenizer(src) {
          const m = /^(!?)\[\[([^\]\n]+)\]\]/.exec(src);
          if (m) return { type: "documentWiki", raw: m[0], embed: !!m[1], reference: m[2] };
        },
        renderer(token) {
          const [ref, alias] = token.reference.split("|");
          const record = resolveDocument(ref, documents());
          const label = alias || record?.title || ref;
          if (record && token.embed && depth < 3) {
            const fragment = ref.includes("#") ? ref.slice(ref.indexOf("#")) : "";
            depth++;
            try {
              return `<div class="document-transclusion" data-document-source="${esc(token.raw)}"><a href="#" data-document-ref="${esc(ref)}">${esc(label)}</a>${makeParser().parse(documentSection(record.body || "", fragment))}</div>`;
            } finally { depth--; }
          }
          // A card mention ("[[WEB-12]]") becomes a chip once the HTML is sanitised.
          const card = !record && resolveCard(ref, cards());
          if (card) return `<a href="#" data-document-source="${esc(token.raw)}" data-document-ref="${esc(ref)}" data-document-card="${esc(card.id)}" class="document-card-mention">${esc(alias || card.title)}</a>`;
          // Images and sketches (attachments/s-….svg, which reopen in the sketch pad).
          if (token.embed && /^(?:\.\.\/)?attachments\/(?:a-[\w-]+\.(?:png|jpe?g|webp|gif)|s-[\w-]+\.svg)$/i.test(ref)) {
            const file = ref.replace(/^\.\.\//, ""), sketch = /\/s-/.test(file);
            return `<img data-document-source="${esc(token.raw)}" src="/api/projects/${esc(project())}/${esc(file)}" alt="${esc(sketch && label === ref ? "Sketch" : label)}"${sketch ? ` data-document-sketch="${esc(file)}"` : ""}${/^\d{1,4}$/.test(alias || "") ? ` width="${alias}"` : ""}>`;
          }
          return `<a href="#" data-document-source="${esc(token.raw)}" class="${record ? "" : "unresolved-link"}" data-document-ref="${esc(ref)}">${esc(label)}</a>`;
        },
      },
    ],
    });
    return parser;
  }
  function render(text, inline = false) {
    // Footnotes need a complete lexer pass, even for a small live-preview widget.
    const fragment = DOMPurify.sanitize(makeParser().parse(text), {
      RETURN_DOM_FRAGMENT: true,
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ["data-document-sketch", "data-document-ref", "data-document-diagram", "data-document-source", "data-document-callout", "data-document-card", "data-document-task-query"],
      FORBID_TAGS: ["style", "form", "button", "textarea", "select", "option", "iframe", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
    for (const link of fragment.querySelectorAll("a[data-document-card]")) {
      const card = cards().find((t) => t.id === link.dataset.documentCard);
      if (!card || !cardHTML) continue;
      link.setAttribute("aria-label", `Card ${card.key || card.id}: ${link.textContent}`);
      link.innerHTML = cardHTML(card, link.textContent);
    }
    for (const link of fragment.querySelectorAll("a")) {
      const href = link.getAttribute("href") || "";
      link.dataset.documentHref = href;
      if (link.hasAttribute("data-document-ref")) continue;
      if (/^https?:|^mailto:/i.test(href)) {
        link.target = "_blank"; link.rel = "noopener noreferrer";
      } else if (href.startsWith("#")) {
        // Includes footnote anchors and links to headings.
      } else if (/^(?:\.\.\/)?attachments\/a-[\w-]+\.[\w]+$/i.test(href)) {
        link.href = `/api/projects/${project()}/${href.replace(/^\.\.\//, "")}`;
        link.target = "_blank"; link.rel = "noopener noreferrer";
      } else {
        let reference = href;
        try { reference = decodeURIComponent(href); } catch {}
        link.setAttribute("href", "#");
        link.dataset.documentRef = reference;
      }
    }
    for (const img of fragment.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      img.dataset.documentSrc = src;
      if (/^(?:\.\.\/)?attachments\/(?:a-[\w-]+\.(?:png|jpe?g|webp|gif)|s-[\w-]+\.svg)$/i.test(src))
        img.src = `/api/projects/${project()}/${src.replace(/^\.\.\//, "")}`;
      else if (!/^\/api\/projects\/[\w-]+\/attachments\/(?:a-[\w-]+\.(?:png|jpe?g|webp|gif)|s-[\w-]+\.svg)$/i.test(src))
        img.replaceWith(document.createTextNode(`[Image: ${img.alt || src}]`));
    }
    // List callouts ("- ! item"): the item's own line is tinted and its character shows as an icon.
    // The character stays in the mark as hidden text, so editable quotes and callouts that turn
    // this HTML back into Markdown keep it.
    for (const item of fragment.querySelectorAll("li")) {
      const holder = item.firstElementChild?.tagName === "P" ? item.firstElementChild : item;
      let text = holder.firstChild;
      if (text?.nodeName === "INPUT") text = text.nextSibling;
      const match = text?.nodeType === Node.TEXT_NODE && /^\s*([!?&~@$%])\s/.exec(text.data);
      const callout = match && listCallouts.find((c) => c.char === match[1]);
      if (!callout) continue;
      const checkbox = text.previousSibling?.nodeName === "INPUT" ? text.previousSibling : null;
      if (checkbox) checkbox.setAttribute("aria-label", listCalloutLabel(`${match[1]} ${item.textContent.slice(item.textContent.indexOf(match[1]) + 1).trim()}`));
      text.data = text.data.slice(match[0].length - 1);
      item.dataset.listCallout = callout.name;
      let line = holder;
      if (holder === item) {
        line = document.createElement("span");
        while (item.firstChild && !/^(UL|OL)$/.test(item.firstChild.nodeName)) line.append(item.firstChild);
        item.prepend(line);
      }
      line.classList.add("document-list-callout");
      const mark = document.createElement("span");
      mark.className = "document-list-callout-mark";
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", callout.label);
      mark.innerHTML = `${icon ? icon(callout.icon) : ""}<span class="document-list-callout-char">${esc(callout.char)}</span>`;
      text.before(mark);
    }
    for (const input of fragment.querySelectorAll("input")) {
      if (input.type !== "checkbox") { input.remove(); continue; }
      input.disabled = true; input.removeAttribute("name"); input.removeAttribute("id");
      if (!input.hasAttribute("aria-label")) input.setAttribute("aria-label", input.closest("li")?.textContent?.trim() || "Checklist item");
    }
    const element = document.createElement("div"); element.append(fragment);
    if (inline && element.firstElementChild?.tagName === "P" && element.children.length === 1)
      return element.firstElementChild.innerHTML;
    return element.innerHTML;
  }
  return { render, tokens: text => blockParser.lexer(text) };
}
