// Controlerul partidei locale: leagă motorul de reguli, AI-ul și interfața.
// Toate acțiunile trec prin aceeași poartă (busy + fază + tip jucător),
// deci nu se pot face mutări în timpul animațiilor, prin clic dublu sau în afara turei.

import { createGame, applyRoll, applyMove } from '/shared/engine.js';
import { chooseMove } from '/shared/ai.js';
import { rollDie } from '/shared/dice.js';
import { settings, AI_DELAY } from './settings.js';
import { sound } from './sound.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_MOVE_PAUSE = 1100;   // cât rămâne vizibil un zar fără mutări, înainte de a trece mai departe

export class LocalGame {
  /**
   * @param {object[]} configs  configurația jucătorilor
   * @param {{ board, dice, onUpdate:(view, info)=>void, onEvents:(events, state)=>void, onOver:(state)=>void }} ui
   */
  constructor(configs, ui) {
    this.configs = configs;
    this.ui = ui;
    this.state = createGame(configs);
    this.busy = false;
    this.stopped = false;
    this.timer = null;
    this.shownDie = null;     // valoarea afișată pe zar; null = stare neutră
    this.pauseFor = null;     // jucătorul afișat în timpul pauzei „fără mutări”
    ui.board.setupPlayers(this.state.players);
    this.refresh();
    this.ui.onEvents(this.state.events, this.state);
    this.continue();
  }

  get currentPlayer() { return this.state.players[this.state.current]; }
  get humanTurn() { return this.currentPlayer.type === 'human'; }

  canRoll() { return !this.busy && !this.stopped && this.state.phase === 'roll' && this.humanTurn; }

  /** Cerere din interfață: aruncă zarul. */
  requestRoll() { if (this.canRoll()) this.doRoll(); }

  /** Cerere din interfață: mută pionul ales. */
  requestMove(pawn) {
    if (this.busy || this.stopped || this.state.phase !== 'move' || !this.humanTurn) return;
    if (!this.state.legalMoves.some(m => m.pawn === pawn)) return;
    this.doMove(pawn);
  }

  async doRoll() {
    this.busy = true;
    this.refresh();
    const value = rollDie();
    const roller = this.state.current;
    sound.roll();
    await this.ui.dice.roll(value);
    if (this.stopped) return;
    this.shownDie = value;
    this.state = applyRoll(this.state, value);

    if (this.state.phase === 'roll') {
      // Nicio mutare (sau al treilea 6): lăsăm rezultatul vizibil puțin, la jucătorul care a aruncat.
      this.pauseFor = roller;
      this.ui.onEvents(this.state.events, this.state);
      this.refresh();
      await sleep(NO_MOVE_PAUSE);
      if (this.stopped) return;
      this.pauseFor = null;
      this.busy = false;
      this.afterAction({ logged: true });
      return;
    }
    this.busy = false;
    this.afterAction();
  }

  async doMove(pawn) {
    this.busy = true;
    const next = applyMove(this.state, pawn);
    const event = next.events.find(e => e.type === 'move');
    const color = this.currentPlayer.color;
    // Culorile victimelor, ca vizualizarea să știe unde îi trimite în bază.
    event.victimColors = Object.fromEntries(this.state.players.map((p, i) => [i, p.color]));
    this.refresh();
    if (event.kind === 'enter') sound.enter();
    await this.ui.board.animateMove(event, color, () => sound.step());
    if (this.stopped) return;
    if (event.captures.length) sound.capture();
    if (event.kind === 'finish') sound.finish();
    this.state = next;
    this.busy = false;
    this.afterAction();
  }

  afterAction({ logged = false } = {}) {
    if (this.state.phase === 'roll') this.shownDie = null;   // înainte de aruncare: zar neutru
    if (!logged) this.ui.onEvents(this.state.events, this.state);
    this.refresh();
    if (this.state.phase === 'over') {
      sound.win();
      this.ui.onOver(this.state);
      return;
    }
    if (this.state.events.some(e => e.type === 'turn') && this.humanTurn) sound.turn();
    this.continue();
  }

  /** Programează pasul următor pentru AI sau mutarea automată. */
  continue() {
    clearTimeout(this.timer);
    if (this.stopped || this.busy || this.state.phase === 'over') return;
    if (!this.humanTurn) {
      const delay = AI_DELAY[settings.aiSpeed] ?? AI_DELAY.normal;
      this.timer = setTimeout(() => this.aiStep(), delay);
    } else if (settings.autoMove && this.state.phase === 'move' && this.state.legalMoves.length === 1) {
      const pawn = this.state.legalMoves[0].pawn;
      this.timer = setTimeout(() => this.requestMove(pawn), 450);
    }
  }

  aiStep() {
    if (this.stopped || this.busy || this.humanTurn) return;
    if (this.state.phase === 'roll') {
      this.doRoll();
    } else if (this.state.phase === 'move') {
      const move = chooseMove(this.state, this.currentPlayer.difficulty);
      this.doMove(move.pawn);
    }
  }

  refresh() {
    const s = this.state;
    // În pauza „fără mutări” afișăm încă jucătorul care a aruncat.
    const view = this.pauseFor === null ? s : { ...s, current: this.pauseFor };
    const human = view.players[view.current].type === 'human';
    const showMovable = !this.busy && s.phase === 'move' && this.humanTurn;
    // În pauza de „gândire” a AI-ului, pionii dintre care alege sunt marcați discret.
    const candidates = !this.busy && s.phase === 'move' && !this.humanTurn ? s.legalMoves : [];
    this.ui.board.render(view, { movable: s.legalMoves, showMovable, candidates });
    this.ui.onUpdate(view, {
      busy: this.busy,
      canRoll: this.canRoll(),
      humanTurn: human,
      die: this.shownDie,
      pause: this.pauseFor !== null ? s.events.find(e => ['no-moves', 'no-moves-extra', 'three-sixes'].includes(e.type)) : null,
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
