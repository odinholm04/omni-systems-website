// Mimir — app shell: routing, global keyboard, quick add, command palette, modals, toasts.
import * as store from './store.js';
import { parseQuickAdd, escapeHtml, fmtDate, minutesToHM, fuzzyMatch, todayYmd } from './utils.js';
import { renderToday } from './views/today.js';
import { renderTasks } from './views/tasks.js';
import { renderCalendar } from './views/calendar.js';
import { renderNotes } from './views/notes.js';
import { renderFocus, focusTick, startFocusOnTask } from './views/focus.js';
import { renderGoals } from './views/goals.js';
import { renderInsights } from './views/insights.js';
import { openPlanDay, openShutdown, openWeeklyReview, openTriage } from './views/wizards.js';
import { openTaskModal, openEventModal, openSettingsModal } from './views/modals.js';

const routes = {
  today: renderToday,
  tasks: renderTasks,
  calendar: renderCalendar,
  notes: renderNotes,
  focus: renderFocus,
  goals: renderGoals,
  insights: renderInsights,
};

export let currentRoute = 'today';
export let routeParam = null;

export function navigate(route, param = null) {
  location.hash = '#/' + route + (param ? '/' + param : '');
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [r, ...rest] = h.split('/');
  return { route: routes[r] ? r : 'today', param: rest.join('/') || null };
}

export function renderApp() {
  const { route, param } = parseHash();
  currentRoute = route; routeParam = param;
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.nav === route));
  const el = document.getElementById('view');
  routes[route](el, param);
  updateBadges();
}

function updateBadges() {
  const n = store.inboxTasks().length;
  const b = document.getElementById('inbox-badge');
  b.hidden = n === 0;
  b.textContent = n;
}

// ---------- toasts ----------
export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

// ---------- modal ----------
export function showModal(html) {
  const ov = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-box');
  box.innerHTML = html;
  ov.hidden = false;
  return box;
}
export function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.getElementById('modal-box').innerHTML = '';
}
export function modalOpen() { return !document.getElementById('modal-overlay').hidden; }

// ---------- quick add ----------
const qaOverlay = () => document.getElementById('quickadd-overlay');
const qaInput = () => document.getElementById('quickadd-input');

export function openQuickAdd(prefill = '') {
  qaOverlay().hidden = false;
  qaInput().value = prefill;
  qaInput().focus();
  renderQaPreview();
}
function closeQuickAdd() { qaOverlay().hidden = true; qaInput().value = ''; }

function renderQaPreview() {
  const p = parseQuickAdd(qaInput().value);
  const bits = [];
  if (p.date) bits.push(`<span class="chip">📅 ${fmtDate(p.date)}${p.time ? ' ' + p.time : ''}</span>`);
  if (p.durationMin) bits.push(`<span class="chip">⏱ ${minutesToHM(p.durationMin)}</span>`);
  if (p.priority) bits.push(`<span class="chip prio-${p.priority}">! ${p.priority}</span>`);
  if (p.project) bits.push(`<span class="chip project">@${escapeHtml(p.project)}</span>`);
  p.tags.forEach(t => bits.push(`<span class="chip">#${escapeHtml(t)}</span>`));
  document.getElementById('quickadd-preview').innerHTML =
    bits.length ? bits.join(' ') : '<span class="faint" style="font-size:12px">…parsed details appear here</span>';
}

function submitQuickAdd(toInbox) {
  const raw = qaInput().value.trim();
  if (!raw) { closeQuickAdd(); return; }
  const p = parseQuickAdd(raw);
  if (!p.title) { toast('Give it a title', 'warn'); return; }
  store.addTask({
    title: p.title,
    priority: p.priority || 'normal',
    tags: p.tags,
    project: p.project,
    scheduled: toInbox ? null : p.date,
    time: toInbox ? null : p.time,
    estimateMin: p.durationMin,
    inbox: toInbox || !p.date,
  });
  toast(`Captured: <b>${escapeHtml(p.title)}</b>${p.date && !toInbox ? ' → ' + fmtDate(p.date) : ' → Inbox'}`, 'success');
  closeQuickAdd();
  renderApp();
}

// ---------- command palette ----------
const palOverlay = () => document.getElementById('palette-overlay');
const palInput = () => document.getElementById('palette-input');
let palSelected = 0;

