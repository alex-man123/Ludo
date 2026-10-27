import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, RoomError, CODE_RE } from '../server/rooms.js';
import { BASE } from '../shared/engine.js';

/** Ceas fals: temporizatoarele rulează doar când avansăm timpul manual. */
function fakeTimers() {
  let now = 1_000_000;
  let seq = 0;
  const pending = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++seq; pending.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => pending.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...pending].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        pending.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
    count: () => pending.size,
  };
}

function setup({ dice = [] } = {}) {
  const timers = fakeTimers();
  const queue = [...dice];
  const kicks = [];
  const m = new RoomManager({
    timers,
    dice: () => (queue.length ? queue.shift() : 3),
    random: () => 0,
    onKick: (socketId, message) => kicks.push({ socketId, message }),
  });
  return { m, timers, kicks, queue };
}

const code = err => (err instanceof RoomError ? err.code : err.message);
const throwsCode = (fn, expected) => assert.throws(fn, err => code(err) === expected);

/** Cameră cu gazda Alex (roșu) și Cosmin (verde), ambii pregătiți și partida pornită. */
function startedGame(opts) {
  const ctx = setup(opts);
  const { m } = ctx;
  const host = m.createRoom('Alex', 's-alex');
  const guest = m.joinRoom(host.room.code, 'Cosmin', 's-cosmin');
  const room = host.room;
  m.setReady(room, host.p, true);
  m.setReady(room, guest.p, true);
  m.start(room, host.p);
  return { ...ctx, room, host, guest };
}

test('crearea camerei: cod valid, gazdă, culoare și token secret', () => {
  const { m } = setup();
  const { room, p, token } = m.createRoom('Alex', 's1');
  assert.match(room.code, CODE_RE);
  assert.equal(room.hostId, p.pid);
  assert.equal(p.color, 'red');
  assert.ok(token.length >= 30);
  const snap = JSON.stringify(m.snapshot(room, p.pid));
  assert.ok(!snap.includes(token), 'tokenul nu apare în starea trimisă');
  assert.ok(!snap.includes('tokenHash'));
});

test('codurile sunt unice', () => {
  const { m } = setup();
  const codes = new Set();
  for (let i = 0; i < 300; i++) codes.add(m.createRoom(`Jucator ${i}`, `s${i}`).room.code);
  assert.equal(codes.size, 300);
});

test('intrarea în cameră primește următoarea culoare liberă', () => {
  const { m } = setup();
  const { room } = m.createRoom('Alex', 's1');
  const { p } = m.joinRoom(room.code.toLowerCase(), 'Cosmin', 's2');
  assert.equal(p.color, 'green');
  assert.equal(m.humans(room).length, 2);
});

test('cod invalid sau inexistent', () => {
  const { m } = setup();
  throwsCode(() => m.joinRoom('abc', 'Cosmin', 's1'), 'bad_code');
  throwsCode(() => m.joinRoom('ZZZZZZ', 'Cosmin', 's1'), 'not_found');
});

test('nume invalid sau duplicat', () => {
  const { m } = setup();
  const { room } = m.createRoom('Alex', 's1');
  throwsCode(() => m.joinRoom(room.code, '<b>', 's2'), 'bad_name');
  throwsCode(() => m.joinRoom(room.code, 'alex', 's2'), 'name_taken');
});

test('camera plină și partida deja începută', () => {
  const { m } = setup();
  const host = m.createRoom('Alex', 's1');
  const room = host.room;
  m.joinRoom(room.code, 'Cosmin', 's2');
  m.addAI(room, host.p, 'yellow');
  m.joinRoom(room.code, 'Ana', 's3');
  throwsCode(() => m.joinRoom(room.code, 'Dan', 's4'), 'full');

  const g = startedGame();
  throwsCode(() => g.m.joinRoom(g.room.code, 'Dan', 's9'), 'started');
});

test('culori duplicate respinse; schimbarea configurației anulează „Pregătit”', () => {
  const { m } = setup();
  const host = m.createRoom('Alex', 's1');
  const guest = m.joinRoom(host.room.code, 'Cosmin', 's2');
  throwsCode(() => m.setColor(host.room, guest.p, 'red'), 'color_taken');
  m.setReady(host.room, host.p, true);
  m.setColor(host.room, guest.p, 'blue');
  assert.equal(host.p.ready, false);
  m.setReady(host.room, host.p, true);
  m.addAI(host.room, host.p, 'yellow', 'hard');
  assert.equal(host.p.ready, false);
  throwsCode(() => m.addAI(host.room, host.p, 'blue'), 'color_taken');
});

