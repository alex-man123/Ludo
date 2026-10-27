// Culori, simboluri și piese grafice (pion, avatar, zar decorativ).
// Simbolurile asigură identificarea și fără a te baza doar pe culoare.

// main = culoarea de bază, dark = contur, edge = umbra solidă a pieselor,
// lane = culoarul final (variantă temperată), light = fundalul stărilor active, ink = text pe `main`.
export const PALETTE = {
  red:    { main: '#bf3546', dark: '#7e1f2c', edge: '#8c2433', lane: '#cf6c78', light: '#d9b4bb', ink: '#ffffff' },
  green:  { main: '#23734f', dark: '#134430', edge: '#185338', lane: '#5f9d80', light: '#abc8bb', ink: '#ffffff' },
  yellow: { main: '#c49619', dark: '#73570a', edge: '#8c6a0d', lane: '#d5b452', light: '#d8cb9d', ink: '#20283b' },
  blue:   { main: '#315db5', dark: '#1c3873', edge: '#22438a', lane: '#6f8fcf', light: '#afbfdf', ink: '#ffffff' },
};

/** Culorile neutre ale tablei (aceleași valori ca variabilele CSS). */
export const BOARD = {
  ink: '#20283b',
  frame: '#949eb4',
  bg: '#a7b1c4',
  cell: '#d0d7e2',
  cellLine: '#8e99af',
  inner: '#c3ccda',
  face: '#dde2ea',
};

export const SYMBOL_NAMES = { red: 'stea', green: 'triunghi', yellow: 'cerc', blue: 'pătrat' };

let uid = 0;

