// Snotra - sleep metrics. Manual entry always works; Ultrahuman ring sync uses the
// Partner API (partner.ultrahuman.com). The auth token lives only in this browser's
// settings. If the browser blocks the cross-origin call, we retry through a tiny
// same-origin proxy (/api/uh) that exists on the Vercel deployment.
import * as store from './store.js';
import { todayYmd } from './utils.js';

const UH_URL = 'https://partner.ultrahuman.com/api/v1/partner/daily_metrics';

// Deep-scan an unknown JSON shape for a sleep score (0-100) and sleep duration.
// Ultrahuman nests metrics as {type:'sleep', object:{...}} and quick_metrics as
// {title:'Sleep Index', value:88} - the discriminator is a VALUE, not a key - so
// we fold `type`/`title` strings into the path before matching.
export function extractSleep(json) {
  let score = null, scoreRank = 0, hours = null, hoursRank = 0;
  // Unit heuristic with no dead zones: <=16 hours, <=960 minutes (16h), <=86400 seconds (24h).
  // Anything above 24h-in-seconds is a timestamp or garbage, never a sleep duration.
  const toHours = n => {
    if (n <= 0) return null;
    if (n <= 16) return Math.round(n * 10) / 10;      // already hours
    if (n <= 960) return Math.round(n / 6) / 10;      // minutes
    if (n <= 86400) return Math.round(n / 360) / 10;  // seconds
    return null;
  };
  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'object') {
      let p = path;
      if (typeof node.type === 'string') p += '/' + node.type.toLowerCase();
      if (typeof node.title === 'string') p += '/' + node.title.toLowerCase();
      Object.entries(node).forEach(([k, v]) => walk(v, p + '/' + k.toLowerCase()));
      return;
    }
    if (typeof node !== 'number') return;
    if (!/sleep/.test(path)) return;
    if (node >= 0 && node <= 100) {
      // rank 2: a segment that IS sleep index/score (anchored, so deep_sleep_score can't tie);
      // rank 1: a bare score/index key in the sleep subtree (named stage scores stay out).
      const rank = /\/sleep[_ ]?(index|score)(\/|$)/.test(path) ? 2 : (/\/(score|index)$/.test(path) ? 1 : 0);
      if (rank > scoreRank) { score = Math.round(node); scoreRank = rank; }
    }
    // Duration: never a stage/awake/latency slice, never a clock timestamp;
    // prefer an explicit total over a generic duration.
    if (!/awake|deep|rem|light|latency|nap|in[_ ]?bed|interruption|bedtime|_at$|_time$|timestamp|start|end/.test(path)) {
      const rank = /total[_ ]?sleep|asleep/.test(path) ? 2 : (/duration/.test(path) ? 1 : 0);
      if (rank > hoursRank) {
        const h = toHours(node);
        if (h !== null) { hours = h; hoursRank = rank; }
      }
    }
  };
  walk(json, '');
  return { score, hours };
}

// Recovery / movement indices (0-100) and step count from the same payload.
// Same path-folding trick; each metric anchors on its own named segment.
export function extractExtras(json) {
  let recovery = null, movement = null, steps = 0;
  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'object') {
      let p = path;
      if (typeof node.type === 'string') p += '/' + node.type.toLowerCase();
      if (typeof node.title === 'string') p += '/' + node.title.toLowerCase();
      Object.entries(node).forEach(([k, v]) => walk(v, p + '/' + k.toLowerCase()));
      return;
    }
    if (typeof node !== 'number') return;
    if (recovery === null && /\/recovery[_ ]?index(\/|$)/.test(path) && /(value|score|index)$/.test(path) && node >= 0 && node <= 100) recovery = Math.round(node);
    if (movement === null && /\/movement[_ ]?index(\/|$)/.test(path) && /(value|score|index)$/.test(path) && node >= 0 && node <= 100) movement = Math.round(node);
    // steps: the daily total is the largest plausible number in the steps subtree
    if (/\/steps?(\/|$)/.test(path) && !/goal|target|timestamp|_at$|_time$/.test(path) && node > steps && node <= 200000 && Number.isInteger(node)) steps = node;
  };
  walk(json, '');
  return { recovery, movement, steps: steps || null };
}

// One request: direct first (raw token, then Bearer on 401/403); if the browser
// blocks the call outright (CORS -> TypeError), retry via the same-origin proxy.
async function uhRequest(date, email, key) {
  const qs = new URLSearchParams({ date });
  if (email) qs.set('email', email);
  try {
    let res = await fetch(`${UH_URL}?${qs}`, { headers: { Authorization: key } });
    if (res.status === 401 || res.status === 403) {
      res = await fetch(`${UH_URL}?${qs}`, { headers: { Authorization: `Bearer ${key}` } });
    }
    if (!res.ok) throw new Error(`Ultrahuman API: ${res.status}`);
    return await res.json();
  } catch (err) {
    if (!(err instanceof TypeError)) throw err; // real API error - report it
    const res = await fetch(`/api/uh?${qs}`, { headers: { 'X-UH-Token': key } });
    if (!res.ok) throw new Error(`Ultrahuman API (via proxy): ${res.status}`);
    return await res.json();
  }
}

export async function fetchUltrahuman(date = todayYmd()) {
  const s = store.get().settings;
  if (!s.uhKey) throw new Error('Paste your Ultrahuman auth token in Settings first');
  // A personal token needs no email; with an email we try scoped first, then own-data.
  const attempts = s.uhEmail ? [s.uhEmail, ''] : [''];
  let lastErr = null;
  for (const email of attempts) {
    try {
      const json = await uhRequest(date, email, s.uhKey);
      const { score, hours } = extractSleep(json);
      if (score === null && hours === null) { lastErr = new Error('No sleep data in the ring response for ' + date); continue; }
      const patch = { source: 'ultrahuman' };
      if (score !== null) patch.sleepScore = score;
      if (hours !== null) patch.sleepHours = hours;
      const extra = extractExtras(json);
      if (extra.recovery !== null) patch.recoveryIndex = extra.recovery;
      if (extra.movement !== null) patch.movementIndex = extra.movement;
      if (extra.steps !== null) patch.steps = extra.steps;
      store.setMetrics(date, patch);
      return patch;
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('Ultrahuman sync failed');
}
