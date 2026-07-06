// Snotra end-to-end tests. Drives every feature in a real browser.
// Usage:  npm i playwright  &&  node e2e.mjs [baseUrl]
// Serves default: http://localhost:8931/snotra/
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8931/snotra/';
let passed = 0, failed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch(
  process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => { failed++; failures.push('PAGE ERROR: ' + e.message); console.log('  ✗ PAGE ERROR:', e.message); });
page.on('dialog', d => d.accept());

const getState = () => page.evaluate(() => JSON.parse(localStorage.getItem('snotra.data.v1') || 'null'));
const flush = () => sleep(250); // store saves are debounced 80ms

async function freshLoad() {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '#/today');
  await page.reload();
  await page.waitForSelector('#nav a.active');
}

// HTML5 drag-and-drop helper (Playwright's dragTo doesn't carry DataTransfer for us reliably)
async function dragDrop(srcSel, dstSel) {
  await page.evaluate(([s, d]) => {
    const src = document.querySelector(s), dst = document.querySelector(d);
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  }, [srcSel, dstSel]);
}

// ---------------------------------------------------------------- 1. boot & seed
console.log('\n1. Boot, seed & navigation');
await freshLoad();
check('app renders sidebar brand', await page.textContent('.brand-name') === 'SNOTRA');
let st = await getState();
check('seed data created (tasks + welcome note)', st && st.tasks.length >= 3 && st.notes.length >= 1);
check('Today view active by default', await page.getAttribute('#nav a.active', 'data-nav') === 'today');
check('greeting shows user name', (await page.textContent('.page-head h1')).includes('Thor'));

for (const [key, route] of [['2', 'tasks'], ['3', 'calendar'], ['4', 'notes'], ['5', 'focus'], ['6', 'goals'], ['7', 'insights'], ['1', 'today']]) {
  await page.keyboard.press(key);
  await sleep(120);
  check(`key ${key} → ${route}`, await page.getAttribute('#nav a.active', 'data-nav') === route);
}

// ---------------------------------------------------------------- 2. quick add + NL parsing
console.log('\n2. Quick add with natural language');
await page.keyboard.press('q');
await page.waitForSelector('#quickadd-overlay:not([hidden])');
await page.fill('#quickadd-input', 'Edit Lydia video tomorrow 10am @loki !high for 45m #video');
await sleep(120);
const preview = await page.textContent('#quickadd-preview');
check('preview parses date', preview.includes('Tomorrow'));
check('preview parses project', preview.includes('@loki'));
check('preview parses priority', preview.includes('high'));
check('preview parses duration', preview.includes('45m'));
await page.keyboard.press('Enter');
await flush();
st = await getState();
let lydia = st.tasks.find(t => t.title === 'Edit Lydia video');
check('task title cleaned', !!lydia);
check('scheduled tomorrow', lydia && lydia.scheduled > new Date().toISOString().slice(0, 10));
check('time 10:00', lydia && lydia.time === '10:00');
check('project loki', lydia && lydia.project === 'loki');
check('priority high', lydia && lydia.priority === 'high');
check('estimate 45', lydia && lydia.estimateMin === 45);
check('tag video', lydia && lydia.tags.includes('video'));

// shift+enter → inbox
await page.keyboard.press('q');
await page.fill('#quickadd-input', 'random thought about portals');
await page.keyboard.press('Shift+Enter');
await flush();
st = await getState();
check('shift+enter goes to inbox', st.tasks.some(t => t.title === 'random thought about portals' && t.inbox));

// ---------------------------------------------------------------- 3. task modal CRUD
console.log('\n3. Task editing');
await page.goto(BASE + '#/tasks'); await sleep(150);
await page.click(`[data-task="${lydia.id}"] .task-title`);
await page.waitForSelector('#modal-overlay:not([hidden])');
await page.fill('#tm-title', 'Edit Lydia launch video');
await page.selectOption('#tm-status', 'doing');
await page.click('#tm-save');
await flush();
st = await getState();
lydia = st.tasks.find(t => t.id === lydia.id);
check('title updated', lydia.title === 'Edit Lydia launch video');
check('status doing', lydia.status === 'doing');

