// Snotra — shared render helpers (task rows, etc.)
import * as store from '../store.js';
import { escapeHtml, fmtDate, minutesToHM, todayYmd } from '../utils.js';
import { renderApp, toast } from '../app.js';
import { openTaskModal } from './modals.js';
import { startFocusOnTask } from './focus.js';

export function taskRowHtml(t, opts = {}) {
  const overdue = t.scheduled && t.scheduled < todayYmd() && t.status !== 'done';
  const actual = store.actualMin(t.id);
  const meta = [];
  if (t.time) meta.push(`<span class="mono">${t.time}</span>`);
  if (t.scheduled && !opts.hideDate) meta.push(`<span class="chip ${overdue ? 'overdue' : ''}">${overdue ? '⚠ ' : ''}${fmtDate(t.scheduled)}</span>`);
  if (t.priority && t.priority !== 'normal') meta.push(`<span class="chip prio-${t.priority}">${t.priority === 'high' ? '↑ high' : t.priority === 'low' ? '↓ low' : '· minimal'}</span>`);
  if (t.project) meta.push(`<span class="chip project">@${escapeHtml(t.project)}</span>`);
  t.tags.forEach(tag => meta.push(`<span class="chip">#${escapeHtml(tag)}</span>`));
  if (t.estimateMin) meta.push(`<span class="chip">⏱ ${minutesToHM(t.estimateMin)}${actual ? ` / ${minutesToHM(actual)} done` : ''}</span>`);
  else if (actual) meta.push(`<span class="chip">⏱ ${minutesToHM(actual)} logged</span>`);
  if (t.rollovers >= 2) meta.push(`<span class="chip rolled">↻ rolled ${t.rollovers}×</span>`);
  if (t.goalId) {
    const g = store.goalById(t.goalId);
    const p = g && g.priorities.find(p => p.id === t.goalPriorityId);
    meta.push(`<span class="chip" style="color:var(--green)">◎ ${escapeHtml(p ? p.title : 'goal')}</span>`);
  }

  return `<div class="task-row ${t.status === 'done' ? 'done' : ''}" data-task="${t.id}" ${opts.draggable ? 'draggable="true"' : ''}>
    <button class="task-check" data-check="${t.id}" title="Toggle done"></button>
    <div class="task-main">
      <div class="task-title">${escapeHtml(t.title)}</div>
      ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="icon-btn" data-focus="${t.id}" title="Focus on this">▶</button>
      <button class="icon-btn" data-edit="${t.id}" title="Edit">✎</button>
    </div>
  </div>`;
}

// Wire click handlers for any container with task rows rendered by taskRowHtml.
export function wireTaskRows(container) {
  container.querySelectorAll('[data-check]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const t = store.toggleTaskDone(b.dataset.check);
    if (t && t.status === 'done') toast('Done ✓', 'success');
    renderApp();
  });
  container.querySelectorAll('[data-edit]').forEach(b => b.onclick = e => {
    e.stopPropagation(); openTaskModal(b.dataset.edit);
  });
  container.querySelectorAll('[data-focus]').forEach(b => b.onclick = e => {
    e.stopPropagation(); startFocusOnTask(b.dataset.focus);
  });
  container.querySelectorAll('.task-row').forEach(r => {
    r.onclick = e => {
      if (e.target.closest('button')) return;
      openTaskModal(r.dataset.task);
    };
  });
}

export const KIND_LABEL = { event: 'Event', deepwork: 'Deep work', shallow: 'Shallow work', personal: 'Personal' };
