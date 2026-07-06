// Snotra — Goals: rolling quarterly planning (theme + 2-4 priorities, linked to tasks).
import * as store from '../store.js';
import { escapeHtml, todayYmd, quarterOf, uid } from '../utils.js';
import { renderApp, toast } from '../app.js';

let viewYear = null, viewQuarter = null;

export function renderGoals(el) {
  const t = todayYmd();
  const curY = Number(t.slice(0, 4)), curQ = quarterOf(t);
  if (viewYear === null) { viewYear = curY; viewQuarter = curQ; }
  const g = store.addGoalQuarter(viewYear, viewQuarter);
  const isCurrent = viewYear === curY && viewQuarter === curQ;
  const monthsLeft = isCurrent ? Math.max(0, (viewQuarter * 3) - (Number(t.slice(5, 7)) - 1) - 1) : 0;

  el.innerHTML = `
  <div class="page-head">
    <h1>Quarterly Goals</h1>
    <span class="page-sub">rolling planning — plan this quarter in detail, sketch the next</span>
    <div class="page-actions">
      <button class="btn small" id="gl-prev">←</button>
      <span class="mono" style="font-size:14px;min-width:90px;text-align:center">Q${viewQuarter} ${viewYear}</span>
      <button class="btn small" id="gl-next">→</button>
    </div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>🎨 Theme ${isCurrent ? `<span class="count">current quarter · ${monthsLeft} month(s) left</span>` : ''}</h2>
      <input id="gl-theme" value="${escapeHtml(g.theme)}" placeholder="One phrase that defines Q${viewQuarter}… e.g. “Ship Loki v1 to 3 agencies”" style="width:100%;font-size:16px;font-weight:600">
      <textarea id="gl-why" rows="3" placeholder="Why this theme, why now?" style="width:100%;margin-top:10px">${escapeHtml(g.why)}</textarea>
      <p class="faint" style="font-size:12px">Rule of thumb: 2–4 priorities max. More = overwhelm. Review weekly (W), re-plan 2–3 weeks before the next quarter.</p>
    </div>

    <div class="card">
      <h2>◎ Priorities <span class="count">${g.priorities.length}/4</span>
        <span class="spacer"></span>
        <button class="btn small primary" id="gl-addp" ${g.priorities.length >= 4 ? 'disabled' : ''}>+ Priority</button></h2>
      <div id="gl-priorities">
        ${g.priorities.map(p => priorityHtml(g, p)).join('') || '<div class="empty">No priorities yet. What would make this quarter a win?</div>'}
      </div>
    </div>
  </div>`;

  el.querySelector('#gl-prev').onclick = () => { viewQuarter--; if (viewQuarter < 1) { viewQuarter = 4; viewYear--; } renderGoals(el); };
  el.querySelector('#gl-next').onclick = () => { viewQuarter++; if (viewQuarter > 4) { viewQuarter = 1; viewYear++; } renderGoals(el); };
  el.querySelector('#gl-theme').onchange = e => { g.theme = e.target.value; store.save(); };
  el.querySelector('#gl-why').onchange = e => { g.why = e.target.value; store.save(); };
  el.querySelector('#gl-addp').onclick = () => {
    g.priorities.push({ id: uid(), title: '', metric: '', done: false });
    store.save(); renderGoals(el);
  };

  el.querySelectorAll('[data-p-title]').forEach(inp => inp.onchange = () => {
    const p = g.priorities.find(x => x.id === inp.dataset.pTitle);
    p.title = inp.value; store.save();
  });
  el.querySelectorAll('[data-p-metric]').forEach(inp => inp.onchange = () => {
    const p = g.priorities.find(x => x.id === inp.dataset.pMetric);
    p.metric = inp.value; store.save();
  });
  el.querySelectorAll('[data-p-done]').forEach(b => b.onclick = () => {
    const p = g.priorities.find(x => x.id === b.dataset.pDone);
    p.done = !p.done; store.save(); renderGoals(el);
    if (p.done) toast('Priority achieved! 🎉', 'success');
  });
  el.querySelectorAll('[data-p-del]').forEach(b => b.onclick = () => {
    if (!confirm('Remove this priority?')) return;
    g.priorities = g.priorities.filter(x => x.id !== b.dataset.pDel);
    store.get().tasks.forEach(task => { if (task.goalPriorityId === b.dataset.pDel) { task.goalId = null; task.goalPriorityId = null; } });
    store.save(); renderGoals(el);
  });
}

function priorityHtml(g, p) {
  const linked = store.get().tasks.filter(t => t.goalPriorityId === p.id);
  const done = linked.filter(t => t.status === 'done').length;
  const pct = linked.length ? Math.round(done / linked.length * 100) : 0;
  return `<div class="goal-priority">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="task-check ${p.done ? '' : ''}" data-p-done="${p.id}" style="${p.done ? 'background:var(--green);border-color:var(--green)' : ''}" title="Mark achieved"></button>
      <input data-p-title="${p.id}" value="${escapeHtml(p.title)}" placeholder="Priority — specific outcome" style="flex:1;font-weight:600;${p.done ? 'text-decoration:line-through;color:var(--faint)' : ''}">
      <button class="icon-btn" data-p-del="${p.id}" title="Remove">✕</button>
    </div>
    <input data-p-metric="${p.id}" value="${escapeHtml(p.metric)}" placeholder="Success metric — how will you know?" style="width:100%;margin-top:8px;font-size:12.5px">
    <div class="progressbar" title="${done}/${linked.length} linked tasks done"><i style="width:${pct}%"></i></div>
    <p class="faint" style="font-size:11.5px;margin:6px 0 0">${linked.length ? `${done}/${linked.length} linked tasks done` : 'No tasks linked yet — link tasks to this priority from the task editor.'}</p>
  </div>`;
}