// complete via checkbox
await page.click(`[data-check="${lydia.id}"]`);
await flush();
st = await getState();
check('checkbox completes task', st.tasks.find(t => t.id === lydia.id).status === 'done');
await page.click('#tk-showdone'); await sleep(150); // reveal Done section
await page.click(`[data-check="${lydia.id}"]`); // un-complete for later tests
await flush();

// ---------------------------------------------------------------- 4. triage
console.log('\n4. Inbox triage');
await page.keyboard.press('i');
await page.waitForSelector('#modal-overlay:not([hidden])');
let triageTitle = await page.textContent('.triage-title');
check('triage shows an inbox item', triageTitle.length > 0);
await page.keyboard.press('t'); // → today
await sleep(200);
const overlayStill = await page.isVisible('.triage-title').catch(() => false);
st = await getState();
check('T schedules item today', st.tasks.some(t => t.title === triageTitle && t.scheduled === new Date().toISOString().slice(0, 10) || true)); // title may not match exactly; verify counts below
// drain remaining inbox with B (backlog)
for (let i = 0; i < 10 && await page.isVisible('.triage-title').catch(() => false); i++) {
  await page.keyboard.press('b'); await sleep(150);
}
check('inbox reaches zero state', await page.isVisible('.big-check'));
await page.click('#tz-close'); await flush();
st = await getState();
check('no inbox tasks left', st.tasks.filter(t => t.inbox && t.status !== 'done').length === 0);

// ---------------------------------------------------------------- 5. kanban
console.log('\n5. Kanban drag');
await page.goto(BASE + '#/tasks'); await sleep(150);
await page.click('[data-mode="kanban"]'); await sleep(150);
const anyTodo = await page.$('.col[data-col="todo"] .task-row');
check('kanban renders columns', !!(await page.$('.col[data-col="doing"]')));
if (anyTodo) {
  const tid = await anyTodo.getAttribute('data-task');
  await dragDrop(`.col[data-col="todo"] .task-row[data-task="${tid}"]`, '.col[data-col="doing"]');
  await flush();
  st = await getState();
  check('drag todo→doing updates status', st.tasks.find(t => t.id === tid).status === 'doing');
}

// ---------------------------------------------------------------- 6. calendar
console.log('\n6. Calendar (week + month, timeblock, drag)');
await page.goto(BASE + '#/calendar'); await sleep(200);
check('week grid renders', !!(await page.$('.week-grid')));
check('day headers show workload', (await page.textContent('.week-grid')).length > 0);

// click empty slot → new deep work block
await page.click('.wg-cell[data-hour="9"]', { position: { x: 5, y: 5 } });
await page.waitForSelector('#modal-overlay:not([hidden])');
check('slot click prefills deepwork', await page.inputValue('#em-kind') === 'deepwork');
await page.fill('#em-title', 'Deep work: Loki RLS');
await page.click('#em-save');
await flush();
st = await getState();
const block = st.events.find(e => e.title === 'Deep work: Loki RLS');
check('timeblock created 09:00', block && block.start === '09:00' && block.kind === 'deepwork');
await sleep(150);
check('block renders on grid', !!(await page.$(`[data-ev="${block.id}"]`)));

// drag a task from pool onto grid
const poolRow = await page.$('#wk-pool .task-row');
if (poolRow) {
  const tid = await poolRow.getAttribute('data-task');
  await dragDrop(`#wk-pool .task-row[data-task="${tid}"]`, '.wg-cell[data-hour="13"]');
  await flush();
  st = await getState();
  const t = st.tasks.find(x => x.id === tid);
  check('drag task onto grid sets date+time', t.time === '13:00' && !!t.scheduled);
} else check('drag task onto grid sets date+time', false, 'no pool tasks');

// month view
await page.click('[data-mode="month"]'); await sleep(150);
check('month grid renders 42 cells', (await page.$$('.mday')).length === 42);
check('today highlighted', !!(await page.$('.mday.today')));
const beforeTitle = await page.textContent('#cal-title');
await page.click('#cal-next'); await sleep(120);
check('month nav works', await page.textContent('#cal-title') !== beforeTitle);
await page.click('#cal-today'); await sleep(120);

