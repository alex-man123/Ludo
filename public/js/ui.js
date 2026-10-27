// Ajutătoare comune pentru interfață.

import { PALETTE } from './theme.js';

export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];

/** Textul introdus de utilizatori este afișat mereu ca text, niciodată interpretat ca HTML. */
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Variabile CSS pentru culoarea unui jucător (folosite de carduri, zona de aruncare, victorie). */
export function colorVars(node, color, prefix = 'c') {
  const p = PALETTE[color];
  node.style.setProperty(`--${prefix}`, p.main);
  node.style.setProperty(`--${prefix}-light`, p.light);
  node.style.setProperty(`--${prefix}-dark`, p.dark);
  node.style.setProperty(`--${prefix}-edge`, p.edge);
  node.style.setProperty(`--${prefix}-ink`, p.ink);
}

export function showScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
  document.body.dataset.screen = name;
  window.scrollTo({ top: 0 });
}

export function openDialog(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}
