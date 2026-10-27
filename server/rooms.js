// Camerele online: lobby, partidă, deconectare, AI pe server, curățare.
// Clasa nu știe nimic despre rețea: primește intenții (pid + acțiune), le validează,
// aplică motorul de reguli și anunță schimbările prin `onChange`. Astfel poate fi testată direct.

import crypto from 'node:crypto';
import { COLORS, createGame, applyRoll, applyMove } from '../shared/engine.js';
import { chooseMove, DIFFICULTIES } from '../shared/ai.js';
import { rollDie } from '../shared/dice.js';
import { validateName, cleanName } from '../shared/validation.js';
import { COLOR_NAMES } from '../shared/messages.js';

export const MAX_SEATS = 4;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // fără 0/O, 1/I/L
const CODE_LENGTH = 6;                                       // 31^6 ≈ 887 milioane de coduri
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const defaultTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
};

const hashToken = token => crypto.createHash('sha256').update(String(token)).digest();
const randomId = () => crypto.randomBytes(9).toString('base64url');

/** Cât durează, aproximativ, animațiile unei acțiuni la clienți (ca AI-ul să nu grăbească jocul). */
export function animationMs(events = []) {
  let ms = 0;
  for (const e of events) {
    if (e.type === 'roll') ms += 560;
    if (e.type === 'no-moves' || e.type === 'no-moves-extra' || e.type === 'three-sixes') ms += 1100;
    if (e.type === 'move') ms += (e.from === -1 ? 300 : (e.to - e.from) * 150) + e.captures.length * 650 + (e.kind === 'finish' ? 450 : 0);
  }
  return ms;
}

export class RoomManager {
  constructor({
    timers = defaultTimers,
    dice = rollDie,
    random = Math.random,
    graceMs = 60_000,          // intervalul de revenire după deconectare
    aiDelayMs = 700,           // „gândirea” AI-ului, peste durata animațiilor
    emptyRoomMs = 10 * 60_000, // cameră fără niciun om conectat
    idleRoomMs = 2 * 60 * 60_000,
    onChange = () => {},       // (room) => void — trimite starea tuturor
    onKick = () => {},         // (socketId, message) => void — închide o conexiune înlocuită
  } = {}) {
    Object.assign(this, { timers, dice, random, graceMs, aiDelayMs, emptyRoomMs, idleRoomMs, onChange, onKick });
    this.rooms = new Map();    // cod → cameră
    this.sockets = new Map();  // socketId → { code, pid }
  }

  // ------------------------------------------------------------------ ajutătoare