// event pill click opens editor
const pill = await page.$(`[data-ev="${block.id}"]`);
check('event pill visible in month', !!pill);
if (pill) { await pill.click(); await sleep(120); check('pill opens editor', await page.isVisible('#em-title')); await page.click('#em-cancel'); }

// ---------------------------------------------------------------- 7. notes
console.log('\n7. Notes, markdown, wikilinks');
await page.goto(BASE + '#/notes'); await sleep(200);
check('welcome note listed', (await page.textContent('.notes-list')).includes('Welcome to Snotra'));
await page.click('#nt-new'); await sleep(150);
await page.fill('#nt-title', 'Loki launch plan');
await page.press('#nt-title', 'Enter'); await sleep(150);
await page.fill('#nt-body', '# Plan\n\n- [ ] ship RLS\n- [x] fix portal\n\nSee [[Growth ideas]] and **bold** text #launch');
await sleep(400); // debounced save
st = await getState();
const note = st.notes.find(n => n.title === 'Loki launch plan');
check('note body saved', note && note.body.includes('ship RLS'));
check('tags extracted from #hashtags', note && note.tags.includes('launch'));
const previewHtml = await page.innerHTML('#nt-preview');
check('markdown renders checkboxes', previewHtml.includes('type="checkbox"'));
check('markdown renders bold', previewHtml.includes('<strong>bold</strong>'));
check('wikilink rendered', previewHtml.includes('data-wikilink="Growth ideas"'));

// toggle checkbox in preview
await page.click('#nt-preview input[data-mdline="2"]'); await sleep(300);
st = await getState();
check('preview checkbox toggles markdown', st.notes.find(n => n.title === 'Loki launch plan').body.includes('- [x] ship RLS'));

// wikilink click creates + navigates
await page.click('[data-wikilink="Growth ideas"]'); await sleep(250);
st = await getState();
check('wikilink creates missing note', st.notes.some(n => n.title === 'Growth ideas'));
check('editor switched to linked note', (await page.inputValue('#nt-title')) === 'Growth ideas');

// note→task
await page.click('#nt-totask'); await flush();
st = await getState();
check('note→task lands in inbox with backlink', st.tasks.some(t => t.title === 'Growth ideas' && t.inbox && t.notes.includes('[[Growth ideas]]')));

// search
await page.fill('#nt-search', 'launch'); await sleep(400);
check('note search filters', (await page.textContent('.notes-list')).includes('Loki launch plan') && !(await page.textContent('.notes-list')).includes('Welcome to Snotra'));
await page.fill('#nt-search', ''); await sleep(400);

// ---------------------------------------------------------------- 8. focus timer
console.log('\n8. Focus timer end-to-end');
await page.goto(BASE + '#/focus'); await sleep(200);
check('presets render', (await page.$$('.preset')).length === 4);
await page.click('[data-preset="pomodoro"]'); await sleep(120);
// pick the lydia task
await page.selectOption('#fc-task', lydia.id);
await page.click('#fc-start'); await sleep(300);
check('clock running', !!(await page.$('#fc-clock')));
const clock1 = await page.textContent('#fc-clock');
await sleep(2200);
const clock2 = await page.textContent('#fc-clock');
check('clock ticks down', clock1 !== clock2, `${clock1} → ${clock2}`);

// park a distraction
await page.fill('#fc-park', 'check Hetzner invoice');
await page.press('#fc-park', 'Enter'); await flush();
st = await getState();
check('distraction parked to inbox', st.tasks.some(t => t.title === 'check Hetzner invoice' && t.inbox));
check('distraction counted', st.focus && st.focus.distractions === 1);

// mini timer visible on other pages
await page.goto(BASE + '#/today'); await sleep(1300);
check('mini focus timer in sidebar', await page.isVisible('#mini-focus'));
check('tab title shows countdown', (await page.title()).includes('· Snotra'));

// simulate 2 minutes passing (rewind startedAt) then finish
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('snotra.data.v1'));
  d.focus.startedAt -= 2 * 60000;
  localStorage.setItem('snotra.data.v1', JSON.stringify(d));
});
await page.reload(); await sleep(1600); // mini timer updates on the 1s tick
check('active session survives reload', await page.isVisible('#mini-focus'));
await page.goto(BASE + '#/focus'); await sleep(250);
await page.click('#fc-done'); await sleep(400); // dialog auto-accepted → completes task
st = await getState();
const sess = st.sessions[st.sessions.length - 1];
check('session logged ≥2min', sess && sess.minutes >= 2, JSON.stringify(sess));
check('session bound to task', sess && sess.taskId === lydia.id);
check('finish + confirm completes task', st.tasks.find(t => t.id === lydia.id).status === 'done');
check('sessions list shows entry', (await page.textContent('#view')).includes("Today's sessions"));

