// Mimir — Today: the daily command center.
import * as store from '../store.js';
import { escapeHtml, todayYmd, fmtDate, minutesToHM, timeToMin } from '../utils.js';
import { toast, renderApp } from '../app.js';
import { taskRowHtml, wireTaskRows, KIND_LABEL } from './shared.js';
import { openPlanDay, openShutdown, openTriage } from './wizards.js';
import { openEventModal, openTaskModal } from './modals.js';

export function renderToday(el) {
  const t = todayYmd();
  const s = store.get().settings;
  const day = store.day(t);
  const tasks = store.tasksFor(t);
  const overdue = store.overdueTasks();
  const inbox = store.inboxTasks();
  const events = store.eventsFor(t);
  const focusMin = store.focusMinOn(t);
  const streak = store.focusStreak();
  const doneCount = tasks.filter(x => x.status === 'done').length;
  const plannedMin = store.plannedMin(t);
  const capMin = s.capacityHours * 60;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Night owl' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // schedule (events + timed tasks merged)
  const sched = [
    ...events.map(e => ({ start: e.start, end: e.end, title: e.title, kind: e.kind, ev: e.id, done: false })),
    ...tasks.filter(x => x.time).map(x => ({ start: x.time, end: null, title: x.title, kind: 'task', task: x.id, done: x.status === 'done' })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  el.innerHTML = `
  <div class="page-head">
    <h1>${greeting}, ${escapeHtml(s.name)}</h1>
    <span class="page-sub">${fromDateLong()}</span>
    <div class="page-actions">
      ${!day.plannedAt ? `<button class="btn primary" id="td-plan">☀ Plan my day</button>` : `<button class="btn" id="td-plan">↻ Re-plan</button>`}
      ${!day.shutdownAt ? `<button class="btn" id="td-shutdown">◑ Shutdown</button>` : `<span class="chip" style="color:var(--green)">✓ day closed</span>`}
    </div>
  </div>

  <div class="stat-tiles">
    <div class="stat-tile accent"><div class="sv">${minutesToHM(focusMin)}</div><div class="sl">deep work today · goal ${minutesToHM(s.focusGoalMin)}</div></div>
    <div class="stat-tile"><div class="sv">${doneCount}/${tasks.length}</div><div class="sl">tasks done today</div></div>
    <div class="stat-tile"><div class="sv">${minutesToHM(plannedMin)}</div><div class="sl">planned load · capacity ${s.capacityHours}h ${plannedMin > capMin ? '<span style="color:var(--red)">— over!</span>' : ''}</div></div>
    <div class="stat-tile"><div class="sv">${streak > 0 ? '🔥 ' + streak : '—'}</div><div class="sl">focus-goal streak (days)</div></div>
  </div>

  ${overdue.length ? `<div class="card" style="border-color:rgba(217,123,108,.4);margin-bottom:14px">
    <h2>⚠ Overdue <span class="count">${overdue.length}</span>
      <span class="spacer"></span><button class="btn small" id="td-rollover">Roll all to today</button></h2>
    <div id="td-overdue">${overdue.slice(0, 6).map(x => taskRowHtml(x)).join('')}</div>
  </div>` : ''}

  <div class="today-grid">
    <div class="card">
      <h2>Today's tasks <span class="count">${tasks.length}</span>
        <span class="spacer"></span>
        ${inbox.length ? `<button class="btn small" id="td-triage">Inbox: ${inbox.length} → triage</button>` : ''}
        <button class="btn small" id="td-add">+ Task</button></h2>
      <div id="td-tasks">${tasks.length ? tasks.map(x => taskRowHtml(x, { hideDate: true })).join('') : `<div class="empty">Nothing planned yet. Press <span class="kbd">P</span> to plan your day, or <span class="kbd">Q</span> to capture a task.</div>`}</div>
    </div>

    <div class="card">
      <h2>Schedule <span class="count">${sched.length}</span>
        <span class="spacer"></span><button class="btn small" id="td-block">+ Timeblock</button></h2>
      <div class="timeline-mini">
        ${sched.length ? sched.map(x => `
          <div class="tlm-row" data-sched-ev="${x.ev || ''}" data-sched-task="${x.task || ''}" style="cursor:pointer">
            <span class="tlm-time">${x.start}${x.end ? '–' + x.end : ''}</span>
            <span class="tlm-title ${x.done ? 'faint' : ''}" style="${x.done ? 'text-decoration:line-through' : ''}">${escapeHtml(x.title)}</span>
            <span class="tlm-kind k-${x.kind}-text">${x.kind === 'task' ? 'task' : KIND_LABEL[x.kind].toLowerCase()}</span>
          </div>`).join('') : '<div class="empty">No blocks yet — add a deep work block for your most important task.</div>'}
      </div>
      ${shutdownHint(day, s)}
    </div>
  </div>`;

  wireTaskRows(el);
  el.querySelector('#td-plan').onclick = () => openPlanDay();
  const sd = el.querySelector('#td-shutdown'); if (sd) sd.onclick = () => openShutdown();
  el.querySelector('#td-add').onclick = () => openTaskModalForToday();
  el.querySelector('#td-block').onclick = () => openEventModal(null, { kind: 'deepwork', date: t });
  const tri = el.querySelector('#td-triage'); if (tri) tri.onclick = () => openTriage();
  const roll = el.querySelector('#td-rollover');
  if (roll) roll.onclick = () => {
    overdue.forEach(x => store.updateTask(x.id, { scheduled: t, rollovers: (x.rollovers || 0) + 1 }));
    toast(`${overdue.length} task(s) moved to today`, 'success'); renderApp();
  };
  el.querySelectorAll('[data-sched-ev]').forEach(r => r.onclick = () => {
    if (r.dataset.schedEv) openEventModal(r.dataset.schedEv);
    else if (r.dataset.schedTask) openTaskModal(r.dataset.schedTask);
  });
}

function openTaskModalForToday() {
  const t = store.addTask({ title: '', scheduled: todayYmd(), inbox: false });
  // open editor on the fresh task; delete if left titleless
  openTaskModal(t.id);
  const obs = new MutationObserver(() => {
    if (document.getElementById('modal-overlay').hidden) {
      const task = store.task(t.id);
      if (task && !task.title.trim()) store.deleteTask(t.id);
      obs.disconnect(); renderApp();
    }
  });
  obs.observe(document.getElementById('modal-overlay'), { attributes: true });
}

function shutdownHint(day, s) {
  if (day.shutdownAt) {
    return `<p class="faint" style="font-size:12.5px;margin:14px 0 0">Day closed at ${new Date(day.shutdownAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — “${escapeHtml(s.shutdownPhrase)}”</p>`;
  }
  const end = timeToMin(s.dayEnd);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  if (now >= end) return `<p style="font-size:12.5px;margin:14px 0 0;color:var(--amber-bright)">It's past ${s.dayEnd} — run the shutdown ritual (<span class="kbd">S</span>) and close the day.</p>`;
  return '';
}

function fromDateLong() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
