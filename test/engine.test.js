import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyRoll, applyMove, getLegalMoves, removePlayer, trackCell,
  COLORS, BASE, FINISH, LAST_TRACK, HOME_START,
} from '../shared/engine.js';
import { TRACK, HOME_LANES, pawnCoord } from '../shared/geometry.js';

const two = () => createGame([
  { name: 'Alex', color: 'red', type: 'human' },
  { name: 'Cosmin', color: 'yellow', type: 'human' },
]);
const four = () => createGame(COLORS.map(c => ({ name: c, color: c, type: 'human' })));

/** Construiește o stare cu pozițiile dorite (progres relativ) pentru fiecare jucător. */
function withPawns(state, positions) {
  const s = structuredClone(state);
  positions.forEach((pawns, i) => { if (pawns) s.players[i].pawns = pawns; });
  return s;
}

test('ordinea turelor urmează culorile, indiferent de ordinea configurării', () => {
  const g = createGame([
    { name: 'B', color: 'blue', type: 'human' },
    { name: 'R', color: 'red', type: 'human' },
  ]);
  assert.deepEqual(g.players.map(p => p.color), ['red', 'blue']);
});

test('configurații invalide sunt respinse', () => {
  assert.throws(() => createGame([{ name: 'A', color: 'red' }]));
  assert.throws(() => createGame([{ name: 'A', color: 'red' }, { name: 'B', color: 'red' }]));
  assert.throws(() => createGame([{ name: 'A', color: 'red' }, { name: 'B', color: 'pink' }]));
});

test('un pion iese din bază numai la 6', () => {
  for (let v = 1; v <= 5; v++) {
    assert.equal(getLegalMoves(two(), 0, v).length, 0, `valoarea ${v}`);
  }
  const moves = getLegalMoves(two(), 0, 6);
  assert.equal(moves.length, 4);
  assert.ok(moves.every(m => m.kind === 'enter' && m.to === 0));
});

test('ieșirea plasează pionul pe start și consumă aruncarea', () => {
  let s = applyRoll(two(), 6);
  s = applyMove(s, 0);
  assert.equal(s.players[0].pawns[0], 0);
  assert.equal(s.phase, 'roll');          // aruncare bonus pentru 6
  assert.equal(s.current, 0);
});

test('la 6 se poate alege între ieșire și mutarea unui pion de pe traseu', () => {
  const s = withPawns(two(), [[10, BASE, BASE, BASE]]);
  const moves = getLegalMoves(s, 0, 6);
  assert.deepEqual(moves.map(m => m.kind).sort(), ['enter', 'enter', 'enter', 'move']);
});

test('un pion propriu aflat pe start blochează ieșirea', () => {
  const s = withPawns(two(), [[0, BASE, BASE, BASE]]);
  const moves = getLegalMoves(s, 0, 6);
  assert.deepEqual(moves.map(m => m.pawn), [0]);   // doar pionul de pe start poate avansa
});

test('capturarea trimite adversarul în bază', () => {
  // Galben pornește de la celula 26. Roșu pe progres 20, galben pe progresul ce corespunde celulei 23.
  const yellowProg = (23 - 26 + 52) % 52;
  let s = withPawns(two(), [[20, BASE, BASE, BASE], [yellowProg, BASE, BASE, BASE]]);
  s = applyRoll(s, 3);
  const [m] = s.legalMoves;
  assert.equal(m.captures.length, 1);
  s = applyMove(s, 0);
  assert.equal(s.players[1].pawns[0], BASE);
  assert.equal(s.current, 1);   // capturarea nu dă aruncare bonus
});

test('ieșirea din bază capturează adversarul aflat pe poziția de start', () => {
  // Roșu are startul pe celula 0. Galben (start 26) ajunge pe celula 0 la progres 26.
  let s = withPawns(two(), [null, [26, BASE, BASE, BASE]]);
  assert.equal(trackCell('yellow', 26), 0);
  s = applyRoll(s, 6);
  s = applyMove(s, 0);
  assert.equal(s.players[0].pawns[0], 0);
  assert.equal(s.players[1].pawns[0], BASE);
});

test('nu există poziții sigure pe traseul comun (nici startul altei culori)', () => {
  // Galben stă pe startul verde (celula 13); roșu ajunge acolo și îl capturează.
  const yProg = (13 - 26 + 52) % 52;
  const s = withPawns(two(), [[10, BASE, BASE, BASE], [yProg, BASE, BASE, BASE]]);
  const [m] = getLegalMoves(s, 0, 3);
  assert.equal(m.captures.length, 1);
});

test('doi pioni proprii nu pot ocupa aceeași poziție', () => {
  const s = withPawns(two(), [[10, 13, BASE, BASE]]);
  assert.deepEqual(getLegalMoves(s, 0, 3).map(m => m.pawn), [1]);
  const lane = withPawns(two(), [[52, 54, BASE, BASE]]);
  assert.deepEqual(getLegalMoves(lane, 0, 2).map(m => m.pawn), [1]); // 54+2 = capăt, permis
});

test('pozițiile finale pot găzdui toți pionii terminați', () => {
  const s = withPawns(two(), [[FINISH, FINISH, 53, BASE]]);
  const moves = getLegalMoves(s, 0, 3);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].kind, 'finish');
});

