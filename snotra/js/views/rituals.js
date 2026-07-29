// Snotra - Rituals: "The Daily Saga". Fully editable morning/night rituals + custom quests,
// gamified with XP, Norse ranks, streaks, a rune wall, sleep metrics and a friend Fellowship.
import * as store from '../store.js';
import * as sync from '../sync.js';
import { fetchUltrahuman } from '../metrics.js';
import { escapeHtml, todayYmd, addDays, timeToMin, minToTime } from '../utils.js';
import { showModal, closeModal, renderApp, toast } from '../app.js';

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'];
const METRIC_LABEL = { sleepScore: 'sleep score', sleepHours: 'hours slept', steps: 'steps', movementIndex: 'movement index', recoveryIndex: 'recovery index' };

export function nightStepTime(step) {
  const bed = timeToMin(store.get().habits.bedtime);
  return minToTime(bed - step.offsetMin);
}

// Which night step is "up next" right now (null outside the wind-down window).
function nextNightIdx() {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const bed = timeToMin(store.get().habits.bedtime);
  const l = store.habitLog(todayYmd());
  const steps = store.get().habits.night;
  // Steps can be displayed in any order the user likes, so pick the due,
  // unchecked step whose time comes earliest in the evening (largest offset).
  let best = null;
  for (let i = 0; i < steps.length; i++) {
    if (l.n.includes(i) || now < bed - steps[i].offsetMin - 30) continue;
    if (best === null || steps[i].offsetMin > steps[best].offsetMin) best = i;
  }
  return best;
}

