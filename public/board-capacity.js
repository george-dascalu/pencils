import { positionPopover } from './popover-position.js';
import { BOARD_LIMITS } from './board-limits.js';

export const BOARD_CAPACITY_TARGET = 80_000;
export function boardCapacityStats(count) {
  const percent = count / BOARD_CAPACITY_TARGET * 100;
  return {
    count,
    label: percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`,
    // The percentage remains honest above the target; the ring stops at one turn.
    progress: Math.min(100, Math.max(0, percent)),
  };
}

export function boardCapacity() {
  function position() {
    const panel = document.querySelector('#board-capacity-info');
    const trigger = document.querySelector('#board-capacity-toggle');
    if (!panel?.matches(':popover-open') || !trigger) return;
    const r = trigger.getBoundingClientRect();
    // To the right of the gauge at the foot of the tool bar; above it in the phone dock.
    const anchor = trigger.closest('.phone-board-dock') ? r : { left: r.right + 10, top: r.top - 10, bottom: r.top - 10 };
    positionPopover(panel, anchor, { width: 220, maxHeight: 100, gap: 10 });
  }
  // Keep Space/Enter and Escape native instead of invoking canvas shortcuts.
  document.addEventListener('keydown', event => {
    if (event.target.closest('.board-capacity')) event.stopImmediatePropagation();
  }, true);
  window.addEventListener('resize', position);
  return {
    position,
    render(canvas, count, frameCount) {
      const controls = canvas.querySelector('.board-controls');
      if (!controls) return;
      if (!controls.querySelector('.board-capacity')) {
        controls.querySelector('[data-board-menu="zoom"]').insertAdjacentHTML('beforebegin', `<div class="board-capacity"><button type="button" class="icon-button board-capacity-toggle" id="board-capacity-toggle" popovertarget="board-capacity-info" aria-controls="board-capacity-info" aria-expanded="false" title="Board capacity"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="capacity-track" cx="18" cy="18" r="15.5"/><circle class="capacity-progress" cx="18" cy="18" r="15.5" pathLength="100"/></svg><span class="capacity-percent" aria-hidden="true"></span></button><div class="board-capacity-info canvas-panel" id="board-capacity-info" popover="auto" role="note"><strong class="capacity-count"></strong><strong class="capacity-frame-count"></strong></div></div>`);
        const panel = controls.querySelector('#board-capacity-info');
        panel.addEventListener('toggle', () => {
          controls.querySelector('#board-capacity-toggle').setAttribute('aria-expanded', String(panel.matches(':popover-open')));
          position();
        });
      }
      const gauge = controls.querySelector('.board-capacity');
      if (gauge.dataset.count !== String(count) || gauge.dataset.frameCount !== String(frameCount)) {
        const stats = boardCapacityStats(count);
        const summary = `${count.toLocaleString('en-GB')} / ${BOARD_CAPACITY_TARGET.toLocaleString('en-GB')} objects`;
        const frameSummary = `${frameCount.toLocaleString('en-GB')} / ${BOARD_LIMITS.frames.toLocaleString('en-GB')} frames`;
        gauge.dataset.count = String(count);
        gauge.dataset.frameCount = String(frameCount);
        gauge.querySelector('.capacity-percent').textContent = stats.label;
        gauge.querySelector('.capacity-progress').style.strokeDasharray = `${stats.progress} 100`;
        gauge.querySelector('.capacity-count').textContent = summary;
        gauge.querySelector('.capacity-frame-count').textContent = frameSummary;
        gauge.querySelector('button').setAttribute('aria-label', `Board capacity: ${summary}, ${stats.label}; ${frameSummary}. Show object and frame counts`);
      }
      position();
    },
  };
}
