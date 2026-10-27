// Randarea tablei în SVG și animațiile pionilor.
// Nu conține reguli: primește starea de la motor și afișează ce i se spune.

import { COLORS, BASE, FINISH, LAST_TRACK, startCell } from '/shared/engine.js';
import { TRACK, HOME_LANES, BASE_ORIGIN, BASE_SLOTS, pawnCoord, pathBetween } from '/shared/geometry.js';
import { COLOR_NAMES } from '/shared/messages.js';
import { PALETTE, BOARD, symbolPath, pawnGradient, pawnShape } from './theme.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 40;
const SIZE = CELL * 15;
// Margine în jurul tablei, ca pionii de pe marginea de sus (ridicați sau în animație) să nu fie tăiați.
const MARGIN = 14;
const px = ([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let instances = 0;   // id-urile din <defs> trebuie să fie unice în document (pot exista mai multe table)

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export class BoardView {
  /**
   * @param {SVGSVGElement} svg
   * @param {{ interactive?: boolean, onPawnClick?: (pawn:number)=>void }} opts
   */
  constructor(svg, opts = {}) {
    this.svg = svg;
    this.interactive = opts.interactive !== false;
    this.onPawnClick = opts.onPawnClick || (() => {});
    this.pawnEls = {};        // color → [g, g, g, g]
    this.targets = new Map(); // pawn index → progres destinație (pentru previzualizare)
    this.animations = true;
    this.stepMs = 150;
    this.uid = `b${++instances}`;
    this.drawBoard();
  }

  setAnimations(on) {
    this.animations = on;
    this.svg.classList.toggle('no-anim', !on);
  }

  drawBoard() {
    const svg = this.svg;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `${-MARGIN} ${-MARGIN} ${SIZE + 2 * MARGIN} ${SIZE + 2 * MARGIN}`);

    const defs = el('defs', {}, svg);
    defs.innerHTML = COLORS.map(c => pawnGradient(`${this.uid}-pg-${c}`, c)).join('');

    el('rect', { x: 1.5, y: 1.5, width: SIZE - 3, height: SIZE - 3, rx: 18, class: 'board-bg' }, svg);

    this.baseEls = {};
    for (const c of COLORS) {
      const pal = PALETTE[c];
      const [bx, by] = BASE_ORIGIN[c];
      const g = el('g', { class: 'base', 'data-color': c }, svg);
      el('rect', {
        x: bx * CELL + 6, y: by * CELL + 6, width: 6 * CELL - 12, height: 6 * CELL - 12, rx: 22,
        fill: pal.main, class: 'base-outer',
      }, g);
      el('rect', {
        x: bx * CELL + 30, y: by * CELL + 30, width: 6 * CELL - 60, height: 6 * CELL - 60, rx: 18,
        fill: BOARD.inner, class: 'base-inner',
      }, g);
      for (const slot of BASE_SLOTS[c]) {
        const [sx, sy] = px(slot);
        el('ellipse', { cx: sx, cy: sy + 10, rx: 16, ry: 6.5, fill: pal.light, stroke: pal.lane, 'stroke-width': 2.5 }, g);
      }
      const [cx, cy] = px([bx + 2.5, by + 2.5]);
      el('path', { d: symbolPath(c, 10), transform: `translate(${cx} ${cy})`, fill: pal.main, opacity: 0.55 }, g);
      const label = el('text', { x: cx, y: by * CELL + 19, class: 'base-label', fill: pal.ink }, g);
      label.textContent = COLOR_NAMES[c];
      this.baseEls[c] = g;
    }

    // Traseul comun.
    TRACK.forEach((cell, i) => {
      const owner = COLORS.find(c => startCell(c) === i);
      el('rect', {
        x: cell[0] * CELL + 1.5, y: cell[1] * CELL + 1.5, width: CELL - 3, height: CELL - 3, rx: 8,
        class: 'cell', fill: owner ? PALETTE[owner].main : BOARD.cell,
      }, svg);
      if (owner) {
        const [cx, cy] = px(cell);
        el('path', { d: symbolPath(owner, 9), transform: `translate(${cx} ${cy})`, fill: PALETTE[owner].ink, opacity: 0.9 }, svg);
      }
    });

    // Culoarele finale (aceeași culoare ca triunghiul central) și săgeata de intrare.
    for (const c of COLORS) {
      HOME_LANES[c].slice(0, 5).forEach(cell => {
        el('rect', {
          x: cell[0] * CELL + 1.5, y: cell[1] * CELL + 1.5, width: CELL - 3, height: CELL - 3, rx: 8,
          class: 'cell lane', fill: PALETTE[c].main,
        }, svg);
      });
      const entry = TRACK[(startCell(c) + LAST_TRACK) % TRACK.length];
      const first = HOME_LANES[c][0];
      const [ex, ey] = px(entry);
      const angle = Math.atan2(first[1] - entry[1], first[0] - entry[0]) * 180 / Math.PI;
      el('path', {
        d: 'M-9,-7 L5,0 L-9,7 Z', fill: PALETTE[c].main, stroke: BOARD.ink, 'stroke-width': 1.2, 'stroke-linejoin': 'round',
        transform: `translate(${ex} ${ey}) rotate(${angle})`,
      }, svg);
    }

    // Centrul: patru triunghiuri — capătul fiecărui culoar.
    const T = { red: [[240, 240], [240, 360]], green: [[240, 240], [360, 240]], yellow: [[360, 240], [360, 360]], blue: [[240, 360], [360, 360]] };
    for (const c of COLORS) {
      const [[ax, ay], [bx, by]] = T[c];
      el('polygon', { points: `${ax},${ay} ${bx},${by} 300,300`, fill: PALETTE[c].main, class: 'home-tri' }, svg);
    }

    this.markerLayer = el('g', { class: 'markers' }, svg);
    this.pawnLayer = el('g', { class: 'pawns' }, svg);
  }

  /** Creează pionii pentru jucătorii activi; culorile libere apar estompate. */
  setupPlayers(players) {
    this.pawnLayer.innerHTML = '';
    this.pawnEls = {};
    const active = new Set(players.map(p => p.color));
    for (const c of COLORS) this.baseEls[c].classList.toggle('inactive', !active.has(c));
    for (const p of players) {
      this.pawnEls[p.color] = p.pawns.map((_, i) => this.createPawn(p.color, i));
    }
  }

  createPawn(color, index) {
    const g = el('g', { class: 'pawn', 'data-color': color, 'data-pawn': index }, this.pawnLayer);
    el('ellipse', { class: 'pawn-halo', cx: 0, cy: 11, rx: 17, ry: 6.5 }, g);
    const body = el('g', { class: 'pawn-body' }, g);
    body.innerHTML = `${pawnShape(color, `${this.uid}-pg-${color}`)}
      <g class="pawn-badge" transform="translate(9.5 -18)">
        <circle r="5.8" fill="${BOARD.face}" stroke="${BOARD.ink}" stroke-width="1.3"/>
        <text class="pawn-num" y="0.4">${index + 1}</text>
      </g>`;

    if (this.interactive) {
      const activate = () => { if (g.classList.contains('movable')) this.onPawnClick(index); };
      g.addEventListener('click', activate);
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
      g.addEventListener('pointerenter', () => this.showTarget(color, index));
      g.addEventListener('pointerleave', () => this.clearTarget());
      g.addEventListener('focus', () => this.showTarget(color, index));
      g.addEventListener('blur', () => this.clearTarget());
    }
    return g;
  }

  placePawn(g, color, index, progress) {
    const [x, y] = px(pawnCoord(color, index, progress));
    g.style.transform = `translate(${x}px, ${y}px)`;
    g.classList.toggle('finished', progress === FINISH);
    g.classList.toggle('in-base', progress === BASE);
  }

  /**
   * Afișează starea fără animații. `movable` + `showMovable` marchează pionii pe care omul îi poate apăsa;
   * `candidates` marchează discret (fără interacțiune) pionii între care alege AI-ul.
   */
  render(state, { movable = [], showMovable = true, candidates = [] } = {}) {
    state.players.forEach((p, pi) => {
      const els = this.pawnEls[p.color];
      if (!els) return;
      p.pawns.forEach((prog, i) => {
        const g = els[i];
        this.placePawn(g, p.color, i, prog);
        const canMove = showMovable && pi === state.current && movable.some(m => m.pawn === i);
        g.classList.toggle('movable', canMove);
        g.classList.toggle('candidate', pi === state.current && candidates.some(m => m.pawn === i));
        if (canMove) {
          g.setAttribute('tabindex', '0');
          g.setAttribute('role', 'button');
        } else {
          g.removeAttribute('tabindex');
          g.removeAttribute('role');
        }
        g.setAttribute('aria-label', `Pionul ${i + 1} ${COLOR_NAMES[p.color]}${canMove ? ' — poate fi mutat' : ''}`);
      });
    });
    this.targets = new Map(showMovable ? movable.map(m => [m.pawn, m.to]) : []);
    this.clearTarget();
    const cur = state.players[state.current]?.color;
    for (const c of COLORS) this.baseEls[c].classList.toggle('active', state.phase !== 'over' && c === cur);
  }

  showTarget(color, pawn) {
    this.clearTarget();
    if (!this.targets.has(pawn)) return;
    const [x, y] = px(pawnCoord(color, pawn, this.targets.get(pawn)));
    el('ellipse', { cx: x, cy: y + 10, rx: 16, ry: 6.5, class: 'target-marker', stroke: PALETTE[color].dark }, this.markerLayer);
    el('circle', { cx: x, cy: y - 4, r: 4, class: 'target-dot', fill: PALETTE[color].dark }, this.markerLayer);
  }

  clearTarget() { this.markerLayer.innerHTML = ''; }

  /**
   * Deplasează un pion între două puncte (în unități SVG), sincronizat cu cadrele browserului.
   * Poziția se calculează din timpul scurs, deci mișcarea rămâne corectă chiar dacă un cadru întârzie.
   */
  tween(g, [x0, y0], [x1, y1], duration, hop = 6) {
    return new Promise(resolve => {
      const start = performance.now();
      const frame = now => {
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;   // ease-in-out
        const lift = Math.sin(Math.PI * t) * hop;                    // mic salt la fiecare pas
        g.style.transform = `translate(${x0 + (x1 - x0) * e}px, ${y0 + (y1 - y0) * e - lift}px)`;
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  /** Animează o mutare pas cu pas, apoi eventualele capturări. */
  async animateMove(event, color, onStep) {
    const g = this.pawnEls[color][event.pawn];
    this.clearTarget();
    for (const els of Object.values(this.pawnEls)) els.forEach(p => p.classList.remove('movable', 'candidate'));
    this.pawnLayer.appendChild(g);              // pionul care se mișcă stă deasupra
    if (!this.animations) {
      this.placePawn(g, color, event.pawn, event.to);
    } else {
      // Fără tranziții CSS pe durata mutării: poziția este controlată doar de tween().
      g.classList.add('moving');
      g.classList.remove('in-base');
      let from = px(pawnCoord(color, event.pawn, event.from));
      for (const step of pathBetween(event.from, event.to)) {
        const to = px(pawnCoord(color, event.pawn, step));
        onStep?.();
        await this.tween(g, from, to, event.from === BASE ? this.stepMs * 2 : this.stepMs, event.from === BASE ? 14 : 6);
        from = to;
      }
      this.placePawn(g, color, event.pawn, event.to);
      g.classList.remove('moving');
    }
    for (const c of event.captures) {
      const victimColor = event.victimColors[c.player];
      const v = this.pawnEls[victimColor][c.pawn];
      if (this.animations) {
        v.classList.add('captured');
        await sleep(220);                       // scurtă clătinare, apoi alunecă înapoi în bază
        const start = px(pawnCoord(victimColor, c.pawn, c.progress));
        await this.tween(v, start, px(pawnCoord(victimColor, c.pawn, BASE)), 420, 24);
        v.classList.remove('captured');
      }
      this.placePawn(v, victimColor, c.pawn, BASE);
    }
    if (this.animations && event.to === FINISH) {
      g.classList.add('celebrate');
      await sleep(450);
      g.classList.remove('celebrate');
    }
  }
}