/** Calea SVG a simbolului unei culori, centrată în (0, 0), cu „raza” r. */
export function symbolPath(color, r) {
  switch (color) {
    case 'red': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? r * 0.45 : r;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`);
      }
      return `M${pts.join('L')}Z`;
    }
    case 'green':
      return `M0,${-r} L${(r * 0.9).toFixed(2)},${(r * 0.62).toFixed(2)} L${(-r * 0.9).toFixed(2)},${(r * 0.62).toFixed(2)}Z`;
    case 'yellow':
      return `M${-r * 0.8},0 a${r * 0.8},${r * 0.8} 0 1,0 ${r * 1.6},0 a${r * 0.8},${r * 0.8} 0 1,0 ${-r * 1.6},0Z`;
    case 'blue':
    default: {
      const s = r * 0.72;
      return `M${-s},${-s} H${s} V${s} H${-s}Z`;
    }
  }
}

/** Gradient orizontal care dă volum pionului (folosit în <defs>). */
export function pawnGradient(id, color) {
  const p = PALETTE[color];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${p.lane}"/><stop offset=".42" stop-color="${p.main}"/><stop offset="1" stop-color="${p.dark}"/>
  </linearGradient>`;
}

/**
 * Silueta unui pion (bază, corp, guler, cap), cu punctul de sprijin în jurul lui y = 11.
 * `gradId` trebuie să indice un gradient creat cu pawnGradient().
 */
export function pawnShape(color, gradId) {
  const p = PALETTE[color];
  // Contur bleumarin comun: pionul se distinge și pe celulele de aceeași culoare.
  const fill = `fill="url(#${gradId})" stroke="${BOARD.ink}" stroke-width="1.7" stroke-linejoin="round"`;
  return `
    <ellipse cx="0" cy="12.5" rx="13.5" ry="4.2" fill="${BOARD.ink}" opacity=".38"/>
    <path d="M-12 9.5a12 4.2 0 0 0 24 0v-3a12 4.2 0 0 0-24 0z" ${fill}/>
    <path d="M-8.5 6.5C-7 1-4.6-3-4-6.5h8c.6 3.5 3 7.5 4.5 13a8.5 3 0 0 1-17 0z" ${fill}/>
    <ellipse cx="0" cy="-6.5" rx="6" ry="2.2" ${fill}/>
    <circle cx="0" cy="-13.5" r="7" ${fill}/>
    <ellipse cx="-2.4" cy="-16" rx="2.6" ry="1.7" fill="#fff" opacity=".6"/>
    <path d="${symbolPath(color, 3.6)}" transform="translate(0 1.5)" fill="${p.ink}" opacity=".95"/>`;
}

/** Pion de sine stătător (pentru decor). */
export function pawnSvg(color, cls = '') {
  const id = `pawn-${++uid}`;
  return `<svg class="${cls}" viewBox="-15 -23 30 40" aria-hidden="true"><defs>${pawnGradient(id, color)}</defs>${pawnShape(color, id)}</svg>`;
}

/** Avatar geometric: plăcuță rotunjită, forme decorative și simbolul culorii. */
export function avatarSvg(color, size = 44) {
  const p = PALETTE[color];
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 44 44" aria-hidden="true">
    <rect x="1.5" y="1.5" width="41" height="41" rx="13" fill="${p.main}" stroke="${BOARD.ink}" stroke-width="2"/>
    <path d="M3 30c8 0 14 5 15 12.5H14.5C8 42.5 3 37.5 3 31z" fill="${p.lane}" opacity=".75"/>
    <circle cx="34" cy="10" r="4" fill="#fff" opacity=".3"/>
    <path d="${symbolPath(color, 11)}" transform="translate(22 22.5)" fill="${p.ink}" stroke="${p.dark}" stroke-width=".8" stroke-linejoin="round"/>
  </svg>`;
}

/** Jeton mic (cerc colorat + simbol), pentru istoric și legende. */
export function tokenSvg(color, size = 20) {
  const p = PALETTE[color];
  return `<svg class="token-svg" width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true">
    <circle r="11" fill="${p.main}" stroke="${BOARD.ink}" stroke-width="1.5"/>
    <path d="${symbolPath(color, 6)}" fill="${p.ink}"/>
  </svg>`;
}

/** Zar decorativ în perspectivă, cu puncte în cele patru culori. */
export function decoDieSvg(cls = '') {
  const c = PALETTE;
  const ink = BOARD.ink;
  return `<svg class="${cls}" viewBox="0 0 110 110" aria-hidden="true">
    <path d="M18 30 L30 18 H96 a8 8 0 0 1 8 8 V86 L92 98 Z" fill="#8792aa" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="6" y="30" width="86" height="72" rx="16" fill="${BOARD.face}" stroke="${ink}" stroke-width="3.5"/>
    <rect x="12" y="35" width="74" height="10" rx="5" fill="#fff" opacity=".45"/>
    <circle cx="28" cy="50" r="7.5" fill="${c.red.main}" stroke="${ink}" stroke-width="2"/>
    <circle cx="70" cy="50" r="7.5" fill="${c.green.main}" stroke="${ink}" stroke-width="2"/>
    <circle cx="49" cy="66" r="7.5" fill="${ink}"/>
    <circle cx="28" cy="82" r="7.5" fill="${c.blue.main}" stroke="${ink}" stroke-width="2"/>
    <circle cx="70" cy="82" r="7.5" fill="${c.yellow.main}" stroke="${ink}" stroke-width="2"/>
  </svg>`;
}

/** Marca din logo: un zar mic cu patru puncte colorate. */
export function logoMarkSvg() {
  const c = PALETTE;
  return `<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="6" width="38" height="38" rx="11" fill="${BOARD.ink}"/>
    <rect x="3" y="3" width="38" height="38" rx="11" fill="${BOARD.face}" stroke="${BOARD.ink}" stroke-width="3"/>
    <circle cx="14" cy="14" r="4.2" fill="${c.red.main}"/><circle cx="30" cy="14" r="4.2" fill="${c.green.main}"/>
    <circle cx="14" cy="30" r="4.2" fill="${c.blue.main}"/><circle cx="30" cy="30" r="4.2" fill="${c.yellow.main}"/>
  </svg>`;
}
