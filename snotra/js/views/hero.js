// Snotra - Hero: your character. The saga's XP, rank and streaks made flesh -
// a pixel Viking who gains gear as YOU level up. The avatar is drawn in code
// (in your accent colour); describe yourself below and future versions can
// wear your face.
import * as store from '../store.js';
import { escapeHtml, todayYmd, minutesToHM, ymd } from '../utils.js';
import { toast } from '../app.js';

// Gear unlocked at each rank (index-aligned with store.RANKS).
const GEAR = [
  'a plain tunic and a stubborn will',
  'belt and boots - you keep showing up',
  'a round shield - the habit holds',
  'a horned-free, historically accurate helmet',
  'the war axe - deep work bites harder',
  'a jarl\'s cloak',
  'the golden crown',
  'glowing runes of the chosen',
  'Huginn & Muninn at your shoulders',
];

export function renderHero(el) {
  const s = store.get().settings;
  const rank = store.habitRank();
  const tier = Math.max(0, store.RANKS.findIndex(r => r[0] === rank.name));
  const rankPct = rank.ceil ? Math.round((rank.xp - rank.floor) / (rank.ceil - rank.floor) * 100) : 100;

  const pStreakTotal = Object.keys(store.get().habits.log).filter(d => store.perfectDay(d)).length;
  const mStreak = store.habitStreak(d => store.ritualDone(d, 'm'));
  const nStreak = store.habitStreak(d => store.ritualDone(d, 'n'));
  const pStreak = store.habitStreak(d => store.perfectDay(d));
  const sessions = store.get().sessions;
  const totalDeepH = Math.round(sessions.reduce((a, x) => a + x.minutes, 0) / 60 * 10) / 10;
  const rated = sessions.filter(x => x.rating);
  const avgRating = rated.length ? (rated.reduce((a, x) => a + x.rating, 0) / rated.length).toFixed(1) : null;
  const questDays = Object.keys({ ...store.get().habits.log, ...store.get().metrics })
    .reduce((a, d) => a + store.questsDoneCount(d), 0);
  const kind = store.dayKind(todayYmd());

  el.innerHTML = `
  <div class="page-head">
    <h1>Hero</h1>
    <span class="page-sub">the one being forged is you</span>
  </div>

  <div class="grid cols-2">
    <div class="card hero-card">
      <div class="hero-stage ${kind === 'berserker' ? 'berserker' : ''}">
        <canvas id="hero-canvas" width="160" height="180"></canvas>
      </div>
      <div class="hero-name">${escapeHtml(s.name)} the ${rank.name}</div>
      <div class="mono faint" style="font-size:11.5px;text-align:center">tier ${tier + 1}/9 · wearing: ${GEAR[tier]}</div>
      <div class="rank-track" style="margin:12px 0 4px"><i style="width:${rankPct}%"></i></div>
      <div class="mono faint" style="font-size:11px;text-align:center">${rank.xp} XP${rank.next ? ` · ${rank.ceil - rank.xp} to ${rank.next}` : ' · the Allfather needs no more'}</div>
      <label style="display:block;margin-top:16px">Who is this hero? <span class="help" data-help="Describe yourself (or upload nothing at all - words are enough). This description is saved and will feed AI-generated artwork of your character in a future version, so make it yours.">?</span>
        <textarea id="hero-desc" rows="3" style="width:100%" placeholder="e.g. Tall Icelander, short beard, calm eyes. Trains hard, builds companies, guards his sleep.">${escapeHtml(s.heroDesc || '')}</textarea></label>
    </div>

    <div>
      <div class="card">
        <h2>Deeds <span class="help" data-help="Everything here is earned, never bought: rituals, quests, deep work and honest rest all feed the same XP that levels your hero.">?</span></h2>
        <div class="stat-tiles" style="grid-template-columns:repeat(2,1fr);margin-bottom:0">
          <div class="stat-tile"><div class="sv">✦ ${pStreakTotal}</div><div class="sl">perfect days forged</div></div>
          <div class="stat-tile"><div class="sv">${totalDeepH}h</div><div class="sl">lifetime deep work</div></div>
          <div class="stat-tile"><div class="sv">☀ ${mStreak}d · ☾ ${nStreak}d</div><div class="sl">ritual streaks ${pStreak ? `· ✦ ${pStreak}d perfect` : ''}</div></div>
          <div class="stat-tile"><div class="sv">◈ ${questDays}</div><div class="sl">quest-days won ${avgRating ? `· ★ ${avgRating} avg session` : ''}</div></div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>The ladder <span class="count">every rank is a promise kept</span></h2>
        ${store.RANKS.map(([name, floor], i) => `
          <div class="ladder-row ${i === tier ? 'current' : ''} ${i < tier ? 'passed' : ''} ${i > tier ? 'locked' : ''}">
            <span class="mono ladder-xp">${floor}</span>
            <span class="ladder-name">${name}</span>
            <span class="ladder-gear">${GEAR[i]}</span>
            <span class="ladder-mark">${i < tier ? '✓' : i === tier ? '◈' : ''}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>`;

  drawHero(el.querySelector('#hero-canvas'), tier);
  el.querySelector('#hero-desc').onchange = e => {
    s.heroDesc = e.target.value.trim(); store.save();
    toast('Saved. The skalds will remember.', 'success');
  };
}

// ---------- the pixel Viking ----------
// Flat pixel-rect style on a 16x18 logical grid, gear stacking up with tier.
function drawHero(canvas, tier) {
  const ctx = canvas.getContext('2d');
  const P = 10; // pixel size
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--amber').trim() || '#e8a33d';
  const accentBright = css.getPropertyValue('--amber-bright').trim() || '#f2b65a';
  const C = {
    skin: '#d9a066', skinD: '#c08a52', hair: '#8a5a33', beard: '#7a4e2b',
    tunic: accent, tunicD: accentBright, pants: '#4a3b2f', boots: '#2e2620',
    metal: '#9aa5b1', metalD: '#6f7a85', gold: '#e8c547', glow: accentBright,
    wood: '#6b4a2f', eye: '#1c1c22', raven: '#23252d',
  };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * P, y * P, w * P, h * P); };

  // aura (tier 7+)
  if (tier >= 7) {
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = C.glow;
    ctx.beginPath(); ctx.arc(canvas.width / 2, 90, 78, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // cloak (tier 5+): behind body
  if (tier >= 5) { px(3.5, 7, 2, 8, '#5b2330'); px(10.5, 7, 2, 8, '#5b2330'); }
  // head
  px(6, 2, 4, 3, C.skin); px(6, 2, 4, 1, C.hair);
  // eyes
  px(6.7, 3.2, 0.6, 0.6, C.eye); px(8.7, 3.2, 0.6, 0.6, C.eye);
  // beard - always. This is non-negotiable.
  px(6, 4.4, 4, 1.4, C.beard); px(6.6, 5.6, 2.8, 0.8, C.beard);
  // helmet (tier 3+), crown (tier 6+)
  if (tier >= 6) { px(5.8, 1.2, 4.4, 1, C.gold); px(6.2, 0.4, 0.7, 0.9, C.gold); px(7.7, 0.2, 0.7, 1.1, C.gold); px(9.2, 0.4, 0.7, 0.9, C.gold); }
  else if (tier >= 3) { px(5.7, 1.4, 4.6, 1.3, C.metal); px(5.7, 2.4, 0.8, 1, C.metal); px(9.5, 2.4, 0.8, 1, C.metal); }
  // torso
  px(5, 6, 6, 5, C.tunic); px(5, 6, 6, 1, C.tunicD);
  // arms
  px(3.8, 6.2, 1.2, 4, C.tunic); px(11, 6.2, 1.2, 4, C.tunic);
  px(3.8, 10, 1.2, 1, C.skin); px(11, 10, 1.2, 1, C.skin);
  // belt (tier 1+)
  if (tier >= 1) { px(5, 10.4, 6, 0.9, C.boots); px(7.4, 10.4, 1.2, 0.9, C.gold); }
  // war paint (tier 4+)
  if (tier >= 4) { px(6, 2.6, 0.5, 1.6, accent); px(9.5, 2.6, 0.5, 1.6, accent); }
  // legs
  px(5.6, 11, 2, 4, C.pants); px(8.4, 11, 2, 4, C.pants);
  // boots (tier 1+) or bare feet
  if (tier >= 1) { px(5.3, 14.6, 2.5, 1.4, C.boots); px(8.2, 14.6, 2.5, 1.4, C.boots); }
  else { px(5.6, 15, 2, 1, C.skinD); px(8.4, 15, 2, 1, C.skinD); }
  // shield (tier 2+), left hand
  if (tier >= 2) {
    ctx.fillStyle = C.wood; ctx.beginPath(); ctx.arc(4.4 * P, 9.4 * P, 2.2 * P, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.metal; ctx.beginPath(); ctx.arc(4.4 * P, 9.4 * P, 0.7 * P, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.metalD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(4.4 * P, 9.4 * P, 2.2 * P, 0, Math.PI * 2); ctx.stroke();
  }
  // axe (tier 4+), right hand
  if (tier >= 4) {
    px(11.4, 6.8, 0.7, 6, C.wood);
    px(10.6, 6.2, 2.3, 1.2, C.metal); px(10.6, 7.2, 1.1, 0.6, C.metalD);
  }
  // runes (tier 7+)
  if (tier >= 7) {
    ctx.fillStyle = C.glow; ctx.font = `${P * 1.1}px monospace`; ctx.globalAlpha = 0.9;
    ['ᚠ', 'ᛊ', 'ᛏ'].forEach((r, i) => ctx.fillText(r, (5.6 + i * 1.8) * P, 8.6 * P));
    ctx.globalAlpha = 1;
  }
  // ravens (tier 8)
  if (tier >= 8) {
    px(2.2, 3.6, 1.6, 1, C.raven); px(2.0, 3.2, 0.8, 0.8, C.raven); px(1.7, 3.4, 0.4, 0.4, C.gold);
    px(12.2, 3.6, 1.6, 1, C.raven); px(13.2, 3.2, 0.8, 0.8, C.raven); px(13.9, 3.4, 0.4, 0.4, C.gold);
  }
}
