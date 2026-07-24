// Snotra - sleep metrics. Manual entry always works; Ultrahuman ring sync is best-effort
// (their partner API needs a key, and some browsers/networks may block cross-origin calls -
// if so Snotra tells you and you enter the score manually).
import * as store from './store.js';
import { todayYmd } from './utils.js';

const UH_URL = 'https://partner.ultrahuman.com/api/v1/metrics';

// Deep-scan an unknown JSON shape for a sleep score (0–100) and sleep duration.
export function extractSleep(json) {
  let score = null, hours = null;
  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'object') {
      Object.entries(node).forEach(([k, v]) => walk(v, path + '/' + k.toLowerCase()));
      return;
    }
    if (typeof node !== 'number') return;
    const inSleep = /sleep/.test(path);
    if (score === null && inSleep && /(score|index)$/.test(path) && node >= 0 && node <= 100) score = Math.round(node);
    if (hours === null && inSleep && /(duration|total.*sleep|asleep)/.test(path)) {
      if (node > 20000) hours = Math.round(node / 360) / 10;        // seconds
      else if (node > 90 && node <= 1440) hours = Math.round(node / 6) / 10; // minutes
      else if (node > 0 && node <= 16) hours = Math.round(node * 10) / 10;   // already hours
    }
  };
  walk(json, '');
  return { score, hours };
}

export async function fetchUltrahuman(date = todayYmd()) {
  const s = store.get().settings;
  if (!s.uhKey || !s.uhEmail) throw new Error('Add your Ultrahuman email + API key in Settings first');
  const url = `${UH_URL}?email=${encodeURIComponent(s.uhEmail)}&date=${date}`;
  const res = await fetch(url, { headers: { Authorization: s.uhKey } });
  if (!res.ok) throw new Error(`Ultrahuman API: ${res.status}`);
  const json = await res.json();
  const { score, hours } = extractSleep(json);
  if (score === null && hours === null) throw new Error('No sleep data in the ring response for ' + date);
  const patch = { source: 'ultrahuman' };
  if (score !== null) patch.sleepScore = score;
  if (hours !== null) patch.sleepHours = hours;
  store.setMetrics(date, patch);
  return patch;
}
