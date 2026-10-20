import mermaid from "mermaid";
mermaid.initialize({
  startOnLoad: false, securityLevel: "strict",
  theme: "neutral", fontFamily: "sans-serif",
  maxTextSize: 30000, suppressErrorRendering: true,
});
let nextId = 0;
export async function renderDiagrams(element) {
  for (const block of element.querySelectorAll("[data-document-diagram]:not([data-rendered])")) {
    block.dataset.rendered = "pending";
    const source = block.textContent;
    try {
      const { svg } = await mermaid.render(`document-diagram-${++nextId}`, source);
      if (!block.isConnected) continue;
      block.innerHTML = svg;
      block.dataset.rendered = "true";
    } catch {
      block.textContent = source;
      block.dataset.rendered = "error";
      block.setAttribute("aria-label", "Diagram could not be rendered. Edit its Mermaid source.");
    }
  }
}