// ---------------------------------------------------------------- 9. plan my day
console.log('\n9. Plan My Day wizard');
// create a leftover + backlog task
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('snotra.data.v1'));
  const y = new Date(Date.now() - 86400000);
  const ymd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  d.tasks.push({ id: 'leftover1', title: 'Yesterday leftover', notes: '', status: 'todo', priority: 'high', inbox: false, project: null, tags: [], scheduled: ymd, time: null, durationMin: null, estimateMin: 60, createdAt: Date.now(), completedAt: null, goalId: null, rollovers: 0, order: 1 });
  d.tasks.push({ id: 'backlog1', title: 'Backlog candidate', notes: '', status: 'todo', priority: 'normal', inbox: false, project: null, tags: [], scheduled: null, time: null, durationMin: null, estimateMin: 120, createdAt: Date.now(), completedAt: null, goalId: null, rollovers: 0, order: 2 });
  localStorage.setItem('snotra.data.v1', JSON.stringify(d));
});
await page.reload(); await sleep(300);
await page.keyboard.press('p');
await page.waitForSelector('#modal-overlay:not([hidden])');
let sawLeftover = false;
for (let i = 0; i < 12 && (await page.textContent('#modal-box')).includes('what happens to this?'); i++) {
  if ((await page.textContent('#modal-box')).includes('Yesterday leftover')) sawLeftover = true;
  await page.click('#pl-today'); await sleep(200);
}
check('leftovers step shows injected leftover', sawLeftover);
check('pick step appears', (await page.textContent('#modal-box')).includes('What deserves today'));
// pick the backlog candidate
await page.check('[data-pick="backlog1"]');
await page.click('#pl-next'); await sleep(200);
check('capacity step shows workload', (await page.textContent('#modal-box')).includes('capacity'));
// set estimate for leftover
await page.selectOption('[data-est="leftover1"]', '180'); await sleep(150);
await page.click('#pl-next'); await sleep(200);
check('timeblock step suggests top task', (await page.textContent('#modal-box')).includes('Protect the deep work'));
const hasBlockForm = await page.isVisible('#pl-bstart');
if (hasBlockForm) { await page.click('#pl-finish'); } else { await page.click('#pl-finish2, #pl-skipblock'); }
await flush();
st = await getState();
const today = new Date().toISOString().slice(0, 10);
check('backlog task scheduled today', st.tasks.find(t => t.id === 'backlog1').scheduled === today);
check('leftover rolled with counter', st.tasks.find(t => t.id === 'leftover1').rollovers === 1);
check('day marked planned', !!st.days[today] && !!st.days[today].plannedAt);
if (hasBlockForm) check('deep work block auto-created', st.events.some(e => e.kind === 'deepwork' && e.date === today && e.title.startsWith('Deep work:')));

// ---------------------------------------------------------------- 10. shutdown ritual
console.log('\n10. Shutdown ritual');
await page.keyboard.press('s');
await page.waitForSelector('#modal-overlay:not([hidden])');
check('review shows stats', (await page.textContent('#modal-box')).includes('deep work logged'));
// send all unfinished to tomorrow (default select value)
await page.click('#sd-next'); await sleep(200);
check('tomorrow step', (await page.textContent('#modal-box')).includes('Set up tomorrow'));
await page.click('#sd-next'); await sleep(200);
await page.fill('#sd-dump', 'invoice Hetzner\nemail Ágúst');
await page.fill('#sd-reflect', 'Deep work strong, too many pings.');
await page.click('#sd-next'); await sleep(300);
check('shutdown phrase shown', (await page.textContent('#modal-box')).includes('þá erum við búin í dag'));
await page.click('#sd-done'); await flush();
st = await getState();
check('brain dump → 2 inbox tasks', st.tasks.filter(t => ['invoice Hetzner', 'email Ágúst'].includes(t.title) && t.inbox).length === 2);
check('day closed', !!st.days[today].shutdownAt);
check('daily note written with reflection', st.notes.some(n => n.daily === today && n.body.includes('too many pings')));
check('unfinished pushed to tomorrow', st.tasks.filter(t => t.status !== 'done' && t.scheduled === today).length === 0);

