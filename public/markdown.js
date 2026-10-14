import { markdownSlice } from "./canvas-format.js";
import { Marked } from "/vendor/marked.js";
import DOMPurify from "/vendor/purify.js";

export function createMarkdown({ state, esc }) {
  const parser = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      html(token) {
        return esc(token.text);
      },
    },
  });
  let embedDepth = 0;
  parser.use({
    extensions: [
      {
        name: "wikilink",
        level: "inline",
        start: (src) => src.indexOf("[["),
        tokenizer(src) {
          const match = /^(!?)\[\[([^\]\n]+)\]\]/.exec(src);
          if (match)
            return {
              type: "wikilink",
              raw: match[0],
              embed: !!match[1],
              target: match[2],
            };
        },
        renderer(token) {
          const [ref, label] = token.target.split("|"),
            name = ref.split("#")[0].split("/").pop().replace(/\.md$/, "");
          const task = [...state.tasks, ...(state.overview?.tasks || [])].find(
            (t) =>
              t.id === name ||
              t.title === name ||
              (t.aliases || []).includes(name),
          );
          if (task && token.embed && embedDepth < 2) {
            const fragment = ref.includes("#")
              ? "#" + ref.split("#").slice(1).join("#")
              : "";
            const section = markdownSlice(task.body || "", fragment);
            if (section) {
              embedDepth++;
              try {
                return `<span data-md-source="${esc(token.raw)}" class="note-transclusion"><strong>${esc(label || task.title)}</strong>${parser.parse(section.text)}</span>`;
              } finally {
                embedDepth--;
              }
            }
          }
          if (task)
            return `<button data-md-source="${esc(token.raw)}" type="button" class="text-link" data-action="note-open" data-id="${esc(task.id)}" data-project="${esc(task.project)}">${esc(label || task.title)}</button>`;
          if (
            token.embed &&
            /^attachments\/a-[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp|gif)$/.test(ref)
          )
            return `<img data-md-source="${esc(token.raw)}" src="/api/projects/${esc(state.project.id)}/${esc(ref)}" alt="${esc(label || name)}">`;
          return `<span data-md-source="${esc(token.raw)}" class="unresolved-link" title="Unresolved vault link">${esc(label || ref)}</span>`;
        },
      },
    ],
  });
  return (text) => {
    const fragment = DOMPurify.sanitize(parser.parse(text || ""), {
      RETURN_DOM_FRAGMENT: true,
      ADD_ATTR: ["data-action", "data-id", "data-project"],
      FORBID_TAGS: ["style", "form"],
    });
    for (const link of fragment.querySelectorAll("a")) {
      const href = (link.getAttribute("href") || "").replace(
        /^\.\.\/attachments\//,
        "attachments/",
      );
      link.dataset.mdHref = href;
      if (href.startsWith("attachments/"))
        link.href = `/api/projects/${state.project.id}/${href}`;
      else if (/^https?:/.test(href)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } else if (!href.startsWith("#") && !href.startsWith("mailto:")) {
        let decoded = href;
        try {
          decoded = decodeURI(href);
        } catch {}
        const name = decoded
            .split("/")
            .pop()
            .replace(/\.md(?:#.*)?$/, ""),
          task = state.tasks.find(
            (t) =>
              t.id === name ||
              t.title === name ||
              (t.aliases || []).includes(name),
          );
        if (task) {
          link.removeAttribute("href");
          link.dataset.action = "note-open";
          link.dataset.id = task.id;
          link.dataset.project = task.project;
          link.tabIndex = 0;
        }
      }
    }
    for (const img of fragment.querySelectorAll("img")) {
      const src = (img.getAttribute("src") || "").replace(
        /^\.\.\/attachments\//,
        "attachments/",
      );
      img.dataset.mdSrc = src;
      if (src.startsWith("attachments/"))
        img.src = `/api/projects/${state.project.id}/${src}`;
      else if (!/^\/api\/projects\/[^/]+\/attachments\//.test(src))
        img.replaceWith(document.createTextNode(`[Image: ${img.alt || src}]`));
    }
    const wrapper = document.createElement("div");
    wrapper.append(fragment);
    return wrapper.innerHTML || "<p>Your notes will appear here.</p>";
  };
}