test('fiecare culoare intră pe propriul culoar, fără ture suplimentare', () => {
  const g = four();
  for (const color of COLORS) {
    const path = [];
    for (let p = 0; p <= FINISH; p++) path.push(pawnCoord(color, 0, p).join(','));
    // Traseul comun: 51 de celule distincte, fără celula de dinaintea startului propriu.
    const trackPart = path.slice(0, LAST_TRACK + 1);
    assert.equal(new Set(trackPart).size, 51);
    // Culoarul: exact celulele culorii proprii (capătul 56 are locuri vizuale separate).
    const lane = path.slice(HOME_START, FINISH).map(s => s.split(',').map(Number));
    assert.deepEqual(lane, HOME_LANES[color].slice(0, 5));
    // Nicio celulă din culoar nu face parte din traseul comun sau din culoarul altei culori.
    for (const cell of lane) {
      assert.ok(!TRACK.some(t => t[0] === cell[0] && t[1] === cell[1]));
      for (const other of COLORS.filter(c => c !== color)) {
        assert.ok(!HOME_LANES[other].some(t => t[0] === cell[0] && t[1] === cell[1]));
      }
    }
    // Ultima celulă de pe traseu este vecină cu prima celulă din culoar.
    const [ax, ay] = pawnCoord(color, 0, LAST_TRACK);
    const [bx, by] = pawnCoord(color, 0, HOME_START);
    assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1);
    // Mutarea de pe ultima celulă a traseului intră în culoar.
    const i = COLORS.indexOf(color);
    const s = structuredClone(g);
    s.players[i].pawns = [48, BASE, BASE, BASE];
    const [m] = getLegalMoves(s, i, 4);
    assert.equal(m.to, 52);
    assert.equal(m.kind, 'home');
  }
});

test('traseul comun are 52 de celule distincte și adiacente', () => {
  assert.equal(new Set(TRACK.map(String)).size, 52);
  for (let i = 0; i < 52; i++) {
    const [ax, ay] = TRACK[i];
    const [bx, by] = TRACK[(i + 1) % 52];
    // Pașii sunt ortogonali, cu excepția colțurilor diagonale din jurul centrului.
    assert.ok(Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1);
  }
});

test('este necesară valoarea exactă pentru a ajunge la capăt', () => {
  const s = withPawns(two(), [[54, BASE, BASE, BASE]]);
  assert.equal(getLegalMoves(s, 0, 3).length, 0);
  assert.equal(getLegalMoves(s, 0, 2)[0].to, FINISH);
  assert.equal(getLegalMoves(s, 0, 1)[0].to, 55);
});

test('pionii terminați nu mai pot fi mutați', () => {
  const s = withPawns(two(), [[FINISH, BASE, BASE, BASE]]);
  assert.equal(getLegalMoves(s, 0, 6).filter(m => m.pawn === 0).length, 0);
});

test('6 acordă o nouă aruncare; dacă nu există mutări, aruncarea se păstrează', () => {
  // Singurul pion rămas este pe 54: cu 6 nu poate muta.
  let s = withPawns(two(), [[FINISH, FINISH, FINISH, 54]]);
  s = applyRoll(s, 6);
  assert.equal(s.phase, 'roll');
  assert.equal(s.current, 0);
  assert.ok(s.events.some(e => e.type === 'no-moves-extra'));
});

test('al treilea 6 consecutiv încheie tura, iar mutările anterioare rămân', () => {
  let s = two();
  s = applyMove(applyRoll(s, 6), 0);           // pionul 0 pe start
  s = applyMove(applyRoll(s, 6), 0);           // pionul 0 la 6
  assert.equal(s.players[0].pawns[0], 6);
  s = applyRoll(s, 6);                         // al treilea 6
  assert.ok(s.events.some(e => e.type === 'three-sixes'));
  assert.equal(s.current, 1);
  assert.equal(s.sixes, 0);                    // contorul se resetează
  assert.equal(s.players[0].pawns[0], 6);
});

test('contorul de șesari se resetează între ture', () => {
  let s = two();
  s = applyMove(applyRoll(s, 6), 0);
  s = applyMove(applyRoll(s, 2), 0);           // tura roșie se încheie
  assert.equal(s.current, 1);
  assert.equal(s.sixes, 0);
});

test('fără mutări legale pentru o valoare diferită de 6, tura se încheie', () => {
  const s = applyRoll(two(), 4);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'roll');
  assert.ok(s.events.some(e => e.type === 'no-moves'));
});

test('acțiunile în afara fazei sau mutările ilegale sunt respinse', () => {
  const s = two();
  assert.throws(() => applyMove(s, 0));                  // nu s-a aruncat zarul
  const r = applyRoll(s, 6);
  assert.throws(() => applyRoll(r, 3));                  // trebuie mai întâi mutat
  const r2 = applyRoll(withPawns(s, [[10, BASE, BASE, BASE]]), 3);
  assert.throws(() => applyMove(r2, 1));                 // pionul 1 e în bază
  assert.throws(() => applyRoll(s, 7));
});

test('finalizarea nu acordă aruncare bonus', () => {
  let s = withPawns(two(), [[53, BASE, BASE, BASE]]);
  s = applyMove(applyRoll(s, 3), 0);
  assert.equal(s.players[0].pawns[0], FINISH);
  assert.equal(s.current, 1);
});

test('detectarea victoriei', () => {
  let s = withPawns(two(), [[FINISH, FINISH, FINISH, 52]]);
  s = applyMove(applyRoll(s, 4), 3);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
  assert.throws(() => applyRoll(s, 1));
});

test('părăsirea partidei trece tura și poate decide câștigătorul', () => {
  let s = four();
  s = removePlayer(s, 0);
  assert.equal(s.players.length, 3);
  assert.equal(s.players[s.current].color, 'green');
  s = removePlayer(removePlayer(s, 0), 0);
  assert.equal(s.phase, 'over');
  assert.equal(s.players[s.winner].color, 'blue');
});
