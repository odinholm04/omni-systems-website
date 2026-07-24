// Snotra - guided rituals: Plan My Day, Triage Inbox, Shutdown, Weekly Review.
import * as store from '../store.js';
import { escapeHtml, todayYmd, addDays, fmtDate, minutesToHM, startOfWeek, uid, minToTime, timeToMin } from '../utils.js';
import { showModal, closeModal, renderApp, toast } from '../app.js';

// ============ PLAN MY DAY ============
// yesterday's leftovers → pick today's tasks → estimates + capacity → timeblock top task
export function openPlanDay() {
  const t = todayYmd();
  const leftovers = store.overdueTasks();
  if (leftovers.length) planStepLeftovers(leftovers, t);
  else planStepPick(t);
}

function planStepLeftovers(leftovers, t) {
  let idx = 0;
  const step = () => {
    if (idx >= leftovers.length) { planStepPick(t); return; }
    const task = leftovers[idx];
    const box = showModal(`
      ${wsteps(['Leftovers', 'Pick tasks', 'Capacity', 'Timeblock'], 0)}
      <h2>Unfinished: what happens to this?</h2>
      <div class="triage-card" style="padding:10px 0 6px">
        <div class="triage-title">${escapeHtml(task.title)}</div>
        <p class="faint" style="margin-top:-8px">was scheduled ${fmtDate(task.scheduled)}${task.rollovers ? ` · already rolled ${task.rollovers}×` : ''}</p>
        <div class="triage-keys">
          <button class="btn primary" id="pl-today">Today<small>do it today</small></button>
          <button class="btn" id="pl-tmrw">Tomorrow<small>push one day</small></button>
          <button class="btn" id="pl-backlog">Backlog<small>no date</small></button>
          <button class="btn danger" id="pl-drop">Let it go<small>delete</small></button>
        </div>
        <p class="faint" style="font-size:11.5px;margin-top:14px">${idx + 1} of ${leftovers.length} - no silent pile-ups. ${task.rollovers >= 2 ? 'Rolled 3+ times usually means: renegotiate or delete.' : ''}</p>
      </div>`);
    box.querySelector('#pl-today').onclick = () => { store.updateTask(task.id, { scheduled: t, rollovers: (task.rollovers || 0) + 1 }); idx++; step(); };
    box.querySelector('#pl-tmrw').onclick = () => { store.updateTask(task.id, { scheduled: addDays(t, 1), rollovers: (task.rollovers || 0) + 1 }); idx++; step(); };
    box.querySelector('#pl-backlog').onclick = () => { store.updateTask(task.id, { scheduled: null, time: null }); idx++; step(); };
    box.querySelector('#pl-drop').onclick = () => { store.deleteTask(task.id); idx++; step(); };
  };
  step();
}

function planStepPick(t) {
  const candidates = store.get().tasks.filter(x => x.status !== 'done' && x.scheduled !== t);
  const chosen = new Set(store.tasksFor(t).filter(x => x.status !== 'done').map(x => x.id));
  const render = () => {
    const rows = candidates.map(x => `
      <label class="task-row" style="cursor:pointer">
        <input type="checkbox" data-pick="${x.id}" ${chosen.has(x.id) ? 'checked' : ''} style="margin-top:3px">
        <div class="task-main"><div class="task-title">${escapeHtml(x.title)}</div>
        <div class="task-meta">${x.inbox ? '<span class="chip">inbox</span>' : x.scheduled ? `<span class="chip">${fmtDate(x.scheduled)}</span>` : '<span class="chip">backlog</span>'}
        ${x.priority !== 'normal' ? `<span class="chip prio-${x.priority}">${x.priority}</span>` : ''}
        ${x.project ? `<span class="chip project">@${escapeHtml(x.project)}</span>` : ''}</div></div>
      </label>`).join('');
    const box = showModal(`
      ${wsteps(['Leftovers', 'Pick tasks', 'Capacity', 'Timeblock'], 1)}
      <h2>What deserves today?</h2>
      <p class="muted" style="font-size:13px;margin-top:-8px">Already on today: <b>${store.tasksFor(t).filter(x => x.status !== 'done').length}</b> task(s). Add from inbox & backlog - be ambitious, we'll check capacity next.</p>
      <div style="max-height:44vh;overflow-y:auto">${rows || '<div class="empty">Backlog and inbox are empty.</div>'}</div>
      <div class="modal-foot">
        <span class="spacer"></span>
        <button class="btn" id="pl-skip">Cancel</button>
        <button class="btn primary" id="pl-next">Next → estimates</button>
      </div>`);
    box.querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => {
      cb.checked ? chosen.add(cb.dataset.pick) : chosen.delete(cb.dataset.pick);
    });
    box.querySelector('#pl-skip').onclick = closeModal;
    box.querySelector('#pl-next').onclick = () => {
      chosen.forEach(id => store.updateTask(id, { scheduled: t, inbox: false }));
      planStepCapacity(t);
    };
  };
  render();
}

