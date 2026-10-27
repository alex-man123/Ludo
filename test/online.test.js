// Test de integrare: server real + clienți Socket.IO reali, pe 127.0.0.1.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { startServer } from '../server/server.js';

let srv;
let url;
const clients = [];

before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', roomOptions: { dice: () => 6, aiDelayMs: 20, graceMs: 400 } });
  url = `http://127.0.0.1:${srv.port}`;
});

after(async () => {
  clients.forEach(c => c.close());
  srv.io.close();
  await new Promise(r => srv.server.close(r));
});

function client(opts = {}) {
  const c = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, ...opts });
  c.states = [];
  c.on('room:state', s => c.states.push(s));
  clients.push(c);
  return c;
}
const ready = c => new Promise((res, rej) => { c.once('connect', res); c.once('connect_error', rej); });
const req = (c, event, payload = {}) => new Promise(res => c.emit(event, payload, res));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastState = c => c.states[c.states.length - 1];

async function room() {
  const a = client(); const b = client();
  await Promise.all([ready(a), ready(b)]);
  const created = await req(a, 'room:create', { name: 'Alex' });
  assert.equal(created.ok, true);
  const joined = await req(b, 'room:join', { code: created.code, name: 'Cosmin' });
  assert.equal(joined.ok, true);
  return { a, b, code: created.code, tokenA: created.token, tokenB: joined.token };
}

async function started() {
  const r = await room();
  await req(r.a, 'lobby:ready', { ready: true });
  await req(r.b, 'lobby:ready', { ready: true });
  const s = await req(r.a, 'lobby:start');
  assert.equal(s.ok, true);
  await sleep(50);
  return r;
}

test('creare și intrare: ambii clienți văd aceeași cameră', async () => {
  const { a, b } = await room();
  await sleep(50);
  const sa = lastState(a); const sb = lastState(b);
  assert.equal(sa.code, sb.code);
  assert.deepEqual(sa.participants.map(p => p.name), ['Alex', 'Cosmin']);
  assert.deepEqual(sb.participants.map(p => p.name), ['Alex', 'Cosmin']);
  assert.notEqual(sa.you, sb.you);
  assert.ok(!JSON.stringify(sb).includes('token'), 'starea nu conține tokenuri');
});

test('erori clare: cod inexistent, cod invalid, nume duplicat', async () => {
  const { code } = await room();
  const c = client(); await ready(c);
  assert.equal((await req(c, 'room:join', { code: 'ZZZZZZ', name: 'Dan' })).code, 'not_found');
  assert.equal((await req(c, 'room:join', { code: '12', name: 'Dan' })).code, 'bad_code');
  assert.equal((await req(c, 'room:join', { code, name: 'cosmin' })).code, 'name_taken');
  assert.equal((await req(c, 'game:roll', { version: 0 })).code, 'no_room');
});

test('sincronizare: o aruncare apare identic la ambii; acțiunile în afara turei sunt respinse', async () => {
  const { a, b } = await started();
  const g = lastState(a).game;
  assert.equal((await req(b, 'game:roll', { version: g.version })).code, 'not_your_turn');
  assert.equal((await req(a, 'game:roll', { version: g.version, actionId: 'x1' })).ok, true);
  await sleep(50);
  assert.deepEqual(lastState(a).game, lastState(b).game);
  assert.equal(lastState(b).game.dice, 6);
  // același clic retrimis și o versiune veche
  assert.equal((await req(a, 'game:roll', { version: g.version, actionId: 'x1' })).duplicate, true);
  assert.equal((await req(a, 'game:move', { pawn: 0, version: g.version })).code, 'stale');
  assert.equal((await req(a, 'game:move', { pawn: 0, version: lastState(a).game.version })).ok, true);
  await sleep(50);
  assert.equal(lastState(b).game.players[0].pawns[0], 0);
});

test('reconectare cu token: același loc, starea completă; token greșit refuzat', async () => {
  const { a, code, tokenA } = await started();
  const pid = lastState(a).you;
  a.close();
  await sleep(50);
  const intruder = client(); await ready(intruder);
  assert.equal((await req(intruder, 'room:resume', { code, token: 'ghicit' })).code, 'bad_token');
  const a2 = client(); await ready(a2);
  const res = await req(a2, 'room:resume', { code, token: tokenA });
  assert.equal(res.ok, true);
  assert.equal(res.pid, pid);
  assert.equal(res.state.phase, 'playing');
  assert.equal(res.state.pauses.length, 0);
});

test('aceeași persoană din a doua conexiune: prima este închisă', async () => {
  const { a, code, tokenA } = await room();
  const kicked = new Promise(res => a.once('room:kicked', res));
  const a2 = client(); await ready(a2);
  assert.equal((await req(a2, 'room:resume', { code, token: tokenA })).ok, true);
  const msg = await kicked;
  assert.match(msg.message, /altă filă|alt dispozitiv/);
});

test('conexiunile de pe alt site (Origin străin) sunt refuzate', async () => {
  const c = client({ extraHeaders: { origin: 'http://site-strain.example' }, transports: ['polling'] });
  await assert.rejects(ready(c));
});
