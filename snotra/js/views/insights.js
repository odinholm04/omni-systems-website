// Snotra — Insights: focus analytics + estimate accuracy. Single-hue charts, direct labels.
import * as store from '../store.js';
import { escapeHtml, todayYmd, addDays, minutesToHM, startOfWeek } from '../utils.js';

export function renderInsights(el) {
  const s = store.get().settings;
  const t = todayYmd();
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const focusByDay = last14.map(d => ({ d, min: store.focusMinOn(d) }));
  const maxMin = Math.max(s.focusGoalMin, ...focusByDay.map(x => x.min), 1);

  const weekStartTs = new Date(startOfWeek(t) + 'T00:00').getTime();
  const sessions = store.get().sessions;
  const weekSessions = sessions.filter(x => x.endedAt >= weekStartTs);
  const weekMin = Math.round(weekSessions.reduce((a, x) => a + x.minutes, 0));
  const prevWeekStart = weekStartTs - 7 * 86400000;
  const prevWeekMin = Math.round(sessions.filter(x => x.endedAt >= prevWeekStart && x.endedAt < weekStartTs).reduce((a, x) => a + x.minutes, 0));
  const delta = prevWeekMin ? Math.round((weekMin - prevWeekMin) / prevWeekMin * 100) : null;

  const doneThisWeek = store.get().tasks.filter(x => x.completedAt && x.completedAt >= weekStartTs);
  const streak = store.focusStreak();

  // time per project (last 14 days)
  const cutoff = new Date(last14[0] + 'T00:00').getTime();
  const byProject = {};
  sessions.filter(x => x.endedAt >= cutoff).forEach(x => {
    const task = x.taskId ? store.task(x.taskId) : null;
    const key = task ? (task.project || 'no project') : 'general';
    byProject[key] = (byProject[key] || 0) + x.minutes;
  });
  const projRows = Object.entries(byProject).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxProj = Math.max(...projRows.map(r => r[1]), 1);

  // estimate accuracy: done tasks having both estimate and logged time
  const estTasks = store.get().tasks.filter(x => x.status === 'done' && x.estimateMin && store.actualMin(x.id) >= 5);
  const accRows = estTasks.slice(-8).reverse();

  // goal alignment: % of logged focus going to tasks linked to quarterly priorities
  const focused = sessions.filter(x => x.endedAt >= cutoff);
  const goalMin = focused.reduce((a, x) => {
    const task = x.taskId ? store.task(x.taskId) : null;
    return a + (task && task.goalPriorityId ? x.minutes : 0);
  }, 0);
  const totalMin = focused.reduce((a, x) => a + x.minutes, 0);
  const goalPct = totalMin ? Math.round(goalMin / totalMin * 100) : 0;

  el.innerHTML = `
  <div class="page-head"><h1>Insights</h1><span class="page-sub">what actually happened — not what you hoped</span></div>

  <div class="stat-tiles">
    <div class="stat-tile accent"><div class="sv">${minutesToHM(weekMin)}</div>
      <div class="sl">deep work this week${delta !== null ? ` · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last week` : ''}</div></div>
    <div class="stat-tile"><div class="sv">${doneThisWeek.length}</div><div class="sl">tasks completed this week</div></div>
    <div class="stat-tile"><div class="sv">${streak > 0 ? '🔥 ' + streak : '0'}</div><div class="sl">days hitting ${minutesToHM(s.focusGoalMin)} goal</div></div>
    <div class="stat-tile"><div class="sv">${goalPct}%</div><div class="sl">of focus aligned to quarterly priorities (14d)</div></div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>Deep work — last 14 days <span class="count">goal ${minutesToHM(s.focusGoalMin)}/day</span></h2>
      <div class="barchart" role="img" aria-label="Deep work minutes per day, last 14 days">
        ${focusByDay.map(x => {
          const hpct = Math.round(x.min / maxMin * 100);
          const hit = x.min >= s.focusGoalMin;
          return `<div class="bar" title="${x.d}: ${minutesToHM(x.min)}">
            <span class="bv">${x.min ? minutesToHM(x.min) : ''}</span>
            <i class="${hit ? 'hit' : ''}" style="height:${Math.max(2, hpct)}%"></i>
            <span class="bl">${x.d.slice(8)}</span></div>`;
        }).join('')}
      </div>
      <p class="faint" style="font-size:11.5px">Amber bars = daily goal hit. Numbers are hours of logged focus sessions.</p>
    </div>

    <div class="card">
      <h2>Where the hours went <span class="count">last 14 days</span></h2>
      ${projRows.length ? projRows.map(([name, min]) => `
        <div class="hbar" title="${escapeHtml(name)}: ${minutesToHM(min)}">
          <span class="hl">${name === 'general' ? 'general deep work' : '@' + escapeHtml(name)}</span>
          <span class="ht"><i style="width:${Math.round(min / maxProj * 100)}%"></i></span>
          <span class="hv">${minutesToHM(Math.round(min))}</span>
        </div>`).join('') : '<div class="empty">Log focus sessions against tasks to see the split.</div>'}
      <h2 style="margin-top:22px">Estimate accuracy</h2>
      ${accRows.length ? accRows.map(x => {
        const act = store.actualMin(x.id);
        const ratio = act / x.estimateMin;
        const col = ratio <= 1.2 ? 'var(--green)' : ratio <= 1.8 ? 'var(--amber)' : 'var(--red)';
        return `<div class="hbar" title="${escapeHtml(x.title)}">
          <span class="hl">${escapeHtml(x.title)}</span>
          <span class="hv" style="width:auto">est ${minutesToHM(x.estimateMin)} → <b style="color:${col}">${minutesToHM(act)}</b></span>
        </div>`;
      }).join('') : '<div class="empty">Complete estimated tasks with logged focus time to calibrate your planning.</div>'}
    </div>
  </div>`;
}
