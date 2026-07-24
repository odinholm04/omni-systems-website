// Snotra — accent palette. Dark/light is the base; the accent is a deliberate,
// meaning-driven choice drawn from chakra + colour psychology. The whole app
// themes off --amber / --amber-bright / --on-accent, so one call re-skins everything.
import * as store from './store.js';
import { showModal, closeModal, renderApp, toast } from './app.js';

// main = accent · bright = lighter tint (accent text / hover) · on = text that sits ON the accent
export const PALETTE = [
  { key: 'amber', name: 'Amber', chakra: 'Signature', main: '#e8a33d', bright: '#f2b65a', on: '#0a0b0c',
    meaning: 'Warm focus and steady momentum — Snotra’s home fire.',
    when: 'everyday drive & clarity' },
  { key: 'red', name: 'Red', chakra: 'Root · Life force', main: '#e5484d', bright: '#f36a6e', on: '#180809',
    meaning: 'Courage, action and raw life-force. Passion, drive, self-confidence and groundedness.',
    when: 'you’re calling in courage & bold action' },
  { key: 'orange', name: 'Orange', chakra: 'Sacral · Creativity', main: '#ef7415', bright: '#ff9542', on: '#180b02',
    meaning: 'Creativity, enthusiasm and self-respect. Uplifts mood, sparks motivation and joy.',
    when: 'chasing creative work & momentum' },
  { key: 'gold', name: 'Gold', chakra: 'Solar plexus · Power', main: '#dca400', bright: '#f2c63c', on: '#171200',
    meaning: 'Confidence, optimism and clarity. Personal power, warmth and focus.',
    when: 'building confidence & personal power' },
  { key: 'green', name: 'Green', chakra: 'Heart · Growth', main: '#2fa96b', bright: '#54c98c', on: '#04140c',
    meaning: 'Love, growth and abundance. Balance, healing, compassion and renewal.',
    when: 'focused on growth, health & love' },
  { key: 'turquoise', name: 'Turquoise', chakra: 'Throat · Expression', main: '#10aec0', bright: '#3fd1de', on: '#021417',
    meaning: 'Self-expression, calm and truth. Clarity of mind, kindness and patience.',
    when: 'expressing, creating & finding calm' },
  { key: 'blue', name: 'Blue', chakra: 'Third eye · Focus', main: '#3b82c4', bright: '#66a6e6', on: '#f4f7fb',
    meaning: 'Depth, trust and steady focus. Calm, clear thinking and concentration.',
    when: 'deep work & sustained concentration' },
  { key: 'indigo', name: 'Indigo', chakra: 'Third eye · Intuition', main: '#5b54d6', bright: '#847dee', on: '#f4f4fc',
    meaning: 'Wisdom and intuition. Spiritual awareness, integrity and inner vision.',
    when: 'introspection, vision & insight' },
  { key: 'violet', name: 'Violet', chakra: 'Crown · Spirit', main: '#8b5cd6', bright: '#a988ea', on: '#f7f4fc',
    meaning: 'Spirituality and imagination. Intuition, dignity, determination and purpose.',
    when: 'seeking meaning & higher purpose' },
  { key: 'rose', name: 'Rose', chakra: 'Heart · Compassion', main: '#e0559a', bright: '#f27bb5', on: '#1a0611',
    meaning: 'Self-love, warmth and nurture. Softness, kindness and emotional care.',
    when: 'self-compassion, healing & gentleness' },
  { key: 'silver', name: 'Silver', chakra: 'Root · Reflection', main: '#94a0ac', bright: '#c0c8d0', on: '#0d0f11',
    meaning: 'Reflection and change. Patience, perseverance and clear communication.',
    when: 'recalibrating & moving through change' },
];

export function accentDef(key) {
  return PALETTE.find(p => p.key === key) || PALETTE[0];
}

export function applyAccent(key) {
  const p = accentDef(key);
  const r = document.documentElement.style;
  r.setProperty('--amber', p.main);
  r.setProperty('--amber-bright', p.bright);
  r.setProperty('--on-accent', p.on);
}

export function openPaletteModal() {
  const render = () => {
    const s = store.get().settings;
    const cards = PALETTE.map(p => `
      <button class="swatch-card ${s.accent === p.key ? 'selected' : ''}" data-accent="${p.key}"
        style="--sw:${p.main};--swb:${p.bright}">
        ${s.accent === p.key ? '<span class="swatch-check">✓</span>' : ''}
        <div class="swatch-head">
          <span class="swatch-dot"></span>
          <div>
            <div class="swatch-name">${p.name}</div>
            <div class="swatch-chakra">${p.chakra}</div>
          </div>
        </div>
        <div class="swatch-meaning">${p.meaning}</div>
        <div class="swatch-when">Choose when: ${p.when}</div>
      </button>`).join('');

    const box = showModal(`
      <h2>Palette — align Snotra with your journey</h2>
      <p class="palette-intro">Colour is a tool. Pick the base, then choose the accent that matches where you are and what you’re
        reaching for right now — the whole app takes on that colour. Change it whenever your focus shifts.</p>
      <div class="base-toggle">
        <span class="muted" style="font-size:13px">Base</span>
        <div class="seg" id="base-seg">
          <button class="${s.theme === 'dark' ? 'active' : ''}" data-base="dark">◐ Dark</button>
          <button class="${s.theme === 'light' ? 'active' : ''}" data-base="light">◑ Light</button>
        </div>
        <span class="spacer"></span>
        <span class="mono faint" style="font-size:11px">now: ${accentDef(s.accent).name} · ${s.theme}</span>
      </div>
      <div class="palette-grid">${cards}</div>
      <div class="modal-foot"><span class="spacer"></span><button class="btn primary" id="pal-done">Done</button></div>`);

    box.querySelectorAll('[data-base]').forEach(b => b.onclick = () => {
      s.theme = b.dataset.base;
      document.documentElement.dataset.theme = s.theme;
      store.save(); render();
    });
    box.querySelectorAll('[data-accent]').forEach(c => c.onclick = () => {
      s.accent = c.dataset.accent;
      applyAccent(s.accent);
      store.save();
      toast(`Accent set to <b>${accentDef(s.accent).name}</b> — ${accentDef(s.accent).when}`, 'success');
      render();
      renderApp();
    });
    box.querySelector('#pal-done').onclick = () => { closeModal(); renderApp(); };
  };
  render();
}
