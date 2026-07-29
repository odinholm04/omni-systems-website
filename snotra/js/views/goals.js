// Snotra - Goals: quarterly outcomes built on the actual science of goal setting.
//   - Specific, challenging outcomes beat vague hopes (Locke & Latham).
//   - A LEAD measure (the weekly action you control) moves the LAG measure (the result).
//   - Naming the obstacle and an if-then plan doubles follow-through (Oettingen / Gollwitzer).
//   - Visible progress is the strongest daily motivator we know of (Amabile).
//   - A weekly check-in keeps goals alive; unreviewed goals die quietly.
import * as store from '../store.js';
import { escapeHtml, todayYmd, quarterOf, uid, startOfWeek, addDays } from '../utils.js';
import { renderApp, toast } from '../app.js';

let viewYear = null, viewQuarter = null;

const STATUS = {
  on: { label: 'on track', color: 'var(--green)' },
  risk: { label: 'at risk', color: 'var(--amber)' },
  off: { label: 'off track', color: 'var(--red)' },
};

export function renderGoals(el) {
  const t = todayYmd();
  const s = store.get().settings;
  const curY = Number(t.slice(0, 4)), curQ = quarterOf(t);
  if (viewYear === null) { viewYear = curY; viewQuarter = curQ; }
  const g = store.addGoalQuarter(viewYear, viewQuarter);
  const isCurrent = viewYear === curY && viewQuarter === curQ;

  // weeks left in the viewed quarter
  const qEnd = new Date(viewYear, viewQuarter * 3, 0);
  const weeksLeft = isCurrent ? Math.max(0, Math.ceil((qEnd - new Date()) / (7 * 86400000))) : 0;
  const week = startOfWeek(t);

  el.innerHTML = `
  <div class="page-head">
    <h1>Goals</h1>
    <span class="page-sub">outcomes with a battle plan - not wishes</span>
    <div class="page-actions">
      <button class="btn small" id="gl-prev">←</button>
      <span class="mono" style="font-size:14px;min-width:90px;text-align:center">Q${viewQuarter} ${viewYear}</span>
      <button class="btn small" id="gl-next">→</button>
    </div>
  </div>

  <div class="card northstar">
    <span class="ns-icon">✦</span>
    <input id="gl-north" value="${escapeHtml(s.northStar || '')}"
      placeholder="North star - who are you becoming? e.g. “A calm, disciplined founder who ships every week”">
    <span class="help" data-help="Identity leads, goals follow. Quarterly outcomes should be evidence that you ARE this person. Keep it one sentence; change it rarely.">?</span>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>🎨 Quarter theme ${isCurrent ? `<span class="count">${weeksLeft} week(s) left</span>` : ''}</h2>
      <input id="gl-theme" value="${escapeHtml(g.theme)}" placeholder="One phrase that defines Q${viewQuarter}… e.g. “Ship Loki v1 to 3 agencies”" style="width:100%;font-size:16px;font-weight:600">
      <textarea id="gl-why" rows="3" placeholder="Why this, why now? (When motivation dips, this line does the lifting.)" style="width:100%;margin-top:10px">${escapeHtml(g.why)}</textarea>
      <div class="goal-science">
        <div class="gs-row"><b>Specific + hard</b> beats "do your best" - every time it has been studied.</div>
        <div class="gs-row"><b>2-4 outcomes max.</b> Each extra goal taxes all the others.</div>
        <div class="gs-row"><b>Check in weekly</b> (press W). Goals that are not reviewed quietly die.</div>
      </div>
    </div>

    <div class="card">
      <h2>◎ Outcomes <span class="count">${g.priorities.length}/4</span>
        <span class="help" data-help="An outcome is a result you can verify at quarter's end. Give each one: a lag measure (how you'll know), a lead measure (the weekly action you control), and an obstacle plan (when X threatens, I will Y).">?</span>
        <span class="spacer"></span>
        <button class="btn small primary" id="gl-addp" ${g.priorities.length >= 4 ? 'disabled' : ''}>+ Outcome</button></h2>
      <div id="gl-priorities">
        ${g.priorities.map(p => priorityHtml(g, p, week, isCurrent)).join('') || `
        <div class="empty">What would make this quarter a win?<br>
        <span class="faint" style="font-size:12px">Good outcome: "Sign 3 paying agencies". Weak outcome: "work on sales".</span></div>`}
      </div>
    </div>
  </div>`;

  el.querySelector('#gl-prev').onclick = () => { viewQuarter--; if (viewQuarter < 1) { viewQuarter = 4; viewYear--; } renderGoals(el); };
  el.querySelector('#gl-next').onclick = () => { viewQuarter++; if (viewQuarter > 4) { viewQuarter = 1; viewYear++; } renderGoals(el); };
  el.querySelector('#gl-north').onchange = e => { s.northStar = e.target.value.trim(); store.save(); };
  el.querySelector('#gl-theme').onchange = e => { g.theme = e.target.value; store.save(); };
  el.querySelector('#gl-why').onchange = e => { g.why = e.target.value; store.save(); };
  el.querySelector('#gl-addp').onclick = () => {
    g.priorities.push({ id: uid(), title: '', metric: '', lead: '', obstacle: '', plan: '', progress: 0, done: false, checkins: {} });
    store.save(); renderGoals(el);
  };

  const bind = (attr, field) => el.querySelectorAll(`[data-${attr}]`).forEach(inp => inp.onchange = () => {
    const p = g.priorities.find(x => x.id === inp.dataset[attr.replace(/-./g, c => c[1].toUpperCase())]);
    if (p) { p[field] = inp.value; store.save(); }
  });
  bind('p-title', 'title'); bind('p-metric', 'metric'); bind('p-lead', 'lead');
  bind('p-obstacle', 'obstacle'); bind('p-plan', 'plan');

  el.querySelectorAll('[data-p-progress]').forEach(inp => inp.oninput = () => {
    const p = g.priorities.find(x => x.id === inp.dataset.pProgress);
    if (p) { p.progress = Number(inp.value); store.save(); inp.closest('.goal-priority').querySelector('.gp-pct').textContent = p.progress + '%'; }
  });
  el.querySelectorAll('[data-p-done]').forEach(b => b.onclick = () => {
    const p = g.priorities.find(x => x.id === b.dataset.pDone);
    p.done = !p.done; if (p.done) p.progress = 100; store.save(); renderGoals(el);
    if (p.done) toast('Outcome achieved! The saga remembers. 🎉', 'success');
  });
  el.querySelectorAll('[data-p-del]').forEach(b => b.onclick = () => {
    if (!confirm('Remove this outcome?')) return;
    g.priorities = g.priorities.filter(x => x.id !== b.dataset.pDel);
    store.get().tasks.forEach(task => { if (task.goalPriorityId === b.dataset.pDel) { task.goalId = null; task.goalPriorityId = null; } });
    store.save(); renderGoals(el);
  });
  el.querySelectorAll('[data-checkin]').forEach(b => b.onclick = () => {
    const [pid, status] = b.dataset.checkin.split('|');
    const p = g.priorities.find(x => x.id === pid);
    if (!p) return;
    p.checkins = p.checkins || {};
    p.checkins[week] = p.checkins[week] === status ? undefined : status;
    store.save(); renderGoals(el);
  });
  el.querySelectorAll('[data-toggle-plan]').forEach(b => b.onclick = () => {
    const body = el.querySelector(`[data-plan-body="${b.dataset.togglePlan}"]`);
    if (body) { body.hidden = !body.hidden; b.textContent = body.hidden ? '⚔ Battle plan' : '⚔ Hide plan'; }
  });
}

