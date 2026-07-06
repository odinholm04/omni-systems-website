// Snotra — Calendar: month + week (timeblocking) views.
import * as store from '../store.js';
import { escapeHtml, todayYmd, ymd, fromYmd, addDays, startOfWeek, timeToMin, minToTime, minutesToHM, fmtDate } from '../utils.js';
import { renderApp } from '../app.js';
import { openEventModal, openTaskModal } from './modals.js';
import { taskRowHtml, wireTaskRows } from './shared.js';

let mode = 'week';           // month | week
let anchor = todayYmd();     // any date within displayed period

export function renderCalendar(el) {
  el.innerHTML = `
  <div class="page-head">
    <h1>Calendar</h1>
    <div class="page-actions">
      <div class="seg">
        <button class="${mode === 'week' ? 'active' : ''}" data-mode="week">Week</button>
        <button class="${mode === 'month' ? 'active' : ''}" data-mode="month">Month</button>
      </div>
      <button class="btn primary" id="cal-new">+ Event / block</button>
    </div>
  </div>
  <div class="cal-head">
    <button class="btn small" id="cal-prev">←</button>
    <button class="btn small" id="cal-today">Today</button>
    <button class="btn small" id="cal-next">→</button>
    <span class="cal-title" id="cal-title"></span>
    ${mode === 'week' ? '<span class="faint" style="font-size:12px">Drag tasks from the right onto the grid to timeblock them · click an empty slot to add a block</span>' : ''}
  </div>
  <div id="cal-body"></div>`;

  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; renderCalendar(el); });
  el.querySelector('#cal-new').onclick = () => openEventModal(null, { date: anchor });
  el.querySelector('#cal-prev').onclick = () => { anchor = addDays(anchor, mode === 'week' ? -7 : -stepMonth(anchor, -1)); renderCalendar(el); };
  el.querySelector('#cal-next').onclick = () => { anchor = addDays(anchor, mode === 'week' ? 7 : stepMonth(anchor, 1)); renderCalendar(el); };
  el.querySelector('#cal-today').onclick = () => { anchor = todayYmd(); renderCalendar(el); };

  if (mode === 'month') renderMonth(el); else renderWeek(el);
}

function stepMonth(a, dir) {
  const d = fromYmd(a);
  const cur = new Date(d.getFullYear(), d.getMonth() + (dir > 0 ? 1 : 0), 1);
  const prev = new Date(d.getFullYear(), d.getMonth() + (dir > 0 ? 0 : -1), 1);
  return Math.round((cur - prev) / 86400000);
}

