// Snotra — Rituals: "The Daily Saga". Fully editable morning/night rituals + custom quests,
// gamified with XP, Norse ranks, streaks, a rune wall, sleep metrics and a friend Fellowship.
import * as store from '../store.js';
import * as sync from '../sync.js';
import { fetchUltrahuman } from '../metrics.js';
import { escapeHtml, todayYmd, addDays, timeToMin, minToTime } from '../utils.js';
import { showModal, closeModal, renderApp, toast } from '../app.js';

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'];
const METRIC_LABEL = { sleepScore: 'sleep score', sleepHours: 'hours slept' };

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
  for (let i = 0; i < steps.length; i++) {
    if (!l.n.includes(i) && now >= bed - steps[i].offsetMin - 30) return i;
  }
  return null;
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
    <span class="page-sub">the daily saga — win the morning, guard the night</span>
    <div class="page-actions">
      <button class="btn small ${remindersOn ? 'primary' : ''}" id="rt-remind">${remindersOn ? '🔔 Reminders on' : '🔕 Enable reminders'}</button>
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

  ${perfect ? `<div class="card perfect-banner">✦ Perfect day forged — both rituals complete. The saga grows. (+30 XP)</div>` : ''}

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
      ${nDone ? `<p class="ritual-victory">“${escapeHtml(store.get().settings.shutdownPhrase)}” — sleep well. 🌙</p>` : ''}
    </div>

    <div class="card">
      <h2>◈ Quests <span class="count">${store.questsDoneCount(t)}/${quests.length} today · +10 XP each</span>
        <span class="spacer"></span>
        <button class="btn small" id="rt-sleep">😴 Log sleep</button>
        ${store.get().settings.uhKey ? '<button class="btn small" id="rt-ring">◉ Sync ring</button>' : ''}
        <button class="btn small primary" id="rt-addq">+ Quest</button></h2>
      ${quests.length ? quests.map(q => questHtml(q, t)).join('') :
        `<div class="empty">Your own goals, your rules. A quest is anything you want to be held to daily —
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
      if (store.perfectDay(t)) toast('✦ PERFECT DAY — the rune is lit! +30 XP', 'success');
    }
    sync.schedulePublish();
    renderApp();
  });
  el.querySelector('#rt-edit').onclick = openRitualEditor;
  el.querySelector('#rt-remind').onclick = enableReminders;

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
      toast(`Ring synced: score ${r.sleepScore ?? '—'}${r.sleepHours ? ` · ${r.sleepHours}h` : ''}`, 'success');
      sync.schedulePublish();
    } catch (err) {
      toast('Ring sync failed: ' + escapeHtml(err.message) + ' — log sleep manually', 'warn');
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
    detail = `<span class="chip mono" title="checks itself from sleep data">auto · ${METRIC_LABEL[q.metric]} ${q.op} ${q.target}${v != null ? ` · today ${v}` : ' · no data yet'}</span>`;
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
        <option value="metric" ${v.type === 'metric' ? 'selected' : ''}>Automatic — from sleep data</option>
      </select></label>
    </div>
    <div class="form-row" id="qm-metric-row" style="${v.type === 'metric' ? '' : 'display:none'}">
      <label>Metric<select id="qm-metric">
        <option value="sleepScore" ${v.metric === 'sleepScore' ? 'selected' : ''}>Sleep score (0–100)</option>
        <option value="sleepHours" ${v.metric === 'sleepHours' ? 'selected' : ''}>Hours slept</option>
      </select></label>
      <label>Condition<select id="qm-op">
        <option value=">=" ${v.op === '>=' ? 'selected' : ''}>at least (≥)</option>
        <option value="<=" ${v.op === '<=' ? 'selected' : ''}>at most (≤)</option>
      </select></label>
      <label>Target<input type="number" id="qm-target" step="0.5" value="${v.target}"></label>
    </div>
    <p class="faint" style="font-size:12px">Automatic quests judge themselves the moment sleep data lands — from your Ultrahuman ring or a manual log. No arguing with the rune wall.</p>
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
      progress — you see theirs. Nobody slacks unseen. Tasks, notes and calendar stay private on your device.</p>
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
    ${s.friends.length ? s.friends.map(friendHtml).join('') : '<div class="empty">No companions yet — send your code to a friend who has Snotra open at omni-systems.ai/snotra.</div>'}
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
      <span class="chip mono">${escapeHtml(d.rank || '—')} · ${d.xp ?? 0} XP</span>
      ${d.streaks ? `<span class="mono faint" style="font-size:11px">☀${d.streaks.m}d ☾${d.streaks.n}d ✦${d.streaks.p}d</span>` : ''}
      <span class="spacer"></span>
      <button class="icon-btn" data-fw-remove="${f.code}" title="Remove">✕</button>
    </div>
    <div class="fw-friend-body mono">
      ${stale ? `<span style="color:var(--red)">no entry yet today — poke them ⚔</span>`
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
      toast('Share code forged — send it to your companion ⚔', 'success');
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
  const refresh = el.querySelector('#fw-refresh');
  if (refresh) refresh.onclick = async () => {
    refresh.textContent = '↻ …';
    await sync.refreshFriends(true).catch(() => {});
    await sync.publishNow().catch(() => {});
    renderApp();
  };
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
  toast('🔔 Reminders on — Snotra will nudge you at each dusk anchor (keep a tab open)', 'success');
}

// ---------- ritual editor ----------
function openRitualEditor() {
  const h = store.get().habits;
  const box = showModal(`
    <h2>Edit rituals</h2>
    <p class="muted" style="font-size:12.5px;margin-top:-8px">Make it yours — or hand Snotra to a friend and let them write their own saga.</p>
    <div class="form-row">
      <label>Morning ritual name<input id="re-mname" value="${escapeHtml(h.morningName)}"></label>
      <label>Night ritual name<input id="re-nname" value="${escapeHtml(h.nightName)}"></label>
      <label>Bedtime<input type="time" id="re-bed" value="${h.bedtime}"></label>
    </div>
    <div class="form-row"><label style="flex:100%">☀ Morning steps (one per line, in order)
      <textarea id="re-morning" rows="8">${escapeHtml(h.morning.join('\n'))}</textarea></label></div>
    <div class="form-row"><label style="flex:100%">☾ Night steps (minutes-before-bedtime | step, one per line)
      <textarea id="re-night" rows="5">${escapeHtml(h.night.map(s => `${s.offsetMin} | ${s.title}`).join('\n'))}</textarea></label></div>
    <div class="modal-foot"><span class="spacer"></span>
      <button class="btn" id="re-cancel">Cancel</button>
      <button class="btn primary" id="re-save">Save</button></div>`);
  box.querySelector('#re-cancel').onclick = closeModal;
  box.querySelector('#re-save').onclick = () => {
    const morning = box.querySelector('#re-morning').value.split('\n').map(s => s.trim()).filter(Boolean);
    const night = box.querySelector('#re-night').value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const m = line.match(/^(\d+)\s*\|\s*(.+)$/);
      return m ? { offsetMin: Number(m[1]), title: m[2].trim() } : { offsetMin: 0, title: line };
    }).sort((a, b) => b.offsetMin - a.offsetMin);
    if (!morning.length || !night.length) { toast('Both rituals need at least one step', 'warn'); return; }
    h.morning = morning;
    h.night = night;
    h.morningName = box.querySelector('#re-mname').value.trim() || 'Dawn ritual';
    h.nightName = box.querySelector('#re-nname').value.trim() || 'Dusk ritual';
    h.bedtime = box.querySelector('#re-bed').value || '21:30';
    store.save(); sync.schedulePublish(); closeModal(); renderApp(); toast('Rituals updated', 'success');
  };
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