function planStepCapacity(t) {
  const s = store.get().settings;
  const render = () => {
    const tasks = store.tasksFor(t).filter(x => x.status !== 'done');
    const total = tasks.reduce((a, x) => a + (x.estimateMin || 30), 0);
    const capMin = s.capacityHours * 60;
    const over = total > capMin;
    const box = showModal(`
      ${wsteps(['Leftovers', 'Pick tasks', 'Capacity', 'Timeblock'], 2)}
      <h2>Reality check: estimates vs capacity</h2>
      <div class="workload ${over ? 'over' : 'ok'}" style="margin-bottom:12px">
        ${minutesToHM(total)} planned / ${s.capacityHours}h capacity
        ${over ? ' - over! Defer something or shrink estimates.' : ' - fits. 👌'}
      </div>
      ${tasks.map(x => `<div class="task-row" style="cursor:default">
        <div class="task-main"><div class="task-title">${escapeHtml(x.title)}</div></div>
        <select data-est="${x.id}" style="width:96px">
          ${[15, 30, 45, 60, 90, 120, 180, 240].map(m => `<option value="${m}" ${(x.estimateMin || 30) === m ? 'selected' : ''}>${minutesToHM(m)}</option>`).join('')}
        </select>
        <button class="icon-btn" data-defer="${x.id}" title="Move to tomorrow">→</button>
      </div>`).join('')}
      <p class="faint" style="font-size:11.5px">Estimates default to 30m. The → button defers a task to tomorrow.</p>
      <div class="modal-foot">
        <span class="spacer"></span>
        <button class="btn primary" id="pl-next">Next → timeblock</button>
      </div>`);
    box.querySelectorAll('[data-est]').forEach(sel => sel.onchange = () => {
      store.updateTask(sel.dataset.est, { estimateMin: Number(sel.value) }); render();
    });
    box.querySelectorAll('[data-defer]').forEach(b => b.onclick = () => {
      store.updateTask(b.dataset.defer, { scheduled: addDays(t, 1) }); render();
    });
    box.querySelector('#pl-next').onclick = () => planStepTimeblock(t);
  };
  render();
}

