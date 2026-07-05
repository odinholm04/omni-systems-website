// Mimir — shared utilities: ids, dates, natural-language parsing, markdown.

export const uid = () => 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- dates ----------
export const DAY_MS = 86400000;

export function ymd(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function fromYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export const todayYmd = () => ymd(new Date());

export function startOfWeek(s) { // Monday
  const d = fromYmd(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

export function fmtDate(s, opts = {}) {
  if (!s) return '';
  const d = fromYmd(s);
  const today = todayYmd();
  if (s === today) return 'Today';
  if (s === addDays(today, 1)) return 'Tomorrow';
  if (s === addDays(today, -1)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), ...opts });
}

export function fmtTime(hhmm) {
  return hhmm || '';
}

export function minutesToHM(min) {
  min = Math.round(min);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function timeToMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function minToTime(min) {
  min = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function quarterOf(s) {
  const m = Number(s.slice(5, 7));
  return Math.floor((m - 1) / 3) + 1;
}

// ---------- natural language quick-add parsing ----------
// Supports: "tomorrow", "today", "tonight", weekday names, "next week",
// "jul 12" / "12 jul", times ("9am", "14:30"), durations ("for 45m", "for 1.5h"),
// "!high" / "!low" / "!min", "#tag", "@project".
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseQuickAdd(input, base = new Date()) {
  let text = ' ' + input.trim() + ' ';
  const out = { title: '', priority: null, tags: [], project: null, date: null, time: null, durationMin: null };

  text = text.replace(/\s!(high|hi|h)\b/i, () => { out.priority = 'high'; return ' '; });
  text = text.replace(/\s!(low|l)\b/i, () => { out.priority = 'low'; return ' '; });
  text = text.replace(/\s!(min|minimal|m)\b/i, () => { out.priority = 'min'; return ' '; });

  text = text.replace(/\s#([\w-]+)/g, (_, t) => { out.tags.push(t.toLowerCase()); return ' '; });
  text = text.replace(/\s@([\w-]+)/g, (_, p) => { out.project = p.toLowerCase(); return ' '; });

  text = text.replace(/\sfor\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, (_, h) => { out.durationMin = Math.round(parseFloat(h) * 60); return ' '; });
  text = text.replace(/\sfor\s+(\d+)\s*m(?:in(?:utes?)?)?\b/i, (_, m) => { out.durationMin = Number(m); return ' '; });

  // time: 9am / 9.30pm / 14:30 / at 9
  const timeRe = /\s(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b(?!\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d))/i;
  text = text.replace(timeRe, (m0, h, mm, ap) => {
    let H = Number(h);
    if (!ap && !mm) return m0; // bare number without am/pm or :MM — probably not a time
    if (ap) {
      ap = ap.toLowerCase();
      if (ap === 'pm' && H < 12) H += 12;
      if (ap === 'am' && H === 12) H = 0;
    }
    if (H > 23) return m0;
    out.time = `${String(H).padStart(2, '0')}:${mm || '00'}`;
    return ' ';
  });

  const baseYmd = ymd(base);
  text = text.replace(/\s(today|tonight)\b/i, () => { out.date = baseYmd; return ' '; });
  text = text.replace(/\s(tomorrow|tmrw|tmr)\b/i, () => { out.date = addDays(baseYmd, 1); return ' '; });
  text = text.replace(/\snext\s+week\b/i, () => { out.date = addDays(startOfWeek(baseYmd), 7); return ' '; });

  text = text.replace(/\s(?:on\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i, (m0, w) => {
    const full = WEEKDAYS.find(x => x.startsWith(w.toLowerCase().slice(0, 3)));
    const target = WEEKDAYS.indexOf(full);
    let diff = (target - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    out.date = addDays(baseYmd, diff);
    return ' ';
  });

  // "jul 12" or "12 jul"
  text = text.replace(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i, (_, mo, d) => {
    out.date = monthDayToYmd(mo, d, base); return ' ';
  });
  text = text.replace(/\s(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, (_, d, mo) => {
    out.date = monthDayToYmd(mo, d, base); return ' ';
  });

  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}

function monthDayToYmd(mo, d, base) {
  const m = MONTHS.indexOf(mo.toLowerCase().slice(0, 3));
  let y = base.getFullYear();
  const candidate = new Date(y, m, Number(d));
  if (ymd(candidate) < ymd(base)) y += 1;
  return ymd(new Date(y, m, Number(d)));
}

// ---------- markdown (small, safe renderer) ----------
export function renderMarkdown(src = '') {
  const lines = String(src).split('\n');
  let html = '', inList = null, inCode = false, codeBuf = [];
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };

  const inline = s => {
    s = escapeHtml(s);
    s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t) => `<a href="#" class="wikilink" data-wikilink="${escapeHtml(t.trim())}">${escapeHtml(t.trim())}</a>`);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith('```')) {
      if (inCode) { html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`; codeBuf = []; }
      inCode = !inCode;
      return;
    }
    if (inCode) { codeBuf.push(line); return; }

    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { closeList(); html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`; return; }

    const todo = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)/);
    if (todo) {
      if (inList !== 'ul') { closeList(); html += '<ul class="md-todos">'; inList = 'ul'; }
      const done = todo[1].toLowerCase() === 'x';
      html += `<li class="md-todo${done ? ' done' : ''}"><input type="checkbox" data-mdline="${i}" ${done ? 'checked' : ''}> <span>${inline(todo[2])}</span></li>`;
      return;
    }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inline(li[1])}</li>`; return;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ol) {
      if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inline(ol[1])}</li>`; return;
    }
    const bq = line.match(/^>\s?(.*)/);
    if (bq) { closeList(); html += `<blockquote>${inline(bq[1])}</blockquote>`; return; }

    closeList();
    if (line.trim() === '') html += '';
    else html += `<p>${inline(line)}</p>`;
  });
  closeList();
  if (inCode && codeBuf.length) html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
  return html;
}

// Toggle "- [ ]" ↔ "- [x]" on a given line of a markdown source string.
export function toggleMdCheckbox(src, lineIdx) {
  const lines = String(src).split('\n');
  const l = lines[lineIdx];
  if (l === undefined) return src;
  if (/\[( )\]/.test(l)) lines[lineIdx] = l.replace(/\[( )\]/, '[x]');
  else lines[lineIdx] = l.replace(/\[(x|X)\]/, '[ ]');
  return lines.join('\n');
}

export function fuzzyMatch(query, text) {
  query = query.toLowerCase(); text = text.toLowerCase();
  if (!query) return true;
  if (text.includes(query)) return true;
  let qi = 0;
  for (const ch of text) { if (ch === query[qi]) qi++; if (qi === query.length) return true; }
  return false;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
