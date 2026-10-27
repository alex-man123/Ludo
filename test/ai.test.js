import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyRoll, applyMove, COLORS, BASE } from '../shared/engine.js';
import { chooseMove, threat } from '../shared/ai.js';

// Generator determinist, ca testele să fie reproductibile.
function seeded(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

function simulate(difficulties, seed) {
  const rng = seeded(seed);
  let s = createGame(difficulties.map((d, i) => ({
    name: `AI ${i}`, color: COLORS[i], type: 'ai', difficulty: d,
  })));
  for (let step = 0; step < 20000 && s.phase !== 'over'; step++) {
    if (s.phase === 'roll') {
      s = applyRoll(s, 1 + Math.floor(rng() * 6));
    } else {
      const p = s.players[s.current];
      const m = chooseMove(s, p.difficulty, rng);
      assert.ok(s.legalMoves.includes(m), 'AI-ul a ales o mutare care nu e legală');
      s = applyMove(s, m.pawn);   // applyMove aruncă excepție la mutări ilegale
    }
  }
  return s;
}

test('toate mutările AI sunt legale și partidele se termină', () => {
  const setups = [
    ['easy', 'easy'],
    ['medium', 'hard'],
    ['hard', 'easy', 'medium'],
    ['hard', 'hard', 'hard', 'hard'],
    ['easy', 'medium', 'hard', 'medium'],
  ];
  setups.forEach((d, i) => {
    for (let seed = 1; seed <= 20; seed++) {
      const end = simulate(d, seed * 97 + i);
      assert.equal(end.phase, 'over', `partida ${d} / ${seed} nu s-a terminat`);
    }
  });
});

test('AI-ul dificil câștigă mai des decât cel ușor', () => {
  let hardWins = 0;
  const games = 200;
  for (let seed = 1; seed <= games; seed++) {
    // Alternăm cine începe pentru a elimina avantajul primei mutări.
    const order = seed % 2 ? ['hard', 'easy'] : ['easy', 'hard'];
    const end = simulate(order, seed);
    if (end.players[end.winner].difficulty === 'hard') hardWins++;
  }
  assert.ok(hardWins > games * 0.6, `dificil a câștigat doar ${hardWins}/${games}`);
});

test('AI-ul mediu preferă finalizarea și capturarea', () => {
  let s = createGame([
    { name: 'A', color: 'red', type: 'ai' },
    { name: 'B', color: 'yellow', type: 'ai' },
  ]);
  s.players[0].pawns = [53, 10, BASE, BASE];
  s = applyRoll(s, 3);
  assert.equal(chooseMove(s, 'medium').kind, 'finish');

  let c = createGame([
    { name: 'A', color: 'red', type: 'ai' },
    { name: 'B', color: 'yellow', type: 'ai' },
  ]);
  c.players[0].pawns = [5, 20, BASE, BASE];
  c.players[1].pawns = [(23 - 26 + 52) % 52, BASE, BASE, BASE];
  c = applyRoll(c, 3);
  assert.equal(chooseMove(c, 'medium').pawn, 1);
  assert.equal(chooseMove(c, 'hard').pawn, 1);
});

test('riscul ține cont doar de adversarii aflați la 1–6 poziții în urmă', () => {
  const s = createGame([
    { name: 'A', color: 'red', type: 'ai' },
    { name: 'B', color: 'yellow', type: 'ai' },
  ]);
  s.players[1].pawns = [2, BASE, BASE, BASE];   // galben pe celula 28
  assert.ok(threat(s, 0, 29, new Set()) > 0);
  assert.equal(threat(s, 0, 35, new Set()), 0);  // 7 poziții distanță
  assert.equal(threat(s, 0, 27, new Set()), 0);  // în spatele pionului galben
  // Celula de start galbenă este periculoasă cât timp galbenul are pioni în bază...
  assert.ok(threat(s, 0, 26, new Set()) > 0);
  // ...dar nu și când startul îi este blocat de un pion propriu.
  s.players[1].pawns = [0, BASE, BASE, BASE];
  assert.equal(threat(s, 0, 26, new Set()), 0);
});
