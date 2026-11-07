import { sourceReadOnly } from "./source-model.js";
import { calendarTimeSelection, hourlySegments, minuteTime } from './calendar-time.js';
import { shiftDate, isWeekend } from './timeline-dates.js';
import { taskFieldColor, taskColorAttributes, fieldBoxStyle } from './task-colors.js';

export function calendarHoursHTML(tasks, days, { state, esc, assigneeHTML, priorityHTML, statusNames }) {
  const segments = hourlySegments(tasks, days);
  const fields = task => `<span class="calendar-event-fields field-box" ${fieldBoxStyle(state, task.priority)}><span class="calendar-event-assignee" title="${esc(task.assignee || 'Unassigned')}">${assigneeHTML(task)}</span><span class="field-chip field-chip-status" ${taskColorAttributes(state,'status',task.status)} title="${esc(statusNames[task.status] || task.status)}">${esc(statusNames[task.status] || task.status)}</span>${priorityHTML(task)}</span>`;
  const grip = (s, end) => {
    const edge = end === 'start' ? s.task.start === s.day : s.task.due === s.day || (s.task.due_time === '00:00' && s.task.due === shiftDate(s.day, 1));
    return edge && !sourceReadOnly(s.task,"due") ? `<button type="button" class="calendar-time-resize" data-calendar-time-end="${end}" aria-label="Adjust ${end === 'start' ? 'start' : 'end'} time for ${esc(s.task.title)}" title="Drag across days to resize; Up/Down adjusts time, Left/Right changes day; click to edit dates"></button>` : '';
  };
  return `<div class="calendar-hours-scroll"><div class="calendar-hours" style="--calendar-columns:${days.length}"><div class="calendar-hour-labels" aria-hidden="true">${Array.from({length:24},(_,hour)=>`<span>${minuteTime(hour*60)}</span>`).join('')}</div>${days.map(day=>`<div class="calendar-hours-day${isWeekend(day)?' weekend':''}" data-calendar-date="${day}">${Array.from({length:24},(_,hour)=>`<button type="button" class="calendar-hour-slot" data-hour="${hour}" aria-label="New card on ${day} at ${minuteTime(hour*60)}"></button>`).join('')}${segments.filter(s=>s.day===day).map(s=>`<div class="calendar-timed-card${state.config.done.includes(s.task.status)?' card-done':''}" data-calendar-card="${esc(s.task.id)}" data-id="${esc(s.task.id)}" style="top:${s.start/1440*100}%;height:${(s.end-s.start)/1440*100}%;left:${s.lane/s.columns*100}%;width:${100/s.columns}%;--task-field-color:${taskFieldColor(state,'status',s.task.status)}"><button type="button" data-action="task-open" data-id="${esc(s.task.id)}" class="calendar-card-title" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight" title="${esc(s.task.title)}, ${minuteTime(s.start)} – ${s.end===1440?'24:00':minuteTime(s.end)}" aria-label="Open ${esc(s.task.title)}, ${minuteTime(s.start)} – ${s.end===1440?'24:00':minuteTime(s.end)}"><strong>${esc(s.task.title)}</strong>${fields(s.task)}<span class="calendar-event-time">${minuteTime(s.start)} – ${s.end===1440?'24:00':minuteTime(s.end)}</span></button>${grip(s,'start')}${grip(s,'due')}</div>`).join('')}</div>`).join('')}</div></div>`;
}