  newCode() {
    for (let i = 0; i < 1000; i++) {
      let code = '';
      for (let k = 0; k < CODE_LENGTH; k++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('server', 'Nu s-a putut genera un cod de cameră. Încearcă din nou.');
  }

  getRoom(code) {
    const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!CODE_RE.test(c)) throw new RoomError('bad_code', 'Codul camerei trebuie să aibă 6 caractere (litere și cifre).');
    const room = this.rooms.get(c);
    if (!room) throw new RoomError('not_found', 'Camera nu există sau a expirat. Verifică codul sau creează o cameră nouă.');
    return room;
  }

  /** Camera și participantul legați de o conexiune. */
  bySocket(socketId) {
    const link = this.sockets.get(socketId);
    const room = link && this.rooms.get(link.code);
    const p = room?.participants.get(link.pid);
    if (!room || !p || p.socketId !== socketId) throw new RoomError('no_room', 'Nu ești într-o cameră.');
    return { room, p };
  }

  humans(room) { return [...room.participants.values()].filter(p => !p.gone); }

  usedColors(room) {
    const used = new Set(room.ai.keys());
    for (const p of this.humans(room)) if (p.color) used.add(p.color);
    return used;
  }

  seatCount(room) { return this.humans(room).length + room.ai.size; }

  checkName(room, raw, exceptPid = null) {
    const err = validateName(raw);
    if (err) throw new RoomError('bad_name', err);
    const name = cleanName(raw);
    const taken = this.humans(room).some(p => p.pid !== exceptPid && p.name.toLowerCase() === name.toLowerCase())
      || [...room.ai.keys()].some(c => `AI ${COLOR_NAMES[c]}`.toLowerCase() === name.toLowerCase());
    if (taken) throw new RoomError('name_taken', `Numele „${name}” este deja folosit în această cameră.`);
    return name;
  }

  touch(room) {
    room.lastActive = this.timers.now();
    room.rev += 1;
  }

  changed(room) {
    this.touch(room);
    this.onChange(room);
  }

  resetReady(room) {
    for (const p of room.participants.values()) p.ready = false;
  }

  addParticipant(room, name, socketId) {
    const used = this.usedColors(room);
    const token = crypto.randomBytes(24).toString('base64url');
    const p = {
      pid: randomId(),
      name,
      tokenHash: hashToken(token),
      color: COLORS.find(c => !used.has(c)),
      ready: false,
      socketId,
      connected: true,
      gone: false,
      graceTimer: null,
      actions: [],              // ultimele actionId-uri procesate (contra dublei procesări)
    };
    room.participants.set(p.pid, p);
    this.sockets.set(socketId, { code: room.code, pid: p.pid });
    return { p, token };
  }

  transferHost(room) {
    const host = room.participants.get(room.hostId);
    if (host && !host.gone && host.connected) return;
    const next = this.humans(room).find(p => p.connected) || this.humans(room)[0];
    if (next) room.hostId = next.pid;
  }

  // ------------------------------------------------------------------ creare / intrare / reconectare

  createRoom(rawName, socketId) {
    this.detachSocket(socketId);
    const name = this.checkName({ participants: new Map(), ai: new Map() }, rawName);
    const now = this.timers.now();
    const room = {
      code: this.newCode(),
      createdAt: now, lastActive: now, rev: 0,
      phase: 'lobby',
      hostId: null,
      participants: new Map(),
      ai: new Map(),            // culoare → { difficulty } (locuri AI din lobby)
      game: null,
      control: new Map(),       // culoare → 'human' | 'ai' (cine acționează în partidă)
      pauses: new Map(),        // pid → { until, timer }
      reclaim: new Set(),       // pid-uri care își reiau locul la următoarea tură
      aiTimer: null,
    };
    this.rooms.set(room.code, room);
    const { p, token } = this.addParticipant(room, name, socketId);
    room.hostId = p.pid;
    this.changed(room);
    return { room, p, token };
  }

  joinRoom(code, rawName, socketId) {
    const room = this.getRoom(code);
    if (room.phase !== 'lobby') throw new RoomError('started', 'Partida din această cameră a început deja. Nu se mai pot alătura jucători noi.');
    if (this.seatCount(room) >= MAX_SEATS) throw new RoomError('full', 'Camera este plină (4 locuri ocupate).');
    const name = this.checkName(room, rawName);
    this.detachSocket(socketId);
    const { p, token } = this.addParticipant(room, name, socketId);
    this.resetReady(room);
    this.changed(room);
    return { room, p, token };
  }

  /** Revenire cu tokenul primit la intrare. Cea mai nouă conexiune preia locul; cea veche este închisă. */
  resume(code, token, socketId) {
    const room = this.getRoom(code);
    const hash = hashToken(token);
    const p = [...room.participants.values()].find(x => !x.gone && crypto.timingSafeEqual(x.tokenHash, hash));
    if (!p) throw new RoomError('bad_token', 'Nu am putut confirma locul tău în această cameră. Intră din nou cu codul camerei.');

    const link = this.sockets.get(socketId);
    if (link && !(link.code === room.code && link.pid === p.pid)) this.detachSocket(socketId);
    if (p.socketId && p.socketId !== socketId) {
      this.sockets.delete(p.socketId);
      this.onKick(p.socketId, 'Camera a fost deschisă într-o altă filă sau pe alt dispozitiv. Această sesiune a fost închisă.');
    }
    p.socketId = socketId;
    p.connected = true;
    this.sockets.set(socketId, { code: room.code, pid: p.pid });
    if (p.graceTimer) { this.timers.clearTimeout(p.graceTimer); p.graceTimer = null; }

    if (room.phase === 'playing') {
      const pause = room.pauses.get(p.pid);
      if (pause) {
        this.timers.clearTimeout(pause.timer);
        room.pauses.delete(p.pid);
      }
      if (room.control.get(p.color) === 'ai') {
        // Locul a fost preluat de AI: omul îl reia doar la o limită sigură de tură.
        if (this.currentColor(room) !== p.color) room.control.set(p.color, 'human');
        else room.reclaim.add(p.pid);
      }
      this.scheduleAI(room);
    }
    this.transferHost(room);
    this.changed(room);
    return { room, p };
  }

  /** Desface o conexiune de vechea cameră (de ex. când aceeași filă intră în altă cameră). */
  detachSocket(socketId) {
    if (!this.sockets.has(socketId)) return;
    try {
      const { room, p } = this.bySocket(socketId);
      this.leave(room, p.pid);
    } catch { /* legătura era deja invalidă */ }
    this.sockets.delete(socketId);
  }

  // ------------------------------------------------------------------ deconectare / plecare

  disconnect(socketId) {
    const link = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    const room = link && this.rooms.get(link.code);
    const p = room?.participants.get(link.pid);
    if (!room || !p || p.socketId !== socketId) return;
    p.socketId = null;
    p.connected = false;

    if (room.phase === 'lobby' || room.phase === 'over') {
      // În lobby păstrăm locul 60 s; apoi participantul este scos.
      p.graceTimer = this.timers.setTimeout(() => { p.graceTimer = null; this.leave(room, p.pid); }, this.graceMs);
      p.ready = false;
    } else if (room.control.get(p.color) === 'human') {
      // În partidă: jocul se suspendă 60 s; dacă omul nu revine, AI-ul preia locul.
      const until = this.timers.now() + this.graceMs;
      const timer = this.timers.setTimeout(() => this.expirePause(room, p.pid), this.graceMs);
      room.pauses.set(p.pid, { until, timer });
      this.cancelAI(room);
    }
    this.transferHost(room);
    this.changed(room);
  }

  expirePause(room, pid) {
    const p = room.participants.get(pid);
    if (!room.pauses.has(pid) || !p) return;
    room.pauses.delete(pid);
    room.control.set(p.color, 'ai');
    this.transferHost(room);
    this.scheduleAI(room);
    this.changed(room);
  }

  /** Plecare definitivă (buton „Părăsește” sau expirarea intervalului din lobby). */
  leave(room, pid) {
    const p = room.participants.get(pid);
    if (!p || p.gone) return;
    if (p.graceTimer) { this.timers.clearTimeout(p.graceTimer); p.graceTimer = null; }
    if (p.socketId) this.sockets.delete(p.socketId);
    p.socketId = null;
    p.connected = false;

    if (room.phase === 'lobby') {
      room.participants.delete(pid);
      this.resetReady(room);
    } else {
      p.gone = true;              // păstrat pentru numele din partidă; tokenul nu mai este valid
      const pause = room.pauses.get(pid);
      if (pause) { this.timers.clearTimeout(pause.timer); room.pauses.delete(pid); }
      room.reclaim.delete(pid);
      if (room.phase === 'playing') room.control.set(p.color, 'ai');
    }
    if (this.humans(room).length === 0) { this.deleteRoom(room); return; }
    this.transferHost(room);
    if (room.phase === 'playing') this.scheduleAI(room);
    this.changed(room);
  }

  deleteRoom(room) {
    this.cancelAI(room);
    for (const pause of room.pauses.values()) this.timers.clearTimeout(pause.timer);
    for (const p of room.participants.values()) {
      if (p.graceTimer) this.timers.clearTimeout(p.graceTimer);
      if (p.socketId) this.sockets.delete(p.socketId);
    }
    this.rooms.delete(room.code);
  }

  /** Șterge camerele abandonate (apelată periodic de server). */
  sweep() {
    const now = this.timers.now();
    for (const room of [...this.rooms.values()]) {
      const anyConnected = this.humans(room).some(p => p.connected);
      if ((!anyConnected && now - room.lastActive > this.emptyRoomMs) || now - room.lastActive > this.idleRoomMs) {
        this.deleteRoom(room);
      }
    }
  }

  // ------------------------------------------------------------------ lobby

  requireLobby(room) {
    if (room.phase !== 'lobby') throw new RoomError('started', 'Configurația nu mai poate fi schimbată după pornirea partidei.');
  }

  requireHost(room, p) {
    if (room.hostId !== p.pid) throw new RoomError('not_host', 'Doar gazda camerei poate face această modificare.');
  }

  checkColor(color) {
    if (!COLORS.includes(color)) throw new RoomError('bad_color', 'Culoare invalidă.');
  }

  setColor(room, p, color) {
    this.requireLobby(room);
    this.checkColor(color);
    if (p.color === color) return;
    if (this.usedColors(room).has(color)) throw new RoomError('color_taken', `Culoarea ${COLOR_NAMES[color].toLowerCase()} este deja ocupată.`);
    p.color = color;
    this.resetReady(room);
    this.changed(room);
  }

  setReady(room, p, ready) {
    this.requireLobby(room);
    p.ready = Boolean(ready);
    this.changed(room);
  }

  addAI(room, p, color, difficulty = 'medium') {
    this.requireLobby(room);
    this.requireHost(room, p);
    this.checkColor(color);
    if (!(difficulty in DIFFICULTIES)) throw new RoomError('bad_request', 'Dificultate invalidă.');
    if (this.usedColors(room).has(color)) throw new RoomError('color_taken', 'Locul acesta este deja ocupat.');
    if (this.seatCount(room) >= MAX_SEATS) throw new RoomError('full', 'Camera este plină.');
    room.ai.set(color, { difficulty });
    this.resetReady(room);
    this.changed(room);
  }

  removeAI(room, p, color) {
    this.requireLobby(room);
    this.requireHost(room, p);
    if (!room.ai.delete(color)) throw new RoomError('bad_request', 'Pe acest loc nu este un AI.');
    this.resetReady(room);
    this.changed(room);
  }

  setAIDifficulty(room, p, color, difficulty) {
    this.requireLobby(room);
    this.requireHost(room, p);
    const ai = room.ai.get(color);
    if (!ai) throw new RoomError('bad_request', 'Pe acest loc nu este un AI.');
    if (!(difficulty in DIFFICULTIES)) throw new RoomError('bad_request', 'Dificultate invalidă.');
    if (ai.difficulty === difficulty) return;
    ai.difficulty = difficulty;
    this.resetReady(room);
    this.changed(room);
  }

  /** Motivul pentru care partida nu poate porni sau null. */
  startProblem(room) {
    const humans = this.humans(room);
    const total = humans.length + room.ai.size;
    if (total < 2) return 'Sunt necesari cel puțin doi participanți (oameni sau AI).';
    if (total > MAX_SEATS) return 'Sunt prea mulți participanți.';
    const colors = [...humans.map(h => h.color), ...room.ai.keys()];
    if (new Set(colors).size !== colors.length || colors.some(c => !c)) return 'Fiecare participant trebuie să aibă o culoare distinctă.';
    const offline = humans.find(h => !h.connected);
    if (offline) return `${offline.name} nu este conectat.`;
    const notReady = humans.filter(h => !h.ready);
    if (notReady.length) return `Așteptăm să fie pregătiți: ${notReady.map(h => h.name).join(', ')}.`;
    return null;
  }

  start(room, p) {
    this.requireLobby(room);
    this.requireHost(room, p);
    const problem = this.startProblem(room);
    if (problem) throw new RoomError('not_ready', problem);
    const configs = [
      ...this.humans(room).map(h => ({ name: h.name, color: h.color, type: 'human', id: h.pid })),
      ...[...room.ai].map(([color, ai]) => ({ name: `AI ${COLOR_NAMES[color]}`, color, type: 'ai', difficulty: ai.difficulty })),
    ];
    room.game = createGame(configs);
    room.control = new Map(configs.map(c => [c.color, c.type]));
    room.pauses.clear();
    room.reclaim.clear();
    room.phase = 'playing';
    this.scheduleAI(room);
    this.changed(room);
  }

  /** După o partidă: înapoi în lobby, cu aceleași locuri, toți nepregătiți. */
  rematch(room) {
    if (room.phase !== 'over') return;
    for (const p of [...room.participants.values()]) if (p.gone) room.participants.delete(p.pid);
    room.phase = 'lobby';
    room.game = null;
    room.control = new Map();
    this.resetReady(room);
    this.transferHost(room);
    this.changed(room);
  }

  // ------------------------------------------------------------------ partida

  currentColor(room) {
    return room.game?.players[room.game.current]?.color;
  }

  /** Verificările comune pentru o acțiune de joc a unui om. */
  checkTurn(room, p, version, actionId) {
    if (room.phase !== 'playing') throw new RoomError('not_playing', 'Partida nu este în desfășurare.');
    if (actionId != null) {
      if (typeof actionId !== 'string' || actionId.length > 64) throw new RoomError('bad_request', 'Acțiune invalidă.');
      if (p.actions.includes(actionId)) return false;       // aceeași acțiune trimisă de două ori: ignorată
    }
    if (room.pauses.size) throw new RoomError('paused', 'Jocul este suspendat până revine un jucător deconectat.');
    if (this.currentColor(room) !== p.color) throw new RoomError('not_your_turn', 'Nu este rândul tău.');
    if (room.control.get(p.color) !== 'human') throw new RoomError('not_your_turn', 'Locul tău este jucat temporar de AI. Îl reiei la începutul turei următoare.');
    if (!Number.isInteger(version) || version !== room.game.version) {
      throw new RoomError('stale', 'Starea jocului s-a schimbat între timp. Am sincronizat tabla.');
    }
    if (actionId != null) p.actions = [...p.actions.slice(-49), actionId];
    return true;
  }

  roll(room, p, version, actionId) {
    if (!this.checkTurn(room, p, version, actionId)) return { duplicate: true };
    if (room.game.phase !== 'roll') throw new RoomError('bad_phase', 'Mai întâi alege un pion.');
    this.apply(room, applyRoll(room.game, this.dice()));
    return {};
  }

  move(room, p, pawn, version, actionId) {
    if (!this.checkTurn(room, p, version, actionId)) return { duplicate: true };
    if (room.game.phase !== 'move') throw new RoomError('bad_phase', 'Mai întâi aruncă zarul.');
    if (!Number.isInteger(pawn) || !room.game.legalMoves.some(m => m.pawn === pawn)) {
      throw new RoomError('illegal', 'Mutarea aceasta nu este permisă.');
    }
    this.apply(room, applyMove(room.game, pawn));
    return {};
  }

  /** Aplică noua stare, rezolvă revenirile la limită de tură și programează AI-ul. */
  apply(room, next) {
    room.game = next;
    if (next.phase === 'over') {
      room.phase = 'over';
      this.cancelAI(room);
    } else {
      if (next.events.some(e => e.type === 'turn') && room.reclaim.size) {
        for (const pid of room.reclaim) {
          const p = room.participants.get(pid);
          if (p && p.connected && !p.gone) room.control.set(p.color, 'human');
        }
        room.reclaim.clear();
      }
      this.scheduleAI(room);
    }
    this.changed(room);
  }

  cancelAI(room) {
    if (room.aiTimer) { this.timers.clearTimeout(room.aiTimer); room.aiTimer = null; }
  }

  /** Dacă la mutare este AI-ul (un loc AI sau un loc preluat), acționează după animații + o scurtă pauză. */
  scheduleAI(room) {
    this.cancelAI(room);
    if (room.phase !== 'playing' || room.pauses.size) return;
    if (!this.humans(room).some(p => p.connected)) return;       // nimeni nu privește: AI-ul așteaptă
    const color = this.currentColor(room);
    if (room.control.get(color) !== 'ai') return;
    const delay = animationMs(room.game.events) + this.aiDelayMs;
    room.aiTimer = this.timers.setTimeout(() => {
      room.aiTimer = null;
      this.aiStep(room);
    }, delay);
  }

  aiStep(room) {
    if (room.phase !== 'playing' || room.pauses.size || !this.rooms.has(room.code)) return;
    const g = room.game;
    const player = g.players[g.current];
    if (room.control.get(player.color) !== 'ai') return;
    if (g.phase === 'roll') {
      this.apply(room, applyRoll(g, this.dice()));
    } else if (g.phase === 'move') {
      const move = chooseMove(g, player.difficulty || 'medium', this.random);
      this.apply(room, applyMove(g, move.pawn));
    }
  }

  // ------------------------------------------------------------------ starea trimisă clienților

  /** Starea camerei, din perspectiva participantului `pid`. Nu conține tokenuri. */
  snapshot(room, pid) {
    const now = this.timers.now();
    const seats = COLORS.map(color => {
      const human = this.humans(room).find(h => h.color === color);
      if (room.phase === 'lobby') {
        if (human) return { color, kind: 'human', pid: human.pid };
        if (room.ai.has(color)) return { color, kind: 'ai', difficulty: room.ai.get(color).difficulty };
        return { color, kind: 'free' };
      }
      const player = room.game?.players.find(pl => pl.color === color);
      if (!player) return { color, kind: 'free' };
      return { color, kind: player.type, pid: player.id ?? undefined, difficulty: player.difficulty ?? undefined };
    });
    return {
      code: room.code,
      phase: room.phase,
      rev: room.rev,
      you: pid,
      hostId: room.hostId,
      participants: [...room.participants.values()].map(p => ({
        pid: p.pid, name: p.name, color: p.color, ready: p.ready, connected: p.connected, gone: p.gone,
      })),
      seats,
      startProblem: room.phase === 'lobby' ? this.startProblem(room) : null,
      game: room.game,
      control: Object.fromEntries(room.control),
      pauses: [...room.pauses].map(([ppid, pause]) => {
        const p = room.participants.get(ppid);
        return { pid: ppid, name: p?.name, color: p?.color, remainingMs: Math.max(0, pause.until - now) };
      }),
      reclaim: [...room.reclaim],
    };
  }
}
