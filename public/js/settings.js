// Setările utilizatorului, păstrate în localStorage (dacă browserul permite).

const KEY = 'ludo.settings.v1';
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS = {
  sound: true,
  animations: !reducedMotion,
  aiSpeed: 'normal',   // 'fast' | 'normal' | 'slow'
  autoMove: false,     // mută automat când există o singură variantă
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();
const listeners = new Set();

export function updateSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stocare indisponibilă */ }
  listeners.forEach(fn => fn(settings));
}

export function onSettingsChange(fn) { listeners.add(fn); }

export const AI_DELAY = { fast: 350, normal: 750, slow: 1300 };