function priorityHtml(g, p, week, isCurrent) {
  const linked = store.get().tasks.filter(t => t.goalPriorityId === p.id);
  const doneTasks = linked.filter(t => t.status === 'done').length;
  const taskPct = linked.length ? Math.round(doneTasks / linked.length * 100) : null;
  const pct = p.done ? 100 : Math.max(p.progress || 0, taskPct || 0);
  const checkins = p.checkins || {};
  const cur = checkins[week];
  const hasPlan = p.lead || p.obstacle || p.plan;

  // last 6 weeks of check-ins, oldest first
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(week, (i - 5) * 7));

  return `<div class="goal-priority ${p.done ? 'achieved' : ''}">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="task-check" data-p-done="${p.id}" style="${p.done ? 'background:var(--green);border-color:var(--green)' : ''}" title="Mark achieved"></button>
      <input data-p-title="${p.id}" value="${escapeHtml(p.title)}" placeholder="Outcome - specific, verifiable, a stretch" style="flex:1;font-weight:600;${p.done ? 'text-decoration:line-through;color:var(--faint)' : ''}">
      <span class="gp-pct mono" style="font-size:12px;color:var(--amber-bright)">${pct}%</span>
      <button class="icon-btn" data-p-del="${p.id}" title="Remove">✕</button>
    </div>
    <div class="progressbar" title="progress"><i style="width:${pct}%"></i></div>
    <input type="range" min="0" max="100" step="5" value="${p.progress || 0}" data-p-progress="${p.id}" class="gp-slider" title="Drag to log progress" ${p.done ? 'disabled' : ''}>
    <div class="form-row" style="margin-top:8px">
      <label style="flex:1">Lag measure - how you'll know
        <input data-p-metric="${p.id}" value="${escapeHtml(p.metric || '')}" placeholder="e.g. 3 signed agencies" style="width:100%;font-size:12.5px"></label>
      <label style="flex:1">Lead measure - weekly action you control
        <input data-p-lead="${p.id}" value="${escapeHtml(p.lead || '')}" placeholder="e.g. 20 outreach messages / week" style="width:100%;font-size:12.5px"></label>
    </div>
    <button class="btn small ghost" data-toggle-plan="${p.id}" style="margin-top:6px">⚔ ${hasPlan ? 'Battle plan' : 'Battle plan (recommended)'}</button>
    <div data-plan-body="${p.id}" hidden style="margin-top:8px">
      <div class="form-row">
        <label style="flex:1">Biggest obstacle (inside you or out)
          <input data-p-obstacle="${p.id}" value="${escapeHtml(p.obstacle || '')}" placeholder="e.g. I avoid outreach when tired" style="width:100%;font-size:12.5px"></label>
        <label style="flex:1">If-then plan
          <input data-p-plan="${p.id}" value="${escapeHtml(p.plan || '')}" placeholder="If it's 9:00, then I send 5 messages before anything else" style="width:100%;font-size:12.5px"></label>
      </div>
    </div>
    <div class="gp-foot">
      <span class="gp-weeks" title="weekly check-ins, last 6 weeks">
        ${weeks.map(w => `<i class="gp-dot" style="background:${checkins[w] ? STATUS[checkins[w]].color : 'var(--line-strong)'}" title="${w}${checkins[w] ? ' · ' + STATUS[checkins[w]].label : ''}"></i>`).join('')}
      </span>
      ${isCurrent && !p.done ? `<span class="gp-check">this week:
        ${Object.entries(STATUS).map(([k, v]) => `<button class="chip gp-status ${cur === k ? 'active' : ''}" data-checkin="${p.id}|${k}" style="${cur === k ? `color:${v.color};border-color:${v.color}` : ''}">${v.label}</button>`).join('')}
      </span>` : ''}
      <span class="spacer"></span>
      <span class="faint" style="font-size:11px">${linked.length ? `${doneTasks}/${linked.length} linked tasks done` : 'link tasks from the task editor'}</span>
    </div>
  </div>`;
}