// ---------- month ----------
function renderMonth(el) {
  const d = fromYmd(anchor);
  const y = d.getFullYear(), m = d.getMonth();
  el.querySelector('#cal-title').textContent = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const gridStart = addDays(ymd(first), -startOffset);
  const today = todayYmd();

  let html = '<div class="month-grid">';
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(w => html += `<div class="dow">${w}</div>`);
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    const inMonth = date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`;
    const evs = store.eventsFor(date);
    const tasks = store.get().tasks.filter(t => t.scheduled === date);
    const pills = [
      ...evs.map(e => `<div class="pill k-${e.kind}" data-ev="${e.id}">${e.start} ${escapeHtml(e.title)}</div>`),
      ...tasks.map(t => `<div class="pill k-task ${t.status === 'done' ? 'done' : ''}" data-task-pill="${t.id}">◻ ${escapeHtml(t.title)}</div>`),
    ];
    html += `<div class="mday ${inMonth ? '' : 'other'} ${date === today ? 'today' : ''}" data-date="${date}">
      <div class="dnum">${Number(date.slice(8, 10))}</div>
      ${pills.slice(0, 4).join('')}
      ${pills.length > 4 ? `<div class="pill k-task">+${pills.length - 4} more</div>` : ''}
    </div>`;
  }
  html += '</div>';
  el.querySelector('#cal-body').innerHTML = html;

  el.querySelectorAll('.mday').forEach(dEl => dEl.onclick = e => {
    const evEl = e.target.closest('[data-ev]');
    const tEl = e.target.closest('[data-task-pill]');
    if (evEl) { openEventModal(evEl.dataset.ev); return; }
    if (tEl) { openTaskModal(tEl.dataset.taskPill); return; }
    anchor = dEl.dataset.date; mode = 'week'; renderCalendar(el.closest('#view'));
  });
}

// ---------- week ----------
const HOUR_H = 44;
function renderWeek(el) {
  const s = store.get().settings;
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const startHour = Math.max(0, Math.floor((timeToMin(s.dayStart) - 60) / 60));
  const endHour = Math.min(24, Math.ceil((timeToMin(s.dayEnd) + 180) / 60));
  const hours = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const today = todayYmd();

  el.querySelector('#cal-title').textContent =
    `${fromYmd(days[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${fromYmd(days[6]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  let grid = `<div class="week-grid" style="grid-template-rows: 34px repeat(${hours.length}, ${HOUR_H}px)">`;
  grid += `<div></div>`;
  days.forEach(d => {
    const load = store.plannedMin(d);
    const over = load > s.capacityHours * 60;
    grid += `<div class="wg-head ${d === today ? 'today' : ''}">${fromYmd(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
      <span class="wl ${over ? 'over' : ''}">${load ? minutesToHM(load) + ' planned' : ''}</span></div>`;
  });
  hours.forEach((h, ri) => {
    grid += `<div class="wg-timecol" style="grid-row:${ri + 2}">${String(h).padStart(2, '0')}:00</div>`;
    days.forEach((d, ci) => {
      grid += `<div class="wg-cell" data-date="${d}" data-hour="${h}" style="grid-row:${ri + 2};grid-column:${ci + 2}"></div>`;
    });
  });

  // absolute-positioned blocks per day column
  days.forEach((d, ci) => {
    const evs = store.eventsFor(d);
    const timedTasks = store.get().tasks.filter(t => t.scheduled === d && t.time);
    let blocks = '';
    evs.forEach(e => {
      const top = (timeToMin(e.start) - startHour * 60) / 60 * HOUR_H;
      const h = Math.max(20, (timeToMin(e.end) - timeToMin(e.start)) / 60 * HOUR_H - 2);
      const linked = (e.taskIds || []).map(id => store.task(id)).filter(Boolean);
      blocks += `<div class="wg-block k-${e.kind}" data-ev="${e.id}" style="top:${top}px;height:${h}px">
        <span class="t">${e.start}–${e.end}</span>${escapeHtml(e.title)}${linked.length ? `<span class="t">↳ ${escapeHtml(linked[0].title)}</span>` : ''}</div>`;
    });
    timedTasks.forEach(t => {
      const top = (timeToMin(t.time) - startHour * 60) / 60 * HOUR_H;
      const h = Math.max(20, (t.estimateMin || 30) / 60 * HOUR_H - 2);
      const tStart = timeToMin(t.time), tEnd = tStart + (t.estimateMin || 30);
      const overlaps = evs.some(e => timeToMin(e.start) < tEnd && timeToMin(e.end) > tStart);
      blocks += `<div class="wg-block k-task ${t.status === 'done' ? 'done' : ''}" data-task-block="${t.id}" draggable="true" style="top:${top}px;height:${h}px;${overlaps ? 'left:42%;' : ''}${t.status === 'done' ? 'opacity:.5;text-decoration:line-through' : ''}">
        <span class="t">${t.time}${t.estimateMin ? ' · ' + minutesToHM(t.estimateMin) : ''}</span>◻ ${escapeHtml(t.title)}</div>`;
    });
    let now = '';
    if (d === today) {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const top = (nowMin - startHour * 60) / 60 * HOUR_H;
      if (top > 0 && top < hours.length * HOUR_H) now = `<div class="wg-now" style="top:${top}px"></div>`;
    }
    grid += `<div class="wg-col" style="grid-row:2 / span ${hours.length};grid-column:${ci + 2}">${blocks}${now}</div>`;
  });
  grid += '</div>';

  // unscheduled side panel
  const pool = store.get().tasks
    .filter(t => t.status !== 'done' && (!t.time) && (!t.scheduled || t.scheduled >= weekStart))
    .sort((a, b) => store.prioRank(a) - store.prioRank(b)).slice(0, 20);

  el.querySelector('#cal-body').innerHTML = `
    <div class="week-wrap">
      <div class="week-grid-scroll">${grid}</div>
      <div class="week-side">
        <h2 style="font-size:13px;margin:2px 0 10px" class="mono muted">DRAG TO TIMEBLOCK</h2>
        <div id="wk-pool">${pool.map(t => taskRowHtml(t, { draggable: true })).join('') || '<div class="empty">No unblocked tasks.</div>'}</div>
      </div>
    </div>`;

  wireTaskRows(el.querySelector('#wk-pool'));

  el.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => openEventModal(b.dataset.ev));
  el.querySelectorAll('[data-task-block]').forEach(b => {
    b.onclick = () => openTaskModal(b.dataset.taskBlock);
    b.addEventListener('dragstart', e => e.dataTransfer.setData('text/task', b.dataset.taskBlock));
  });
  el.querySelectorAll('.wg-cell').forEach(c => {
    c.onclick = () => openEventModal(null, {
      date: c.dataset.date, kind: 'deepwork',
      start: minToTime(+c.dataset.hour * 60), end: minToTime((+c.dataset.hour + 1) * 60),
    });
    c.addEventListener('dragover', e => { e.preventDefault(); c.classList.add('drop-hint'); });
    c.addEventListener('dragleave', () => c.classList.remove('drop-hint'));
    c.addEventListener('drop', e => {
      e.preventDefault(); c.classList.remove('drop-hint');
      const id = e.dataTransfer.getData('text/task');
      if (!id) return;
      store.updateTask(id, { scheduled: c.dataset.date, time: minToTime(+c.dataset.hour * 60), inbox: false });
      renderApp();
    });
  });
  el.querySelectorAll('#wk-pool .task-row[draggable]').forEach(r => {
    r.addEventListener('dragstart', e => e.dataTransfer.setData('text/task', r.dataset.task));
  });
}
