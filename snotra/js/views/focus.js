// Snotra - Focus: deep work timer bound to tasks, distraction parking, session log,
// plus the workday clock (clock in/out - lighter than a focus block).
import * as store from '../store.js';
import { escapeHtml, minutesToHM, todayYmd } from '../utils.js';
import { navigate, renderApp, toast, currentRoute, showModal, closeModal } from '../app.js';

const PRESETS = [
  { key: 'pomodoro', name: 'Pomodoro', min: 25, sub: '25 min · quick wins' },
  { key: 'flow', name: 'Flow', min: 50, sub: '50 min · solid block' },
  { key: 'deep', name: 'Deep Work', min: 90, sub: '90 min · Newport mode' },
  { key: 'monk', name: 'Monk Mode', min: 180, sub: '3 h · the full ritual' },
];
let chosenPreset = 'deep';
let chosenTaskId = null;

export function startFocusOnTask(taskId) {
  chosenTaskId = taskId;
  navigate('focus');
}

export function renderFocus(el) {
  const f = store.get().focus;
  el.innerHTML = `<div class="focus-hero">${f ? runningHtml() : setupHtml()}</div>`;
  if (f) wireRunning(el); else wireSetup(el);
}

// ---------- setup ----------
function setupHtml() {
  const s = store.get().settings;
  const t = todayYmd();
  const focusMin = store.focusMinOn(t);
  const streak = store.focusStreak();
  const candidates = store.get().tasks
    .filter(x => x.status !== 'done')
    .sort((a, b) => (a.scheduled === t ? -1 : 0) - (b.scheduled === t ? -1 : 0) || store.prioRank(a) - store.prioRank(b))
    .slice(0, 30);
  const sessionsToday = store.get().sessions.filter(x => x.endedAt >= new Date(t + 'T00:00').getTime());

  return `
    <h1 style="margin:8px 0 4px">Deep Work</h1>
    <p class="muted" style="margin-top:0">One task. One block. Nothing else. <span class="faint">Phone in the bag - you know the ritual.</span></p>

    <div class="focus-presets">
      ${PRESETS.map(p => `<div class="preset ${p.key === chosenPreset ? 'active' : ''}" data-preset="${p.key}">
        <div class="p-name">${p.name}</div><div class="p-sub">${p.sub}</div></div>`).join('')}
    </div>

    <div style="max-width:440px;margin:0 auto">
      <select id="fc-task" style="width:100%">
        <option value="">- no specific task (general deep work) -</option>
        ${candidates.map(x => `<option value="${x.id}" ${x.id === chosenTaskId ? 'selected' : ''}>${x.scheduled === t ? '☀ ' : ''}${escapeHtml(x.title)}</option>`).join('')}
      </select>
      <button class="btn primary" id="fc-start" style="width:100%;margin-top:12px;padding:13px;font-size:15px">▶ Start ${PRESETS.find(p => p.key === chosenPreset).min} min block</button>
    </div>

    <div class="focus-stats-row">
      <div><b>${minutesToHM(focusMin)}</b>deep today · goal ${minutesToHM(s.focusGoalMin)}</div>
      <div><b>${sessionsToday.length}</b>sessions today</div>
      <div><b>${streak > 0 ? '🔥 ' + streak : '0'}</b>day streak</div>
      <div><b>${minutesToHM(weekFocus())}</b>this week</div>
    </div>

    ${workdayCard()}

    ${sessionsToday.length ? `
    <div class="card" style="max-width:520px;margin:26px auto 0;text-align:left">
      <h2>Today's sessions <span class="help" data-help="Every deep-work block you ran today. Rate a session (1-10) and jot a line about how it went - future you learns from it.">?</span></h2>
      ${sessionsToday.map(x => {
        const task = x.taskId ? store.task(x.taskId) : null;
        return `<div class="tlm-row">
          <span class="tlm-time">${new Date(x.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="tlm-title">${task ? escapeHtml(task.title) : 'General deep work'}${x.note ? `<span class="faint" style="display:block;font-size:11px">${escapeHtml(x.note)}</span>` : ''}</span>
          <span class="tlm-kind">${minutesToHM(x.minutes)}${x.completed ? '' : ' · stopped early'}${x.distractions ? ` · ${x.distractions} parked` : ''}${x.rating ? ` · ★ ${x.rating}/10` : ''}</span>
          <button class="icon-btn" data-rate="${x.id}" title="Rate this session">${x.rating ? '✎' : '★'}</button>
        </div>`;
      }).join('')}
    </div>` : ''}`;
}