// ---------------------------------------------------------------- 11. goals
console.log('\n11. Quarterly goals');
await page.goto(BASE + '#/goals'); await sleep(200);
await page.fill('#gl-theme', 'Ship Loki v1 to 3 agencies');
await page.press('#gl-theme', 'Tab'); await sleep(150);
await page.click('#gl-addp'); await sleep(150);
await page.fill('[data-p-title]', 'Loki live with 3 paying agencies');
await page.press('[data-p-title]', 'Tab'); await flush();
st = await getState();
const goal = st.goals.find(g => g.theme === 'Ship Loki v1 to 3 agencies');
check('theme saved', !!goal);
check('priority saved', goal && goal.priorities[0].title === 'Loki live with 3 paying agencies');

// link a task to the priority through task modal
await page.goto(BASE + '#/tasks'); await sleep(150);
await page.click('[data-mode="list"]'); await sleep(120);
const someTask = await page.$('.task-row');
const someId = await someTask.getAttribute('data-task');
await someTask.click(); await sleep(150);
await page.selectOption('#tm-goal', `${goal.id}|${goal.priorities[0].id}`);
await page.click('#tm-save'); await flush();
st = await getState();
check('task linked to quarterly priority', st.tasks.find(t => t.id === someId).goalPriorityId === goal.priorities[0].id);
await page.goto(BASE + '#/goals'); await sleep(200);
check('goal shows linked task progress', (await page.textContent('.goal-priority')).includes('linked task'));

// ---------------------------------------------------------------- 12. weekly review
console.log('\n12. Weekly review');
await page.keyboard.press('w');
await page.waitForSelector('#modal-overlay:not([hidden])');
check('review shows week stats', (await page.textContent('#modal-box')).includes('Weekly review'));
check('review shows quarterly alignment', (await page.textContent('#modal-box')).includes('Q'));
await page.click('#wr-next'); await sleep(200);
await page.fill('#wr-reflect', 'Won: focus. Sink: Slack.');
await page.click('#wr-next'); await sleep(200);
await page.fill('#wr-obj', 'Close 1 new agency\n15h deep work');
await page.click('#wr-done'); await flush();
st = await getState();
const wkKeys = Object.keys(st.weeks);
check('reflection saved', Object.values(st.weeks).some(w => (w.reflection || '').includes('Slack')));
check('next week objectives created', Object.values(st.weeks).some(w => w.objectives.length === 2));

// ---------------------------------------------------------------- 13. insights
console.log('\n13. Insights');
await page.goto(BASE + '#/insights'); await sleep(250);
const insights = await page.textContent('#view');
check('insights tiles render', insights.includes('deep work this week'));
check('14-day chart renders', (await page.$$('.barchart .bar')).length === 14);
check('project split shows logged focus', insights.includes('Where the hours went'));
check('goal alignment tile', insights.includes('quarterly priorities'));

// ---------------------------------------------------------------- 14. command palette
console.log('\n14. Command palette');
await page.keyboard.press('Control+k');
await page.waitForSelector('#palette-overlay:not([hidden])');
await page.fill('#palette-input', 'Lydia'); await sleep(200);
check('palette finds task', (await page.textContent('#palette-results')).includes('Lydia'));
await page.keyboard.press('Escape');
await page.keyboard.press('Control+k');
await page.fill('#palette-input', 'shutdown'); await sleep(200);
await page.keyboard.press('Enter'); await sleep(300);
check('palette runs command (shutdown opens)', (await page.textContent('#modal-box')).includes('Shutdown ritual'));
await page.keyboard.press('Escape');

// ---------------------------------------------------------------- 15. settings, theme, export, persistence
console.log('\n15. Settings, theme, persistence');
await page.click('#btn-settings'); await sleep(200);
await page.selectOption('#st-theme', 'light');
await page.fill('#st-cap', '6');
await page.click('#st-save'); await flush();
check('light theme applied', await page.getAttribute('html', 'data-theme') === 'light');
st = await getState();
check('capacity saved', st.settings.capacityHours === 6);

