// Snotra - Ultrahuman Partner API proxy (Vercel serverless function).
// Exists only because browsers may block the cross-origin call; this keeps it
// same-origin. Holds NO secrets: the caller supplies their own token per request,
// and the upstream host is fixed. Gated to same-origin browser requests so
// strangers cannot use it as a relay or burn function invocations.
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

  // Same-origin gate: modern browsers send Sec-Fetch-Site; fall back to
  // Origin/Referer host matching. Non-browser callers don't need a CORS proxy.
  const sfs = req.headers['sec-fetch-site'];
  const host = req.headers.host || '';
  const refHost = h => { try { return new URL(h).host; } catch { return null; } };
  const sameOrigin = sfs
    ? sfs === 'same-origin'
    : (refHost(req.headers.origin || req.headers.referer || '') === host);
  if (!sameOrigin) { res.status(403).json({ error: 'same-origin only' }); return; }

  const { email = '', date = '' } = req.query;
  const token = req.headers['x-uh-token'];
  if (!token || !date) { res.status(400).json({ error: 'missing token or date' }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'bad date format, expected YYYY-MM-DD' }); return; }

  const qs = new URLSearchParams({ date });
  if (email) qs.set('email', email);
  const url = `https://partner.ultrahuman.com/api/v1/partner/daily_metrics?${qs}`;

  let r = await fetch(url, { headers: { Authorization: token } });
  if (r.status === 401 || r.status === 403) {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  const body = await r.text();
  res.status(r.status);
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.send(body);
}
