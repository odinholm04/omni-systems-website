// Mimir — Rituals: "The Daily Saga". Morning + night routines from the Notion brain,
// gamified with XP, Norse ranks, streaks and a 28-day rune wall.
import * as store from '../store.js';
import { escapeHtml, todayYmd, addDays, timeToMin, minToTime } from '../utils.js';
import { showModal, closeModal, renderApp, toast } from '../app.js';

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'];

export function nightStepTime(step) {
  const bed = timeToMin(store.get().habits.bedtime);
  return minToTime(bed - step.offsetMin);
}

// Which night step is "up next" right now (null outside the wind-down window).
function nextNightIdx() {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const bed = timeToMin(store.get().habits.bedtime);
  const t = todayYmd();
  const l = store.habitLog(t);
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

  el.innerHTML = `
  <div class="page-head">
    <h1>Rituals</h1>
    <span class="page-sub">the daily saga — win the morning, guard the night</span>
    <div class="page-actions"><button class="btn small" id="rt-edit">✎ Edit rituals</button></div>
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
    </div>
  </div>

  ${perfect ? `<div class="card perfect-banner">✦ Perfect day forged — both rituals complete. The saga grows. (+30 XP)</div>` : ''}

  <div class="grid cols-2">
    <div class="card ritual-card ${mDone ? 'complete' : ''}">
      <h2>☀ Dawn ritual <span class="count">${log.m.length}/${h.morning.length}</span>
        <span class="spacer"></span>${mDone ? '<span class="chip" style="color:var(--green)">forged ✓</span>' : ''}</h2>
      <div class="ritual-steps">
        ${h.morning.map((s, i) => stepHtml('m', i, s, null, log.m.includes(i), false)).join('')}
      </div>
      ${mDone ? '<p class="ritual-victory">The morning is yours. Get to work. 💪</p>' : ''}
    </div>

    <div class="card ritual-card ${nDone ? 'complete' : ''}">
      <h2>☾ Dusk ritual <span class="count">${log.n.length}/${h.night.length}</span>
        <span class="spacer"></span><span class="chip mono">bedtime ${h.bedtime}</span>
        ${nDone ? '<span class="chip" style="color:var(--green)">forged ✓</span>' : ''}</h2>
      <div class="ritual-steps">
        ${h.night.map((s, i) => stepHtml('n', i, s.title, nightStepTime(s), log.n.includes(i), i === nextIdx)).join('')}
      </div>
      ${nDone ? `<p class="ritual-victory">“${escapeHtml(store.get().settings.shutdownPhrase)}” — sleep well. 🌙</p>` : ''}
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
    <p class="faint" style="font-size:11.5px;margin:10px 0 0">☀ dot = dawn ritual · ☾ dot = dusk ritual · lit rune = perfect day. Every step is 5 XP, a full ritual +20, a perfect day +30.</p>
  </div>`;

  el.querySelectorAll('[data-step]').forEach(row => row.onclick = () => {
    const [which, idx] = row.dataset.step.split(':');
    const wasDone = store.ritualDone(t, which);
    store.toggleHabitStep(t, which, Number(idx));
    const nowDone = store.ritualDone(t, which);
    if (!wasDone && nowDone) {
      toast(which === 'm' ? '☀ Dawn ritual forged! +20 XP' : '☾ Dusk ritual forged! +20 XP', 'success');
      if (store.perfectDay(t)) toast('✦ PERFECT DAY — the rune is lit! +30 XP', 'success');
    }
    renderApp();
  });
  el.querySelector('#rt-edit').onclick = openRitualEditor;
}

function stepHtml(which, i, title, time, done, isNext) {
  return `<div class="ritual-step ${done ? 'done' : ''} ${isNext ? 'next' : ''}" data-step="${which}:${i}">
    <span class="rs-check">${done ? '✓' : ''}</span>
    ${time ? `<span class="rs-time mono">${time}</span>` : `<span class="rs-num mono">${i + 1}</span>`}
    <span class="rs-title">${escapeHtml(title)}</span>
    ${isNext ? '<span class="chip" style="color:var(--amber-bright)">now</span>' : ''}
  </div>`;
}

function openRitualEditor() {
  const h = store.get().habits;
  const box = showModal(`
    <h2>Edit rituals</h2>
    <p class="muted" style="font-size:12.5px;margin-top:-8px">Sourced from your Notion brain — “Byrja daginn 2026” and the night countdown from “Uppi! → To do”.</p>
    <div class="form-row"><label>Bedtime<input type="time" id="re-bed" value="${h.bedtime}"></label></div>
    <div class="form-row"><label style="flex:100%">☀ Dawn steps (one per line, in order)
      <textarea id="re-morning" rows="8">${escapeHtml(h.morning.join('\n'))}</textarea></label></div>
    <div class="form-row"><label style="flex:100%">☾ Dusk steps (minutes-before-bedtime | step, one per line)
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
    h.bedtime = box.querySelector('#re-bed').value || '21:30';
    store.save(); closeModal(); renderApp(); toast('Rituals updated', 'success');
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
    ${mDone && nDone ? '<span class="mono" style="color:var(--amber-bright)">✦ perfect day</span>' : hint ? `<span class="rs-hint">${hint}</span>` : ''}
    <span class="spacer"></span>
    <span class="mono faint">${rank.name} · ${rank.xp} XP${pStreak ? ` · ✦${pStreak}d` : ''}</span>
  </a>`;
}
