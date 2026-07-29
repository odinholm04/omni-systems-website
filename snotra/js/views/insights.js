// Snotra - Insights: what actually happened - not what you hoped.
// Sectioned: Work (focus analytics, workday clock, estimates) and
// Physical (the Ultrahuman ring dashboard: sleep, recovery, movement, steps).
import * as store from '../store.js';
import { escapeHtml, todayYmd, addDays, minutesToHM, startOfWeek } from '../utils.js';

let section = 'work'; // work | physical

export function renderInsights(el) {
  el.innerHTML = `
  <div class="page-head"><h1>Insights</h1><span class="page-sub">what actually happened - not what you hoped</span>
    <div class="page-actions">
      <div class="seg">
        <button class="${section === 'work' ? 'active' : ''}" data-sec="work">⚒ Work</button>
        <button class="${section === 'physical' ? 'active' : ''}" data-sec="physical">♥ Physical</button>
      </div>
    </div>
  </div>
  ${section === 'work' ? workHtml() : physicalHtml()}`;
  el.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { section = b.dataset.sec; renderInsights(el); });
}

// ---------- Work ----------
function workHtml() {
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

  // workday clock: hours worked per day (clock in/out), this week
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(t), i)).filter(d => d <= t);
  const workedWeek = weekDays.reduce((a, d) => a + store.workMinOn(d), 0);

  // avg session rating, last 7 days
  const rated = sessions.filter(x => x.rating && x.endedAt >= Date.now() - 7 * 86400000);
  const avgRating = rated.length ? (rated.reduce((a, x) => a + x.rating, 0) / rated.length).toFixed(1) : null;

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

  const estTasks = store.get().tasks.filter(x => x.status === 'done' && x.estimateMin && store.actualMin(x.id) >= 5);
  const accRows = estTasks.slice(-8).reverse();

  return `
  <div class="stat-tiles">
    <div class="stat-tile accent"><div class="sv">${minutesToHM(weekMin)}</div>
      <div class="sl">deep work this week${delta !== null ? ` · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last week` : ''}</div></div>
    <div class="stat-tile"><div class="sv">${minutesToHM(workedWeek)}</div><div class="sl">clocked work this week <span class="help" data-help="Hours between clock in and clock out on the Focus page. Deep work blocks are the sharp end; this is the whole blade.">?</span></div></div>
    <div class="stat-tile"><div class="sv">${doneThisWeek.length}</div><div class="sl">tasks completed this week</div></div>
    <div class="stat-tile"><div class="sv">${avgRating ? '★ ' + avgRating : '-'}</div><div class="sl">avg session rating (7d)</div></div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>Deep work - last 14 days <span class="count">goal ${minutesToHM(s.focusGoalMin)}/day</span></h2>
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

// ---------- Physical (the ring dashboard) ----------
function physicalHtml() {
  const t = todayYmd();
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const metrics = store.get().metrics;
  const today = metrics[t] || {};
  const kind = store.dayKind(t);

  const series = key => last14.map(d => ({ d, v: metrics[d] ? metrics[d][key] : null }));
  const avg7 = key => {
    const vals = last14.slice(-7).map(d => metrics[d]?.[key]).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
  };

  const chart = (key, label, goodAt, fmt = v => v) => {
    const data = series(key);
    const max = Math.max(...data.map(x => x.v || 0), goodAt || 1, 1);
    if (!data.some(x => x.v != null)) return `<div class="empty">No ${label.toLowerCase()} data yet - it lands with each morning's ring sync.</div>`;
    return `<div class="barchart small" role="img" aria-label="${label}, last 14 days">
      ${data.map(x => {
        const pct = x.v != null ? Math.round(x.v / max * 100) : 0;
        const hit = goodAt != null && x.v != null && x.v >= goodAt;
        return `<div class="bar" title="${x.d}: ${x.v != null ? fmt(x.v) : 'no data'}">
          <span class="bv">${x.v != null ? fmt(x.v) : ''}</span>
          <i class="${hit ? 'hit' : ''}" style="height:${Math.max(2, pct)}%"></i>
          <span class="bl">${x.d.slice(8)}</span></div>`;
      }).join('')}
    </div>`;
  };

  const KIND_CHIP = {
    berserker: '<span class="chip" style="color:var(--amber-bright);border-color:rgba(232,163,61,.5)">⚡ Berserker day</span>',
    steady: '<span class="chip">🛡 Steady day</span>',
    healer: '<span class="chip" style="color:var(--green)">🌿 Healer day</span>',
  };

  return `
  <div class="stat-tiles">
    <div class="stat-tile accent"><div class="sv">${today.sleepScore ?? '-'}</div><div class="sl">sleep score today ${today.source === 'ultrahuman' ? '· ◉ ring' : today.source ? '· manual' : ''}</div></div>
    <div class="stat-tile"><div class="sv">${today.sleepHours != null ? today.sleepHours + 'h' : '-'}</div><div class="sl">slept last night · 7d avg ${avg7('sleepHours') ?? '-'}h</div></div>
    <div class="stat-tile"><div class="sv">${today.recoveryIndex ?? '-'}</div><div class="sl">recovery today ${kind ? '· ' + KIND_CHIP[kind] : ''}</div></div>
    <div class="stat-tile"><div class="sv">${today.steps != null ? today.steps.toLocaleString() : '-'}</div><div class="sl">steps today · movement ${today.movementIndex ?? '-'}</div></div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>😴 Sleep score <span class="count">last 14 days · 85+ is a Berserker signal</span></h2>
      ${chart('sleepScore', 'Sleep score', 85)}
      <h2 style="margin-top:22px">🌙 Hours slept</h2>
      ${chart('sleepHours', 'Hours slept', 7.5, v => v + 'h')}
    </div>
    <div class="card">
      <h2>♻ Recovery index <span class="count">75+ Berserker · under 45 Healer</span> <span class="help" data-help="Recovery drives Odin's Counsel on the Today page: it sets whether the day rolls Berserker (1.5x deep-work XP), Steady, or Healer (rest pays extra).">?</span></h2>
      ${chart('recoveryIndex', 'Recovery', 75)}
      <h2 style="margin-top:22px">👣 Steps</h2>
      ${chart('steps', 'Steps', 8000, v => (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : v))}
    </div>
  </div>
  <p class="faint" style="font-size:11.5px;margin-top:12px">Data flows in automatically each morning from your Ultrahuman ring (Settings → Ultrahuman). History builds day by day - give it a week and the trends start talking.</p>`;
}
