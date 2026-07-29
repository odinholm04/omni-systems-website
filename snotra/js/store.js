// Snotra - state store: single source of truth, persisted to localStorage.
import { uid, ymd, todayYmd, addDays, startOfWeek, quarterOf } from './utils.js';

const KEY = 'snotra.data.v1';

const defaults = () => ({
  version: 1,
  settings: {
    name: 'Thor',
    theme: 'dark',
    accent: 'amber',
    dayStart: '07:00',
    dayEnd: '18:00',
    capacityHours: 8,        // planned-work capacity per day
    focusGoalMin: 180,       // daily deep-work goal (3h)
    shutdownPhrase: 'Alright, þá erum við búin í dag!',
    sound: true,
    taskSort: 'smart',       // tasks page sort: smart|date|name|priority|created
    taskSortDir: 'asc',
    heroDesc: '',            // how Thor describes his hero (feeds future avatar art)
  },
  tasks: [],       // {id,title,notes,status,priority,inbox,project,tags,scheduled,time,durationMin,estimateMin,createdAt,completedAt,goalId,rollovers,order}
  events: [],      // {id,title,date,start,end,kind,taskIds:[],notes,createdAt}
  notes: [],       // {id,title,body,tags,pinned,daily,createdAt,updatedAt}
  sessions: [],    // {id,taskId,mode,plannedMin,startedAt,endedAt,minutes,completed,distractions,rating,note}
  worklog: [],     // clock in/out spans: {id,startedAt,endedAt|null} - lightweight "I'm working" tracking
  goals: [],       // {id,year,quarter,theme,why,priorities:[{id,title,metric,tag,done}]}
  habits: {        // The Daily Saga - morning + night rituals (sourced from the Notion brain)
    bedtime: '21:30',
    morningName: 'Dawn ritual',
    nightName: 'Dusk ritual',
    morning: [
      'Wake up', 'No phone', '10-minute morning walk', 'Back home',
      '12-minute mobility session', 'Shower - 25 push-ups while water warms up',
      'Shave', 'Brush your teeth', 'Floss', 'Caffeine', 'Get to work!',
    ],
    night: [
      { offsetMin: 180, title: 'Stop eating' },
      { offsetMin: 120, title: 'Red light glasses on' },
      { offsetMin: 60, title: 'No screens - wind down' },
      { offsetMin: 30, title: 'Journal · calming music · magnesium' },
      { offsetMin: 0, title: 'Lights out' },
    ],
    log: {},       // ymd -> {m:[stepIdx…], n:[stepIdx…], q:[questId…]}
  },
  quests: [],      // custom goals: {id,title,type:'check'|'metric',metric,op,target,createdAt}
  metrics: {},     // ymd -> {sleepScore, sleepHours, source:'manual'|'ultrahuman'}
  sync: { code: null, secret: null, friends: [], autoPublish: true }, // Fellowship
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
    return migrate({
      ...defaults(), ...data,
      settings: { ...defaults().settings, ...(data.settings || {}) },
      habits: { ...defaults().habits, ...(data.habits || {}) },
      sync: { ...defaults().sync, ...(data.sync || {}) },
    });
  } catch (e) {
    console.error('Snotra: failed to load state, starting fresh', e);
    return seed(defaults());
  }
}

// One-time repairs on stored data. Safe to run on every load.
function migrate(s) {
  if (!Array.isArray(s.worklog)) s.worklog = [];
  // A focus session left running past its block used to log wall-clock time
  // (a 90 min block could record 32 h). Credit at most the planned block.
  s.sessions.forEach(x => {
    const cap = Math.max(1, x.plannedMin || 90);
    if (x.minutes > cap + 5) {
      x.minutes = cap;
      x.endedAt = (x.startedAt || x.endedAt - cap * 60000) + cap * 60000;
      x.repaired = true;
    }
  });
  // A clock-in left open for over 24h was almost certainly forgotten - close it after 8h.
  s.worklog.forEach(w => {
    if (!w.endedAt && Date.now() - w.startedAt > 24 * 3600000) { w.endedAt = w.startedAt + 8 * 3600000; w.repaired = true; }
  });
  return s;
}