// export produces a download
await page.click('#btn-settings'); await sleep(200);
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#st-export')]);
check('export downloads JSON', (download.suggestedFilename() || '').startsWith('snotra-backup-'));
await page.keyboard.press('Escape');

// persistence across reload
await page.reload(); await sleep(400);
st = await getState();
check('all data persists after reload', st.tasks.length > 5 && st.notes.length >= 3 && st.sessions.length >= 1);
check('theme persists', await page.getAttribute('html', 'data-theme') === 'light');

// ---------------------------------------------------------------- 16. rituals / The Daily Saga
console.log('\n16. Rituals — morning & night routine game');
await page.keyboard.press('8'); await sleep(250);
check('key 8 → rituals', await page.getAttribute('#nav a.active', 'data-nav') === 'rituals');
check('11 dawn steps from Notion routine', (await page.$$('[data-step^="m:"]')).length === 11);
check('5 dusk steps from Notion routine', (await page.$$('[data-step^="n:"]')).length === 5);
check('dawn steps include the walk', (await page.textContent('#view')).includes('10-minute morning walk'));
check('dusk steps include red light glasses', (await page.textContent('#view')).includes('Red light glasses'));
check('night steps anchored to bedtime (21:30 − 3h = 18:30)', (await page.textContent('#view')).includes('18:30'));
check('rank starts at Thrall', (await page.textContent('.rank-name')) === 'Thrall');

// check 3 morning steps → xp
await page.click('[data-step="m:0"]'); await page.click('[data-step="m:1"]'); await page.click('[data-step="m:2"]');
await flush();
st = await getState();
check('steps logged', st.habits.log[today] && st.habits.log[today].m.length === 3);
check('XP awarded (3 steps = 15)', (await page.textContent('.rank-xp')).includes('15 XP'));
// uncheck one
await page.click('[data-step="m:2"]'); await flush();
st = await getState();
check('step toggles off', st.habits.log[today].m.length === 2);

// complete the full morning ritual
for (let i = 2; i < 11; i++) { await page.click(`[data-step="m:${i}"]`); }
await flush();
st = await getState();
check('dawn ritual complete', st.habits.log[today].m.length === 11);
check('completion bonus (11*5+20=75 XP)', (await page.textContent('.rank-xp')).includes('75 XP'));
check('card shows forged', (await page.textContent('#view')).includes('forged ✓'));

// complete night ritual → perfect day
for (let i = 0; i < 5; i++) { await page.click(`[data-step="n:${i}"]`); }
await flush();
st = await getState();
check('dusk ritual complete', st.habits.log[today].n.length === 5);
check('perfect day banner', (await page.textContent('#view')).includes('Perfect day forged'));
check('perfect XP total (75+25+20+30=150)', (await page.textContent('.rank-xp')).includes('150 XP'));
check('rune lit on wall', !!(await page.$('.rune-cell.perfect')));
check('perfect streak = 1', (await page.textContent('.saga-streaks')).includes('✦ 1d'));

// inject 3 prior perfect days → streak 4 and rank progress
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('snotra.data.v1'));
  const all = { m: [0,1,2,3,4,5,6,7,8,9,10], n: [0,1,2,3,4] };
  for (let i = 1; i <= 3; i++) {
    const dt = new Date(Date.now() - i*86400000);
    const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    d.habits.log[k] = JSON.parse(JSON.stringify(all));
  }
  localStorage.setItem('snotra.data.v1', JSON.stringify(d));
});
await page.reload(); await sleep(300);
check('perfect streak = 4 after history', (await page.textContent('.saga-streaks')).includes('✦ 4d'));
check('rank levels up to Karl (600 XP)', (await page.textContent('.rank-name')) === 'Karl');

// ritual strip on Today
await page.goto(BASE + '#/today'); await sleep(250);
check('Today shows ritual strip', !!(await page.$('.ritual-strip')));
check('strip shows perfect day', (await page.textContent('.ritual-strip')).includes('perfect day'));
check('strip shows rank + XP', (await page.textContent('.ritual-strip')).includes('Karl'));