export function calendarHourSelection(ctx) {
  let selection = null, suppressUntil = 0;
  const minutes = (day, y) => { const r = day.getBoundingClientRect(); return (y-r.top)/r.height*1440; };
  function paint() {
    const d=selection;
    if(!d?.active) return;
    if(!d.day.isConnected) return finish(true);
    d.value=calendarTimeSelection(d.day.dataset.calendarDate,d.from,d.to);
    const start=Number(d.value.start_time.slice(0,2))*60+Number(d.value.start_time.slice(3));
    const end=d.value.due!==d.value.start?1440:Number(d.value.due_time.slice(0,2))*60+Number(d.value.due_time.slice(3));
    d.preview ||= d.day.appendChild(Object.assign(document.createElement('div'),{className:'calendar-time-selection'}));
    d.preview.style.top=`${start/1440*100}%`; d.preview.style.height=`${(end-start)/1440*100}%`;
    d.preview.textContent=`${d.value.start_time} – ${end===1440?'24:00':d.value.due_time}`;
  }
  function autoScroll() {
    const d = selection; if (!d?.active) return;
    if (!d.day.isConnected) return finish(true);
    const scroll = d.day.closest('.calendar-hours-scroll'), r = scroll.getBoundingClientRect(), before = scroll.scrollTop;
    if (d.y < r.top + 24) scroll.scrollTop -= 8;
    else if (d.y > r.bottom - 24) scroll.scrollTop += 8;
    if (scroll.scrollTop !== before) { d.to = minutes(d.day, d.y); paint(); }
    d.frame = requestAnimationFrame(autoScroll);
  }
  function finish(cancel=false) {
    const d=selection; if(!d)return;
    selection=null; clearTimeout(d.timer); cancelAnimationFrame(d.frame); d.preview?.remove();
    if(d.slot.hasPointerCapture(d.pointer))d.slot.releasePointerCapture(d.pointer);
    suppressUntil=performance.now()+500;
    if(!cancel && d.day.isConnected) ctx.taskDialog(null,calendarTimeSelection(d.day.dataset.calendarDate,d.from,d.to));
  }
  document.addEventListener('pointerdown',event=>{
    if(selection && event.pointerId!==selection.pointer)return finish(true);
    const slot=event.target.closest('[data-hour]');
    if(!slot || event.button!==0 || ctx.state.view!=='calendar')return;
    const day=slot.closest('.calendar-hours-day'), from=minutes(day,event.clientY);
    const d=selection={slot,day,from,to:from,pointer:event.pointerId,x:event.clientX,y:event.clientY,active:event.pointerType!=='touch'};
    if(d.active){event.preventDefault();slot.setPointerCapture(event.pointerId);paint();autoScroll();}
    else d.timer=setTimeout(()=>{if(selection===d){d.active=true;slot.setPointerCapture(d.pointer);paint();autoScroll();}},350);
  },true);
  document.addEventListener('pointermove',event=>{
    const d=selection;if(!d || d.pointer!==event.pointerId)return;
    if(!d.active && Math.hypot(event.clientX-d.x,event.clientY-d.y)>8)return finish(true);
    if(d.active){event.preventDefault();d.y=event.clientY;d.to=minutes(d.day,event.clientY);paint();}
  },true);
  // Touch scrolling remains native until a held finger starts selecting a range.
  document.addEventListener('touchmove',event=>{if(selection?.active)event.preventDefault();},{passive:false,capture:true});
  document.addEventListener('pointerup',event=>{if(selection?.pointer===event.pointerId)finish();},true);
  document.addEventListener('pointercancel',event=>{if(selection?.pointer===event.pointerId)finish(true);},true);
  document.addEventListener('lostpointercapture',event=>{if(selection?.pointer===event.pointerId && event.target===selection.slot)finish(true);},true);
  document.addEventListener('contextmenu',event=>{if(event.target.closest('.calendar-hours-day'))event.preventDefault();});
  document.addEventListener('keydown',event=>{if(selection&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(true);}},true);
  window.addEventListener('blur',()=>finish(true));
  document.addEventListener('click',event=>{
    const slot=event.target.closest('[data-hour]');if(!slot)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(performance.now()<suppressUntil)return;
    ctx.taskDialog(null,calendarTimeSelection(slot.closest('[data-calendar-date]').dataset.calendarDate,Number(slot.dataset.hour)*60,Number(slot.dataset.hour)*60));
  },true);
}
