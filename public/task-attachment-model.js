import { Marked } from "/vendor/marked.js";

const parser = new Marked({ gfm: true });
const filePattern = /^a-[a-f0-9-]+\.(png|jpe?g|gif|webp|pdf|txt|md|csv|zip)$/i;
const label = (text) => String(text || "").replace(/\\([\\[\]])/g, "$1");

function linkedAttachment(token, project) {
  if (!["link", "image"].includes(token.type)) return null;
  const href = token.href || "";
  const prefix = `/api/projects/${project}/attachments/`;
  const file = href.startsWith(prefix)
    ? href.slice(prefix.length)
    : href.replace(/^(?:\.\.\/)?attachments\//, "");
  if (!filePattern.test(file) || file === href) return null;
  return {
    file,
    name: label(token.text) || file,
    extension: file.split(".").pop().toLowerCase(),
    url: `${prefix}${file}`,
  };
}

export function taskAttachmentContent(source, project) {
  const tokens = parser.lexer(source || "");
  const files = new Map(),
    blocks = [];
  const attachment = (token) => linkedAttachment(token, project);
  parser.walkTokens(tokens, (token) => {
    const value = attachment(token);
    if (value && !files.has(value.file)) files.set(value.file, value);
  });
  const description = tokens
    .map((token) => {
      if (token.type !== "paragraph") return token.raw;
      const parts = token.tokens || [];
      if (
        !parts.some(attachment) ||
        !parts.every(
          (part) =>
            attachment(part) || (part.type === "text" && !part.text.trim()),
        )
      )
        return token.raw;
      // Keep portable Markdown links, including legacy image links and reference links.
      blocks.push(
        parts
          .filter(attachment)
          .map((part) => {
            const value = attachment(part);
            const name = value.name.replace(/[\\[\]]/g, "\\$&");
            return `${part.type === "image" ? "!" : ""}[${name}](../attachments/${value.file})`;
          })
          .join("\n\n"),
      );
      return "";
    })
    .join("");
  return { description, blocks, files: [...files.values()] };
}

export function retainTaskAttachments(edited, original, project) {
  const { blocks } = taskAttachmentContent(original, project);
  return blocks.length
    ? [edited.trimEnd(), ...blocks].filter(Boolean).join("\n\n") + "\n"
    : edited;
}

// Takes every link to one attachment, and its reference, out of the text, leaving code and other
// links as they were; a paragraph left empty goes. The file stays: earlier versions of the card
// still link to it (F0.22-33).
export function removeTaskAttachment(source, project, file) {
  const matches = (token) =>
    linkedAttachment(token.type === "def" ? { ...token, type: "link" } : token, project)?.file === file;
  const children = (token) => [
    ...(token.tokens || []),
    ...(token.items || []),
    ...(token.header || []).flatMap((cell) => cell.tokens || []),
    ...(token.rows || []).flat().flatMap((cell) => cell.tokens || []),
  ];
  return parser
    .lexer(source || "")
    .map((block) => {
      const raw = block.raw;
      let cursor = 0, kept = "", removed = false;
      // Tokens come in reading order, so each one lies after the last; a matched link skips its contents.
      const visit = (token) => {
        const match = matches(token), inner = children(token);
        if (!match && inner.length) return inner.forEach(visit);
        const at = raw.indexOf(token.raw, cursor);
        if (at < 0) return;
        kept += raw.slice(cursor, match ? at : at + token.raw.length);
        cursor = at + token.raw.length;
        removed ||= match;
      };
      visit(block);
      kept += raw.slice(cursor);
      return removed && !kept.trim() ? "" : kept;
    })
    .join("");
}
