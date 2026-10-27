// Legătura dintre Socket.IO și RoomManager.
// Clientul trimite doar intenții; identitatea vine din legătura conexiune → participant ținută pe server.

import { RoomManager, RoomError } from './rooms.js';
import { TokenBucket, KeyedLimiter } from './rate-limit.js';

const fail = (code, message) => ({ ok: false, code, message });
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Adresa clientului; în spatele unui proxy (găzduire) se folosește X-Forwarded-For doar dacă TRUST_PROXY=1. */
function clientIp(socket) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = socket.handshake.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  }
  return socket.handshake.address;
}

export function attachOnline(io, options = {}) {
  const createLimit = new KeyedLimiter(8, 8 / 600);    // 8 camere noi / 10 minute / IP
  const joinLimit = new KeyedLimiter(20, 20 / 60);     // 20 încercări de intrare / minut / IP

  const manager = new RoomManager({
    ...options,
    onChange: room => {
      for (const p of room.participants.values()) {
        if (p.socketId) io.to(p.socketId).emit('room:state', manager.snapshot(room, p.pid));
      }
    },
    onKick: (socketId, message) => {
      const s = io.sockets.sockets.get(socketId);
      if (s) { s.emit('room:kicked', { message }); s.disconnect(true); }
    },
  });

  const sweep = setInterval(() => { manager.sweep(); createLimit.prune(); joinLimit.prune(); }, 60_000);
  sweep.unref();

  io.on('connection', socket => {
    const ip = clientIp(socket);
    const actions = new TokenBucket(12, 6);           // rafală de 12, apoi 6 acțiuni / secundă

    /** Înregistrează un handler: limitează frecvența, prinde erorile și răspunde prin ack. */
    const on = (event, fn) => socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!actions.take()) return reply(fail('rate_limited', 'Prea multe acțiuni într-un timp scurt. Încearcă din nou peste câteva secunde.'));
      try {
        reply({ ok: true, ...(fn(obj(payload)) || {}) });
      } catch (err) {
        if (err instanceof RoomError) reply(fail(err.code, err.message));
        else { console.error(err); reply(fail('server', 'A apărut o eroare pe server.')); }
      }
    });
    const mine = () => manager.bySocket(socket.id);

    on('room:create', ({ name }) => {
      if (!createLimit.take(ip)) throw new RoomError('rate_limited', 'Ai creat prea multe camere. Încearcă din nou peste câteva minute.');
      const { room, p, token } = manager.createRoom(name, socket.id);
      return { code: room.code, token, pid: p.pid, state: manager.snapshot(room, p.pid) };
    });

    on('room:join', ({ code, name }) => {
      if (!joinLimit.take(ip)) throw new RoomError('rate_limited', 'Prea multe încercări de intrare. Așteaptă un minut.');
      const { room, p, token } = manager.joinRoom(code, name, socket.id);
      return { code: room.code, token, pid: p.pid, state: manager.snapshot(room, p.pid) };
    });

    on('room:resume', ({ code, token }) => {
      if (!joinLimit.take(ip)) throw new RoomError('rate_limited', 'Prea multe încercări de reconectare. Așteaptă un minut.');
      if (typeof token !== 'string' || token.length > 100) throw new RoomError('bad_token', 'Sesiune invalidă.');
      const { room, p } = manager.resume(code, token, socket.id);
      return { code: room.code, pid: p.pid, state: manager.snapshot(room, p.pid) };
    });

    on('room:sync', () => {
      const { room, p } = mine();
      return { state: manager.snapshot(room, p.pid) };
    });

    on('room:leave', () => {
      const { room, p } = mine();
      manager.leave(room, p.pid);
    });

    on('lobby:color', ({ color }) => { const { room, p } = mine(); manager.setColor(room, p, color); });
    on('lobby:ready', ({ ready }) => { const { room, p } = mine(); manager.setReady(room, p, ready); });
    on('lobby:ai-add', ({ color, difficulty }) => { const { room, p } = mine(); manager.addAI(room, p, color, difficulty); });
    on('lobby:ai-remove', ({ color }) => { const { room, p } = mine(); manager.removeAI(room, p, color); });
    on('lobby:ai-difficulty', ({ color, difficulty }) => { const { room, p } = mine(); manager.setAIDifficulty(room, p, color, difficulty); });
    on('lobby:start', () => { const { room, p } = mine(); manager.start(room, p); });
    on('room:rematch', () => { const { room } = mine(); manager.rematch(room); });

    on('game:roll', ({ version, actionId }) => {
      const { room, p } = mine();
      return manager.roll(room, p, version, actionId);
    });
    on('game:move', ({ pawn, version, actionId }) => {
      const { room, p } = mine();
      return manager.move(room, p, pawn, version, actionId);
    });

    socket.on('disconnect', () => manager.disconnect(socket.id));
  });

  return manager;
}