function paletteCommands() {
  return [
    { k: 'G then 1', t: 'Go to Today', run: () => navigate('today') },
    { k: 'G then 2', t: 'Go to Tasks', run: () => navigate('tasks') },
    { k: 'G then 3', t: 'Go to Calendar', run: () => navigate('calendar') },
    { k: 'G then 4', t: 'Go to Notes', run: () => navigate('notes') },
    { k: 'G then 5', t: 'Go to Focus', run: () => navigate('focus') },
    { k: '6', t: 'Go to Goals', run: () => navigate('goals') },
    { k: '7', t: 'Go to Insights', run: () => navigate('insights') },
    { k: 'Q', t: 'Quick add task', run: () => openQuickAdd() },
    { k: 'P', t: 'Plan my day', run: () => openPlanDay() },
    { k: 'S', t: 'Shutdown ritual', run: () => openShutdown() },
    { k: 'I', t: 'Triage inbox', run: () => openTriage() },
    { k: 'W', t: 'Weekly review', run: () => openWeeklyReview() },
    { k: 'F', t: 'Start focus session', run: () => navigate('focus') },
    { k: '', t: 'New note', run: () => { const n = store.addNote({ title: 'Untitled' }); navigate('notes', n.id); } },
    { k: '', t: 'New event / timeblock', run: () => openEventModal() },
    { k: '', t: 'Settings · export / import', run: () => openSettingsModal() },
    { k: '', t: 'Toggle light / dark theme', run: toggleTheme },
  ];
}

export function openPalette() {
  palOverlay().hidden = false;
  palInput().value = '';
  palSelected = 0;
  palInput().focus();
  renderPalette();
}
function closePalette() { palOverlay().hidden = true; }

function paletteItems(q) {
  const items = [];
  paletteCommands().forEach(c => { if (fuzzyMatch(q, c.t)) items.push({ ...c, section: 'Commands' }); });
  if (q.trim()) {
    store.get().tasks.filter(t => fuzzyMatch(q, t.title)).slice(0, 6).forEach(t =>
      items.push({
        t: t.title, s: t.status === 'done' ? 'done' : (t.scheduled ? fmtDate(t.scheduled) : (t.inbox ? 'inbox' : 'backlog')),
        section: 'Tasks', run: () => openTaskModal(t.id),
      }));
    store.get().notes.filter(n => fuzzyMatch(q, n.title) || fuzzyMatch(q, n.body.slice(0, 400))).slice(0, 5).forEach(n =>
      items.push({ t: n.title, s: 'note', section: 'Notes', run: () => navigate('notes', n.id) }));
    store.get().events.filter(e => fuzzyMatch(q, e.title)).slice(0, 4).forEach(e =>
      items.push({ t: e.title, s: `${fmtDate(e.date)} ${e.start}`, section: 'Events', run: () => openEventModal(e.id) }));
  }
  return items.slice(0, 18);
}

function renderPalette() {
  const q = palInput().value;
  const items = paletteItems(q);
  palSelected = Math.min(palSelected, Math.max(0, items.length - 1));
  let html = '', lastSection = '';
  items.forEach((it, i) => {
    if (it.section !== lastSection) { html += `<div class="pal-section">${it.section}</div>`; lastSection = it.section; }
    html += `<div class="pal-item ${i === palSelected ? 'selected' : ''}" data-i="${i}">
      <span class="pt">${escapeHtml(it.t)}</span>
      ${it.s ? `<span class="ps">${escapeHtml(it.s)}</span>` : ''}
      ${it.k ? `<span class="pk">${it.k}</span>` : ''}</div>`;
  });
  document.getElementById('palette-results').innerHTML = html || '<div class="empty" style="padding:14px">No matches</div>';
  document.querySelectorAll('.pal-item').forEach(el => {
    el.onclick = () => { const it = items[+el.dataset.i]; closePalette(); it.run(); };
    el.onmousemove = () => { palSelected = +el.dataset.i; renderPalette(); };
  });
}

// ---------- theme ----------
export function toggleTheme() {
  const s = store.get().settings;
  s.theme = s.theme === 'dark' ? 'light' : 'dark';
  applyTheme(); store.save();
}
function applyTheme() {
  document.documentElement.dataset.theme = store.get().settings.theme;
}