export function renderRituals(el) {
  const h = store.get().habits;
  const t = todayYmd();
  const log = store.habitLog(t);
  const rank = store.habitRank();
  const mStreak = store.habitStreak(d => store.ritualDone(d, 'm'));
  const nStreak = store.habitStreak(d => store.ritualDone(d, 'n'));
  const pStreak = store.habitStreak(d => store.perfectDay(d));
  const mDone = store.ritualDone(t, 'm');
  const nDone = store.ritualDone(t, 'n');
  const perfect = mDone && nDone;
  const rankPct = rank.ceil ? Math.round((rank.xp - rank.floor) / (rank.ceil - rank.floor) * 100) : 100;
  const nextIdx = nextNightIdx();
  const quests = store.get().quests;
  const met = store.get().metrics[t];
  const syncState = store.get().sync;
  const remindersOn = store.get().settings.reminders && typeof Notification !== 'undefined' && Notification.permission === 'granted';

  el.innerHTML = `
  <div class="page-head">
    <h1>Rituals</h1>
    <span class="page-sub">the daily saga - win the morning, guard the night</span>
    <div class="page-actions">
      <label class="switch-wrap" title="Nudges at each dusk anchor while a Snotra tab is open">
        <span class="switch-label">🔔 Reminders</span>
        <span class="switch"><input type="checkbox" id="rt-remind" ${remindersOn ? 'checked' : ''}><i></i></span>
      </label>
      <button class="btn small" id="rt-edit">✎ Edit rituals</button>
    </div>
  </div>

  <div class="card saga-bar">
    <div class="rank-badge" title="${rank.xp} XP total">
      <div class="rank-rune">${RUNES[store.RANKS.findIndex(r => r[0] === rank.name)] || 'ᚠ'}</div>
      <div>
        <div class="rank-name">${rank.name}</div>
        <div class="rank-xp mono">${rank.xp} XP${rank.next ? ` · ${rank.ceil - rank.xp} to ${rank.next}` : ' · max rank'}</div>
      </div>
    </div>
    <div class="rank-track"><i style="width:${rankPct}%"></i></div>
    <div class="saga-streaks mono">
      <span title="Morning ritual streak">☀ ${mStreak}d</span>
      <span title="Night ritual streak">☾ ${nStreak}d</span>
      <span title="Perfect-day streak" class="${pStreak ? 'perfect-glow' : ''}">✦ ${pStreak}d</span>
      ${met && met.sleepScore != null ? `<span title="Sleep score (${met.source})">😴 ${met.sleepScore}</span>` : ''}
    </div>
  </div>

  ${perfect ? `<div class="card perfect-banner">✦ Perfect day forged - both rituals complete. The saga grows. (+30 XP)</div>` : ''}

  <div class="grid cols-2">
    <div class="card ritual-card ${mDone ? 'complete' : ''}">
      <h2>☀ ${escapeHtml(h.morningName)} <span class="count">${log.m.length}/${h.morning.length}</span>
        <span class="spacer"></span>${mDone ? '<span class="chip" style="color:var(--green)">forged ✓</span>' : ''}</h2>
      <div class="ritual-steps">
        ${h.morning.map((s, i) => stepHtml('m', i, s, null, log.m.includes(i), false)).join('')}
      </div>
      ${mDone ? '<p class="ritual-victory">The morning is yours. Get to work. 💪</p>' : ''}
    </div>

    <div class="card ritual-card ${nDone ? 'complete' : ''}">
      <h2>☾ ${escapeHtml(h.nightName)} <span class="count">${log.n.length}/${h.night.length}</span>
        <span class="spacer"></span><span class="chip mono">bedtime ${h.bedtime}</span>
        ${nDone ? '<span class="chip" style="color:var(--green)">forged ✓</span>' : ''}</h2>
      <div class="ritual-steps">
        ${h.night.map((s, i) => stepHtml('n', i, s.title, nightStepTime(s), log.n.includes(i), i === nextIdx)).join('')}
      </div>
      ${nDone ? `<p class="ritual-victory">“${escapeHtml(store.get().settings.shutdownPhrase)}” - sleep well. 🌙</p>` : ''}
    </div>

    <div class="card">
      <h2>◈ Quests <span class="count">${store.questsDoneCount(t)}/${quests.length} today · +10 XP each</span>
        <span class="spacer"></span>
        <button class="btn small" id="rt-sleep">😴 Log sleep</button>
        ${store.get().settings.uhKey ? '<button class="btn small" id="rt-ring">◉ Sync ring</button>' : ''}
        <button class="btn small primary" id="rt-addq">+ Quest</button></h2>
      ${quests.length ? quests.map(q => questHtml(q, t)).join('') :
        `<div class="empty">Your own goals, your rules. A quest is anything you want to be held to daily -
         “Read 10 pages”, “No sugar”, or an automatic one like “Sleep score ≥ 85” that checks itself from your ring data.</div>`}
      ${met ? `<p class="faint" style="font-size:11.5px;margin:10px 0 0">Today's sleep: ${met.sleepScore != null ? `score ${met.sleepScore}` : ''}${met.sleepHours != null ? ` · ${met.sleepHours}h` : ''} <span class="mono">(${met.source})</span></p>` : ''}
    </div>

    <div class="card" id="fellowship-card">
      <h2>⚔ Fellowship <span class="count">${syncState.friends.length ? syncState.friends.length + ' companion(s)' : 'accountability, Viking style'}</span>
        <span class="spacer"></span>
        ${syncState.code ? '<button class="btn small" id="fw-refresh">↻ Refresh</button>' : ''}</h2>
      ${fellowshipHtml(syncState)}
    </div>
  </div>

  <div class="card" style="margin-top:14px">
    <h2>Rune wall <span class="count">last 28 days · a rune lights when the day is perfect</span></h2>
    <div class="rune-wall">
      ${Array.from({ length: 28 }, (_, i) => {
        const d = addDays(t, i - 27);
        const m = store.ritualDone(d, 'm'), n = store.ritualDone(d, 'n');
        const p = m && n;
        return `<div class="rune-cell ${p ? 'perfect' : ''}" title="${d}${m ? ' · ☀' : ''}${n ? ' · ☾' : ''}${p ? ' · perfect' : ''}">
          <span class="rune-glyph">${RUNES[i]}</span>
          <span class="rune-dots"><i class="${m ? 'on-m' : ''}"></i><i class="${n ? 'on-n' : ''}"></i></span>
          <span class="rune-day">${d.slice(8)}</span>
        </div>`;
      }).join('')}
    </div>
    <p class="faint" style="font-size:11.5px;margin:10px 0 0">☀ dot = ${escapeHtml(h.morningName.toLowerCase())} · ☾ dot = ${escapeHtml(h.nightName.toLowerCase())} · lit rune = perfect day. Every step is 5 XP, a full ritual +20, a perfect day +30, each quest +10.</p>
  </div>`;

  // ritual steps
  el.querySelectorAll('[data-step]').forEach(row => row.onclick = () => {
    const [which, idx] = row.dataset.step.split(':');
    const wasDone = store.ritualDone(t, which);
    store.toggleHabitStep(t, which, Number(idx));
    if (!wasDone && store.ritualDone(t, which)) {
      toast(which === 'm' ? '☀ Ritual forged! +20 XP' : '☾ Ritual forged! +20 XP', 'success');
      if (store.perfectDay(t)) toast('✦ PERFECT DAY - the rune is lit! +30 XP', 'success');
    }
    sync.schedulePublish();
    renderApp();
  });
  el.querySelector('#rt-edit').onclick = openRitualEditor;
  el.querySelector('#rt-remind').onchange = enableReminders;

  // quests
  el.querySelector('#rt-addq').onclick = () => openQuestModal();
  el.querySelectorAll('[data-quest-toggle]').forEach(b => b.onclick = () => {
    store.toggleQuest(t, b.dataset.questToggle);
    sync.schedulePublish();
    renderApp();
  });
  el.querySelectorAll('[data-quest-edit]').forEach(b => b.onclick = e => {
    e.stopPropagation(); openQuestModal(b.dataset.questEdit);
  });
  el.querySelector('#rt-sleep').onclick = openSleepModal;
  const ring = el.querySelector('#rt-ring');
  if (ring) ring.onclick = async () => {
    ring.disabled = true; ring.textContent = '◉ Syncing…';
    try {
      const r = await fetchUltrahuman();
      toast(`Ring synced: score ${r.sleepScore ?? '-'}${r.sleepHours ? ` · ${r.sleepHours}h` : ''}`, 'success');
      sync.schedulePublish();
    } catch (err) {
      toast('Ring sync failed: ' + escapeHtml(err.message) + ' - log sleep manually', 'warn');
    }
    renderApp();
  };

  wireFellowship(el, syncState);

  // background-refresh companions (throttled)
  if (syncState.friends.length) sync.refreshFriends().then(ch => { if (ch) renderApp(); }).catch(() => {});
}

function stepHtml(which, i, title, time, done, isNext) {
  return `<div class="ritual-step ${done ? 'done' : ''} ${isNext ? 'next' : ''}" data-step="${which}:${i}">
    <span class="rs-check">${done ? '✓' : ''}</span>
    ${time ? `<span class="rs-time mono">${time}</span>` : `<span class="rs-num mono">${i + 1}</span>`}
    <span class="rs-title">${escapeHtml(title)}</span>
    ${isNext ? '<span class="chip" style="color:var(--amber-bright)">now</span>' : ''}
  </div>`;
}

// ---------- quests ----------
function questHtml(q, t) {
  const done = store.questDone(q, t);
  const streak = store.habitStreak(d => store.questDone(q, d));
  let detail = '';
  if (q.type === 'metric') {
    const m = store.get().metrics[t];
    const v = m ? m[q.metric] : null;
    detail = `<span class="chip mono" title="checks itself from ring data">auto · ${METRIC_LABEL[q.metric]} ${q.op} ${q.target}${v != null ? ` · today ${v}` : ' · no data yet'}</span>`;
  }
  return `<div class="ritual-step ${done ? 'done' : ''}" ${q.type === 'check' ? `data-quest-toggle="${q.id}"` : ''} style="${q.type === 'metric' ? 'cursor:default' : ''}">
    <span class="rs-check" style="${q.type === 'metric' && done ? 'background:var(--amber);border-color:var(--amber)' : ''}">${done ? '✓' : ''}</span>
    <span class="rs-title">${escapeHtml(q.title)}</span>
    ${detail}
    ${streak ? `<span class="chip mono" title="quest streak">🔥 ${streak}d</span>` : ''}
    <span class="spacer"></span>
    <button class="icon-btn" data-quest-edit="${q.id}" title="Edit quest">✎</button>
  </div>`;
}

function openQuestModal(id = null) {
  const q = id ? store.get().quests.find(x => x.id === id) : null;
  const v = q || { title: '', type: 'check', metric: 'sleepScore', op: '>=', target: 85 };
  const box = showModal(`
    <h2>${q ? 'Edit quest' : 'New quest'}</h2>
    <div class="form-row"><label style="flex:100%">What are you committing to?
      <input id="qm-title" value="${escapeHtml(v.title)}" placeholder="Read 10 pages · No sugar · Sleep score ≥ 85…"></label></div>
    <div class="form-row">
      <label>How is it judged?<select id="qm-type">
        <option value="check" ${v.type === 'check' ? 'selected' : ''}>I check it off myself</option>
        <option value="metric" ${v.type === 'metric' ? 'selected' : ''}>Automatic - from ring data</option>
      </select></label>
    </div>
    <div class="form-row" id="qm-metric-row" style="${v.type === 'metric' ? '' : 'display:none'}">
      <label>Metric<select id="qm-metric">
        <option value="sleepScore" ${v.metric === 'sleepScore' ? 'selected' : ''}>Sleep score (0-100)</option>
        <option value="sleepHours" ${v.metric === 'sleepHours' ? 'selected' : ''}>Hours slept</option>
        <option value="steps" ${v.metric === 'steps' ? 'selected' : ''}>Steps</option>
        <option value="movementIndex" ${v.metric === 'movementIndex' ? 'selected' : ''}>Movement index (0-100)</option>
        <option value="recoveryIndex" ${v.metric === 'recoveryIndex' ? 'selected' : ''}>Recovery index (0-100)</option>
      </select></label>
      <label>Condition<select id="qm-op">
        <option value=">=" ${v.op === '>=' ? 'selected' : ''}>at least (≥)</option>
        <option value="<=" ${v.op === '<=' ? 'selected' : ''}>at most (≤)</option>
      </select></label>
      <label>Target<input type="number" id="qm-target" step="0.5" value="${v.target}"></label>
    </div>
    <p class="faint" style="font-size:12px">Automatic quests judge themselves the moment sleep data lands - from your Ultrahuman ring or a manual log. No arguing with the rune wall.</p>
    <div class="modal-foot">
      ${q ? '<button class="btn danger" id="qm-del">Delete</button>' : ''}
      <span class="spacer"></span>
      <button class="btn" id="qm-cancel">Cancel</button>
      <button class="btn primary" id="qm-save">${q ? 'Save' : 'Add quest'}</button>
    </div>`);
  box.querySelector('#qm-type').onchange = e => {
    box.querySelector('#qm-metric-row').style.display = e.target.value === 'metric' ? '' : 'none';
  };
  box.querySelector('#qm-title').focus();
  box.querySelector('#qm-cancel').onclick = closeModal;
  if (q) box.querySelector('#qm-del').onclick = () => { store.deleteQuest(q.id); closeModal(); renderApp(); };
  box.querySelector('#qm-save').onclick = () => {
    const patch = {
      title: box.querySelector('#qm-title').value.trim(),
      type: box.querySelector('#qm-type').value,
      metric: box.querySelector('#qm-metric').value,
      op: box.querySelector('#qm-op').value,
      target: Number(box.querySelector('#qm-target').value) || 0,
    };
    if (!patch.title) { toast('Give the quest a name', 'warn'); return; }
    if (q) store.updateQuest(q.id, patch); else store.addQuest(patch);
    sync.schedulePublish();
    closeModal(); renderApp();
  };
}

function openSleepModal() {
  const t = todayYmd();
  const m = store.get().metrics[t] || {};
  const box = showModal(`
    <h2>Log last night's sleep</h2>
    <div class="form-row">
      <label>Sleep score (0–100)<input type="number" id="sl-score" min="0" max="100" value="${m.sleepScore ?? ''}" placeholder="85"></label>
      <label>Hours slept<input type="number" id="sl-hours" min="0" max="16" step="0.1" value="${m.sleepHours ?? ''}" placeholder="7.5"></label>
    </div>
    <p class="faint" style="font-size:12px">Automatic quests re-judge instantly. Connect your Ultrahuman ring in Settings to skip this.</p>
    <div class="modal-foot"><span class="spacer"></span>
      <button class="btn" id="sl-cancel">Cancel</button>
      <button class="btn primary" id="sl-save">Save</button></div>`);
  box.querySelector('#sl-cancel').onclick = closeModal;
  box.querySelector('#sl-save').onclick = () => {
    const score = box.querySelector('#sl-score').value;
    const hours = box.querySelector('#sl-hours').value;
    const patch = { source: 'manual' };
    if (score !== '') patch.sleepScore = Math.max(0, Math.min(100, Number(score)));
    if (hours !== '') patch.sleepHours = Number(hours);
    store.setMetrics(t, patch);
    sync.schedulePublish();
    closeModal(); renderApp();
  };
}

// ---------- fellowship ----------
function fellowshipHtml(s) {
  if (!s.code) {
    return `<p class="muted" style="font-size:13px">Forge a share code and give it to a friend. They see your streaks, XP and today's
      progress - you see theirs. Nobody slacks unseen. Tasks, notes and calendar stay private on your device.</p>
      <button class="btn primary" id="fw-forge">⚒ Forge my share code</button>`;
  }
  return `
    <div class="fw-code-row">
      <span class="faint" style="font-size:12px">Your share code</span>
      <code class="fw-code mono" id="fw-code" title="Click to copy">${s.code}</code>
    </div>
    <div class="fw-add-row">
      <input id="fw-input" placeholder="Paste a friend's share code…" style="flex:1">
      <button class="btn" id="fw-add">+ Add companion</button>
    </div>
    ${s.friends.length ? s.friends.map(friendHtml).join('') : '<div class="empty">No companions yet - send your code to a friend who has Snotra open at omni-systems.ai/snotra.</div>'}
    ${sync.lastError ? `<p class="faint" style="font-size:11px;color:var(--red)">sync: ${escapeHtml(sync.lastError)}</p>` : ''}`;
}

function friendHtml(f) {
  const d = f.last || {};
  const today = d.today || {};
  const stale = today.date && today.date !== todayYmd();
  const age = f.updatedAt ? Math.round((Date.now() - new Date(f.updatedAt).getTime()) / 3600000) : null;
  return `<div class="fw-friend" data-friend="${f.code}">
    <div class="fw-friend-head">
      <b>${escapeHtml(f.name || 'Companion')}</b>
      <span class="chip mono">${escapeHtml(d.rank || '-')} · ${d.xp ?? 0} XP</span>
      ${d.streaks ? `<span class="mono faint" style="font-size:11px">☀${d.streaks.m}d ☾${d.streaks.n}d ✦${d.streaks.p}d</span>` : ''}
      <span class="spacer"></span>
      <button class="btn small" data-fw-nudge="${f.code}" data-fw-name="${escapeHtml(f.name || 'Companion')}" title="Send them a push (once per hour)">⚡ Nudge</button>
      <button class="icon-btn" data-fw-remove="${f.code}" title="Remove">✕</button>
    </div>
    <div class="fw-friend-body mono">
      ${stale ? `<span style="color:var(--red)">no entry yet today - poke them ⚔</span>`
        : `today: ☀ ${today.m || '0/0'} · ☾ ${today.n || '0/0'} · ◈ ${today.q || '0/0'}${today.perfect ? ' · <span style="color:var(--amber-bright)">✦ perfect</span>' : ''}`}
      ${d.sleep && d.sleep.score != null ? ` · 😴 ${d.sleep.score}` : ''}
      ${age !== null ? `<span class="faint"> · seen ${age < 1 ? 'just now' : age + 'h ago'}</span>` : ''}
    </div>
  </div>`;
}

function wireFellowship(el, s) {
  const forge = el.querySelector('#fw-forge');
  if (forge) forge.onclick = async () => {
    forge.disabled = true; forge.textContent = '⚒ Forging…';
    try {
      await sync.forgeShareCode();
      toast('Share code forged - send it to your companion ⚔', 'success');
    } catch (e) {
      toast('Could not reach the sync server: ' + escapeHtml(e.message), 'warn');
    }
    renderApp();
  };
  const codeEl = el.querySelector('#fw-code');
  if (codeEl) codeEl.onclick = () => {
    navigator.clipboard?.writeText(s.code).then(() => toast('Code copied', 'success')).catch(() => {});
  };
  const add = el.querySelector('#fw-add');
  if (add) add.onclick = async () => {
    const input = el.querySelector('#fw-input');
    add.disabled = true;
    try {
      const p = await sync.addFriend(input.value);
      toast(`⚔ ${escapeHtml(p.name)} joined your fellowship`, 'success');
      renderApp();
    } catch (e) {
      toast(escapeHtml(e.message), 'warn');
      add.disabled = false;
    }
  };
  el.querySelectorAll('[data-fw-remove]').forEach(b => b.onclick = () => {
    sync.removeFriend(b.dataset.fwRemove); renderApp();
  });
  el.querySelectorAll('[data-fw-nudge]').forEach(b => b.onclick = () => openNudgeModal(b.dataset.fwNudge, b.dataset.fwName));
  const refresh = el.querySelector('#fw-refresh');
  if (refresh) refresh.onclick = async () => {
    refresh.textContent = '↻ …';
    await sync.refreshFriends(true).catch(() => {});
    await sync.publishNow().catch(() => {});
    renderApp();
  };
}

// ---------- nudges ----------
const NUDGE_PRESETS = [
  'The saga waits - your ritual is unfinished! ⚔',
  'Odin sees an empty rune wall today. Fix it.',
  'One small step tonight keeps the streak alive. 🌙',
  'Proud of your streak - keep the fire! 🔥',
];
function openNudgeModal(code, name) {
  const box = showModal(`
    <h2>⚡ Nudge ${escapeHtml(name)}</h2>
    <p class="muted" style="font-size:12.5px">A short push, delivered when they next open Snotra. One per companion per hour - make it count.</p>
    ${NUDGE_PRESETS.map((p, i) => `<button class="btn" data-preset="${i}" style="width:100%;text-align:left;margin-bottom:6px">${p}</button>`).join('')}
    <div class="form-row" style="margin-top:6px"><label style="flex:100%">Or your own words
      <input id="ng-msg" maxlength="200" placeholder="Write something worthy of the fellowship…"></label></div>
    <div class="modal-foot"><span class="spacer"></span>
      <button class="btn" id="ng-cancel">Cancel</button>
      <button class="btn primary" id="ng-send">Send nudge</button></div>`);
  const send = async msg => {
    try {
      await sync.sendNudge(code, msg);
      closeModal();
      toast(`⚡ Nudge sent to ${escapeHtml(name)}`, 'success');
    } catch (e) { toast(escapeHtml(e.message), 'warn'); }
  };
  box.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => send(NUDGE_PRESETS[Number(b.dataset.preset)]));
  box.querySelector('#ng-cancel').onclick = closeModal;
  box.querySelector('#ng-send').onclick = () => send(box.querySelector('#ng-msg').value.trim() || undefined);
}

// ---------- reminders ----------
async function enableReminders() {
  if (typeof Notification === 'undefined') { toast('This browser has no notification support', 'warn'); return; }
  const s = store.get().settings;
  if (s.reminders && Notification.permission === 'granted') {
    s.reminders = false; store.save(); renderApp(); toast('Reminders off');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications blocked by the browser', 'warn'); return; }
  s.reminders = true; store.save(); renderApp();
  toast('🔔 Reminders on - Snotra will nudge you at each dusk anchor (keep a tab open)', 'success');
}

// ---------- ritual editor ----------
// Works on a draft copy: add/edit steps through a small form, drag rows to reorder,
// nothing touches the real ritual until Save.
function openRitualEditor() {
  const h = store.get().habits;
  const draft = {
    morningName: h.morningName, nightName: h.nightName, bedtime: h.bedtime,
    morning: h.morning.map(t => ({ title: t })),
    night: h.night.map(s => ({ title: s.title, offsetMin: s.offsetMin })),
  };

  const stepRow = (which, s, i) => `
    <div class="re-step" draggable="true" data-which="${which}" data-i="${i}">
      <span class="re-grip" title="Drag to reorder">⠿</span>
      ${which === 'n' ? `<span class="chip mono re-when" title="minutes before bedtime">${s.offsetMin === 0 ? 'bedtime' : s.offsetMin + 'm before'}</span>` : ''}
      <span class="re-title">${escapeHtml(s.title)}</span>
      <span class="spacer"></span>
      <button class="icon-btn" data-edit="${which}:${i}" title="Edit step">✎</button>
      <button class="icon-btn" data-del="${which}:${i}" title="Remove step">✕</button>
    </div>`;

  const render = () => {
    const box = showModal(`
      <h2>Edit rituals</h2>
      <p class="muted" style="font-size:12.5px;margin-top:-8px">Make it yours. Drag steps to reorder; night steps carry a time anchored to your bedtime.</p>
      <div class="form-row">
        <label>Morning ritual name<input id="re-mname" value="${escapeHtml(draft.morningName)}"></label>
        <label>Night ritual name<input id="re-nname" value="${escapeHtml(draft.nightName)}"></label>
        <label>Bedtime<input type="time" id="re-bed" value="${draft.bedtime}"></label>
      </div>
      <div class="grid cols-2" style="gap:14px;margin-top:6px">
        <div>
          <div class="re-list-head">☀ ${escapeHtml(draft.morningName)}</div>
          <div class="re-list" data-list="m">${draft.morning.map((s, i) => stepRow('m', s, i)).join('') || '<div class="empty" style="padding:12px">No steps yet</div>'}</div>
          <button class="btn small" data-add="m" style="width:100%;margin-top:8px">+ Add a step</button>
        </div>
        <div>
          <div class="re-list-head">☾ ${escapeHtml(draft.nightName)}</div>
          <div class="re-list" data-list="n">${draft.night.map((s, i) => stepRow('n', s, i)).join('') || '<div class="empty" style="padding:12px">No steps yet</div>'}</div>
          <button class="btn small" data-add="n" style="width:100%;margin-top:8px">+ Add a step</button>
        </div>
      </div>
      <div class="modal-foot"><span class="spacer"></span>
        <button class="btn" id="re-cancel">Cancel</button>
        <button class="btn primary" id="re-save">Save rituals</button></div>`);

    // name/bedtime edits flow into the draft as you type
    box.querySelector('#re-mname').oninput = e => { draft.morningName = e.target.value; };
    box.querySelector('#re-nname').oninput = e => { draft.nightName = e.target.value; };
    box.querySelector('#re-bed').onchange = e => { draft.bedtime = e.target.value || '21:30'; };

    box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => stepForm(b.dataset.add, null));
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const [w, i] = b.dataset.edit.split(':'); stepForm(w, Number(i));
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const [w, i] = b.dataset.del.split(':');
      (w === 'm' ? draft.morning : draft.night).splice(Number(i), 1);
      render();
    });

    // drag to reorder within a list
    let dragging = null;
    box.querySelectorAll('.re-step').forEach(row => {
      row.addEventListener('dragstart', () => { dragging = { which: row.dataset.which, i: Number(row.dataset.i) }; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { dragging = null; row.classList.remove('dragging'); });
      row.addEventListener('dragover', e => {
        if (!dragging || dragging.which !== row.dataset.which) return;
        e.preventDefault();
        row.classList.add('drop-hint');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-hint'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragging || dragging.which !== row.dataset.which) return;
        const list = dragging.which === 'm' ? draft.morning : draft.night;
        const from = dragging.i, to = Number(row.dataset.i);
        if (from !== to) list.splice(to, 0, list.splice(from, 1)[0]);
        dragging = null;
        render();
      });
    });

    box.querySelector('#re-cancel').onclick = closeModal;
    box.querySelector('#re-save').onclick = () => {
      if (!draft.morning.length || !draft.night.length) { toast('Both rituals need at least one step', 'warn'); return; }
      h.morning = draft.morning.map(s => s.title);
      h.night = draft.night.map(s => ({ offsetMin: s.offsetMin, title: s.title }));
      h.morningName = draft.morningName.trim() || 'Dawn ritual';
      h.nightName = draft.nightName.trim() || 'Dusk ritual';
      h.bedtime = draft.bedtime;
      store.save(); sync.schedulePublish(); closeModal(); renderApp(); toast('Rituals updated', 'success');
    };
  };

  // The add/edit step form: name + (night) time before bedtime, then Confirm back to the editor.
  const stepForm = (which, index) => {
    const list = which === 'm' ? draft.morning : draft.night;
    const isNew = index === null;
    const s = isNew ? (which === 'n' ? { title: '', offsetMin: 60 } : { title: '' }) : list[index];
    const box = showModal(`
      <h2>${isNew ? 'Add a step' : 'Edit step'} · ${which === 'm' ? '☀ ' + escapeHtml(draft.morningName) : '☾ ' + escapeHtml(draft.nightName)}</h2>
      <div class="form-row"><label style="flex:100%">What is the step?
        <input id="sf-title" value="${escapeHtml(s.title)}" placeholder="e.g. 10-minute walk · Read 5 pages · Stretch"></label></div>
      ${which === 'n' ? `
      <div class="form-row"><label>When (minutes before bedtime ${draft.bedtime})
        <input type="number" id="sf-offset" min="0" max="720" step="5" value="${s.offsetMin}"></label>
        <label>&nbsp;<span class="chip mono" id="sf-clock" style="align-self:center"></span></label></div>
      <p class="faint" style="font-size:11.5px">0 = right at bedtime. Reminders fire at this time when enabled.</p>` : ''}
      <div class="modal-foot"><span class="spacer"></span>
        <button class="btn" id="sf-back">Back</button>
        <button class="btn primary" id="sf-ok">${isNew ? 'Add step' : 'Confirm'}</button></div>`);
    const title = box.querySelector('#sf-title');
    title.focus();
    const clockPreview = () => {
      const c = box.querySelector('#sf-clock');
      if (!c) return;
      const off = Number(box.querySelector('#sf-offset').value) || 0;
      const [bh, bm] = draft.bedtime.split(':').map(Number);
      const d = new Date(); d.setHours(bh, bm - off, 0, 0);
      c.textContent = '≈ ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };
    if (which === 'n') { clockPreview(); box.querySelector('#sf-offset').oninput = clockPreview; }
    const commit = () => {
      const name = title.value.trim();
      if (!name) { toast('Give the step a name', 'warn'); return; }
      const step = which === 'n'
        ? { title: name, offsetMin: Math.max(0, Number(box.querySelector('#sf-offset').value) || 0) }
        : { title: name };
      if (isNew) list.push(step); else list[index] = step;
      render();
    };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
    box.querySelector('#sf-back').onclick = render;
    box.querySelector('#sf-ok').onclick = commit;
  };

  render();
}

// Compact strip for the Today page.
export function ritualStripHtml() {
  const t = todayYmd();
  const h = store.get().habits;
  const log = store.habitLog(t);
  const mDone = store.ritualDone(t, 'm');
  const nDone = store.ritualDone(t, 'n');
  const rank = store.habitRank();
  const pStreak = store.habitStreak(d => store.perfectDay(d));
  const hour = new Date().getHours();
  const quests = store.get().quests;

  let hint = '';
  if (!mDone && hour < 15) {
    const next = h.morning.findIndex((_, i) => !log.m.includes(i));
    hint = `next: ${escapeHtml(h.morning[next] || '')}`;
  } else if (!nDone && hour >= 17) {
    const idx = nextNightIdx();
    if (idx !== null) hint = `now: ${escapeHtml(h.night[idx].title)} (${nightStepTime(h.night[idx])})`;
    else {
      const first = h.night.findIndex((_, i) => !log.n.includes(i));
      if (first >= 0) hint = `at ${nightStepTime(h.night[first])}: ${escapeHtml(h.night[first].title)}`;
    }
  }

  return `<a href="#/rituals" class="ritual-strip ${mDone && nDone ? 'perfect' : ''}">
    <span class="mono">☀ ${log.m.length}/${h.morning.length}</span>
    <span class="mono">☾ ${log.n.length}/${h.night.length}</span>
    ${quests.length ? `<span class="mono">◈ ${store.questsDoneCount(t)}/${quests.length}</span>` : ''}
    ${mDone && nDone ? '<span class="mono" style="color:var(--amber-bright)">✦ perfect day</span>' : hint ? `<span class="rs-hint">${hint}</span>` : ''}
    <span class="spacer"></span>
    <span class="mono faint">${rank.name} · ${rank.xp} XP${pStreak ? ` · ✦${pStreak}d` : ''}</span>
  </a>`;
}
