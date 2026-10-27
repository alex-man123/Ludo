// Motorul de reguli LUDO — „Nu te supăra, frate!”
// Funcții pure: primesc o stare și întorc o stare NOUĂ. Nu atinge DOM-ul,
// nu generează numere aleatorii (valoarea zarului vine din exterior),
// deci poate fi testat în Node și reutilizat pe server și în browser.

export const COLORS = ['red', 'green', 'yellow', 'blue'];
export const PAWNS_PER_PLAYER = 4;
export const TRACK_LENGTH = 52;   // traseul comun
export const BASE = -1;           // pion în bază
export const LAST_TRACK = 50;     // ultima poziție relativă pe traseul comun
export const HOME_START = 51;     // prima poziție din culoarul final
export const FINISH = 56;         // capătul culoarului (51..56 = 6 poziții)
export const START_OFFSET = 13;   // distanța dintre pozițiile de start

/*
 * Progresul unui pion este un număr relativ la culoarea lui:
 *   -1        → în bază
 *   0..50     → pe traseul comun; celula absolută = (start + progres) % 52
 *   51..56    → în culoarul final propriu; 56 = capăt (pion terminat)
 * Deoarece progresul se oprește la 50 pe traseul comun și apoi continuă
 * doar în culoarul propriu, un pion nu poate face ture suplimentare și nu
 * poate intra pe culoarul altei culori.
 */

export function startCell(color) {
  const i = COLORS.indexOf(color);
  if (i < 0) throw new Error(`Culoare necunoscută: ${color}`);
  return i * START_OFFSET;
}

export function trackCell(color, progress) {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (startCell(color) + progress) % TRACK_LENGTH;
}

/** Creează o partidă nouă. `configs`: [{ name, color, type: 'human'|'ai', difficulty? }] */
export function createGame(configs) {
  if (!Array.isArray(configs) || configs.length < 2 || configs.length > 4) {
    throw new Error('O partidă are între 2 și 4 jucători.');
  }
  const colors = configs.map(c => c.color);
  if (new Set(colors).size !== colors.length || colors.some(c => !COLORS.includes(c))) {
    throw new Error('Fiecare jucător trebuie să aibă o culoare distinctă și validă.');
  }
  // Ordinea turelor este fixă: ordinea culorilor în sensul acelor de ceasornic.
  const players = [...configs]
    .sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color))
    .map(c => ({
      name: c.name,
      color: c.color,
      type: c.type === 'ai' ? 'ai' : 'human',
      difficulty: c.type === 'ai' ? (c.difficulty || 'medium') : null,
      id: c.id ?? null,
      pawns: Array(PAWNS_PER_PLAYER).fill(BASE),
    }));
  return {
    players,
    current: 0,
    phase: 'roll',        // 'roll' → așteaptă zarul, 'move' → așteaptă alegerea pionului, 'over'
    dice: null,
    sixes: 0,             // șesari consecutivi în tura curentă
    legalMoves: [],
    winner: null,
    turn: 1,
    version: 0,           // crește la fiecare acțiune (folosit online contra dublei procesări)
    events: [{ type: 'turn', player: 0 }],
  };
}

const clone = s => JSON.parse(JSON.stringify(s));

/** Pionii adversarilor aflați pe celula absolută `cell` a traseului comun. */
function opponentsAt(state, playerIndex, cell) {
  const found = [];
  state.players.forEach((p, pi) => {
    if (pi === playerIndex) return;
    p.pawns.forEach((prog, pawn) => {
      if (trackCell(p.color, prog) === cell) found.push({ player: pi, pawn, progress: prog });
    });
  });
  return found;
}