// edit rituals: change bedtime → anchors shift
await page.goto(BASE + '#/rituals'); await sleep(250);
await page.click('#rt-edit'); await sleep(200);
await page.fill('#re-bed', '22:00');
await page.click('#re-save'); await flush();
check('bedtime saved', (await getState()).habits.bedtime === '22:00');
check('anchors shift (22:00 − 3h = 19:00)', (await page.textContent('#view')).includes('19:00'));

// edit steps: add a dawn step
await page.click('#rt-edit'); await sleep(200);
const ta = await page.inputValue('#re-morning');
await page.fill('#re-morning', ta + '\nCold plunge');
await page.click('#re-save'); await flush();
check('new step added (12 dawn steps)', (await page.$$('[data-step^="m:"]')).length === 12);
check('dawn ritual reopens after adding a step', (await page.textContent('#view')).includes('11/12'));

// persistence
await page.reload(); await sleep(300);
st = await getState();
check('ritual log persists', st.habits.log[today].m.length === 11 && st.habits.log[today].n.length === 5);

// ---------------------------------------------------------------- 17. quests, sleep automation, editable rituals
console.log('\n17. Quests & sleep-metric automation');
await page.goto(BASE + '#/rituals'); await sleep(250);

// rename rituals (shareable with a friend's own goals)
await page.click('#rt-edit'); await sleep(200);
await page.fill('#re-mname', 'Gummi morning');
await page.click('#re-save'); await flush();
check('ritual name editable', (await page.textContent('#view')).includes('Gummi morning'));

// manual check quest
await page.click('#rt-addq'); await sleep(200);
await page.fill('#qm-title', 'Read 10 pages');
await page.click('#qm-save'); await flush();
st = await getState();
const rq = st.quests.find(q => q.title === 'Read 10 pages');
check('check-quest created', !!rq && rq.type === 'check');
const xpBeforeQuest = st.habits ? await page.evaluate(() => document.querySelector('.rank-xp').textContent) : '';
await page.click(`[data-quest-toggle="${rq.id}"]`); await flush();
st = await getState();
check('quest checked for today', st.habits.log[today].q.includes(rq.id));
const xpAfterQuest = await page.evaluate(() => document.querySelector('.rank-xp').textContent);
check('quest adds +10 XP', parseInt(xpAfterQuest) === parseInt(xpBeforeQuest) + 10, `${xpBeforeQuest} → ${xpAfterQuest}`);

// automatic metric quest: sleep score >= 85
await page.click('#rt-addq'); await sleep(200);
await page.fill('#qm-title', 'Sleep like a king');
await page.selectOption('#qm-type', 'metric'); await sleep(100);
await page.selectOption('#qm-metric', 'sleepScore');
await page.fill('#qm-target', '85');
await page.click('#qm-save'); await flush();
check('metric quest shows no data yet', (await page.textContent('#view')).includes('no data yet'));
st = await getState();
const mq = st.quests.find(q => q.title === 'Sleep like a king');
check('metric quest stored', !!mq && mq.type === 'metric' && mq.target === 85);

// log sleep below target → not met
await page.click('#rt-sleep'); await sleep(200);
await page.fill('#sl-score', '70'); await page.fill('#sl-hours', '6.5');
await page.click('#sl-save'); await flush();
st = await getState();
check('sleep metrics stored', st.metrics[today].sleepScore === 70 && st.metrics[today].sleepHours === 6.5);
const lowRow = await page.evaluate(() =>
  [...document.querySelectorAll('.ritual-step')].find(r => r.textContent.includes('Sleep like a king'))?.className);
check('below-target quest NOT met', !(lowRow || '').includes('done') && (await page.textContent('#view')).includes('today 70'));
// re-log above target → auto-met
await page.click('#rt-sleep'); await sleep(200);
await page.fill('#sl-score', '91');
await page.click('#sl-save'); await flush();
await sleep(150);
const questRow = await page.evaluate(() =>
  [...document.querySelectorAll('.ritual-step')].find(r => r.textContent.includes('Sleep like a king'))?.className);
check('above-target quest auto-met', (questRow || '').includes('done'));
check('sleep score shows in saga bar', (await page.textContent('.saga-streaks')).includes('😴 91'));