function planStepTimeblock(t) {
  const s = store.get().settings;
  const tasks = store.tasksFor(t).filter(x => x.status !== 'done').sort((a, b) => store.prioRank(a) - store.prioRank(b));
  const top = tasks[0];
  const existingDeep = store.eventsFor(t).some(e => e.kind === 'deepwork');
  const defStart = minToTime(Math.max(timeToMin(s.dayStart), (new Date().getHours() + 1) * 60));
  const box = showModal(`
    ${wsteps(['Leftovers', 'Pick tasks', 'Capacity', 'Timeblock'], 3)}
    <h2>Protect the deep work</h2>
    ${top && !existingDeep ? `
      <p class="muted" style="font-size:13.5px">Your top task today is <b>${escapeHtml(top.title)}</b>. Give it a protected block:</p>
      <div class="form-row">
        <label>Start<input type="time" id="pl-bstart" value="${defStart}"></label>
        <label>Length<select id="pl-blen">
          <option value="90">90 min</option><option value="120">2 h</option><option value="180" selected>3 h</option>
        </select></label>
      </div>` : `<p class="muted">${existingDeep ? 'Deep work block already scheduled today. 💪' : 'No tasks today - enjoy the calm or capture something with Q.'}</p>`}
    <div class="modal-foot">
      <span class="spacer"></span>
      <button class="btn" id="pl-skipblock">${top && !existingDeep ? 'Skip block' : 'Close'}</button>
      ${top && !existingDeep ? '<button class="btn primary" id="pl-finish">Add block & finish</button>' : '<button class="btn primary" id="pl-finish2">Finish planning</button>'}
    </div>`);
  const finish = () => {
    store.day(t).plannedAt = Date.now(); store.save();
    closeModal(); renderApp();
    toast(`Day planned. Ground running, ${escapeHtml(store.get().settings.name)}. ☀`, 'success');
  };
  box.querySelector('#pl-skipblock').onclick = finish;
  const f1 = box.querySelector('#pl-finish');
  if (f1) f1.onclick = () => {
    const start = box.querySelector('#pl-bstart').value || '09:00';
    const len = Number(box.querySelector('#pl-blen').value);
    store.addEvent({ title: `Deep work: ${top.title}`, date: t, start, end: minToTime(timeToMin(start) + len), kind: 'deepwork', taskIds: [top.id] });
    finish();
  };
  const f2 = box.querySelector('#pl-finish2');
  if (f2) f2.onclick = finish;
}

// ============ TRIAGE INBOX ============
export function openTriage() {
  const step = () => {
    const inbox = store.inboxTasks();
    if (!inbox.length) {
      const box = showModal(`<div class="triage-card"><div class="big-check">✓</div>
        <div class="triage-title">Inbox zero</div>
        <p class="muted">Every thought has a home. Beautiful.</p>
        <button class="btn primary" id="tz-close">Done</button></div>`);
      box.querySelector('#tz-close').onclick = () => { closeModal(); renderApp(); };
      return;
    }
    const task = inbox[0];
    const t = todayYmd();
    const box = showModal(`
      <div class="triage-card" style="padding:16px 0 4px">
        <p class="faint mono" style="font-size:11px">INBOX TRIAGE · ${inbox.length} LEFT</p>
        <div class="triage-title">${escapeHtml(task.title)}</div>
        <div class="triage-keys">
          <button class="btn primary" data-k="t">Today<small>press T</small></button>
          <button class="btn" data-k="m">Tomorrow<small>press M</small></button>
          <button class="btn" data-k="w">Next week<small>press W</small></button>
          <button class="btn" data-k="b">Backlog<small>press B</small></button>
          <button class="btn danger" data-k="d">Delete<small>press D</small></button>
        </div>
        <p class="faint" style="font-size:11.5px;margin-top:16px">Decide once, move on. Esc to stop.</p>
      </div>`);
    const act = k => {
      if (k === 't') store.updateTask(task.id, { inbox: false, scheduled: t });
      else if (k === 'm') store.updateTask(task.id, { inbox: false, scheduled: addDays(t, 1) });
      else if (k === 'w') store.updateTask(task.id, { inbox: false, scheduled: addDays(startOfWeek(t), 7) });
      else if (k === 'b') store.updateTask(task.id, { inbox: false });
      else if (k === 'd') store.deleteTask(task.id);
      step();
    };
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => act(b.dataset.k));
    box.onkeydown = e => {
      const k = e.key.toLowerCase();
      if (['t', 'm', 'w', 'b', 'd'].includes(k)) { e.preventDefault(); e.stopPropagation(); act(k); }
    };
    box.tabIndex = -1; box.focus();
  };
  step();
}

