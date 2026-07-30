// Snotra - task / event / settings modals.
import * as store from '../store.js';
import { escapeHtml, todayYmd, minutesToHM } from '../utils.js';
import { showModal, closeModal, renderApp, toast, showShortcuts } from '../app.js';
import { startFocusOnTask } from './focus.js';
import { openPaletteModal, accentDef } from '../palette.js';
import * as auth from '../auth.js';
import * as cloud from '../cloud.js';

export function openTaskModal(id = null) {
  const t = id ? store.task(id) : null;
  const isNew = !t;
  const v = t || store.newTask();
  const goals = store.get().goals;
  const goalOptions = goals.flatMap(g =>
    g.priorities.map(p => `<option value="${g.id}|${p.id}" ${v.goalId === g.id && v.goalPriorityId === p.id ? 'selected' : ''}>Q${g.quarter} · ${escapeHtml(p.title)}</option>`));

  const box = showModal(`
    <h2>${isNew ? 'New task' : 'Edit task'}</h2>
    <div class="form-row"><label style="flex:100%">Title
      <input id="tm-title" value="${escapeHtml(v.title)}" placeholder="What needs doing?"></label></div>
    <div class="form-row">
      <label>Status<select id="tm-status">
        <option value="todo" ${v.status === 'todo' ? 'selected' : ''}>Not started</option>
        <option value="doing" ${v.status === 'doing' ? 'selected' : ''}>In progress</option>
        <option value="done" ${v.status === 'done' ? 'selected' : ''}>Completed</option>
      </select></label>
      <label>Priority<select id="tm-prio">
        <option value="high" ${v.priority === 'high' ? 'selected' : ''}>High</option>
        <option value="normal" ${v.priority === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="low" ${v.priority === 'low' ? 'selected' : ''}>Low</option>
        <option value="min" ${v.priority === 'min' ? 'selected' : ''}>Minimal</option>
      </select></label>
      <label>Project<input id="tm-project" value="${escapeHtml(v.project || '')}" placeholder="loki, omni…" list="tm-projects">
        <datalist id="tm-projects">${store.projects().map(p => `<option value="${escapeHtml(p)}">`).join('')}</datalist></label>
    </div>
    <div class="form-row">
      <label>Scheduled<input type="date" id="tm-date" value="${v.scheduled || ''}"></label>
      <label>Time<input type="time" id="tm-time" value="${v.time || ''}"></label>
      <label>Estimate (min)<input type="number" id="tm-est" min="5" step="5" value="${v.estimateMin || ''}" placeholder="30"></label>
    </div>
    <div class="form-row">
      <label>Tags (comma separated)<input id="tm-tags" value="${escapeHtml(v.tags.join(', '))}" placeholder="video, edit"></label>
      <label>Quarterly priority<select id="tm-goal"><option value="">- none -</option>${goalOptions.join('')}</select></label>
    </div>
    <div class="form-row"><label style="flex:100%">Notes
      <textarea id="tm-notes" rows="3" placeholder="Details, links…">${escapeHtml(v.notes)}</textarea></label></div>
    ${!isNew && store.actualMin(v.id) ? `<p class="muted" style="font-size:12.5px">⏱ ${minutesToHM(store.actualMin(v.id))} of focused time logged on this task.</p>` : ''}
    <div class="modal-foot">
      ${!isNew ? `<button class="btn danger" id="tm-delete">Delete</button>
      <button class="btn" id="tm-focus">▶ Focus on this</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" id="tm-cancel">Cancel</button>
      <button class="btn primary" id="tm-save">${isNew ? 'Add task' : 'Save'}</button>
    </div>`);

  box.querySelector('#tm-title').focus();
  const collect = () => ({
    title: box.querySelector('#tm-title').value.trim(),
    status: box.querySelector('#tm-status').value,
    priority: box.querySelector('#tm-prio').value,
    project: box.querySelector('#tm-project').value.trim().toLowerCase() || null,
    scheduled: box.querySelector('#tm-date').value || null,
    time: box.querySelector('#tm-time').value || null,
    estimateMin: Number(box.querySelector('#tm-est').value) || null,
    tags: box.querySelector('#tm-tags').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    notes: box.querySelector('#tm-notes').value,
  });

  box.querySelector('#tm-save').onclick = () => {
    const patch = collect();
    if (!patch.title) { toast('Title required', 'warn'); return; }
    const gv = box.querySelector('#tm-goal').value;
    patch.goalId = gv ? gv.split('|')[0] : null;
    patch.goalPriorityId = gv ? gv.split('|')[1] : null;
    if (patch.scheduled) patch.inbox = false;
    if (patch.status === 'done' && (!t || t.status !== 'done')) patch.completedAt = Date.now();
    if (patch.status !== 'done') patch.completedAt = null;
    if (isNew) store.addTask({ ...patch, inbox: !patch.scheduled });
    else store.updateTask(id, patch);
    closeModal(); renderApp();
  };
  box.querySelector('#tm-cancel').onclick = closeModal;
  if (!isNew) {
    box.querySelector('#tm-delete').onclick = () => { store.deleteTask(id); closeModal(); renderApp(); toast('Task deleted'); };
    box.querySelector('#tm-focus').onclick = () => { closeModal(); startFocusOnTask(id); };
  }
  box.querySelector('#tm-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') box.querySelector('#tm-save').click();
  });
}

export function openEventModal(id = null, defaults = {}) {
  const ev = id ? store.event(id) : null;
  const isNew = !ev;
  const v = ev || { title: '', date: todayYmd(), start: '09:00', end: '10:00', kind: 'event', notes: '', taskIds: [], ...defaults };
  const openTasks = store.get().tasks.filter(t => t.status !== 'done');

  const box = showModal(`
    <h2>${isNew ? 'New event / timeblock' : 'Edit event'}</h2>
    <div class="form-row"><label style="flex:100%">Title
      <input id="em-title" value="${escapeHtml(v.title)}" placeholder="Deep work: Lydia pipeline"></label></div>
    <div class="form-row">
      <label>Type<select id="em-kind">
        <option value="event" ${v.kind === 'event' ? 'selected' : ''}>Event / meeting</option>
        <option value="deepwork" ${v.kind === 'deepwork' ? 'selected' : ''}>Deep work block</option>
        <option value="shallow" ${v.kind === 'shallow' ? 'selected' : ''}>Shallow work block</option>
        <option value="personal" ${v.kind === 'personal' ? 'selected' : ''}>Personal</option>
      </select></label>
      <label>Date<input type="date" id="em-date" value="${v.date}"></label>
      <label>Start<input type="time" id="em-start" value="${v.start}"></label>
      <label>End<input type="time" id="em-end" value="${v.end}"></label>
    </div>
    <div class="form-row"><label style="flex:100%">Linked task (worked on during this block)
      <select id="em-task"><option value="">- none -</option>
      ${openTasks.map(t => `<option value="${t.id}" ${(v.taskIds || [])[0] === t.id ? 'selected' : ''}>${escapeHtml(t.title)}</option>`).join('')}
      </select></label></div>
    <div class="form-row"><label style="flex:100%">Notes
      <textarea id="em-notes" rows="2">${escapeHtml(v.notes || '')}</textarea></label></div>
    <div class="modal-foot">
      ${!isNew ? '<button class="btn danger" id="em-delete">Delete</button>' : ''}
      <span class="spacer"></span>
      <button class="btn" id="em-cancel">Cancel</button>
      <button class="btn primary" id="em-save">${isNew ? 'Add' : 'Save'}</button>
    </div>`);

  box.querySelector('#em-title').focus();
  box.querySelector('#em-save').onclick = () => {
    const patch = {
      title: box.querySelector('#em-title').value.trim() || 'Untitled block',
      kind: box.querySelector('#em-kind').value,
      date: box.querySelector('#em-date').value || todayYmd(),
      start: box.querySelector('#em-start').value || '09:00',
      end: box.querySelector('#em-end').value || '10:00',
      taskIds: box.querySelector('#em-task').value ? [box.querySelector('#em-task').value] : [],
      notes: box.querySelector('#em-notes').value,
    };
    if (patch.end <= patch.start) { toast('End must be after start', 'warn'); return; }
    if (isNew) store.addEvent(patch); else store.updateEvent(id, patch);
    closeModal(); renderApp();
  };
  box.querySelector('#em-cancel').onclick = closeModal;
  if (!isNew) box.querySelector('#em-delete').onclick = () => { store.deleteEvent(id); closeModal(); renderApp(); };
}

export function openSettingsModal() {
  const s = store.get().settings;
  const box = showModal(`
    <h2>Settings</h2>
    <div class="form-row">
      <label>Your name<input id="st-name" value="${escapeHtml(s.name)}"></label>
      <label>Base<select id="st-theme">
        <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option>
        <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option>
      </select></label>
      <label>Accent colour<button class="btn" id="st-palette" type="button" style="width:100%;text-align:left">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--amber);vertical-align:middle;margin-right:7px"></span>${escapeHtml(accentDef(s.accent).name)} - choose…</button></label>
    </div>
    <div class="form-row">
      <label>Day starts<input type="time" id="st-start" value="${s.dayStart}"></label>
      <label>Day ends (target shutdown)<input type="time" id="st-end" value="${s.dayEnd}"></label>
    </div>
    <div class="form-row">
      <label>Daily capacity (hours of planned work)<input type="number" id="st-cap" min="1" max="16" step="0.5" value="${s.capacityHours}"></label>
      <label>Daily deep-work goal (minutes)<input type="number" id="st-goal" min="30" step="15" value="${s.focusGoalMin}"></label>
    </div>
    <div class="form-row"><label style="flex:100%">Shutdown phrase<input id="st-phrase" value="${escapeHtml(s.shutdownPhrase)}"></label></div>
    <h2 style="margin-top:20px">Keyboard shortcuts</h2>
    <p class="muted" style="font-size:12.5px">Snotra is built to be driven from the keyboard. Open the full reference any time - or press <span class="kbd">?</span> from anywhere.</p>
    <div class="modal-foot" style="margin-top:8px"><button class="btn" id="st-shortcuts" type="button">⌨ View all shortcuts</button></div>
    <h2 style="margin-top:20px">Ultrahuman ring</h2>
    <p class="muted" style="font-size:12.5px">Auto-fills your sleep score each morning so automatic quests judge themselves. Paste the auth token from the Ultrahuman Partner API email below; it stays in this browser only.</p>
    <p class="faint" style="font-size:11.5px;margin:0 0 10px">One-time pairing: in the Ultrahuman app go to <b>Profile &rarr; Settings &rarr; Partner ID</b> and enter the Partner Code from that same email. Email is optional here (only needed when reading someone else's linked ring). Sync runs on app open, or press <b>Sync ring</b> on the Rituals page.</p>
    <div class="form-row">
      <label>Account email (optional)<input id="st-uhemail" type="email" value="${escapeHtml(s.uhEmail || '')}" placeholder="you@example.com"></label>
      <label>Auth token<input id="st-uhkey" type="password" value="${escapeHtml(s.uhKey || '')}" placeholder="eyJ…"></label>
    </div>
    <h2 style="margin-top:20px">Account & cloud sync <span class="help" data-help="Optional but recommended: your whole Snotra follows you to any device and survives a wiped browser. Sign in once per device - the session keeps itself alive. Everything syncs to your own private database row that only your account can read.">?</span></h2>
    ${auth.user() ? `
    <div class="ac-box">
      <div class="ac-row"><span class="chip" style="color:var(--green)">● signed in</span> <b>${escapeHtml(auth.user().email || '')}</b>
        <span class="spacer"></span>
        <span class="mono faint" style="font-size:11px" id="ac-status">${cloud.lastSyncAt ? 'synced ' + new Date(cloud.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'not synced yet'}</span>
      </div>
      <div class="modal-foot" style="margin-top:8px">
        <button class="btn" id="ac-sync">☁ Sync now</button>
        <button class="btn ghost" id="ac-signout">Sign out</button>
      </div>
      ${cloud.lastError ? `<p class="faint" style="font-size:11px;color:var(--red)">cloud: ${escapeHtml(cloud.lastError)}</p>` : ''}
    </div>` : `
    <div class="ac-box">
      <p class="muted" style="font-size:12.5px;margin-top:0">No account yet on this device. Create one (or sign in) and your data syncs everywhere; skip it and everything simply stays local.</p>
      <div class="form-row">
        <label>Email<input id="ac-email" type="email" placeholder="you@example.com" autocomplete="username"></label>
        <label>Password<input id="ac-pass" type="password" placeholder="8+ characters" autocomplete="current-password"></label>
      </div>
      <div class="modal-foot" style="margin-top:4px">
        <button class="btn primary" id="ac-signin">Sign in</button>
        <button class="btn" id="ac-signup">Create account</button>
      </div>
    </div>`}
    <h2 style="margin-top:20px">Data</h2>
    <p class="muted" style="font-size:13px">${auth.user() ? 'Your data lives in this browser AND in your private cloud row. Backups still never hurt.' : "Everything lives in this browser's local storage. Export a backup regularly - it's a plain JSON file you can re-import anywhere."}</p>
    <div class="modal-foot" style="margin-top:8px">
      <button class="btn" id="st-export">⬇ Export backup</button>
      <button class="btn" id="st-import">⬆ Import backup</button>
      <input type="file" id="st-file" accept=".json,application/json" hidden>
      <button class="btn danger" id="st-reset">Reset all data</button>
    </div>
    <div class="modal-foot">
      <span class="spacer"></span>
      <button class="btn" id="st-cancel">Cancel</button>
      <button class="btn primary" id="st-save">Save settings</button>
    </div>`);

  box.querySelector('#st-save').onclick = () => {
    const prevUhKey = s.uhKey;
    Object.assign(s, {
      name: box.querySelector('#st-name').value.trim() || 'Friend',
      theme: box.querySelector('#st-theme').value,
      dayStart: box.querySelector('#st-start').value || '07:00',
      dayEnd: box.querySelector('#st-end').value || '18:00',
      capacityHours: Number(box.querySelector('#st-cap').value) || 8,
      focusGoalMin: Number(box.querySelector('#st-goal').value) || 180,
      shutdownPhrase: box.querySelector('#st-phrase').value,
      uhEmail: box.querySelector('#st-uhemail').value.trim(),
      uhKey: box.querySelector('#st-uhkey').value.trim(),
    });
    document.documentElement.dataset.theme = s.theme;
    store.save(); closeModal(); renderApp(); toast('Settings saved', 'success');
    // New or changed ring token: test it immediately so a bad paste is caught on the spot.
    if (s.uhKey && s.uhKey !== prevUhKey) {
      import('../metrics.js').then(({ fetchUltrahuman }) => {
        toast('◉ Testing ring connection…');
        fetchUltrahuman()
          .then(r => { toast(`◉ Ring connected: sleep score ${r.sleepScore ?? '-'}`, 'success'); renderApp(); })
          .catch(err => toast(`◉ Ring test failed: ${escapeHtml(err.message)}`, 'warn'));
      });
    }
  };
  box.querySelector('#st-palette').onclick = () => { closeModal(); openPaletteModal(); };
  box.querySelector('#st-shortcuts').onclick = () => { closeModal(); showShortcuts(); };
  box.querySelector('#st-cancel').onclick = closeModal;

  // account & cloud
  const acCreds = () => {
    const email = box.querySelector('#ac-email').value.trim();
    const pass = box.querySelector('#ac-pass').value;
    if (!email || !pass) { toast('Email and password, both', 'warn'); return null; }
    if (pass.length < 8) { toast('Password needs 8+ characters', 'warn'); return null; }
    return { email, pass };
  };
  const acSignin = box.querySelector('#ac-signin');
  if (acSignin) acSignin.onclick = async () => {
    const c = acCreds(); if (!c) return;
    acSignin.disabled = true; acSignin.textContent = 'Signing in…';
    try {
      await auth.signIn(c.email, c.pass);
      toast('☁ Signed in - syncing…', 'success');
      closeModal(); openSettingsModal();
    } catch (e) {
      toast('Sign in failed: ' + escapeHtml(e.message), 'warn');
      acSignin.disabled = false; acSignin.textContent = 'Sign in';
    }
  };
  const acSignup = box.querySelector('#ac-signup');
  if (acSignup) acSignup.onclick = async () => {
    const c = acCreds(); if (!c) return;
    acSignup.disabled = true; acSignup.textContent = 'Creating…';
    try {
      const r = await auth.signUp(c.email, c.pass);
      if (r.needsConfirm) {
        toast('Account created - check your email to confirm, then sign in here', 'warn');
        acSignup.textContent = 'Create account'; acSignup.disabled = false;
      } else {
        toast('☁ Account created and signed in', 'success');
        closeModal(); openSettingsModal();
      }
    } catch (e) {
      toast('Could not create account: ' + escapeHtml(e.message), 'warn');
      acSignup.disabled = false; acSignup.textContent = 'Create account';
    }
  };
  const acSignout = box.querySelector('#ac-signout');
  if (acSignout) acSignout.onclick = async () => {
    await auth.signOut();
    toast('Signed out - data stays on this device', 'success');
    closeModal(); openSettingsModal();
  };
  const acSync = box.querySelector('#ac-sync');
  if (acSync) acSync.onclick = async () => {
    acSync.disabled = true; acSync.textContent = '☁ Syncing…';
    const r = await cloud.syncNow();
    const msg = { 'in-sync': 'Already in sync', pulled: 'Pulled newer data from the cloud', 'pulled-conflict': 'Cloud version was newer - applied it', pushed: 'Pushed your latest changes', 'pushed-conflict': 'Your local version was newer - pushed it', 'first-push': 'First backup pushed to the cloud', error: 'Sync failed: ' + (cloud.lastError || 'unknown') }[r] || r;
    toast(msg, r === 'error' ? 'warn' : 'success');
    if (r === 'pulled' || r === 'pulled-conflict') renderApp();
    closeModal(); openSettingsModal();
  };
  box.querySelector('#st-export').onclick = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `snotra-backup-${todayYmd()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded', 'success');
  };
  box.querySelector('#st-import').onclick = () => box.querySelector('#st-file').click();
  box.querySelector('#st-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { store.importJson(r.result); closeModal(); renderApp(); toast('Backup imported', 'success'); }
      catch (err) { toast('Import failed: ' + escapeHtml(err.message), 'warn'); }
    };
    r.readAsText(f);
  };
  box.querySelector('#st-reset').onclick = () => {
    if (confirm('Reset ALL Snotra data in this browser? This cannot be undone.')) {
      store.resetAll(); closeModal(); renderApp();
    }
  };
}