function seed(s) {
  const t = todayYmd();
  const note = {
    id: uid(),
    title: 'Welcome to Snotra',
    body: [
      'Snotra is your unified brain: tasks, calendar, notes and deep work - all connected.',
      '',
      '## How it flows',
      '- Capture everything with **Q** (quick add) - try `Call Anna tomorrow 10am @loki !high for 30m`',
      '- Triage your inbox with **I**, one item at a time',
      '- Plan your day each morning (**P**) - pick tasks, estimate, timeblock',
      '- Start a deep work block with **F** - park distractions instead of switching',
      '- Close the day with the shutdown ritual (**S**)',
      '- Review your week every Sunday',
      '',
      '## Everything is linked',
      '- Link notes with [[Welcome to Snotra]] syntax',
      '- Timer sessions log against tasks, so you see planned vs actual',
      '- `- [ ] task lines` inside notes are clickable checkboxes',
      '',
      'Your data lives in this browser only. Export a backup from Settings any time.',
    ].join('\n'),
    tags: ['snotra'], pinned: true, daily: null,
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
    catch (e) { console.error('Snotra: save failed', e); }
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
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) throw new Error('Not a Snotra backup file');
  state = {
    ...defaults(), ...data,
    settings: { ...defaults().settings, ...(data.settings || {}) },
    habits: { ...defaults().habits, ...(data.habits || {}) },
    sync: { ...defaults().sync, ...(data.sync || {}) },
  };
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
  if (!n && create) n = addNote({ title: `Daily - ${date}`, daily: date, tags: ['daily'] });
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
  // Credit at most the planned block - a timer forgotten overnight is not 32h of deep work.
  const minutes = Math.min(Math.max(0, focusElapsedMs() / 60000), f.plannedMin);
  const rec = {
    id: uid(), taskId: f.taskId, mode: f.mode, plannedMin: f.plannedMin,
    startedAt: f.startedAt - f.accumMs, endedAt: (f.startedAt - f.accumMs) + Math.max(1, minutes) * 60000,
    minutes: Math.round(minutes * 10) / 10, completed, distractions: f.distractions,
    rating: null, note: '',
  };
  if (rec.minutes >= 1) state.sessions.push(rec);
  state.focus = null; save(); return rec;
}
export function rateSession(id, rating, note) {
  const s = state.sessions.find(x => x.id === id);
  if (s) { s.rating = rating || null; s.note = (note || '').trim(); save(); }
  return s;
}

