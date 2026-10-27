// Iconițe SVG din aceeași familie: grilă 24×24, contur 2px, capete rotunjite.
// Se folosesc prin icon('nume') sau prin atributul data-icon din HTML.

const PATHS = {
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2c2.9.3 5 2.4 5 5.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="3.5"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1.2"/><circle cx="9" cy="13.5" r="1.3"/><circle cx="15" cy="13.5" r="1.3"/><path d="M9.5 17h5M2 12.5v3.5M22 12.5v3.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  empty: '<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 3"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5z"/><path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19"/><path d="M9 7.5h6"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  exit: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 2"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/>',
  replay: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  bolt: '<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5h11.5l-2.5 4 2.5 4H5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.3" r=".6" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  play: '<path d="M7 5.5v13l11-6.5z"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

/** Înlocuiește <span data-icon="nume" data-size="20"> cu iconița corespunzătoare. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => {
    node.innerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 20);
  });
}