// ============ SHUTDOWN RITUAL ============
export function openShutdown() {
  const t = todayYmd();
  const done = store.get().tasks.filter(x => x.status === 'done' && x.completedAt && new Date(x.completedAt).toDateString() === new Date().toDateString());
  const unfinished = store.tasksFor(t).filter(x => x.status !== 'done');
  const focusMin = store.focusMinOn(t);
  const s = store.get().settings;

  const box = showModal(`
    ${wsteps(['Review', 'Tomorrow', 'Brain dump', 'Close'], 0)}
    <h2>Shutdown ritual</h2>
    <div class="grid cols-2" style="margin-bottom:10px">
      <div class="stat-tile"><div class="sv">${done.length}</div><div class="sl">completed today</div></div>
      <div class="stat-tile accent"><div class="sv">${minutesToHM(focusMin)}</div><div class="sl">deep work logged</div></div>
    </div>
    ${done.length ? `<p class="muted" style="font-size:13px">✓ ${done.slice(0, 6).map(x => escapeHtml(x.title)).join(' · ')}${done.length > 6 ? ` +${done.length - 6} more` : ''}</p>` : ''}
    ${unfinished.length ? `<p class="muted" style="font-size:13.5px"><b>${unfinished.length} unfinished</b> - decide their fate now (no silent rollover):</p>
      ${unfinished.map(x => `<div class="task-row" style="cursor:default">
        <div class="task-main"><div class="task-title">${escapeHtml(x.title)}</div></div>
        <select data-fate="${x.id}">
          <option value="tomorrow">→ tomorrow</option>
          <option value="backlog">→ backlog</option>
          <option value="keep">stay on today (overdue)</option>
          <option value="delete">delete</option>
        </select></div>`).join('')}` : '<p style="color:var(--green);font-weight:600">Everything done. Flawless day. 🏆</p>'}
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="sd-next">Next</button></div>`);

  box.querySelector('#sd-next').onclick = () => {
    const fates = [...box.querySelectorAll('[data-fate]')].map(sel => [sel.dataset.fate, sel.value]);
    fates.forEach(([id, fate]) => {
      const task = store.task(id);
      if (fate === 'tomorrow') store.updateTask(id, { scheduled: addDays(t, 1), rollovers: (task.rollovers || 0) + 1 });
      else if (fate === 'backlog') store.updateTask(id, { scheduled: null, time: null });
      else if (fate === 'delete') store.deleteTask(id);
    });
    shutdownStep2(t);
  };
}

function shutdownStep2(t) {
  const tomorrow = addDays(t, 1);
  const tmrwTasks = store.tasksFor(tomorrow).filter(x => x.status !== 'done');
  const backlog = store.backlogTasks().slice(0, 10);
  const box = showModal(`
    ${wsteps(['Review', 'Tomorrow', 'Brain dump', 'Close'], 1)}
    <h2>Set up tomorrow</h2>
    <p class="muted" style="font-size:13px">Already on tomorrow: ${tmrwTasks.length ? tmrwTasks.map(x => `<b>${escapeHtml(x.title)}</b>`).join(' · ') : 'nothing yet'}</p>
    ${backlog.length ? `<p class="muted" style="font-size:13px">Pull from backlog:</p>
      ${backlog.map(x => `<label class="task-row" style="cursor:pointer">
        <input type="checkbox" data-pull="${x.id}" style="margin-top:3px">
        <div class="task-main"><div class="task-title">${escapeHtml(x.title)}</div></div></label>`).join('')}` : ''}
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="sd-next">Next</button></div>`);
  box.querySelector('#sd-next').onclick = () => {
    box.querySelectorAll('[data-pull]:checked').forEach(cb => store.updateTask(cb.dataset.pull, { scheduled: tomorrow }));
    shutdownStep3(t);
  };
}

