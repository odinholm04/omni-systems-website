// Snotra - app shell: routing, global keyboard, quick add, command palette, modals, toasts.
import * as store from './store.js';
import { parseQuickAdd, escapeHtml, fmtDate, minutesToHM, fuzzyMatch, todayYmd } from './utils.js';
import { renderToday } from './views/today.js';
import { renderTasks } from './views/tasks.js';
import { renderCalendar } from './views/calendar.js';
import { renderNotes } from './views/notes.js';
import { renderFocus, focusTick, startFocusOnTask } from './views/focus.js';
import { renderGoals } from './views/goals.js';
import { renderInsights } from './views/insights.js';
import { renderRituals } from './views/rituals.js';
import { openPlanDay, openShutdown, openWeeklyReview, openTriage } from './views/wizards.js';
import { openTaskModal, openEventModal, openSettingsModal } from './views/modals.js';
import { applyAccent, openPaletteModal } from './palette.js';

const routes = {
  today: renderToday,
  tasks: renderTasks,
  calendar: renderCalendar,
  notes: renderNotes,
  focus: renderFocus,
  goals: renderGoals,
  insights: renderInsights,
  rituals: renderRituals,
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
  box.onkeydown = null; // clear any handler a previous modal (e.g. triage) attached
  box.innerHTML = html;
  ov.hidden = false;
  return box;
}
export function closeModal() {
  const box = document.getElementById('modal-box');
  box.onkeydown = null;
  document.getElementById('modal-overlay').hidden = true;
  box.innerHTML = '';
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
    { k: '8', t: 'Go to Rituals (morning & night routine)', run: () => navigate('rituals') },
    { k: 'Q', t: 'Quick add task', run: () => openQuickAdd() },
    { k: 'P', t: 'Plan my day', run: () => openPlanDay() },
    { k: 'S', t: 'Shutdown ritual', run: () => openShutdown() },
    { k: 'I', t: 'Triage inbox', run: () => openTriage() },
    { k: 'W', t: 'Weekly review', run: () => openWeeklyReview() },
    { k: 'F', t: 'Start focus session', run: () => navigate('focus') },
    { k: '', t: 'New note', run: () => { const n = store.addNote({ title: 'Untitled' }); navigate('notes', n.id); } },
    { k: '', t: 'New event / timeblock', run: () => openEventModal() },
    { k: '', t: 'Change palette - accent colour & meaning', run: () => openPaletteModal() },
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
  applyAccent(store.get().settings.accent);
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
    const map = { '1': 'today', '2': 'tasks', '3': 'calendar', '4': 'notes', '5': 'focus', '6': 'goals', '7': 'insights', '8': 'rituals', t: 'today', k: 'tasks', c: 'calendar', n: 'notes', f: 'focus', r: 'rituals' };
    if (map[k]) { navigate(map[k]); return; }
  }
  if (k === 'g') { gPending = true; setTimeout(() => gPending = false, 900); return; }
  if (k >= '1' && k <= '8') {
    navigate(['today', 'tasks', 'calendar', 'notes', 'focus', 'goals', 'insights', 'rituals'][+k - 1]); return;
  }
  if (k === 'q') { e.preventDefault(); openQuickAdd(); }
  else if (k === 'p') openPlanDay();
  else if (k === 's') openShutdown();
  else if (k === 'i') openTriage();
  else if (k === 'w') openWeeklyReview();
  else if (k === 'f') navigate('focus');
  else if (k === '?') showShortcuts();
});

