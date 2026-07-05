// Mimir — state store: single source of truth, persisted to localStorage.
import { uid, ymd, todayYmd, addDays, startOfWeek, quarterOf } from './utils.js';

const KEY = 'mimir.data.v1';

const defaults = () => ({
  version: 1,
  settings: {
    name: 'Thor',
    theme: 'dark',
    dayStart: '07:00',
    dayEnd: '18:00',
    capacityHours: 8,        // planned-work capacity per day
    focusGoalMin: 180,       // daily deep-work goal (3h)
    shutdownPhrase: 'Alright, þá erum við búin í dag!',
    sound: true,
  },
  tasks: [],       // {id,title,notes,status,priority,inbox,project,tags,scheduled,time,durationMin,estimateMin,createdAt,completedAt,goalId,rollovers,order}
  events: [],      // {id,title,date,start,end,kind,taskIds:[],notes,createdAt}
  notes: [],       // {id,title,body,tags,pinned,daily,createdAt,updatedAt}
  sessions: [],    // {id,taskId,mode,plannedMin,startedAt,endedAt,minutes,completed,distractions}
  goals: [],       // {id,year,quarter,theme,why,priorities:[{id,title,metric,tag,done}]}
  days: {},        // ymd -> {planned:[taskIds], plannedAt, shutdownAt, reflection}
  weeks: {},       // monday-ymd -> {objectives:[{id,title,done}], reflection, reviewedAt}
  focus: null,     // active session {taskId,mode,plannedMin,startedAt,pausedAt,accumMs,breakUntil}
});

let state = load();
const listeners = new Set();
try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed(defaults());
    const data = JSON.parse(raw);
    return { ...defaults(), ...data, settings: { ...defaults().settings, ...(data.settings || {}) } };
  } catch (e) {
    console.error('Mimir: failed to load state, starting fresh', e);
    return seed(defaults());
  }
}

function seed(s) {
  const t = todayYmd();
  const note = {
    id: uid(),
    title: 'Welcome to Mimir',
    body: [
      'Mimir is your unified brain: tasks, calendar, notes and deep work — all connected.',
      '',
      '## How it flows',
      '- Capture everything with **Q** (quick add) — try `Call Anna tomorrow 10am @loki !high for 30m`',
      '- Triage your inbox with **I**, one item at a time',
      '- Plan your day each morning (**P**) — pick tasks, estimate, timeblock',
      '- Start a deep work block with **F** — park distractions instead of switching',
      '- Close the day with the shutdown ritual (**S**)',
      '- Review your week every Sunday',
      '',
      '## Everything is linked',
      '- Link notes with [[Welcome to Mimir]] syntax',
      '- Timer sessions log against tasks, so you see planned vs actual',
      '- `- [ ] task lines` inside notes are clickable checkboxes',
      '',
      'Your data lives in this browser only. Export a backup from Settings any time.',
    ].join('\n'),
    tags: ['mimir'], pinned: true, daily: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  s.notes.push(note);
  s.tasks.push(
    { ...newTask('Try quick add: press Q'), priority: 'high', scheduled: t },
    { ...newTask('Plan today (press P)'), scheduled: t },
    { ...newTask('Sort the inbox (press I)'), inbox: true },
  );
  return s;
}

export function newTask(title = '') {
  return {
    id: uid(), title, notes: '', status: 'todo', priority: 'normal', inbox: false,
    project: null, tags: [], scheduled: null, time: null, durationMin: null,
    estimateMin: null, createdAt: Date.now(), completedAt: null, goalId: null,
    rollovers: 0, order: Date.now(),
  };
}

// ---------- persistence / reactivity ----------
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error('Mimir: save failed', e); }
  }, 80);
  listeners.forEach(fn => fn());
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const get = () => state;

export function exportJson() {
  return JSON.stringify(state, null, 2);
}
export function importJson(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) throw new Error('Not a Mimir backup file');
  state = { ...defaults(), ...data, settings: { ...defaults().settings, ...(data.settings || {}) } };
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach(fn => fn());
}
export function resetAll() {
  state = seed(defaults());
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach(fn => fn());
}

// ---------- tasks ----------
export function addTask(patch = {}) {
  const t = { ...newTask(), ...patch };
  state.tasks.push(t); save(); return t;
}
export function updateTask(id, patch) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return null;
  Object.assign(t, patch); save(); return t;
}
export function toggleTaskDone(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (t.status === 'done') { t.status = 'todo'; t.completedAt = null; }
  else { t.status = 'done'; t.completedAt = Date.now(); t.inbox = false; }
  save(); return t;
}
export function deleteTask(id) {
  state.tasks = state.tasks.filter(x => x.id !== id);
  state.events.forEach(e => { e.taskIds = (e.taskIds || []).filter(x => x !== id); });
  Object.values(state.days).forEach(d => { d.planned = (d.planned || []).filter(x => x !== id); });
  save();
}
export const task = id => state.tasks.find(x => x.id === id);

export function tasksFor(date) {
  return state.tasks.filter(t => t.scheduled === date && t.status !== 'done')
    .concat(state.tasks.filter(t => t.scheduled === date && t.status === 'done'))
    .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || prioRank(a) - prioRank(b));
}
export const prioRank = t => ({ high: 0, normal: 1, low: 2, min: 3 }[t.priority] ?? 1);

export function overdueTasks(before = todayYmd()) {
  return state.tasks.filter(t => t.status !== 'done' && t.scheduled && t.scheduled < before);
}
export function inboxTasks() {
  return state.tasks.filter(t => t.inbox && t.status !== 'done').sort((a, b) => a.createdAt - b.createdAt);
}
export function backlogTasks() {
  return state.tasks.filter(t => !t.inbox && !t.scheduled && t.status !== 'done').sort((a, b) => prioRank(a) - prioRank(b) || a.createdAt - b.createdAt);
}
export function projects() {
  return [...new Set(state.tasks.map(t => t.project).filter(Boolean))].sort();
}