// ---------- workday clock ----------
function workdayCard() {
  const t = todayYmd();
  const active = store.activeWork();
  const blocks = store.workBlocksOn(t);
  const fmt = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const spans = blocks.map(w => `${fmt(w.from)}-${w.endedAt ? fmt(w.to) : 'now'}`).join(' · ');
  return `
    <div class="card workday ${active ? 'on' : ''}" style="max-width:520px;margin:26px auto 0;text-align:left">
      <h2>Workday <span class="help" data-help="Lighter than a focus block: clock in when you start working, clock out for lunch or when you stop. Snotra adds up your real working hours for the day - no timer to babysit.">?</span>
        <span class="spacer"></span>
        <span class="mono ${active ? 'work-live' : 'faint'}" id="wk-total" style="font-size:12px">${minutesToHM(store.workMinOn(t))} worked</span>
      </h2>
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn ${active ? '' : 'primary'}" id="wk-toggle">${active ? '⏹ Clock out' : '⏵ Clock in'}</button>
        <span class="faint mono" style="font-size:11.5px">${spans || 'Not clocked in yet today'}</span>
      </div>
    </div>`;
}

// ---------- session rating ----------
export function openRateModal(sessionId) {
  const sRec = store.get().sessions.find(x => x.id === sessionId);
  if (!sRec) return;
  const box = showModal(`
    <h2>How did that session go?</h2>
    <p class="muted" style="font-size:12.5px">Optional - a 10-second log that compounds. Rate the quality of the work, not the mood.</p>
    <div class="rate-row" id="rr">${Array.from({ length: 10 }, (_, i) => `<button class="rate-pip ${sRec.rating === i + 1 ? 'active' : ''}" data-r="${i + 1}">${i + 1}</button>`).join('')}</div>
    <label style="display:block;margin-top:12px">Notes (what worked, what pulled at you?)
      <textarea id="rt-note" rows="3" style="width:100%" placeholder="e.g. Great flow after the first 15 min. Phone out of the room helped.">${escapeHtml(sRec.note || '')}</textarea></label>
    <div class="modal-foot">
      <span class="spacer"></span>
      <button class="btn" id="rt-skip">Skip</button>
      <button class="btn primary" id="rt-save">Save</button>
    </div>`);
  let chosen = sRec.rating || null;
  box.querySelectorAll('.rate-pip').forEach(b => b.onclick = () => {
    chosen = Number(b.dataset.r);
    box.querySelectorAll('.rate-pip').forEach(x => x.classList.toggle('active', Number(x.dataset.r) === chosen));
  });
  box.querySelector('#rt-skip').onclick = closeModal;
  box.querySelector('#rt-save').onclick = () => {
    store.rateSession(sessionId, chosen, box.querySelector('#rt-note').value);
    closeModal(); renderApp();
    toast('Session logged' + (chosen ? `: ★ ${chosen}/10` : ''), 'success');
  };
}

function wireSetup(el) {
  el.querySelectorAll('[data-preset]').forEach(p => p.onclick = () => {
    chosenPreset = p.dataset.preset; renderFocus(el);
  });
  el.querySelector('#wk-toggle').onclick = () => {
    if (store.activeWork()) {
      store.clockOut();
      toast(`⏹ Clocked out - ${minutesToHM(store.workMinOn(todayYmd()))} worked today`, 'success');
    } else {
      store.clockIn();
      toast('⏵ Clocked in. Go get it.', 'success');
    }
    renderFocus(el);
  };
  el.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => openRateModal(b.dataset.rate));
  const sel = el.querySelector('#fc-task');
  sel.onchange = () => { chosenTaskId = sel.value || null; };
  el.querySelector('#fc-start').onclick = () => {
    const preset = PRESETS.find(p => p.key === chosenPreset);
    store.startFocus({ taskId: sel.value || null, mode: preset.key, plannedMin: preset.min });
    const task = sel.value ? store.task(sel.value) : null;
    if (task && task.status === 'todo') store.updateTask(task.id, { status: 'doing' });
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    renderFocus(el);
  };
}

// ---------- running ----------
function runningHtml() {
  const f = store.get().focus;
  const task = f.taskId ? store.task(f.taskId) : null;
  const elapsed = store.focusElapsedMs();
  const remaining = Math.max(0, f.plannedMin * 60000 - elapsed);
  return `
    <p class="focus-task-label" style="margin-top:40px">${task ? `Focusing on <b>${escapeHtml(task.title)}</b>` : 'General deep work'} · ${PRESETS.find(p => p.key === f.mode)?.name || f.mode}</p>
    <div class="focus-clock ${f.pausedAt ? 'paused' : ''}" id="fc-clock">${clockStr(remaining)}</div>
    <div class="focus-ring"><div id="fc-ring" style="width:${Math.min(100, elapsed / (f.plannedMin * 600))}%"></div></div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="btn" id="fc-pause">${f.pausedAt ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn" id="fc-done">✓ Finish${task ? ' & complete task' : ''}</button>
      <button class="btn ghost" id="fc-abort">Stop early</button>
    </div>
    <div class="park-box">
      <input id="fc-park" placeholder="💭 Distracting thought? Park it here → inbox (↵)" style="width:100%">
      <p class="faint" style="font-size:11.5px;margin-top:6px">Attention residue is real - park it, don't switch. ${f.distractions ? `${f.distractions} parked this session.` : ''}</p>
    </div>`;
}

