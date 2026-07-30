// Snotra - cloud sync. Signed in, your whole state lives as one row in YOUR
// Supabase (RLS: only you can read it). Local-first: the app never waits on the
// network; we pull on boot / tab-focus and push (debounced) after every change.
// Conflicts (two devices edited while offline) resolve last-writer-wins.
import * as store from './store.js';
import { getToken, user, onAuthChange } from './auth.js';

const REST = 'https://poveaqiwzapwajutktsa.supabase.co/rest/v1/snotra_cloud';
const KEY_PUB = 'sb_publishable_Ah-S02aFbBtoiF-FzSkaRQ_54JutJAv';
const META = 'snotra.cloudmeta.v1';

export let lastError = null;
export let lastSyncAt = 0;

let applying = false;   // true while we overwrite local state from the cloud
let meta = loadMeta();

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META)) || { syncedAt: 0, changedAt: 0 }; }
  catch { return { syncedAt: 0, changedAt: 0 }; }
}
function saveMeta() { try { localStorage.setItem(META, JSON.stringify(meta)); } catch (e) { /* ok */ } }

async function headers() {
  const token = await getToken();
  if (!token) return null;
  return { apikey: KEY_PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function fetchRemote() {
  const h = await headers();
  if (!h) return { signedOut: true };
  const res = await fetch(`${REST}?select=data,updated_at&user_id=eq.${user().id}`, { headers: h });
  if (!res.ok) throw new Error(`cloud fetch failed (${res.status})`);
  const rows = await res.json();
  return { row: rows[0] || null };
}

export async function push() {
  const h = await headers();
  if (!h) return false;
  const now = new Date().toISOString();
  const res = await fetch(`${REST}?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: user().id, data: store.get(), device: navigator.platform || '', updated_at: now }),
  });
  if (!res.ok) { lastError = `cloud push failed (${res.status})`; throw new Error(lastError); }
  meta.syncedAt = Date.parse(now); saveMeta();
  lastSyncAt = meta.syncedAt; lastError = null;
  return true;
}

function applyRemote(row) {
  applying = true;
  try {
    store.replaceState(row.data);
    meta.syncedAt = Date.parse(row.updated_at);
    meta.changedAt = 0;
    saveMeta();
    lastSyncAt = meta.syncedAt;
  } finally { applying = false; }
}

// Boot / focus reconciliation. Returns what happened so the UI can toast.
export async function pull() {
  try {
    const r = await fetchRemote();
    if (r.signedOut) return 'signed-out';
    if (!r.row) { await push(); return 'first-push'; }
    const remoteT = Date.parse(r.row.updated_at);
    const localDirty = meta.changedAt > meta.syncedAt;
    const remoteNewer = remoteT > meta.syncedAt + 2000;
    if (remoteNewer && !localDirty) { applyRemote(r.row); return 'pulled'; }
    if (remoteNewer && localDirty) {
      // both sides moved: last writer wins
      if (remoteT >= meta.changedAt) { applyRemote(r.row); return 'pulled-conflict'; }
      await push(); return 'pushed-conflict';
    }
    if (localDirty) { await push(); return 'pushed'; }
    return 'in-sync';
  } catch (e) { lastError = e.message; return 'error'; }
}

let pushTimer = null;
export function schedulePush() {
  if (applying) return;
  meta.changedAt = Date.now(); saveMeta();
  if (!user()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push().catch(() => {}), 4000);
}

export async function syncNow() {
  const result = await pull();
  return result;
}

// Wire-up: every local change marks dirty + schedules a push; signing in pushes/pulls.
export function init(onPulled) {
  store.onChange(() => schedulePush());
  onAuthChange(u => { if (u) pull().then(r => { if (r === 'pulled' || r === 'pulled-conflict') onPulled?.(r); }); });
  if (user()) pull().then(r => { if (r === 'pulled' || r === 'pulled-conflict') onPulled?.(r); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && user()) pull().then(r => { if (r === 'pulled' || r === 'pulled-conflict') onPulled?.(r); });
  });
}
