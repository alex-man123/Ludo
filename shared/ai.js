// Adversari AI algoritmici. Primesc DOAR starea curentă (cu zarul deja aruncat)
// și aleg una dintre mutările legale calculate de motor. Nu cunosc aruncările viitoare.

import { trackCell, BASE, LAST_TRACK, FINISH } from './engine.js';

export const DIFFICULTIES = {
  easy: 'Ușor',
  medium: 'Mediu',
  hard: 'Dificil',
};

/** Alege o mutare din state.legalMoves. Întoarce null dacă nu există mutări. */
export function chooseMove(state, difficulty = 'medium', rng = Math.random) {
  const moves = state.legalMoves;
  if (!moves || moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  if (difficulty === 'easy') return moves[Math.floor(rng() * moves.length)];
  if (difficulty === 'hard') return pickBest(moves, m => hardScore(state, m));
  return pickBest(moves, mediumScore);
}

function pickBest(moves, score) {
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = score(m);
    if (s > bestScore) { best = m; bestScore = s; }
  }
  return best;
}

// Mediu: priorități fixe — finalizare > capturare > ieșire din bază > intrare în culoar;
// la egalitate, avansează pionul cel mai înaintat.
function mediumScore(m) {
  let priority = 0;
  if (m.kind === 'finish') priority = 4;
  else if (m.captures.length) priority = 3;
  else if (m.kind === 'enter') priority = 2;
  else if (m.kind === 'home') priority = 1;
  return priority * 100 + m.to;
}

/**
 * Dificil: scor euristic
 *   scor = câștig de progres
 *        + 40  dacă pionul termină
 *        + 15  dacă pionul intră în culoarul final (devine protejat)
 *        + 25  dacă scoate un pion din bază
 *        + Σ (20 + progresul victimei)            pentru fiecare captură
 *        − risc(destinație) × (destinație + 15)   pierderea estimată dacă e capturat
 *        + risc(origine)    × (origine + 15)      câștigul de a fugi dintr-o poziție periculoasă
 * risc(celulă) ≈ suma probabilităților (1/6 fiecare) ca un pion advers să ajungă exact
 * acolo cu o singură aruncare, plafonată la 1.
 */
export function hardScore(state, move) {
  const me = state.current;
  const color = state.players[me].color;
  const captured = new Set(move.captures.map(c => `${c.player}:${c.pawn}`));

  let score = move.from === BASE ? 0 : move.to - move.from;
  if (move.kind === 'finish') score += 40;
  if (move.kind === 'home') score += 15;
  if (move.kind === 'enter') score += 25;
  for (const c of move.captures) score += 20 + c.progress;

  if (move.to <= LAST_TRACK) {
    score -= threat(state, me, trackCell(color, move.to), captured) * (move.to + 15);
  }
  if (move.from !== BASE && move.from <= LAST_TRACK) {
    score += threat(state, me, trackCell(color, move.from), new Set()) * (move.from + 15);
  }
  return score;
}

/** Probabilitatea aproximativă ca celula absolută `cell` să fie atinsă de un adversar la următoarea aruncare. */
export function threat(state, me, cell, ignore) {
  let risk = 0;
  state.players.forEach((p, pi) => {
    if (pi === me) return;
    p.pawns.forEach((prog, pawn) => {
      if (ignore.has(`${pi}:${pawn}`) || prog === FINISH || prog > LAST_TRACK) return;
      // Progresul pe care adversarul l-ar avea pe acea celulă.
      const target = (cell - trackCell(p.color, 0) + 52) % 52;
      if (target > LAST_TRACK) return;       // adversarul intră în culoar înainte de celulă
      if (prog === BASE) {
        // Poate ieși cu 6 direct peste noi, dacă startul lui nu e ocupat de un pion propriu.
        if (target === 0 && !p.pawns.includes(0)) risk += 1 / 6;
        return;
      }
      const d = target - prog;
      if (d >= 1 && d <= 6) risk += 1 / 6;
    });
  });
  return Math.min(1, risk);
}
