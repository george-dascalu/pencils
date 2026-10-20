import { Marked } from "/vendor/marked.js";

const parser = new Marked({ gfm: true });
const filePattern = /^a-[a-f0-9-]+\.(png|jpe?g|gif|webp|pdf|txt|md|csv|zip)$/i;
const label = (text) => String(text || "").replace(/\\([\\[\]])/g, "$1");

export function taskAttachmentContent(source, project) {
  const tokens = parser.lexer(source || "");
  const files = new Map(),
    blocks = [];
  function attachment(token) {
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