// ---------- workday clock (in/out, lighter than a focus block) ----------
export function activeWork() { return state.worklog.find(w => !w.endedAt) || null; }
export function clockIn() {
  if (activeWork()) return activeWork();
  const w = { id: uid(), startedAt: Date.now(), endedAt: null };
  state.worklog.push(w); save(); return w;
}
export function clockOut() {
  const w = activeWork();
  if (w) { w.endedAt = Date.now(); save(); }
  return w;
}
// Blocks overlapping a date, clipped to that day (a span across midnight counts for both days).
export function workBlocksOn(date) {
  const d0 = new Date(date + 'T00:00').getTime(), d1 = d0 + 86400000;
  return state.worklog
    .map(w => ({ ...w, from: Math.max(w.startedAt, d0), to: Math.min(w.endedAt || Date.now(), d1) }))
    .filter(w => w.to > w.from)
    .sort((a, b) => a.from - b.from);
}
export function workMinOn(date) {
  return Math.round(workBlocksOn(date).reduce((a, w) => a + (w.to - w.from), 0) / 60000);
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

// ---------- habits / The Daily Saga ----------
export const RANKS = [
  ['Thrall', 0], ['Karl', 300], ['Húskarl', 750], ['Víkingr', 1500], ['Berserkr', 2500],
  ['Jarl', 4000], ['Konungr', 6000], ['Einherji', 8500], ['Allfather', 11500],
];

export function habitLog(date) {
  const h = state.habits;
  if (!h.log[date]) h.log[date] = { m: [], n: [], q: [] };
  if (!h.log[date].q) h.log[date].q = [];
  return h.log[date];
}
export function toggleHabitStep(date, which, idx) {
  const l = habitLog(date);
  const arr = l[which];
  const i = arr.indexOf(idx);
  if (i >= 0) arr.splice(i, 1); else arr.push(idx);
  save();
  return arr.includes(idx);
}
// checked count, guarding against steps edited shorter than old logs
function checkedCount(entry, which) {
  const total = which === 'm' ? state.habits.morning.length : state.habits.night.length;
  return (entry?.[which] || []).filter(i => i < total).length;
}
export function ritualDone(date, which) {
  const total = which === 'm' ? state.habits.morning.length : state.habits.night.length;
  return total > 0 && checkedCount(state.habits.log[date], which) >= total;
}
export const perfectDay = date => ritualDone(date, 'm') && ritualDone(date, 'n');

// ---------- quests (custom goals - checkbox or metric-driven) ----------
export function addQuest(patch) {
  const q = { id: uid(), title: '', type: 'check', metric: 'sleepScore', op: '>=', target: 85, createdAt: Date.now(), ...patch };
  state.quests.push(q); save(); return q;
}
export function updateQuest(id, patch) {
  const q = state.quests.find(x => x.id === id);
  if (q) { Object.assign(q, patch); save(); }
  return q;
}
export function deleteQuest(id) {
  state.quests = state.quests.filter(x => x.id !== id);
  Object.values(state.habits.log).forEach(l => { if (l.q) l.q = l.q.filter(x => x !== id); });
  save();
}
export function toggleQuest(date, id) {
  const l = habitLog(date);
  const i = l.q.indexOf(id);
  if (i >= 0) l.q.splice(i, 1); else l.q.push(id);
  save();
}
export function setMetrics(date, patch) {
  state.metrics[date] = { ...(state.metrics[date] || {}), ...patch };
  save();
}
// A metric quest evaluates automatically from that day's metrics; a check quest from the log.
export function questDone(q, date) {
  if (q.type === 'check') return (state.habits.log[date]?.q || []).includes(q.id);
  const m = state.metrics[date];
  const v = m ? m[q.metric] : undefined;
  if (v === undefined || v === null) return false;
  return q.op === '>=' ? v >= q.target : v <= q.target;
}
export function questsDoneCount(date) {
  return state.quests.filter(q => questDone(q, date)).length;
}

// The ring shapes the game: high recovery rolls a Berserker day (deep work pays 1.5x),
// low recovery rolls a Healer day (rest and rituals pay extra). Recovery index leads;
// sleep score stands in when the ring gives no recovery number.
export function dayKind(date) {
  const m = state.metrics[date];
  if (!m) return null;
  const r = m.recoveryIndex != null ? m.recoveryIndex : null;
  const s = m.sleepScore != null ? m.sleepScore : null;
  if (r !== null) return r >= 75 ? 'berserker' : (r < 45 ? 'healer' : 'steady');
  if (s !== null) return s >= 85 ? 'berserker' : (s < 60 ? 'healer' : 'steady');
  return null;
}

// XP: 5 per ritual step, +20 per completed ritual, +30 for a perfect day, +10 per quest-day.
// Deep work pays 10 XP/hour - 15 on Berserker days. Healer days pay +15 for a guarded night.
export function habitXp() {
  let xp = 0;
  const sessionsByDay = {};
  state.sessions.forEach(s => {
    const d = ymd(new Date(s.endedAt));
    sessionsByDay[d] = (sessionsByDay[d] || 0) + s.minutes;
  });
  const dates = new Set([...Object.keys(state.habits.log), ...Object.keys(state.metrics), ...Object.keys(sessionsByDay)]);
  dates.forEach(d => {
    const l = state.habits.log[d];
    const kind = dayKind(d);
    if (l) {
      xp += (checkedCount(l, 'm') + checkedCount(l, 'n')) * 5;
      if (ritualDone(d, 'm')) xp += 20;
      if (ritualDone(d, 'n')) xp += 20;
      if (perfectDay(d)) xp += 30;
      if (kind === 'healer' && ritualDone(d, 'n')) xp += 15; // rest honored on a low-recovery day
    }
    xp += questsDoneCount(d) * 10;
    const focusH = (sessionsByDay[d] || 0) / 60;
    xp += Math.round(focusH * (kind === 'berserker' ? 15 : 10));
  });
  return xp;
}
export function habitRank() {
  const xp = habitXp();
  let cur = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i][1]) cur = RANKS[i];
    else { next = RANKS[i]; break; }
  }
  return { xp, name: cur[0], floor: cur[1], next: next ? next[0] : null, ceil: next ? next[1] : null };
}
// Consecutive-day streak ending today (today counts only if done; else counted from yesterday).
export function habitStreak(check) {
  let d = todayYmd(), streak = 0;
  if (check(d)) streak++;
  d = addDays(d, -1);
  while (check(d)) { streak++; d = addDays(d, -1); }
  return streak;
}

// Planned workload (minutes) for a date: task estimates + timeblock durations of non-task events.
export function plannedMin(date) {
  const taskMin = state.tasks
    .filter(t => t.scheduled === date && t.status !== 'done')
    .reduce((a, t) => a + (t.estimateMin || t.durationMin || 30), 0);
  return taskMin;
}
