// Mimir — Fellowship sync. Tiny capability-code backend (Supabase RPCs, odin-claude-brain).
// Your share code lets a friend READ your published saga stats; only your secret can WRITE.
// Nothing else leaves the browser — tasks, notes and calendar stay local.
import * as store from './store.js';
import { todayYmd } from './utils.js';

const SYNC_URL = 'https://poveaqiwzapwajutktsa.supabase.co/rest/v1/rpc';
const SYNC_KEY = 'sb_publishable_Ah-S02aFbBtoiF-FzSkaRQ_54JutJAv';

export let lastError = null;

async function rpc(fn, body) {
  const res = await fetch(`${SYNC_URL}/${fn}`, {
    method: 'POST',
    headers: { apikey: SYNC_KEY, Authorization: `Bearer ${SYNC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`sync ${fn} failed (${res.status})`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// The stats payload friends can see. Deliberately small and non-sensitive.
export function buildPayload() {
  const t = todayYmd();
  const h = store.get().habits;
  const log = store.habitLog(t);
  const rank = store.habitRank();
  const m = store.get().metrics[t] || null;
  return {
    v: 1,
    rank: rank.name,
    xp: rank.xp,
    streaks: {
      m: store.habitStreak(d => store.ritualDone(d, 'm')),
      n: store.habitStreak(d => store.ritualDone(d, 'n')),
      p: store.habitStreak(d => store.perfectDay(d)),
    },
    today: {
      date: t,
      m: `${log.m.length}/${h.morning.length}`,
      n: `${log.n.length}/${h.night.length}`,
      q: `${store.questsDoneCount(t)}/${store.get().quests.length}`,
      perfect: store.perfectDay(t),
    },
    rituals: { morning: h.morningName, night: h.nightName },
    sleep: m ? { score: m.sleepScore ?? null, hours: m.sleepHours ?? null } : null,
  };
}

export async function forgeShareCode() {
  const s = store.get().sync;
  if (s.code) return s;
  const rows = await rpc('mimir_create_profile', {
    p_name: store.get().settings.name, p_data: buildPayload(),
  });
  s.code = rows[0].share_code;
  s.secret = rows[0].secret;
  store.save();
  return s;
}

let publishTimer = null;
export function schedulePublish() {
  const s = store.get().sync;
  if (!s.code || !s.autoPublish) return;
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => publishNow().catch(() => {}), 2500);
}

export async function publishNow() {
  const s = store.get().sync;
  if (!s.code) return false;
  try {
    const ok = await rpc('mimir_publish', {
      p_code: s.code, p_secret: s.secret,
      p_name: store.get().settings.name, p_data: buildPayload(),
    });
    lastError = ok ? null : 'publish rejected';
    return !!ok;
  } catch (e) {
    lastError = e.message;
    throw e;
  }
}

export async function fetchFriend(code) {
  const rows = await rpc('mimir_get_profile', { p_code: code });
  if (!rows || !rows.length) throw new Error('No saga found for that code');
  return rows[0]; // {name, data, updated_at}
}

export async function addFriend(code) {
  code = code.trim();
  if (!/^[0-9a-f-]{36}$/i.test(code)) throw new Error('That does not look like a share code');
  const s = store.get().sync;
  if (s.code === code) throw new Error('That is your own code, Þór.');
  if (s.friends.some(f => f.code === code)) throw new Error('Already in your fellowship');
  const p = await fetchFriend(code);
  s.friends.push({ code, name: p.name, last: p.data, updatedAt: p.updated_at, fetchedAt: Date.now() });
  store.save();
  return p;
}

export function removeFriend(code) {
  const s = store.get().sync;
  s.friends = s.friends.filter(f => f.code !== code);
  store.save();
}

let lastRefresh = 0;
export async function refreshFriends(force = false) {
  const s = store.get().sync;
  if (!s.friends.length) return false;
  if (!force && Date.now() - lastRefresh < 60000) return false;
  lastRefresh = Date.now();
  let changed = false;
  await Promise.all(s.friends.map(async f => {
    try {
      const p = await fetchFriend(f.code);
      f.name = p.name; f.last = p.data; f.updatedAt = p.updated_at; f.fetchedAt = Date.now();
      changed = true;
      lastError = null;
    } catch (e) { lastError = e.message; }
  }));
  if (changed) store.save();
  return changed;
}