// Actual focused minutes logged against a task.
export function actualMin(taskId) {
  return Math.round(state.sessions.filter(s => s.taskId === taskId).reduce((a, s) => a + s.minutes, 0));
}

// ---------- events / timeblocks ----------
export function addEvent(patch = {}) {
  const e = {
    id: uid(), title: '', date: todayYmd(), start: '09:00', end: '10:00',
    kind: 'event', taskIds: [], notes: '', createdAt: Date.now(), ...patch,
  };
  state.events.push(e); save(); return e;
}
export function updateEvent(id, patch) {
  const e = state.events.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, patch); save(); return e;
}
export function deleteEvent(id) {
  state.events = state.events.filter(x => x.id !== id); save();
}
export const event = id => state.events.find(x => x.id === id);
export function eventsFor(date) {
  return state.events.filter(e => e.date === date).sort((a, b) => a.start.localeCompare(b.start));
}

// ---------- notes ----------
export function addNote(patch = {}) {
  const n = { id: uid(), title: 'Untitled', body: '', tags: [], pinned: false, daily: null, createdAt: Date.now(), updatedAt: Date.now(), ...patch };
  state.notes.push(n); save(); return n;
}
export function updateNote(id, patch) {
  const n = state.notes.find(x => x.id === id);
  if (!n) return null;
  Object.assign(n, patch, { updatedAt: Date.now() }); save(); return n;
}
export function deleteNote(id) { state.notes = state.notes.filter(x => x.id !== id); save(); }
export const note = id => state.notes.find(x => x.id === id);
export function noteByTitle(title) {
  return state.notes.find(n => n.title.toLowerCase() === title.toLowerCase());
}
export function dailyNote(date, create = false) {
  let n = state.notes.find(x => x.daily === date);
  if (!n && create) n = addNote({ title: `Daily — ${date}`, daily: date, tags: ['daily'] });
  return n;
}

// ---------- focus sessions ----------
export function startFocus({ taskId = null, mode = 'deep', plannedMin = 90 }) {
  state.focus = { taskId, mode, plannedMin, startedAt: Date.now(), pausedAt: null, accumMs: 0, distractions: 0 };
  save(); return state.focus;
}
export function pauseFocus() {
  const f = state.focus;
  if (!f || f.pausedAt) return;
  f.accumMs += Date.now() - f.startedAt; f.pausedAt = Date.now(); save();
}
export function resumeFocus() {
  const f = state.focus;
  if (!f || !f.pausedAt) return;
  f.startedAt = Date.now(); f.pausedAt = null; save();
}
export function focusElapsedMs() {
  const f = state.focus;
  if (!f) return 0;
  return f.accumMs + (f.pausedAt ? 0 : Date.now() - f.startedAt);
}
export function endFocus(completed) {
  const f = state.focus;
  if (!f) return null;
  const minutes = Math.max(0, focusElapsedMs() / 60000);
  const rec = {
    id: uid(), taskId: f.taskId, mode: f.mode, plannedMin: f.plannedMin,
    startedAt: f.startedAt - f.accumMs, endedAt: Date.now(),
    minutes: Math.round(minutes * 10) / 10, completed, distractions: f.distractions,
  };
  if (rec.minutes >= 1) state.sessions.push(rec);
  state.focus = null; save(); return rec;
}
export function focusMinOn(date) {
  const d0 = new Date(date + 'T00:00').getTime(), d1 = d0 + 86400000;
  return Math.round(state.sessions.filter(s => s.endedAt >= d0 && s.endedAt < d1).reduce((a, s) => a + s.minutes, 0));
}
export function focusStreak() {
  const goal = state.settings.focusGoalMin;
  let streak = 0, d = todayYmd();
  if (focusMinOn(d) >= goal) streak++;
  d = addDays(d, -1);
  while (focusMinOn(d) >= goal) { streak++; d = addDays(d, -1); }
  return streak;
}

// ---------- days / weeks ----------
export function day(date) {
  if (!state.days[date]) state.days[date] = { planned: [], plannedAt: null, shutdownAt: null, reflection: '' };
  return state.days[date];
}
export function week(monday) {
  if (!state.weeks[monday]) state.weeks[monday] = { objectives: [], reflection: '', reviewedAt: null };
  return state.weeks[monday];
}
export const thisWeek = () => week(startOfWeek(todayYmd()));

// ---------- goals ----------
export function currentQuarterGoal(create = false) {
  const t = todayYmd();
  const y = Number(t.slice(0, 4)), q = quarterOf(t);
  let g = state.goals.find(x => x.year === y && x.quarter === q);
  if (!g && create) {
    g = { id: uid(), year: y, quarter: q, theme: '', why: '', priorities: [] };
    state.goals.push(g); save();
  }
  return g;
}
export function goalById(id) { return state.goals.find(g => g.id === id); }
export function addGoalQuarter(year, quarter) {
  let g = state.goals.find(x => x.year === year && x.quarter === quarter);
  if (!g) { g = { id: uid(), year, quarter, theme: '', why: '', priorities: [] }; state.goals.push(g); save(); }
  return g;
}

// Planned workload (minutes) for a date: task estimates + timeblock durations of non-task events.
export function plannedMin(date) {
  const taskMin = state.tasks
    .filter(t => t.scheduled === date && t.status !== 'done')
    .reduce((a, t) => a + (t.estimateMin || t.durationMin || 30), 0);
  return taskMin;
}