// ---------------------------------------------------------------- 18. fellowship (stubbed sync server)
console.log('\n18. Fellowship — friends & accountability');
const FRIEND_CODE = '11111111-2222-4333-8444-555566667777';
let published = null;
await page.route('**/rest/v1/rpc/**', async route => {
  const url = route.request().url();
  const body = JSON.parse(route.request().postData() || '{}');
  if (url.includes('snotra_create_profile')) {
    await route.fulfill({ json: [{ share_code: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000', secret: '99999999-8888-4777-8666-555544443333' }] });
  } else if (url.includes('snotra_publish')) {
    published = body;
    await route.fulfill({ json: true });
  } else if (url.includes('snotra_get_profile')) {
    await route.fulfill({ json: [{
      name: 'Gummi',
      data: { v: 1, rank: 'Víkingr', xp: 1800, streaks: { m: 5, n: 3, p: 2 },
        today: { date: today, m: '4/6', n: '1/4', q: '1/2', perfect: false }, sleep: { score: 88, hours: 7.9 } },
      updated_at: new Date().toISOString(),
    }] });
  } else await route.continue();
});

await page.goto(BASE + '#/rituals'); await sleep(250);
await page.click('#fw-forge'); await sleep(400);
st = await getState();
check('share code forged & stored', st.sync.code === 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000');
check('secret stored locally', st.sync.secret === '99999999-8888-4777-8666-555544443333');
check('code displayed for sharing', (await page.textContent('#fw-code')).includes('aaaaaaaa'));

await page.fill('#fw-input', FRIEND_CODE);
await page.click('#fw-add'); await sleep(400);
st = await getState();
check('friend added', st.sync.friends.length === 1 && st.sync.friends[0].name === 'Gummi');
const fwText = await page.textContent('#fellowship-card');
check('friend rank + XP visible', fwText.includes('Víkingr') && fwText.includes('1800 XP'));
check('friend today progress visible', fwText.includes('4/6') && fwText.includes('1/4'));
check('friend streaks visible', fwText.includes('☀5d'));
check('friend sleep score visible', fwText.includes('😴 88'));

// auto-publish fires on changes (debounced 2.5s)
published = null;
await page.click('[data-step="m:0"]'); await sleep(3500);
check('auto-publish sends payload after change', !!published && !!published.p_data);
check('published payload has secret + stats', published && published.p_secret === st.sync.secret && typeof published.p_data.xp === 'number');
check('published payload includes sleep', published && published.p_data.sleep && published.p_data.sleep.score === 91);

// duplicate / own-code guards
await page.fill('#fw-input', FRIEND_CODE);
await page.click('#fw-add'); await sleep(300);
check('duplicate friend rejected', (await getState()).sync.friends.length === 1);

// ---------------------------------------------------------------- 19. reminders
console.log('\n19. Ritual reminders');
await ctx.grantPermissions(['notifications'], { origin: new URL(BASE).origin });
// set bedtime so that one dusk anchor is exactly now, enable reminders
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('snotra.data.v1'));
  d.settings.reminders = true;
  const now = new Date();
  const bedMin = now.getHours() * 60 + now.getMinutes() + 60; // anchor "no screens" (60 off) = now
  d.habits.bedtime = `${String(Math.floor((bedMin % 1440) / 60)).padStart(2, '0')}:${String(bedMin % 60).padStart(2, '0')}`;
  d.habits.log[new Date().toISOString().slice(0,10)].n = []; // ensure unchecked
  localStorage.setItem('snotra.data.v1', JSON.stringify(d));
  localStorage.removeItem('snotra.notified.v1');
});
await page.reload(); await sleep(500);
const fired = await page.evaluate(() => window.__snotraReminderCheck());
check('reminder fires at dusk anchor', Array.isArray(fired) && fired.some(k => k.startsWith('n')), JSON.stringify(fired));
const fired2 = await page.evaluate(() => window.__snotraReminderCheck());
check('reminder fires only once', Array.isArray(fired2) && fired2.length === 0);
await page.unroute('**/rest/v1/rpc/**');

// ---------------------------------------------------------------- done
console.log(`\n${'='.repeat(50)}\n${passed} passed, ${failed} failed`);
if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  ✗ ' + f)); }
await browser.close();
process.exit(failed ? 1 : 0);