function shutdownStep3(t) {
  const box = showModal(`
    ${wsteps(['Review', 'Tomorrow', 'Brain dump', 'Close'], 2)}
    <h2>Brain dump</h2>
    <p class="muted" style="font-size:13px">Any loose thoughts? Out of your head, into the system. One per line - each becomes an inbox task.</p>
    <textarea id="sd-dump" rows="4" style="width:100%" placeholder="call the accountant&#10;idea: portal dark mode&#10;book gym slot"></textarea>
    <p class="muted" style="font-size:13px;margin-top:12px">One line about today (goes in your daily note):</p>
    <input id="sd-reflect" style="width:100%" placeholder="What worked? What drained you?">
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="sd-next">Close the day</button></div>`);
  box.querySelector('#sd-dump').focus();
  box.querySelector('#sd-next').onclick = () => {
    const lines = box.querySelector('#sd-dump').value.split('\n').map(x => x.trim()).filter(Boolean);
    lines.forEach(l => store.addTask({ title: l, inbox: true }));
    const reflection = box.querySelector('#sd-reflect').value.trim();
    const day = store.day(t);
    day.shutdownAt = Date.now();
    day.reflection = reflection;
    // write the daily note
    const done = store.get().tasks.filter(x => x.status === 'done' && x.completedAt && new Date(x.completedAt).toDateString() === new Date().toDateString());
    const n = store.dailyNote(t, true);
    const body = [
      `# Daily - ${t}`, '',
      `**Deep work:** ${minutesToHM(store.focusMinOn(t))}`,
      `**Completed (${done.length}):**`,
      ...done.map(x => `- [x] ${x.title}`),
      '', reflection ? `**Reflection:** ${reflection}` : '',
    ].filter(x => x !== null).join('\n');
    store.updateNote(n.id, { body });
    store.save();
    shutdownStep4(lines.length);
  };
}

function shutdownStep4(dumped) {
  const s = store.get().settings;
  const box = showModal(`
    ${wsteps(['Review', 'Tomorrow', 'Brain dump', 'Close'], 3)}
    <div style="text-align:center;padding:12px 0">
      <div class="big-check">✓</div>
      <p class="muted">Day reviewed · tomorrow set · ${dumped ? dumped + ' thought(s) captured · ' : ''}daily note written.</p>
      <p class="muted" style="font-size:13px">Say it out loud:</p>
      <div class="shutdown-phrase">“${escapeHtml(s.shutdownPhrase)}”</div>
      <p class="faint" style="font-size:12px">Work is over. Attention residue ends here.</p>
      <button class="btn primary" id="sd-done" style="margin-top:14px;padding:12px 30px">Done for the day</button>
    </div>`);
  box.querySelector('#sd-done').onclick = () => { closeModal(); renderApp(); };
}

