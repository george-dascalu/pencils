// Shared visual editor for directed status moves and parent/child rules.
// Real buttons keep the diagram usable by touch and keyboard as well as mouse.
export function ruleDiagram(
  host,
  { id, title, nodes, links, editable, hint, ui, esc, icon, toggle, select },
) {
  if (!nodes.some((n) => n.id === ui.selected)) ui.selected = nodes[0]?.id;
  ui.all ??= links.length <= 12;
  const positions = new Map();
  let height;
  if (id === "hierarchy") {
    // Collapse mutually allowed type groups before laying out levels. Type
    // rules may be cyclic even though actual task ancestry must be acyclic.
    const adjacency = new Map(
      nodes.map((n) => [
        n.id,
        links.filter((e) => e.from === n.id).map((e) => e.to),
      ]),
    );
    const reachable = (start) => {
      const seen = new Set(),
        stack = [start];
      while (stack.length) {
        const n = stack.pop();
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(...(adjacency.get(n) || []));
      }
      return seen;
    };
    const reach = new Map(nodes.map((n) => [n.id, reachable(n.id)]));
    const groups = [],
      assigned = new Map();
    for (const n of nodes) {
      if (assigned.has(n.id)) continue;
      const members = nodes.filter(
        (m) =>
          !assigned.has(m.id) &&
          reach.get(n.id).has(m.id) &&
          reach.get(m.id).has(n.id),
      );
      const index = groups.length;
      groups.push(members);
      members.forEach((m) => assigned.set(m.id, index));
    }
    const levels = new Map();
    function level(group) {
      if (levels.has(group)) return levels.get(group);
      const incoming = links.filter(
        (e) => assigned.get(e.to) === group && assigned.get(e.from) !== group,
      );
      const value = Math.max(
        0,
        ...incoming.map((e) => level(assigned.get(e.from)) + 1),
      );
      levels.set(group, value);
      return value;
    }
    const rows = new Map();
    for (const n of nodes) {
      const l = level(assigned.get(n.id));
      if (!rows.has(l)) rows.set(l, []);
      rows.get(l).push(n);
    }
    let y = 48;
    for (const [, members] of [...rows].sort((a, b) => a[0] - b[0])) {
      members.forEach((n, i) => {
        const count = Math.min(3, members.length - Math.floor(i / 3) * 3);
        positions.set(n.id, {
          x: (710 - (count * 160 + (count - 1) * 75)) / 2 + (i % 3) * 235,
          y: y + Math.floor(i / 3) * 140,
        });
      });
      y += Math.ceil(members.length / 3) * 140;
    }
    height = Math.max(230, y + 20);
  } else {
    nodes.forEach((n, i) =>
      positions.set(n.id, {
        x: 40 + (i % 3) * 235,
        y: 48 + Math.floor(i / 3) * 140,
      }),
    );
    height = Math.max(230, Math.ceil(nodes.length / 3) * 140 + 48);
  }
  const visibleLinks = ui.all
    ? links
    : links.filter((e) => e.from === ui.selected || e.to === ui.selected);
  function path(e) {
    const a = positions.get(e.from),
      b = positions.get(e.to);
    if (e.from === e.to)
      return `M${a.x + 40} ${a.y} C${a.x + 15} ${a.y - 40},${a.x + 145} ${a.y - 40},${a.x + 120} ${a.y}`;
    if (a.y === b.y) {
      const forward = b.x > a.x;
      const ay = a.y + (forward ? 0 : 56),
        by = b.y + (forward ? 0 : 56);
      const bend = (forward ? -1 : 1) * (38 + Math.abs(b.x - a.x) * 0.04);
      return `M${a.x + 80} ${ay} C${a.x + 80} ${ay + bend},${b.x + 80} ${by + bend},${b.x + 80} ${by}`;
    }
    if (id === "hierarchy") {
      const down = b.y > a.y,
        ay = a.y + (down ? 56 : 0),
        by = b.y + (down ? 0 : 56);
      return `M${a.x + 80} ${ay} C${a.x + 80} ${(ay + by) / 2},${b.x + 80} ${(ay + by) / 2},${b.x + 80} ${by}`;
    }
    if (a.x === b.x) {
      const sign = b.y > a.y ? 1 : -1,
        ay = a.y + (sign > 0 ? 56 : 0),
        by = b.y + (sign > 0 ? 0 : 56);
      return `M${a.x + 80} ${ay} C${a.x + 100} ${ay + sign * 44},${b.x + 100} ${by - sign * 44},${b.x + 80} ${by}`;
    }
    const sign = b.x > a.x ? 1 : -1,
      ax = a.x + (sign > 0 ? 160 : 0),
      bx = b.x + (sign > 0 ? 0 : 160);
    return `M${ax} ${a.y + 28} C${ax + sign * 65} ${a.y + 28},${bx - sign * 65} ${b.y + 28},${bx} ${b.y + 28}`;
  }
  const selected = nodes.find((n) => n.id === ui.selected);
  const outgoing = links.filter((e) => e.from === ui.selected);
  host.innerHTML = `<div class="rule-diagram" data-rule-diagram="${id}"><div class="rule-diagram-toolbar"><strong>${esc(title)}</strong><button type="button" class="button small" data-rule-connect aria-pressed="${!!ui.connect}" ${editable ? "" : "disabled"}>${icon("connect")}Connect</button><label><input type="checkbox" data-rule-all ${ui.all ? "checked" : ""}>All links</label></div><p class="field-hint">${esc(hint)} ${ui.connect ? (ui.source ? `Choose a destination for ${esc(nodes.find((n) => n.id === ui.source)?.label || "")}. Press Escape to finish.` : "Choose a source, then another card to add or remove its arrow. Press Escape to finish.") : "Select a card to inspect its connections. Use Connect to edit arrows."}</p><div class="rule-diagram-scroll" tabindex="0" aria-label="${esc(title)} diagram"><div class="rule-diagram-canvas" style="width:710px;height:${height}px"><svg viewBox="0 0 710 ${height}" aria-hidden="true"><defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker></defs>${visibleLinks
    .filter((e) => positions.has(e.from) && positions.has(e.to))
    .map(
      (e) =>
        `<path class="rule-diagram-edge" d="${path(e)}" marker-end="url(#${id}-arrow)"/>`,
    )
    .join("")}</svg>${nodes
    .map((n) => {
      const p = positions.get(n.id);
      return `<button type="button" class="rule-diagram-node ${n.done ? "is-done" : ""}" data-rule-node="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px" aria-pressed="${n.id === ui.selected}" title="${esc(n.label)}">${icon(n.icon || "status")}<span>${esc(n.label)}</span>${n.initial ? "<small>Default</small>" : ""}</button>`;
    })
    .join(
      "",
    )}</div></div><div class="rule-diagram-connections" aria-live="polite"><strong>${esc(selected?.label || "")} →</strong>${outgoing.map((e) => `<button type="button" class="button small" data-rule-remove="${esc(e.to)}" aria-label="Remove ${esc(selected?.label || "")} to ${esc(nodes.find((n) => n.id === e.to)?.label || e.to)}" ${editable ? "" : "disabled"}>${esc(nodes.find((n) => n.id === e.to)?.label || e.to)}${icon("close")}</button>`).join("") || '<span class="field-hint">No outgoing rules</span>'}</div></div>`;
  const repaint = () =>
    ruleDiagram(host, {
      id,
      title,
      nodes,
      links,
      editable,
      hint,
      ui,
      esc,
      icon,
      toggle,
      select,
    });
  host.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-rule-connect")) {
      ui.connect = !ui.connect;
      ui.source = null;
      repaint();
      host.querySelector("[data-rule-connect]")?.focus();
    }
    if (button.hasAttribute("data-rule-node")) {
      const target = button.dataset.ruleNode;
      if (ui.connect && ui.source) {
        const source = ui.source;
        ui.source = null;
        toggle(source, target);
        host.querySelector(`[data-rule-node="${CSS.escape(target)}"]`)?.focus();
      } else {
        ui.selected = target;
        if (ui.connect) ui.source = target;
        select?.(target);
        repaint();
        host.querySelector(`[data-rule-node="${CSS.escape(target)}"]`)?.focus();
      }
    }
    if (button.hasAttribute("data-rule-remove")) {
      toggle(ui.selected, button.dataset.ruleRemove);
      host
        .querySelector(`[data-rule-node="${CSS.escape(ui.selected)}"]`)
        ?.focus();
    }
  };
  host.onchange = (event) => {
    if (event.target.hasAttribute("data-rule-all")) {
      ui.all = event.target.checked;
      repaint();
    }
  };
  host.onkeydown = (event) => {
    if (event.key === "Escape" && ui.connect) {
      event.preventDefault();
      event.stopPropagation();
      ui.connect = false;
      ui.source = null;
      repaint();
      host.querySelector("[data-rule-connect]")?.focus();
    }
  };
}
