// Snotra — Notes: markdown notes with wiki-links, tags, daily notes.
import * as store from '../store.js';
import { escapeHtml, renderMarkdown, toggleMdCheckbox, debounce, todayYmd, fmtDate } from '../utils.js';
import { navigate, toast } from '../app.js';

let activeId = null;
let query = '';
let previewMode = true;

export function renderNotes(el, param) {
  if (param) activeId = param;
  const notes = store.get().notes
    .filter(n => !query || n.title.toLowerCase().includes(query.toLowerCase()) || n.body.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt);
  if (!activeId || !store.note(activeId)) activeId = notes[0]?.id || null;
  const active = store.note(activeId);

  el.innerHTML = `
  <div class="page-head">
    <h1>Notes</h1>
    <span class="page-sub">${store.get().notes.length} note${store.get().notes.length === 1 ? '' : 's'}</span>
    <div class="page-actions">
      <input id="nt-search" placeholder="Search notes…" value="${escapeHtml(query)}" style="width:200px">
      <button class="btn" id="nt-daily">☀ Today's daily note</button>
      <button class="btn primary" id="nt-new">+ New note</button>
    </div>
  </div>
  <div class="notes-wrap">
    <div class="notes-list card" style="padding:8px">
      ${notes.map(n => `<div class="note-item ${n.id === activeId ? 'active' : ''}" data-note="${n.id}">
        <div class="nt">${n.pinned ? '📌 ' : ''}${n.daily ? '☀ ' : ''}${escapeHtml(n.title)}</div>
        <div class="np">${escapeHtml(n.body.replace(/[#>*\-\[\]]/g, '').slice(0, 60)) || '—'}</div>
      </div>`).join('') || '<div class="empty">No notes match.</div>'}
    </div>
    <div class="note-editor card" id="nt-editor">
      ${active ? editorHtml(active) : '<div class="empty">Create a note to begin.</div>'}
    </div>
  </div>`;

  el.querySelector('#nt-search').oninput = debounce(e => { query = e.target.value; renderNotes(el); }, 200);
  el.querySelector('#nt-new').onclick = () => {
    const n = store.addNote({ title: 'Untitled' });
    activeId = n.id; previewMode = false; renderNotes(el);
  };
  el.querySelector('#nt-daily').onclick = () => {
    const n = store.dailyNote(todayYmd(), true);
    activeId = n.id; renderNotes(el);
  };
  el.querySelectorAll('.note-item').forEach(it => it.onclick = () => { activeId = it.dataset.note; renderNotes(el); });

  if (active) wireEditor(el, active);
}

function editorHtml(n) {
  const linkedTasks = store.get().tasks.filter(t => t.notes && t.notes.includes(`[[${n.title}]]`));
  return `
    <input class="note-title-input" id="nt-title" value="${escapeHtml(n.title)}">
    <div class="note-tools">
      <span class="faint mono" style="font-size:11px">edited ${new Date(n.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      ${n.daily ? `<span class="chip">daily · ${fmtDate(n.daily)}</span>` : ''}
      ${n.tags.map(t => `<span class="chip">#${escapeHtml(t)}</span>`).join('')}
      <span class="spacer"></span>
      <button class="btn small ${previewMode ? '' : 'primary'}" id="nt-mode">${previewMode ? '✎ Edit' : '✓ Done editing'}</button>
      <button class="btn small" id="nt-pin">${n.pinned ? 'Unpin' : '📌 Pin'}</button>
      <button class="btn small" id="nt-totask" title="Create a task linked to this note">→ Task</button>
      <button class="btn small danger" id="nt-del">Delete</button>
    </div>
    <div class="note-body">
      ${previewMode
        ? `<div class="note-preview" id="nt-preview">${renderMarkdown(n.body) || '<p class="faint">Empty note — click Edit.</p>'}</div>`
        : `<textarea id="nt-body" placeholder="Write in markdown… use [[Note Title]] to link notes, - [ ] for checklists">${escapeHtml(n.body)}</textarea>
           <div class="note-preview" id="nt-preview">${renderMarkdown(n.body)}</div>`}
    </div>`;
}

function wireEditor(el, n) {
  const titleEl = el.querySelector('#nt-title');
  titleEl.onchange = () => { store.updateNote(n.id, { title: titleEl.value.trim() || 'Untitled' }); renderNotes(el); };

  el.querySelector('#nt-mode').onclick = () => { previewMode = !previewMode; renderNotes(el); };
  el.querySelector('#nt-pin').onclick = () => { store.updateNote(n.id, { pinned: !n.pinned }); renderNotes(el); };
  el.querySelector('#nt-del').onclick = () => {
    if (confirm(`Delete note "${n.title}"?`)) { store.deleteNote(n.id); activeId = null; renderNotes(el); }
  };
  el.querySelector('#nt-totask').onclick = () => {
    store.addTask({ title: n.title, notes: `From note [[${n.title}]]`, inbox: true });
    toast(`Task created in inbox, linked to “${escapeHtml(n.title)}”`, 'success');
  };

  const body = el.querySelector('#nt-body');
  if (body) {
    const saveBody = debounce(() => {
      store.updateNote(n.id, { body: body.value, tags: extractTags(body.value) });
      const pv = el.querySelector('#nt-preview');
      if (pv) { pv.innerHTML = renderMarkdown(body.value); wirePreview(el, n); }
    }, 250);
    body.addEventListener('input', saveBody);
    body.focus();
  }
  wirePreview(el, n);
}

function wirePreview(el, n) {
  const pv = el.querySelector('#nt-preview');
  if (!pv) return;
  pv.querySelectorAll('[data-wikilink]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const title = a.dataset.wikilink;
    let target = store.noteByTitle(title);
    if (!target) { target = store.addNote({ title }); toast(`Created linked note “${escapeHtml(title)}”`, 'success'); }
    activeId = target.id;
    navigate('notes', target.id);
    renderNotes(el.closest('#view') || el);
  });
  pv.querySelectorAll('input[data-mdline]').forEach(cb => cb.onclick = () => {
    const cur = store.note(n.id);
    store.updateNote(n.id, { body: toggleMdCheckbox(cur.body, +cb.dataset.mdline) });
    renderNotes(el.closest('#view') || el);
  });
}

function extractTags(body) {
  const m = body.match(/(^|\s)#([\w-]{2,})/g) || [];
  return [...new Set(m.map(x => x.trim().slice(1).toLowerCase()))].slice(0, 8);
}