function wireRunning(el) {
  el.querySelector('#fc-pause').onclick = () => {
    const f = store.get().focus;
    if (f.pausedAt) store.resumeFocus(); else store.pauseFocus();
    renderFocus(el);
  };
  el.querySelector('#fc-done').onclick = () => finishSession(el, true);
  el.querySelector('#fc-abort').onclick = () => finishSession(el, false);
  const park = el.querySelector('#fc-park');
  park.addEventListener('keydown', e => {
    if (e.key === 'Enter' && park.value.trim()) {
      store.addTask({ title: park.value.trim(), inbox: true });
      store.get().focus.distractions++;
      store.save();
      park.value = '';
      toast('Parked → inbox. Back to work. 💪', 'success');
      renderFocus(el);
    }
  });
}

function finishSession(el, completedBlock) {
  const f = store.get().focus;
  const task = f.taskId ? store.task(f.taskId) : null;
  const rec = store.endFocus(completedBlock);
  if (completedBlock && task && task.status !== 'done') {
    if (confirm(`Mark “${task.title}” as done?`)) store.toggleTaskDone(task.id);
  }
  chosenTaskId = null;
  toast(`Session logged: <b>${minutesToHM(rec.minutes)}</b> of deep work`, 'success');
  const s = store.get().settings;
  if (store.focusMinOn(todayYmd()) >= s.focusGoalMin) toast(`🔥 Daily deep-work goal hit (${minutesToHM(s.focusGoalMin)})!`, 'success');
  renderFocus(el);
  if (rec && rec.minutes >= 1) openRateModal(rec.id);
}

function clockStr(ms) {
  const totalS = Math.round(ms / 1000);
  const h = Math.floor(totalS / 3600), m = Math.floor((totalS % 3600) / 60), sec = totalS % 60;
  return (h ? String(h) + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
}

function weekFocus() {
  let sum = 0;
  const t = todayYmd();
  const monday = new Date(t + 'T00:00');
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = monday.getTime();
  store.get().sessions.forEach(s => { if (s.endedAt >= start) sum += s.minutes; });
  return Math.round(sum);
}

// Called every second from app.js - updates running clock, mini timer, tab title,
// and ENDS the session when the block is up (a forgotten timer must never keep counting).
export function focusTick() {
  const f = store.get().focus;
  const mini = document.getElementById('mini-focus');
  if (!f) {
    if (mini) mini.hidden = true;
    if (document.title !== 'Snotra - your unified brain') document.title = 'Snotra - your unified brain';
    // keep the live workday counter fresh on the focus page
    if (currentRoute === 'focus' && store.activeWork()) {
      const wk = document.getElementById('wk-total');
      if (wk) wk.textContent = `${minutesToHM(store.workMinOn(todayYmd()))} worked`;
    }
    return;
  }
  const elapsed = store.focusElapsedMs();
  const remaining = Math.max(0, f.plannedMin * 60000 - elapsed);
  const str = clockStr(remaining);

  mini.hidden = currentRoute === 'focus';
  document.getElementById('mini-focus-time').textContent = str;
  const task = f.taskId ? store.task(f.taskId) : null;
  document.getElementById('mini-focus-task').textContent = task ? task.title : 'deep work';
  document.title = `${str} · Snotra`;

  if (currentRoute === 'focus') {
    const clock = document.getElementById('fc-clock');
    const ring = document.getElementById('fc-ring');
    if (clock) clock.textContent = str;
    if (ring) ring.style.width = Math.min(100, elapsed / (f.plannedMin * 600)) + '%';
  }

  if (remaining === 0 && !f.pausedAt) {
    // Time's up: close the session NOW, crediting exactly the planned block.
    const rec = store.endFocus(true);
    chosenTaskId = null;
    chime();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Snotra - block complete', { body: task ? `“${task.title}” block done (${minutesToHM(rec.minutes)} logged). Take a real break.` : `Deep work block done (${minutesToHM(rec.minutes)} logged). Take a real break.` });
    }
    toast(`⏰ Block complete - <b>${minutesToHM(rec.minutes)}</b> logged. Take a real break.`, 'success');
    renderApp();
    if (currentRoute === 'focus') openRateModal(rec.id);
  }
}

function chime() {
  if (!store.get().settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.start(t0); o.stop(t0 + 0.55);
    });
  } catch (e) { /* audio unavailable */ }
}