export function showShortcuts() {
  const row = (keys, label) => `<div class="sc-row"><span class="sc-keys">${keys.map(k => `<span class="kbd">${k}</span>`).join('')}</span><span class="sc-label">${label}</span></div>`;
  showModal(`<h2>Keyboard shortcuts</h2>
    <p class="muted" style="font-size:12.5px;margin:-6px 0 14px">Shortcuts pause automatically while you are typing in a field.</p>
    <div class="grid cols-2" style="gap:22px">
      <div>
        <div class="sc-group">Navigate</div>
        ${row(['1'], 'Today')}
        ${row(['2'], 'Tasks')}
        ${row(['3'], 'Calendar')}
        ${row(['4'], 'Notes')}
        ${row(['5'], 'Focus')}
        ${row(['6'], 'Goals')}
        ${row(['7'], 'Insights')}
        ${row(['8'], 'Rituals')}
        <div class="sc-group" style="margin-top:12px">Find & run</div>
        ${row(['⌘', 'K'], 'Command palette (search + run anything)')}
      </div>
      <div>
        <div class="sc-group">Capture & plan</div>
        ${row(['Q'], 'Quick add a task')}
        ${row(['P'], 'Plan my day')}
        ${row(['S'], 'Shutdown ritual')}
        ${row(['I'], 'Triage inbox')}
        ${row(['W'], 'Weekly review')}
        ${row(['F'], 'Start a focus session')}
        <div class="sc-group" style="margin-top:12px">General</div>
        ${row(['?'], 'Show this sheet')}
        ${row(['Esc'], 'Close any dialog')}
      </div>
    </div>
    <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="sc-close">Got it</button></div>`);
  document.getElementById('sc-close').onclick = closeModal;
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

// ---------- ritual reminders (fire while a Snotra tab is open) ----------
const NOTIFIED_KEY = 'snotra.notified.v1';
function notifiedMap() {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) || {}; } catch { return {}; }
}
function markNotified(date, key) {
  const m = notifiedMap();
  m[date] = m[date] || {};
  m[date][key] = true;
  Object.keys(m).forEach(d => { if (d !== date) delete m[d]; }); // keep only today
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(m));
}
function notify(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '../icon.svg' });
    }
  } catch (e) { /* headless / unsupported */ }
  toast(`${title}${body ? ' - ' + body : ''}`, 'warn');
}
export function reminderCheck(now = new Date()) {
  const st = store.get();
  if (!st.settings.reminders) return [];
  const t = todayYmd();
  const cur = now.getHours() * 60 + now.getMinutes();
  const seen = notifiedMap()[t] || {};
  const fired = [];
  const win = (anchor) => cur >= anchor && cur < anchor + 15; // 15-min firing window

  // morning ritual at day start
  const dayStart = st.settings.dayStart.split(':').reduce((h, m) => +h * 60 + +m);
  if (!seen['m'] && win(dayStart) && !store.ritualDone(t, 'm')) {
    notify(`☀ ${st.habits.morningName}`, `The saga starts now: ${st.habits.morning[0] || ''}`);
    markNotified(t, 'm'); fired.push('m');
  }
  // each dusk anchor
  const bed = st.habits.bedtime.split(':').reduce((h, m) => +h * 60 + +m);
  const log = store.habitLog(t);
  st.habits.night.forEach((s, i) => {
    const anchor = bed - s.offsetMin;
    if (!seen['n' + i] && win(anchor) && !log.n.includes(i)) {
      notify(`☾ ${st.habits.nightName}`, s.title);
      markNotified(t, 'n' + i); fired.push('n' + i);
    }
  });
  return fired;
}
window.__snotraReminderCheck = reminderCheck; // exposed for tests
setInterval(() => reminderCheck(), 30000);
setTimeout(() => reminderCheck(), 2500);

// ---------- boot ----------
window.addEventListener('hashchange', renderApp);
store.onChange(() => updateBadges());
// Fellowship auto-publish: any saved change refreshes your published saga stats (debounced).
import('./sync.js').then(sync => store.onChange(() => sync.schedulePublish()));
// Ultrahuman auto-sync: on boot, every 15 min, and when the tab becomes visible again -
// so a PWA left open overnight still picks up the new morning without a full reload.
// The failure toast fires at most once per day; retries stay quiet.
import('./metrics.js').then(({ fetchUltrahuman }) => {
  let syncing = false, warnedOn = null;
  const trySync = () => {
    const s = store.get();
    if (syncing || !s.settings.uhKey || s.metrics[todayYmd()]) return;
    syncing = true;
    fetchUltrahuman().then(r => {
      toast(`◉ Ring synced: sleep score ${r.sleepScore ?? '-'}`, 'success');
      renderApp(); // metric quests judge themselves off the fresh score
    }).catch(err => {
      // Never fail silently: Settings promises "sync runs on app open".
      if (warnedOn !== todayYmd()) {
        warnedOn = todayYmd();
        toast(`◉ Ring sync failed: ${escapeHtml(err.message)} - check Settings, or log sleep manually`, 'warn');
      }
    }).finally(() => { syncing = false; });
  };
  trySync();
  setInterval(trySync, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) trySync(); });
});
applyTheme();
if (!location.hash) location.hash = '#/today';
renderApp();

// First-open-of-day nudges: rituals + planning.
(() => {
  const t = todayYmd();
  const hour = new Date().getHours();
  if (!store.day(t).plannedAt && hour >= 6 && store.tasksFor(t).length + store.inboxTasks().length > 0) {
    setTimeout(() => toast('Good morning ✦ Press <span class="kbd">P</span> to plan your day', 'warn'), 900);
  }
  if (hour >= 6 && hour < 15 && !store.ritualDone(t, 'm')) {
    setTimeout(() => toast('☀ The dawn ritual awaits - press <span class="kbd">8</span>', 'warn'), 1600);
  } else if (hour >= 17 && !store.ritualDone(t, 'n')) {
    setTimeout(() => toast('☾ Wind-down is near - dusk ritual on <span class="kbd">8</span>', 'warn'), 1600);
  }
})();
