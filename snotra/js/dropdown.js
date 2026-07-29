// Snotra - custom dropdowns. Upgrades every native <select> into an on-brand
// component while keeping the native element in the DOM (hidden) so all code
// that reads select.value or listens for 'change' keeps working untouched.
// Options with known semantic values get a colored dot / icon.

const META = {
  // task status
  todo: { icon: '○', color: 'var(--faint)' },
  doing: { icon: '◐', color: 'var(--amber)' },
  done: { icon: '●', color: 'var(--green)' },
  // priority
  high: { icon: '▲', color: 'var(--red)' },
  normal: { icon: '■', color: 'var(--faint)' },
  low: { icon: '▽', color: 'var(--blue, #6a9bd8)' },
  // quest types / metrics
  check: { icon: '☑', color: 'var(--amber)' },
  metric: { icon: '◈', color: 'var(--amber-bright)' },
  sleepScore: { icon: '😴' },
  sleepHours: { icon: '🌙' },
  steps: { icon: '👣' },
  movementIndex: { icon: '🏃' },
  // theme
  dark: { icon: '◐' },
  light: { icon: '◑' },
};

let openDd = null;

export function closeOpenDropdown() {
  if (openDd) { openDd.remove(); openDd = null; return true; }
  return false;
}

function optionHtml(opt) {
  const m = META[opt.value] || {};
  const dot = m.color ? `<span class="dd-dot" style="background:${m.color}"></span>` : '';
  const icon = m.icon && !m.color ? `<span class="dd-ico">${m.icon}</span>` : '';
  return `${dot}${icon}<span class="dd-text">${opt.label || opt.textContent}</span>`;
}

function buttonLabel(sel) {
  const opt = sel.options[sel.selectedIndex];
  return opt ? optionHtml(opt) : '<span class="dd-text faint">choose…</span>';
}

export function enhanceSelects(root) {
  if (!root) return;
  root.querySelectorAll('select:not([data-native]):not([data-dd])').forEach(sel => {
    if (sel.multiple || sel.size > 1) return;
    sel.dataset.dd = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dd';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);           // native select lives inside, visually hidden via CSS
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn';
    btn.innerHTML = `<span class="dd-cur">${buttonLabel(sel)}</span><span class="dd-chev">▾</span>`;
    wrap.appendChild(btn);

    const syncBtn = () => { btn.querySelector('.dd-cur').innerHTML = buttonLabel(sel); };
    sel.addEventListener('change', syncBtn);

    btn.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      if (openDd && openDd._for === sel) { closeOpenDropdown(); return; }
      closeOpenDropdown();
      const list = document.createElement('div');
      list.className = 'dd-list';
      list._for = sel;
      [...sel.options].forEach((opt, i) => {
        if (opt.hidden) return;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'dd-opt' + (i === sel.selectedIndex ? ' active' : '') + (opt.disabled ? ' disabled' : '');
        row.innerHTML = optionHtml(opt) + (i === sel.selectedIndex ? '<span class="dd-check">✓</span>' : '');
        if (!opt.disabled) row.onclick = () => {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          syncBtn();
          closeOpenDropdown();
        };
        list.appendChild(row);
      });
      // fixed positioning so the list never clips inside scrolling modals
      const r = btn.getBoundingClientRect();
      list.style.left = r.left + 'px';
      list.style.minWidth = r.width + 'px';
      const below = window.innerHeight - r.bottom;
      if (below < 240 && r.top > 260) { list.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
      else { list.style.top = (r.bottom + 4) + 'px'; }
      document.body.appendChild(list);
      openDd = list;
      const first = list.querySelector('.dd-opt.active') || list.querySelector('.dd-opt');
      if (first) first.focus();
    };
  });
}

// Global closers: click-away, Escape (before the modal's Escape), scroll.
document.addEventListener('mousedown', e => {
  if (openDd && !openDd.contains(e.target) && !e.target.closest('.dd-btn')) closeOpenDropdown();
});
document.addEventListener('keydown', e => {
  if (!openDd) return;
  if (e.key === 'Escape') { e.stopPropagation(); closeOpenDropdown(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const opts = [...openDd.querySelectorAll('.dd-opt:not(.disabled)')];
    const cur = opts.indexOf(document.activeElement);
    const next = opts[cur + (e.key === 'ArrowDown' ? 1 : -1)] || opts[e.key === 'ArrowDown' ? 0 : opts.length - 1];
    if (next) next.focus();
  }
  if (e.key === 'Enter' && document.activeElement?.classList.contains('dd-opt')) {
    e.preventDefault(); document.activeElement.click();
  }
}, true);
window.addEventListener('resize', () => closeOpenDropdown());
