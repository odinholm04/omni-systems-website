// Snotra - Tasks: inbox / backlog / scheduled, list + kanban views.
import * as store from '../store.js';
import { escapeHtml, todayYmd, fmtDate } from '../utils.js';
import { renderApp, openQuickAdd } from '../app.js';
import { taskRowHtml, wireTaskRows } from './shared.js';
import { openTriage } from './wizards.js';

let mode = 'list';       // list | kanban
let filterProject = '';
let showDone = false;

// Sort orders. "Smart" keeps the classic behavior: scheduled by date then priority,
// backlog by priority. The rest apply one comparator everywhere, flippable asc/desc.
const SORTS = {
  smart: null,
  date: (a, b) => (a.scheduled || '9999-99-99').localeCompare(b.scheduled || '9999-99-99'),
  name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  priority: (a, b) => store.prioRank(a) - store.prioRank(b),
  created: (a, b) => a.createdAt - b.createdAt,
};

export function renderTasks(el) {
  const st = store.get().settings;
  const sortKey = SORTS[st.taskSort] !== undefined ? (st.taskSort || 'smart') : 'smart';
  const dirMul = st.taskSortDir === 'desc' ? -1 : 1;
  const cmp = SORTS[sortKey] ? (a, b) => dirMul * SORTS[sortKey](a, b) : null;

  const all = store.get().tasks.filter(t => !filterProject || t.project === filterProject);
  const inbox = all.filter(t => t.inbox && t.status !== 'done');
  if (cmp) inbox.sort(cmp);
  const scheduled = all.filter(t => !t.inbox && t.scheduled && t.status !== 'done')
    .sort(cmp || ((a, b) => a.scheduled.localeCompare(b.scheduled) || store.prioRank(a) - store.prioRank(b)));
  const backlog = all.filter(t => !t.inbox && !t.scheduled && t.status !== 'done')
    .sort(cmp || ((a, b) => store.prioRank(a) - store.prioRank(b)));
  const done = all.filter(t => t.status === 'done')
    .sort(cmp || ((a, b) => (b.completedAt || 0) - (a.completedAt || 0)));
  const projects = store.projects();

  el.innerHTML = `
  <div class="page-head">
    <h1>Tasks</h1>
    <span class="page-sub">${all.filter(t => t.status !== 'done').length} open</span>
    <div class="page-actions">
      <select id="tk-project" title="Filter by project">
        <option value="">All projects</option>
        ${projects.map(p => `<option value="${escapeHtml(p)}" ${filterProject === p ? 'selected' : ''}>@${escapeHtml(p)}</option>`).join('')}
      </select>
      <select id="tk-sort" title="Sort order">
        <option value="smart" ${sortKey === 'smart' ? 'selected' : ''}>Smart order</option>
        <option value="date" ${sortKey === 'date' ? 'selected' : ''}>By date</option>
        <option value="name" ${sortKey === 'name' ? 'selected' : ''}>By name</option>
        <option value="priority" ${sortKey === 'priority' ? 'selected' : ''}>By priority</option>
        <option value="created" ${sortKey === 'created' ? 'selected' : ''}>By created</option>
      </select>
      <button class="btn small" id="tk-dir" title="Flip direction" ${sortKey === 'smart' ? 'disabled' : ''}>${st.taskSortDir === 'desc' ? '↓ desc' : '↑ asc'}</button>
      <div class="seg">
        <button class="${mode === 'list' ? 'active' : ''}" data-mode="list">List</button>
        <button class="${mode === 'kanban' ? 'active' : ''}" data-mode="kanban">Kanban</button>
      </div>
      <button class="btn" id="tk-triage" ${inbox.length ? '' : 'disabled'}>Triage inbox (${inbox.length})</button>
      <button class="btn primary" id="tk-add">+ Quick add</button>
    </div>
  </div>
  ${mode === 'list' ? listHtml(inbox, scheduled, backlog, done, sortKey) : kanbanHtml(all)}`;

  wireTaskRows(el);
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; renderTasks(el); });
  el.querySelector('#tk-project').onchange = e => { filterProject = e.target.value; renderTasks(el); };
  el.querySelector('#tk-sort').onchange = e => { st.taskSort = e.target.value; store.save(); renderTasks(el); };
  el.querySelector('#tk-dir').onclick = () => { st.taskSortDir = st.taskSortDir === 'desc' ? 'asc' : 'desc'; store.save(); renderTasks(el); };
  el.querySelector('#tk-add').onclick = () => openQuickAdd();
  el.querySelector('#tk-triage').onclick = () => openTriage();
  const sd = el.querySelector('#tk-showdone');
  if (sd) sd.onclick = () => { showDone = !showDone; renderTasks(el); };

  if (mode === 'kanban') wireKanban(el);
}

