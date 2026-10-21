import { Marked } from "/vendor/marked.js";
import DOMPurify from "/vendor/purify.js";
import { katex, markedFootnote } from "/vendor/editor/deps.js";
import { resolveDocument, documentSection } from "./document-model.js";

export function documentMarkdown({ documents, project, esc }) {
  let depth = 0, sequence = 0;
  const inlineParser = new Marked({ gfm: true, breaks: false });
  // Preview range discovery must not mutate the footnote renderer's state.
  const blockParser = new Marked({ gfm: true, breaks: false });
  blockParser.use({ extensions: [{
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
          if (token.embed && /^(?:\.\.\/)?attachments\/a-[\w-]+\.(?:png|jpe?g|webp|gif)$/i.test(ref))
            return `<img data-document-source="${esc(token.raw)}" src="/api/projects/${esc(project())}/${esc(ref.replace(/^\.\.\//, ""))}" alt="${esc(label)}"${/^\d{1,4}$/.test(alias || "") ? ` width="${alias}"` : ""}>`;
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
      ADD_ATTR: ["data-document-ref", "data-document-diagram", "data-document-source", "data-document-callout"],
      FORBID_TAGS: ["style", "form", "button", "textarea", "select", "option", "iframe", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
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
      if (/^(?:\.\.\/)?attachments\/a-[\w-]+\.(?:png|jpe?g|webp|gif)$/i.test(src))
        img.src = `/api/projects/${project()}/${src.replace(/^\.\.\//, "")}`;
      else if (!/^\/api\/projects\/[\w-]+\/attachments\/a-[\w-]+\.(?:png|jpe?g|webp|gif)$/i.test(src))
        img.replaceWith(document.createTextNode(`[Image: ${img.alt || src}]`));
    }
    for (const input of fragment.querySelectorAll("input")) {
      if (input.type !== "checkbox") { input.remove(); continue; }
      input.disabled = true; input.removeAttribute("name"); input.removeAttribute("id");
      input.setAttribute("aria-label", input.closest("li")?.textContent?.trim() || "Checklist item");
    }
    const element = document.createElement("div"); element.append(fragment);
    if (inline && element.firstElementChild?.tagName === "P" && element.children.length === 1)
      return element.firstElementChild.innerHTML;
    return element.innerHTML;
  }
  return { render, tokens: text => blockParser.lexer(text) };
}