test('doar gazda gestionează AI-ul și pornește partida', () => {
  const { m } = setup();
  const host = m.createRoom('Alex', 's1');
  const guest = m.joinRoom(host.room.code, 'Cosmin', 's2');
  throwsCode(() => m.addAI(host.room, guest.p, 'yellow'), 'not_host');
  m.setReady(host.room, host.p, true);
  m.setReady(host.room, guest.p, true);
  throwsCode(() => m.start(host.room, guest.p), 'not_host');
});

test('pornirea fără condițiile necesare este refuzată', () => {
  const { m } = setup();
  const host = m.createRoom('Alex', 's1');
  m.setReady(host.room, host.p, true);
  throwsCode(() => m.start(host.room, host.p), 'not_ready');          // un singur participant
  const guest = m.joinRoom(host.room.code, 'Cosmin', 's2');
  m.setReady(host.room, host.p, true);
  throwsCode(() => m.start(host.room, host.p), 'not_ready');          // Cosmin nu e pregătit
  m.setReady(host.room, guest.p, true);
  m.start(host.room, host.p);
  assert.equal(host.room.phase, 'playing');
});

test('un om și un AI pot porni partida', () => {
  const { m } = setup();
  const host = m.createRoom('Alex', 's1');
  m.addAI(host.room, host.p, 'blue', 'easy');
  m.setReady(host.room, host.p, true);
  m.start(host.room, host.p);
  assert.deepEqual(host.room.game.players.map(p => p.type), ['human', 'ai']);
});

test('aruncare și mutare în afara turei sunt respinse', () => {
  const { m, room, host, guest } = startedGame({ dice: [6] });
  const v = room.game.version;
  throwsCode(() => m.roll(room, guest.p, v), 'not_your_turn');
  m.roll(room, host.p, v);                                   // Alex dă 6
  throwsCode(() => m.move(room, guest.p, 0, room.game.version), 'not_your_turn');
  throwsCode(() => m.roll(room, host.p, room.game.version), 'bad_phase');
});

test('nu poți muta pionul altui participant sau un pion fără mutare legală', () => {
  const { m, room, host } = startedGame({ dice: [6] });
  m.roll(room, host.p, room.game.version);
  throwsCode(() => m.move(room, host.p, 7, room.game.version), 'illegal');
  throwsCode(() => m.move(room, host.p, '0', room.game.version), 'illegal');
  m.move(room, host.p, 0, room.game.version);
  assert.equal(room.game.players[0].pawns[0], 0);
  assert.deepEqual(room.game.players[1].pawns, [BASE, BASE, BASE, BASE]);
});

test('acțiunile repetate sau învechite nu sunt aplicate de două ori', () => {
  const { m, room, host } = startedGame({ dice: [6, 6] });
  const v = room.game.version;
  m.roll(room, host.p, v, 'a1');
  const after = room.game.version;
  assert.deepEqual(m.roll(room, host.p, v, 'a1'), { duplicate: true });  // același clic retrimis
  assert.equal(room.game.version, after);
  throwsCode(() => m.move(room, host.p, 0, v, 'a2'), 'stale');           // versiune veche
  m.move(room, host.p, 0, after, 'a3');
  throwsCode(() => m.move(room, host.p, 0, after, 'a4'), 'stale');       // al doilea clic pe aceeași mutare
});

test('deconectarea suspendă jocul 60 s, iar revenirea îl continuă', () => {
  const { m, room, host, guest, timers } = startedGame({ dice: [2] });
  m.disconnect('s-alex');
  assert.equal(room.pauses.size, 1);
  throwsCode(() => m.roll(room, host.p, room.game.version), 'paused');
  timers.advance(30_000);
  const back = m.resume(room.code, host.token, 's-alex-2');
  assert.equal(back.p.pid, host.p.pid);
  assert.equal(room.pauses.size, 0);
  assert.equal(room.control.get('red'), 'human');
  m.roll(room, host.p, room.game.version);
  assert.equal(room.game.current, 1);
  assert.ok(guest.p.connected);
});

test('după 60 s fără revenire, AI-ul preia locul și joacă', () => {
  const { m, room, timers } = startedGame({ dice: [2, 2, 2] });
  m.disconnect('s-alex');
  timers.advance(60_000);
  assert.equal(room.pauses.size, 0);
  assert.equal(room.control.get('red'), 'ai');
  const v = room.game.version;
  timers.advance(5_000);                       // AI-ul aruncă pentru roșu
  assert.ok(room.game.version > v);
  assert.equal(room.game.current, 1);          // fără mutări cu 2 → tura trece la Cosmin
});

