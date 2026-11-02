// Hide idle native scrollbars in shared editors/panels, including rounding-only
// overflow at browser zoom. Real scrolling remains native and keeps its bars.
export function installQuietScrollbars() {
  const areas = '.dialog-body, .task-editor-content, .inline-rich, .inline-preview, .markdown-source, .task-relationship-options, .board-comments-list';
  const tracked = new Set(), pending = new Set();let frame;
  const request = el => { if (el) pending.add(el);if (!frame) frame = requestAnimationFrame(paint); };
  function paint() {
    frame = null;
    for (const el of tracked) if (!el.isConnected) { resize.unobserve(el);tracked.delete(el);pending.delete(el); }
    for (const el of pending) {
      if (!el.isConnected || !el.clientWidth || !el.clientHeight) continue;
      const idle = [el.scrollWidth - el.clientWidth <= 1 && 'x', el.scrollHeight - el.clientHeight <= 1 && 'y'].filter(Boolean).join(' ');
      if (el.getAttribute('data-inert-scrollbars') !== idle) el.setAttribute('data-inert-scrollbars', idle);
    }
    pending.clear();
  }
  const resize = new ResizeObserver(entries => entries.forEach(({target}) => request(target)));
  const add = el => { if (!tracked.has(el)) { tracked.add(el);resize.observe(el);request(el); } };
  const scan = node => { if (!(node instanceof Element)) return;if (node.matches(areas)) add(node);node.querySelectorAll(areas).forEach(add); };
  const mutations = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest('#canvas-world,.cm-editor,.document-reading')) continue;
      request(target?.closest(areas));record.addedNodes.forEach(scan);
    }
  });
  const refresh = () => tracked.forEach(request);
  const loaded = event => request(event.target instanceof Element ? event.target.closest(areas) : null);
  mutations.observe(document.body,{childList:true,subtree:true,characterData:true});scan(document.body);
  window.addEventListener('resize',refresh);window.addEventListener('pencils-appearance',refresh);
  document.fonts?.addEventListener('loadingdone',refresh);document.addEventListener('load',loaded,true);
  return { destroy() { mutations.disconnect();resize.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',refresh);window.removeEventListener('pencils-appearance',refresh);document.fonts?.removeEventListener('loadingdone',refresh);document.removeEventListener('load',loaded,true);tracked.clear();pending.clear(); } };
}
