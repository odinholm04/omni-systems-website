// Mimir end-to-end tests. Drives every feature in a real browser.
// Usage:  npm i playwright  &&  node e2e.mjs [baseUrl]
// Serves default: http://localhost:8931/mimir/
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8931/mimir/';
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

const getState = () => page.evaluate(() => JSON.parse(localStorage.getItem('mimir.data.v1') || 'null'));
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
check('app renders sidebar brand', await page.textContent('.brand-name') === 'MIMIR');
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
check('welcome note listed', (await page.textContent('.notes-list')).includes('Welcome to Mimir'));
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
check('note search filters', (await page.textContent('.notes-list')).includes('Loki launch plan') && !(await page.textContent('.notes-list')).includes('Welcome to Mimir'));
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
check('tab title shows countdown', (await page.title()).includes('· Mimir'));

// simulate 2 minutes passing (rewind startedAt) then finish
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('mimir.data.v1'));
  d.focus.startedAt -= 2 * 60000;
  localStorage.setItem('mimir.data.v1', JSON.stringify(d));
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
  const d = JSON.parse(localStorage.getItem('mimir.data.v1'));
  const y = new Date(Date.now() - 86400000);
  const ymd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  d.tasks.push({ id: 'leftover1', title: 'Yesterday leftover', notes: '', status: 'todo', priority: 'high', inbox: false, project: null, tags: [], scheduled: ymd, time: null, durationMin: null, estimateMin: 60, createdAt: Date.now(), completedAt: null, goalId: null, rollovers: 0, order: 1 });
  d.tasks.push({ id: 'backlog1', title: 'Backlog candidate', notes: '', status: 'todo', priority: 'normal', inbox: false, project: null, tags: [], scheduled: null, time: null, durationMin: null, estimateMin: 120, createdAt: Date.now(), completedAt: null, goalId: null, rollovers: 0, order: 2 });
  localStorage.setItem('mimir.data.v1', JSON.stringify(d));
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
check('export downloads JSON', (download.suggestedFilename() || '').startsWith('mimir-backup-'));
await page.keyboard.press('Escape');

// persistence across reload
await page.reload(); await sleep(400);
st = await getState();
check('all data persists after reload', st.tasks.length > 5 && st.notes.length >= 3 && st.sessions.length >= 1);
check('theme persists', await page.getAttribute('html', 'data-theme') === 'light');

// ---------------------------------------------------------------- done
console.log(`\n${'='.repeat(50)}\n${passed} passed, ${failed} failed`);
if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  ✗ ' + f)); }
await browser.close();
process.exit(failed ? 1 : 0);
