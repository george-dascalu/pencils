export function fitAssigneeName(full, short, width, measure) {
  return [full, short].find(name => measure(name) <= width) || Array.from(full)[0] || '';
}

// Measure layout pixels, not the board's transformed screen pixels: zoom must not change names.
export function installAssigneeNames() {
  const selector = '.task-assignee[data-full-name]', names = new Set();
  const pen = document.createElement('canvas').getContext('2d');
  function fit(el, width) {
    if (!el.isConnected || width <= 0 || !el.matches(selector)) return;
    const style = getComputedStyle(el);
    pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = parseFloat(style.letterSpacing) || 0;
    const text = fitAssigneeName(el.dataset.fullName, el.dataset.shortName, width,
      name => pen.measureText(name).width + Math.max(0, Array.from(name).length - 1) * spacing);
    if (el.textContent !== text) el.textContent = text;
  }
  const resize = new ResizeObserver(entries => entries.forEach(({target, contentRect}) => fit(target, contentRect.width)));
  function each(node, action) {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) action(node);
    node.querySelectorAll(selector).forEach(action);
  }
  const add = el => { if (!names.has(el)) { names.add(el); resize.observe(el); } };
  const remove = el => { if (!el.isConnected) { resize.unobserve(el); names.delete(el); } };
  new MutationObserver(records => {
    for (const record of records) {
      record.removedNodes.forEach(node => each(node, remove));
      record.addedNodes.forEach(node => each(node, add));
      // A redraw that patches the page changes kept elements in place (F0.22-41): their name, which
      // it writes back in full, or whether they show one at all (Unassigned).
      const el = record.type === 'characterData' ? record.target.parentElement : record.type === 'attributes' ? record.target : null;
      if (el?.matches(selector)) { names.add(el); resize.unobserve(el); resize.observe(el); }
      else if (el && names.has(el)) { resize.unobserve(el); names.delete(el); }
    }
  }).observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['data-full-name']});
  each(document.body, add);
  const refit = () => names.forEach(el => {
    const style = getComputedStyle(el);
    fit(el, el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  });
  new MutationObserver(refit).observe(document.documentElement, {attributes:true});
  document.fonts.addEventListener('loadingdone', refit);
}