test('proprietarul revine după preluare și primește locul înapoi la limita turei', () => {
  const { m, room, host, guest, timers } = startedGame({ dice: [2, 6] });
  m.disconnect('s-alex');
  timers.advance(60_000);
  timers.advance(5_000);                       // AI-ul joacă tura roșie (2 → nicio mutare)
  assert.equal(room.game.current, 1);
  m.resume(room.code, host.token, 's-alex-2');
  assert.equal(room.control.get('red'), 'human');   // nu e tura lui → revine imediat
  m.roll(room, guest.p, room.game.version);    // Cosmin dă 6 și scoate un pion
  m.move(room, guest.p, 0, room.game.version);
  assert.equal(room.game.current, 1);
});

test('revenire în timpul propriei ture preluate de AI: controlul revine la tura următoare', () => {
  const { m, room, host, guest, timers } = startedGame({ dice: [6, 3, 1] });
  m.disconnect('s-alex');
  timers.advance(60_000);
  timers.advance(3_000);                       // AI-ul aruncă 6 pentru roșu (încă tura roșie)
  assert.equal(room.game.current, 0);
  m.resume(room.code, host.token, 's-alex-2');
  assert.equal(room.control.get('red'), 'ai');
  assert.deepEqual([...room.reclaim], [host.p.pid]);
  throwsCode(() => m.move(room, host.p, 0, room.game.version), 'not_your_turn');
  timers.advance(5_000);                       // AI-ul termină tura roșie
  while (room.game.current === 0) timers.advance(5_000);
  assert.equal(room.control.get('red'), 'human');
  assert.equal(room.reclaim.size, 0);
  m.roll(room, guest.p, room.game.version);
});

test('tokenul greșit nu preia locul; aceeași persoană din două conexiuni: rămâne doar cea nouă', () => {
  const { m, room, host, kicks } = startedGame();
  throwsCode(() => m.resume(room.code, 'token-ghicit', 's-hacker'), 'bad_token');
  m.resume(room.code, host.token, 's-alex-tab2');
  assert.deepEqual(kicks.map(k => k.socketId), ['s-alex']);
  throwsCode(() => m.bySocket('s-alex'), 'no_room');
  assert.equal(m.bySocket('s-alex-tab2').p.pid, host.p.pid);
});

test('transferul gazdei în lobby când gazda pleacă sau expiră', () => {
  const { m, timers } = setup();
  const host = m.createRoom('Alex', 's1');
  const guest = m.joinRoom(host.room.code, 'Cosmin', 's2');
  m.disconnect('s1');
  assert.equal(host.room.hostId, guest.p.pid);          // gazda deconectată → alt om conectat
  timers.advance(60_000);
  assert.ok(!host.room.participants.has(host.p.pid));   // locul eliberat după 60 s
  assert.equal(host.room.hostId, guest.p.pid);

  const other = setup();
  const h2 = other.m.createRoom('Ana', 'a1');
  const g2 = other.m.joinRoom(h2.room.code, 'Dan', 'a2');
  other.m.leave(h2.room, h2.p.pid);
  assert.equal(h2.room.hostId, g2.p.pid);
});

test('plecarea în timpul partidei: AI-ul preia imediat, jocul nu depinde de gazdă', () => {
  const { m, room, host, guest, timers } = startedGame({ dice: [2, 2] });
  m.leave(room, host.p.pid);
  assert.equal(room.control.get('red'), 'ai');
  assert.equal(room.hostId, guest.p.pid);
  throwsCode(() => m.resume(room.code, host.token, 's-x'), 'bad_token');
  timers.advance(5_000);
  assert.equal(room.game.current, 1);
});

test('curățarea camerelor: goale imediat, abandonate după expirare, cu temporizatoare oprite', () => {
  const { m, timers } = setup();
  const a = m.createRoom('Alex', 's1');
  m.leave(a.room, a.p.pid);
  assert.equal(m.rooms.size, 0);

  const b = startedGame();
  b.m.disconnect('s-alex');
  b.m.disconnect('s-cosmin');
  b.timers.advance(60_000);                    // ambii preluați de AI; nimeni conectat → AI oprit
  b.timers.advance(11 * 60_000);
  b.m.sweep();
  assert.equal(b.m.rooms.size, 0);
  assert.equal(b.timers.count(), 0);
  assert.equal(timers.count(), 0);
});

test('revanșa readuce camera în lobby cu toți nepregătiți', () => {
  const { m } = setup();
  const host = m.createRoom('Alex', 's1');
  m.addAI(host.room, host.p, 'green');
  m.setReady(host.room, host.p, true);
  m.start(host.room, host.p);
  host.room.phase = 'over';
  m.rematch(host.room);
  assert.equal(host.room.phase, 'lobby');
  assert.equal(host.room.game, null);
  assert.equal(host.p.ready, false);
  assert.ok(host.room.ai.has('green'));
});