function listHtml(inbox, scheduled, backlog, done, sortKey = 'smart') {
  return `<div class="grid cols-2">
    <div>
      <div class="card" style="margin-bottom:14px">
        <h2>📥 Inbox <span class="count">${inbox.length}</span></h2>
        ${inbox.length ? inbox.map(t => taskRowHtml(t)).join('') : '<div class="empty">Inbox zero. Beautiful.</div>'}
      </div>
      <div class="card">
        <h2>🗂 Backlog <span class="count">${backlog.length}</span></h2>
        ${backlog.length ? backlog.map(t => taskRowHtml(t)).join('') : '<div class="empty">Nothing waiting.</div>'}
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:14px">
        <h2>📅 Scheduled <span class="count">${scheduled.length}</span></h2>
        ${scheduled.length
          ? (sortKey === 'smart' || sortKey === 'date' ? groupByDate(scheduled) : scheduled.map(t => taskRowHtml(t)).join(''))
          : '<div class="empty">No scheduled tasks.</div>'}
      </div>
      <div class="card">
        <h2>✓ Done <span class="count">${done.length}</span>
          <span class="spacer"></span><button class="btn small ghost" id="tk-showdone">${showDone ? 'Hide' : 'Show'}</button></h2>
        ${showDone ? (done.slice(0, 40).map(t => taskRowHtml(t)).join('') || '<div class="empty">None yet.</div>') : ''}
      </div>
    </div>
  </div>`;
}

function groupByDate(tasks) {
  const groups = {};
  tasks.forEach(t => { (groups[t.scheduled] = groups[t.scheduled] || []).push(t); });
  return Object.keys(groups).sort().map(d =>
    `<div class="pal-section" style="padding-left:4px">${fmtDate(d)}${d < todayYmd() ? ' · <span style="color:var(--red)">overdue</span>' : ''}</div>
     ${groups[d].map(t => taskRowHtml(t, { hideDate: true })).join('')}`).join('');
}

function kanbanHtml(all) {
  const cols = [
    ['todo', 'Not started', all.filter(t => t.status === 'todo' && !t.inbox)],
    ['doing', 'In progress', all.filter(t => t.status === 'doing')],
    ['done', 'Completed', all.filter(t => t.status === 'done').slice(0, 25)],
  ];
  return `<div class="kanban">${cols.map(([key, label, ts]) => `
    <div class="col" data-col="${key}">
      <h3>${label} · ${ts.length}</h3>
      ${ts.map(t => taskRowHtml(t, { draggable: true })).join('') || '<div class="empty">-</div>'}
    </div>`).join('')}</div>`;
}

function wireKanban(el) {
  el.querySelectorAll('.task-row[draggable]').forEach(r => {
    r.addEventListener('dragstart', e => e.dataTransfer.setData('text/task', r.dataset.task));
  });
  el.querySelectorAll('.col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop-hint'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop-hint'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('drop-hint');
      const id = e.dataTransfer.getData('text/task');
      if (!id) return;
      const status = col.dataset.col;
      const patch = { status, inbox: false };
      if (status === 'done') patch.completedAt = Date.now(); else patch.completedAt = null;
      store.updateTask(id, patch);
      renderApp();
    });
  });
}