// ---------- global keyboard ----------
function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

let gPending = false;
document.addEventListener('keydown', e => {
  // palette / quick add always reachable
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }

  if (!qaOverlay().hidden) {
    if (e.key === 'Escape') closeQuickAdd();
    if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd(e.shiftKey); }
    return;
  }
  if (!palOverlay().hidden) {
    const items = paletteItems(palInput().value);
    if (e.key === 'Escape') closePalette();
    else if (e.key === 'ArrowDown') { e.preventDefault(); palSelected = Math.min(palSelected + 1, items.length - 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSelected = Math.max(palSelected - 1, 0); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[palSelected]; if (it) { closePalette(); it.run(); } }
    return;
  }
  if (modalOpen()) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (isTyping()) return;

  const k = e.key.toLowerCase();
  if (gPending) {
    gPending = false;
    const map = { '1': 'today', '2': 'tasks', '3': 'calendar', '4': 'notes', '5': 'focus', '6': 'goals', '7': 'insights', t: 'today', k: 'tasks', c: 'calendar', n: 'notes', f: 'focus' };
    if (map[k]) { navigate(map[k]); return; }
  }
  if (k === 'g') { gPending = true; setTimeout(() => gPending = false, 900); return; }
  if (k >= '1' && k <= '7') {
    navigate(['today', 'tasks', 'calendar', 'notes', 'focus', 'goals', 'insights'][+k - 1]); return;
  }
  if (k === 'q') { e.preventDefault(); openQuickAdd(); }
  else if (k === 'p') openPlanDay();
  else if (k === 's') openShutdown();
  else if (k === 'i') openTriage();
  else if (k === 'w') openWeeklyReview();
  else if (k === 'f') navigate('focus');
  else if (k === '?') showShortcuts();
});

function showShortcuts() {
  showModal(`<h2>Keyboard shortcuts</h2>
    <div class="grid cols-2" style="font-size:13.5px">
      <div>
        <p><span class="kbd">Q</span> Quick add</p>
        <p><span class="kbd">⌘K</span> Command palette</p>
        <p><span class="kbd">1–7</span> Switch page</p>
        <p><span class="kbd">P</span> Plan my day</p>
        <p><span class="kbd">S</span> Shutdown ritual</p>
      </div>
      <div>
        <p><span class="kbd">I</span> Triage inbox</p>
        <p><span class="kbd">W</span> Weekly review</p>
        <p><span class="kbd">F</span> Focus</p>
        <p><span class="kbd">?</span> This help</p>
        <p><span class="kbd">Esc</span> Close anything</p>
      </div>
    </div>
    <div class="modal-foot"><span class="spacer"></span><button class="btn" onclick="document.getElementById('modal-overlay').hidden=true">Close</button></div>`);
}

// overlay click-to-close
['quickadd-overlay', 'palette-overlay', 'modal-overlay'].forEach(id => {
  document.getElementById(id).addEventListener('mousedown', e => {
    if (e.target.id === id) { e.target.hidden = true; }
  });
});

qaInputSetup();
function qaInputSetup() {
  qaInput().addEventListener('input', renderQaPreview);
  palInput().addEventListener('input', () => { palSelected = 0; renderPalette(); });
}

document.getElementById('btn-palette').onclick = () => openPalette();
document.getElementById('btn-settings').onclick = () => openSettingsModal();
document.getElementById('mini-focus').onclick = () => navigate('focus');

// ---------- focus ticker (global, keeps mini timer + title fresh) ----------
setInterval(() => focusTick(), 1000);

// ---------- boot ----------
window.addEventListener('hashchange', renderApp);
store.onChange(() => updateBadges());
applyTheme();
if (!location.hash) location.hash = '#/today';
renderApp();

// First-open-of-day nudge: suggest planning if not planned yet (after 6am).
(() => {
  const d = store.day(todayYmd());
  const planned = d.plannedAt;
  if (!planned && new Date().getHours() >= 6 && store.tasksFor(todayYmd()).length + store.inboxTasks().length > 0) {
    setTimeout(() => toast('Good morning ✦ Press <span class="kbd">P</span> to plan your day', 'warn'), 900);
  }
})();
