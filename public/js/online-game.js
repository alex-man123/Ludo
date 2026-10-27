// Controlerul partidei online. Serverul este autoritatea: clientul trimite doar intenții
// („aruncă”, „mută pionul 2”) împreună cu versiunea stării pe care o vede și un identificator unic.
// Stările primite sunt aplicate în ordine; cele vechi sunt ignorate, iar un salt de versiune
// (reconectare, desincronizare) se afișează direct, fără a relua animațiile istorice.

import { sound } from './sound.js';
import { setNotice } from './game-screen.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_MOVE_PAUSE = 1100;
const newActionId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export class OnlineGame {
  /**
   * @param ui    { board, dice, onUpdate, onEvents, onOver } de la game-screen
   * @param net   conexiunea (request)
   * @param snap  starea completă a camerei, de la server
   * @param hooks { onResync: () => void }
   */
  constructor(ui, net, snap, hooks = {}) {
    Object.assign(this, { ui, net, hooks });
    this.meta = snap;
    this.state = snap.game;
    this.busy = false;          // rulează o animație
    this.pending = false;       // am trimis o intenție și așteptăm răspunsul
    this.stopped = false;
    this.shownDie = this.state.phase === 'move' ? this.state.dice : null;
    this.pauseFor = null;
    this.queue = Promise.resolve();
    this.backlog = 0;
    ui.board.setupPlayers(this.state.players);
    this.refresh();
    if (this.state.phase === 'over') ui.onOver(this.state);
    // Numărătoarea inversă pentru un jucător deconectat.
    this.ticker = setInterval(() => { if (this.meta.pauses?.length) this.refresh(); }, 1000);
  }

  get me() { return this.meta.you; }
  get myColor() { return this.state.players.find(p => p.id === this.me)?.color ?? null; }

  /** Cine acționează pentru jucătorul curent: 'me', 'human' (alt om) sau 'ai'. */
  whoIsCurrent(view = this.state) {
    const cur = view.players[view.current];
    if (this.meta.control?.[cur.color] === 'ai' || cur.type === 'ai') return 'ai';
    return cur.id === this.me ? 'me' : 'human';
  }

  get paused() { return (this.meta.pauses?.length || 0) > 0 || this.meta.phase !== 'playing'; }

  canAct() {
    return !this.busy && !this.pending && !this.stopped && !this.paused && this.whoIsCurrent() === 'me';
  }

  canRoll() { return this.canAct() && this.state.phase === 'roll'; }

  /** O stare nouă de la server (pusă în coadă, ca animațiile să ruleze în ordine). */
  update(snap) {
    this.backlog += 1;
    this.queue = this.queue.then(() => this.consume(snap)).catch(err => console.error(err)).finally(() => { this.backlog -= 1; });
  }

  async consume(snap) {
    if (this.stopped) return;
    const next = snap.game;
    const prev = this.state;
    this.meta = snap;
    if (!next || next.version <= prev.version) {    // doar meta (conexiuni, pauze) sau o stare veche
      this.refresh();
      return;
    }
    this.pending = false;
    const animate = next.version === prev.version + 1 && this.ui.board.animations && !document.hidden && this.backlog <= 2;
    if (animate) await this.animate(prev, next);
    else this.jump(next);
  }

  /** Afișează direct o stare (fără animații istorice). */
  jump(next) {
    this.state = next;
    this.shownDie = next.phase === 'move' ? next.dice : null;
    this.refresh();
    if (next.phase === 'over') this.ui.onOver(next);
  }

  async animate(prev, next) {
    const events = next.events;
    this.busy = true;
    const roll = events.find(e => e.type === 'roll');
    if (roll) {
      sound.roll();
      this.refresh();
      await this.ui.dice.roll(roll.value);
      if (this.stopped) return;
      this.shownDie = roll.value;
      if (next.phase === 'roll') {
        // Fără mutare posibilă: rezultatul rămâne vizibil puțin, la jucătorul care a aruncat.
        this.pauseFor = roll.player;
        this.ui.onEvents(events, next);
        this.refresh(events.find(e => ['no-moves', 'no-moves-extra', 'three-sixes'].includes(e.type)));
        await sleep(NO_MOVE_PAUSE);
        if (this.stopped) return;
        this.pauseFor = null;
        this.busy = false;
        this.jump(next);
        return;
      }
    }
    const mv = events.find(e => e.type === 'move');
    if (mv) {
      const color = prev.players[mv.player].color;
      const ev = { ...mv, victimColors: Object.fromEntries(prev.players.map((p, i) => [i, p.color])) };
      if (mv.kind === 'enter') sound.enter();
      this.refresh();
      await this.ui.board.animateMove(ev, color, () => sound.step());
      if (this.stopped) return;
      if (mv.captures.length) sound.capture();
      if (mv.kind === 'finish') sound.finish();
    }
    this.busy = false;
    this.ui.onEvents(events, next);
    if (next.events.some(e => e.type === 'turn') && this.whoIsCurrent(next) === 'me') sound.turn();
    if (next.phase === 'over') sound.win();
    this.jump(next);
  }

  // ------------------------------------------------------------------ intenții

  async send(event, payload) {
    this.pending = true;
    this.refresh();
    try {
      await this.net.request(event, { ...payload, version: this.state.version, actionId: newActionId() });
      // Răspunsul vine înaintea stării noi; „pending” se anulează când sosește starea.
    } catch (err) {
      this.pending = false;
      setNotice(err.message, 'warn');
      this.refresh();
      if (err.code === 'stale' || err.code === 'not_your_turn') this.hooks.onResync?.();
    }
  }

  requestRoll() { if (this.canRoll()) this.send('game:roll', {}); }

  requestMove(pawn) {
    if (!this.canAct() || this.state.phase !== 'move') return;
    if (!this.state.legalMoves.some(m => m.pawn === pawn)) return;
    this.send('game:move', { pawn });
  }

  continue() { this.refresh(); }

  stop() {
    this.stopped = true;
    clearInterval(this.ticker);
  }

  // ------------------------------------------------------------------ afișare

  status() {
    const out = {};
    for (const p of this.state.players) {
      if (p.type !== 'human') continue;
      const part = this.meta.participants.find(x => x.pid === p.id);
      if (part?.gone) out[p.color] = { text: 'A plecat · AI', kind: 'ai' };
      else if (part && !part.connected) out[p.color] = { text: 'Deconectat', kind: 'off' };
      else if (this.meta.control?.[p.color] === 'ai') out[p.color] = { text: 'AI temporar', kind: 'ai' };
    }
    return out;
  }

  refresh(pause = null) {
    if (this.stopped) return;
    const s = this.state;
    const view = this.pauseFor === null ? s : { ...s, current: this.pauseFor };
    const mine = this.whoIsCurrent() === 'me';
    const showMovable = !this.busy && !this.pending && !this.paused && s.phase === 'move' && mine;
    const candidates = !this.busy && s.phase === 'move' && !mine ? s.legalMoves : [];
    this.ui.board.render(view, { movable: s.legalMoves, showMovable, candidates });
    // Versiunea afișată (utilă la depanare și la verificarea sincronizării între clienți).
    this.ui.board.svg.dataset.version = s.version;
    this.ui.board.svg.dataset.busy = this.busy || this.pauseFor !== null ? '1' : '0';
    const waitingPause = this.meta.pauses?.[0];
    this.ui.onUpdate(view, {
      busy: this.busy,
      pending: this.pending,
      canRoll: this.canRoll(),
      who: this.pauseFor === null ? this.whoIsCurrent() : this.whoIsCurrent(view),
      die: this.shownDie,
      pause,
      waiting: waitingPause ? { name: waitingPause.name, seconds: Math.max(0, Math.ceil((waitingPause.deadline - Date.now()) / 1000)) } : null,
      status: this.status(),
    });
  }
}