// ============ WEEKLY REVIEW ============
export function openWeeklyReview() {
  const t = todayYmd();
  const monday = startOfWeek(t);
  const wk = store.week(monday);
  const weekStartTs = new Date(monday + 'T00:00').getTime();
  const doneThisWeek = store.get().tasks.filter(x => x.completedAt && x.completedAt >= weekStartTs);
  const focusMin = Array.from({ length: 7 }, (_, i) => store.focusMinOn(addDays(monday, i))).reduce((a, b) => a + b, 0);
  const g = store.currentQuarterGoal(true);
  const sessions = store.get().sessions.filter(x => x.endedAt >= weekStartTs);
  const goalAligned = sessions.reduce((a, x) => {
    const task = x.taskId ? store.task(x.taskId) : null;
    return a + (task && task.goalPriorityId ? x.minutes : 0);
  }, 0);
  const totalFocus = sessions.reduce((a, x) => a + x.minutes, 0) || 1;

  const box = showModal(`
    ${wsteps(['The week', 'Reflect', 'Next week'], 0)}
    <h2>Weekly review - week of ${fmtDate(monday)}</h2>
    <div class="stat-tiles" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-tile"><div class="sv">${doneThisWeek.length}</div><div class="sl">tasks completed</div></div>
      <div class="stat-tile accent"><div class="sv">${minutesToHM(focusMin)}</div><div class="sl">deep work</div></div>
      <div class="stat-tile"><div class="sv">${Math.round(goalAligned / totalFocus * 100)}%</div><div class="sl">focus on quarterly priorities</div></div>
    </div>
    ${g.priorities.length ? `<p class="muted" style="font-size:13px"><b>Q${g.quarter} priorities:</b></p>
      ${g.priorities.map(p => {
        const linked = store.get().tasks.filter(x => x.goalPriorityId === p.id);
        const dn = linked.filter(x => x.status === 'done').length;
        return `<div class="hbar"><span class="hl">${p.done ? '✓ ' : ''}${escapeHtml(p.title || 'untitled')}</span>
          <span class="ht"><i style="width:${linked.length ? Math.round(dn / linked.length * 100) : 0}%"></i></span>
          <span class="hv">${dn}/${linked.length}</span></div>`;
      }).join('')}` : `<p class="faint" style="font-size:13px">No quarterly priorities set - add them under Goals (6) so weekly reviews can track alignment.</p>`}
    <p class="muted" style="font-size:13px;margin-top:8px">Objectives you set for this week:</p>
    ${wk.objectives.length ? wk.objectives.map(o => `
      <label class="task-row" style="cursor:pointer"><input type="checkbox" data-obj="${o.id}" ${o.done ? 'checked' : ''} style="margin-top:3px">
      <div class="task-main"><div class="task-title" style="${o.done ? 'text-decoration:line-through;color:var(--faint)' : ''}">${escapeHtml(o.title)}</div></div></label>`).join('')
      : '<p class="faint" style="font-size:12.5px">None set last week.</p>'}
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="wr-next">Next → reflect</button></div>`);

  box.querySelectorAll('[data-obj]').forEach(cb => cb.onchange = () => {
    const o = wk.objectives.find(x => x.id === cb.dataset.obj);
    o.done = cb.checked; store.save();
  });
  box.querySelector('#wr-next').onclick = () => weeklyStep2(monday);
}

function weeklyStep2(monday) {
  const wk = store.week(monday);
  const box = showModal(`
    ${wsteps(['The week', 'Reflect', 'Next week'], 1)}
    <h2>Reflect</h2>
    <p class="muted" style="font-size:13px">Wins, time sinks, lessons. Honest beats pretty.</p>
    <textarea id="wr-reflect" rows="6" style="width:100%" placeholder="Wins:&#10;&#10;Time sinks:&#10;&#10;Change next week:">${escapeHtml(wk.reflection || '')}</textarea>
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="wr-next">Next → plan the week</button></div>`);
  box.querySelector('#wr-next').onclick = () => {
    wk.reflection = box.querySelector('#wr-reflect').value;
    store.save();
    weeklyStep3(monday);
  };
}

function weeklyStep3(monday) {
  const nextMonday = addDays(monday, 7);
  const nwk = store.week(nextMonday);
  const box = showModal(`
    ${wsteps(['The week', 'Reflect', 'Next week'], 2)}
    <h2>Objectives for next week</h2>
    <p class="muted" style="font-size:13px">3–5 outcomes, not a task list. What would make next week a win?</p>
    <textarea id="wr-obj" rows="5" style="width:100%" placeholder="one per line…">${escapeHtml(nwk.objectives.map(o => o.title).join('\n'))}</textarea>
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="wr-done">Finish review</button></div>`);
  box.querySelector('#wr-done').onclick = () => {
    const titles = box.querySelector('#wr-obj').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 5);
    nwk.objectives = titles.map(title => {
      const existing = nwk.objectives.find(o => o.title === title);
      return existing || { id: uid(), title, done: false };
    });
    store.week(monday).reviewedAt = Date.now();
    store.save();
    closeModal(); renderApp();
    toast('Weekly review complete. See you Monday. 🌅', 'success');
  };
}

function wsteps(names, active) {
  return `<div class="wizard-steps">${names.map((n, i) =>
    `<span class="wstep ${i === active ? 'active' : i < active ? 'done' : ''}">${i < active ? '✓ ' : ''}${n}</span>`).join('')}</div>`;
}
