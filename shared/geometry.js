// Geometria tablei, definită prin date.
// Tabla este o grilă 15×15; coordonata [x, y] este indexul celulei (coloană, rând).
// Definim doar sfertul ROȘU, iar celelalte culori se obțin prin rotiri de 90°
// în jurul centrului (7, 7) — în sensul acelor de ceasornic.

import { COLORS, BASE, LAST_TRACK, HOME_START, FINISH, startCell } from './engine.js';

export const GRID = 15;

const rotate = ([x, y]) => [GRID - 1 - y, x];
const rotateTimes = (pt, k) => { let p = pt; for (let i = 0; i < k; i++) p = rotate(p); return p; };

// Primele 13 celule ale traseului comun, pornind de la startul roșu (index 0).
const RED_QUARTER = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
];

/** Traseul comun: 52 de celule, index 0 = startul roșu, 13 = verde, 26 = galben, 39 = albastru. */
export const TRACK = [0, 1, 2, 3].flatMap(k => RED_QUARTER.map(p => rotateTimes(p, k)));

// Culoarul final roșu: 5 celule pe rândul 7 + capătul (în triunghiul central).
const RED_LANE = [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]];
// Locurile din bază (centre de celule, coordonate fracționare).
const RED_BASE = [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]];
// Pionii terminați se așază ușor decalat în triunghiul propriu.
const RED_FINISH = [[6.05, 6.6], [6.05, 7.4], [6.45, 6.8], [6.45, 7.2]];

const byColor = pts => Object.fromEntries(COLORS.map((c, k) => [c, pts.map(p => rotateTimes(p, k))]));

export const HOME_LANES = byColor(RED_LANE);
export const BASE_SLOTS = byColor(RED_BASE);
export const FINISH_SLOTS = byColor(RED_FINISH);
/** Colțul stânga-sus al zonei de bază (6×6 celule) pentru fiecare culoare. */
export const BASE_ORIGIN = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };

/** Coordonata (în celule) a unui pion, în funcție de progres. */
export function pawnCoord(color, pawnIndex, progress) {
  if (progress === BASE) return BASE_SLOTS[color][pawnIndex];
  if (progress <= LAST_TRACK) return TRACK[(startCell(color) + progress) % TRACK.length];
  if (progress === FINISH) return FINISH_SLOTS[color][pawnIndex];
  return HOME_LANES[color][progress - HOME_START];
}

/** Lista progreselor parcurse pas cu pas (pentru animație). */
export function pathBetween(from, to) {
  if (from === BASE) return [0];
  const steps = [];
  for (let p = from + 1; p <= to; p++) steps.push(p);
  return steps;
}