/** Toate mutările legale ale unui jucător pentru o valoare a zarului. */
export function getLegalMoves(state, playerIndex, value) {
  const player = state.players[playerIndex];
  const moves = [];
  player.pawns.forEach((from, pawn) => {
    if (from === FINISH) return;                      // pionii terminați nu se mai mută
    let to;
    if (from === BASE) {
      if (value !== 6) return;                        // ieșirea doar cu 6
      to = 0;                                         // pe start, fără a avansa încă 6
    } else {
      to = from + value;
      if (to > FINISH) return;                        // e nevoie de valoarea exactă
    }
    // Doi pioni proprii nu pot sta pe aceeași poziție (excepție: capătul).
    if (to !== FINISH && player.pawns.some((p, j) => j !== pawn && p === to)) return;
    const captures = to <= LAST_TRACK
      ? opponentsAt(state, playerIndex, trackCell(player.color, to))
      : [];                                           // în culoarul final nu ajung adversari
    let kind = 'move';
    if (from === BASE) kind = 'enter';
    else if (to === FINISH) kind = 'finish';
    else if (from <= LAST_TRACK && to >= HOME_START) kind = 'home';
    moves.push({ pawn, from, to, kind, captures });
  });
  return moves;
}

function endTurn(s) {
  s.current = (s.current + 1) % s.players.length;
  s.sixes = 0;
  s.phase = 'roll';
  s.legalMoves = [];
  s.turn += 1;
  s.events.push({ type: 'turn', player: s.current });
}

/** Jucătorul curent aruncă zarul; `value` (1..6) este generat de apelant. */
export function applyRoll(state, value) {
  if (state.phase !== 'roll') throw new Error('Nu este momentul aruncării zarului.');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('Valoare de zar invalidă.');
  const s = clone(state);
  s.events = [];
  s.version += 1;
  s.dice = value;
  const player = s.current;
  s.events.push({ type: 'roll', player, value });

  if (value === 6) s.sixes += 1;
  if (s.sixes === 3) {
    // Al treilea 6 consecutiv nu produce mutare; mutările anterioare rămân.
    s.events.push({ type: 'three-sixes', player });
    endTurn(s);
    return s;
  }

  const moves = getLegalMoves(s, player, value);
  if (moves.length === 0) {
    if (value === 6) {
      s.events.push({ type: 'no-moves-extra', player });   // păstrează aruncarea bonus
      s.phase = 'roll';
      s.legalMoves = [];
    } else {
      s.events.push({ type: 'no-moves', player, value });
      endTurn(s);
    }
    return s;
  }
  s.phase = 'move';
  s.legalMoves = moves;
  return s;
}

/** Jucătorul curent mută pionul `pawn` (0..3) cu valoarea zarului aruncat. */
export function applyMove(state, pawn) {
  if (state.phase !== 'move') throw new Error('Nu este momentul mutării.');
  const move = state.legalMoves.find(m => m.pawn === pawn);
  if (!move) throw new Error('Mutare ilegală.');
  const s = clone(state);
  s.events = [];
  s.version += 1;
  const player = s.current;
  s.players[player].pawns[pawn] = move.to;
  for (const c of move.captures) s.players[c.player].pawns[c.pawn] = BASE;
  s.events.push({ type: 'move', player, ...move });
  s.legalMoves = [];

  if (s.players[player].pawns.every(p => p === FINISH)) {
    s.winner = player;
    s.phase = 'over';
    s.events.push({ type: 'win', player });
    return s;
  }
  if (s.dice === 6) {
    // Doar 6 dă o nouă aruncare; capturarea și finalizarea nu dau bonus.
    s.phase = 'roll';
    s.events.push({ type: 'extra-roll', player });
  } else {
    endTurn(s);
  }
  return s;
}

/** Scoate un jucător din partidă (folosit online la părăsire). */
export function removePlayer(state, playerIndex) {
  const s = clone(state);
  s.events = [];
  s.version += 1;
  const wasCurrent = s.current === playerIndex;
  const [left] = s.players.splice(playerIndex, 1);
  s.events.push({ type: 'left', name: left.name, color: left.color });
  if (s.phase === 'over') return s;
  if (s.players.length === 1) {
    s.winner = 0;
    s.phase = 'over';
    s.events.push({ type: 'win', player: 0, byForfeit: true });
    return s;
  }
  if (playerIndex < s.current) s.current -= 1;
  if (wasCurrent) {
    s.current = s.current % s.players.length;
    s.sixes = 0;
    s.phase = 'roll';
    s.legalMoves = [];
    s.turn += 1;
    s.events.push({ type: 'turn', player: s.current });
  }
  return s;
}

export function finishedCount(player) {
  return player.pawns.filter(p => p === FINISH).length;
}
