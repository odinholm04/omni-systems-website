// Snotra - accounts. Talks straight to Supabase Auth (GoTrue) over REST; no SDK,
// no build step. The session (access + refresh token) lives in localStorage and
// refreshes itself, so a device you've signed in on stays signed in.
const AUTH_URL = 'https://poveaqiwzapwajutktsa.supabase.co/auth/v1';
const KEY_PUB = 'sb_publishable_Ah-S02aFbBtoiF-FzSkaRQ_54JutJAv';
const LS = 'snotra.auth.v1';

let session = load();
const listeners = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; }
}
function persist() {
  try { session ? localStorage.setItem(LS, JSON.stringify(session)) : localStorage.removeItem(LS); } catch (e) { /* private mode */ }
  listeners.forEach(fn => fn(session));
}
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function user() { return session?.user || null; }

async function authFetch(path, body, token) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY_PUB,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || json.error_description || json.message || `auth failed (${res.status})`);
  return json;
}

function setFromTokenResponse(json) {
  session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    user: { id: json.user?.id, email: json.user?.email },
  };
  persist();
  return session;
}

export async function signUp(email, password) {
  const json = await authFetch('/signup', { email, password });
  if (json.access_token) return { session: setFromTokenResponse(json), needsConfirm: false };
  // Email confirmation is enabled on the project: no session until the link is clicked.
  return { session: null, needsConfirm: true };
}

export async function signIn(email, password) {
  const json = await authFetch('/token?grant_type=password', { email, password });
  return setFromTokenResponse(json);
}

export async function signOut() {
  const t = session?.access_token;
  session = null; persist();
  if (t) { try { await authFetch('/logout', {}, t); } catch (e) { /* already gone */ } }
}

// Valid access token, refreshing when within 2 minutes of expiry.
export async function getToken() {
  if (!session) return null;
  if (Date.now() < session.expires_at - 120000) return session.access_token;
  try {
    const json = await authFetch('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    return setFromTokenResponse(json).access_token;
  } catch (e) {
    // refresh token revoked/expired: sign the device out rather than loop
    session = null; persist();
    return null;
  }
}
