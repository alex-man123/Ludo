// Ecranul de joc, comun pentru partida locală și cea online.
// Controlerul activ (LocalGame sau OnlineGame) apelează onUpdate / onEvents / onOver,
// iar interfața îi transmite intențiile: requestRoll(), requestMove(pawn).

import { COLORS, FINISH, finishedCount } from '/shared/engine.js';
import { DIFFICULTIES } from '/shared/ai.js';
import { COLOR_NAMES, describeEvent } from '/shared/messages.js';
import { BoardView } from './board-view.js';
import { DiceView } from './dice-view.js';
import { settings, onSettingsChange } from './settings.js';
import { PALETTE, SYMBOL_NAMES, tokenSvg, avatarSvg } from './theme.js';
import { icon } from './icons.js';
import { sound } from './sound.js';
import { $, escapeHtml, colorVars, showScreen, openDialog } from './ui.js';

export const board = new BoardView($('#board'), { onPawnClick: pawn => controller?.requestMove(pawn) });
export const dice = new DiceView($('#die'));

let controller = null;
let actions = {};          // { again, exit, leave, againLabel, me }
let historyCount = 0;

if (window.matchMedia('(min-width: 900px)').matches) $('#history').open = true;

function applySettings() {
  board.setAnimations(settings.animations);
  dice.animations = settings.animations;
  document.body.classList.toggle('reduce-motion', !settings.animations);
}
applySettings();
onSettingsChange(() => { applySettings(); sound.warmup(); controller?.continue?.(); });

/**
 * Pornește ecranul de joc cu un controler.
 * @param players  jucătorii (pentru cardurile laterale): { name, color, type, difficulty }
 * @param create   (ui) => controler
 * @param opts     { again, againLabel, exit, leave, me: culoarea proprie (online) }
 */
export function runGame(players, create, opts = {}) {
  sound.warmup();
  controller?.stop();
  actions = opts;
  $('#log').innerHTML = '';
  historyCount = 0;
  $('#history-count').textContent = '';
  setNotice(opts.startNotice || 'Partida a început. Mult noroc!', 'info');
  $('#victory').hidden = true;
  $('#action').dataset.color = '';
  dice.show(null);
  showScreen('game');
  setupPlayerCards(players, opts.me);       // cardurile trebuie să existe înainte de primul onUpdate
  controller = create({ board, dice, onUpdate, onEvents, onOver });
  return controller;
}

export function stopGame() {
  controller?.stop();
  controller = null;
  $('#victory').hidden = true;
}

export const currentController = () => controller;

/** Cardurile jucătorilor: create o dată pe partidă, apoi doar actualizate. */
export function setupPlayerCards(players, me = null) {
  for (const color of COLORS) {
    const card = $(`#pcard-${color}`);
    const p = players.find(pl => pl.color === color);
    colorVars(card, color);
    card.classList.remove('is-current');
    card.classList.toggle('is-empty', !p);
    if (!p) {
      card.innerHTML = `${avatarSvg(color, 40)}
        <div class="pc-info"><b class="pc-name">Loc liber</b><span class="pc-meta">${COLOR_NAMES[color]} · ${SYMBOL_NAMES[color]}</span></div>`;
      continue;
    }
    const role = p.type === 'ai' ? `${icon('robot', 14)} AI ${DIFFICULTIES[p.difficulty].toLowerCase()}` : `${icon('user', 14)} ${color === me ? 'Tu' : 'Om'}`;
    card.innerHTML = `
      <span class="pc-flag">La mutare</span>
      ${avatarSvg(color, 40)}
      <div class="pc-info">
        <b class="pc-name">${escapeHtml(p.name)}</b>
        <span class="pc-meta">${role} · ${COLOR_NAMES[color]}</span>
      </div>
      <span class="pc-status" hidden></span>
      <div class="pc-progress" aria-label="0 din 4 pioni acasă">
        <span class="pc-slots">${'<i></i>'.repeat(4)}</span><span class="pc-count">0/4 acasă</span>
      </div>`;
  }
}

function updatePlayerCards(view, status = {}) {
  view.players.forEach((p, i) => {
    const card = $(`#pcard-${p.color}`);
    if (!card.querySelector('.pc-count')) return;
    const done = finishedCount(p);
    const isCur = i === view.current && view.phase !== 'over';
    if (isCur && !card.classList.contains('is-current')) {
      card.classList.add('is-current');
      if (settings.animations) { card.classList.remove('turn-in'); void card.offsetWidth; card.classList.add('turn-in'); }
    } else if (!isCur) {
      card.classList.remove('is-current', 'turn-in');
    }
    card.querySelectorAll('.pc-slots i').forEach((dot, k) => dot.classList.toggle('on', k < done));
    card.querySelector('.pc-count').textContent = `${done}/4 acasă`;
    card.querySelector('.pc-progress').setAttribute('aria-label', `${done} din 4 pioni acasă`);
    // Stare de conexiune (online): „Deconectat”, „AI temporar”.
    const chip = card.querySelector('.pc-status');
    const s = status[p.color];
    chip.hidden = !s;
    if (s) { chip.textContent = s.text; chip.dataset.kind = s.kind; }
  });
}

/**
 * Indicația din zona de aruncare.
 * info.who: 'me' (controlez eu), 'human' (alt om, online), 'ai'.
 */
function hintFor(view, info) {
  const cur = view.players[view.current];
  if (view.phase === 'over') return 'Partida s-a încheiat';
  if (info.waiting) return `Așteptăm să revină ${info.waiting.name} (${info.waiting.seconds} s)`;
  if (info.pause) {
    if (info.pause.type === 'three-sixes') return 'Al treilea 6 la rând — tura se încheie';
    if (info.pause.type === 'no-moves-extra') return info.who === 'me' ? 'Niciun pion nu poate muta. Mai arunci o dată' : 'Niciun pion nu poate muta. Mai aruncă o dată';
    return `Nicio mutare posibilă cu ${info.pause.value}`;
  }
  if (info.who === 'me') {
    if (view.phase === 'roll') {
      if (info.busy || info.pending) return 'Se aruncă zarul…';
      return view.sixes > 0 ? 'Ai dat 6! Mai arunci o dată' : 'E rândul tău. Aruncă zarul!';
    }
    return info.busy || info.pending ? 'Pionul se mută…' : 'Alege un pion de pe tablă';
  }
  if (info.who === 'human') {
    if (view.phase === 'roll') return view.sixes > 0 ? `${cur.name} a dat 6 și mai aruncă` : `Așteptăm ca ${cur.name} să arunce zarul`;
    return `Așteptăm ca ${cur.name} să aleagă un pion`;
  }
  if (view.phase === 'roll') return view.sixes > 0 ? `${cur.name} a dat 6 și mai aruncă` : `${cur.name} se pregătește…`;
  return `${cur.name} alege un pion…`;
}

function onUpdate(view, info) {
  const who = info.who ?? (info.humanTurn ? 'me' : 'ai');
  const cur = view.players[view.current];
  const action = $('#action');
  if (action.dataset.color !== cur.color) {   // reconstruim avatarul doar când se schimbă jucătorul
    action.dataset.color = cur.color;
    colorVars(action, cur.color, 'a');
    $('#action-avatar').innerHTML = avatarSvg(cur.color, 48);
  }
  $('#action-label').textContent = view.phase === 'over' ? 'Partida s-a încheiat'
    : who === 'me' ? 'Rândul tău' : who === 'human' ? 'La mutare' : 'La mutare · AI';
  $('#action-name').textContent = cur.name;
  $('#action-hint').textContent = hintFor(view, { ...info, who });

  dice.show(info.die);
  $('#die').disabled = !info.canRoll;
  $('#die').classList.toggle('waiting', Boolean(info.pending) && view.phase === 'roll');
  $('#roll-btn').disabled = !info.canRoll;
  $('#roll-label').textContent = who === 'me' && view.phase === 'move' && !info.busy ? 'Alege un pion' : 'Aruncă zarul';

  updatePlayerCards(view, info.status);
}

export function setNotice(text, kind = 'info') {
  const n = $('#notice');
  const ic = { capture: 'bolt', finish: 'flag', info: 'dice', warn: 'alert' }[kind];
  n.className = `notice notice-${kind}`;
  n.innerHTML = `${icon(ic, 16)}<span>${escapeHtml(text)}</span>`;
  if (settings.animations) { void n.offsetWidth; n.classList.add('pop'); }
}

function onEvents(events, state) {
  const messages = [];
  let kind = 'info';
  for (const e of events) {
    const text = describeEvent(e, state.players);
    if (!text) continue;
    messages.push(text);
    if (e.type === 'move' && e.captures.length) kind = 'capture';
    else if (e.type === 'move' && e.kind === 'finish' && kind !== 'capture') kind = 'finish';
    const color = state.players[e.player]?.color;
    const li = document.createElement('li');
    li.innerHTML = `${color ? tokenSvg(color, 16) : ''}<span>${escapeHtml(text)}</span>`;
    $('#log').prepend(li);
    historyCount++;
  }
  const log = $('#log');
  while (log.children.length > 60) log.lastElementChild.remove();
  $('#history-count').textContent = historyCount ? historyCount : '';
  if (messages.length) setNotice(messages.join(' '), kind);
}

function onOver(state) {
  const winner = state.players[state.winner];
  const delay = settings.animations ? 500 : 0;
  setTimeout(() => {
    const card = $('#victory-card');
    colorVars(card, winner.color);
    const mine = actions.me ? winner.color === actions.me : winner.type === 'human';
    $('#victory-avatar').innerHTML = avatarSvg(winner.color, 96);
    $('#victory-color').innerHTML = `${tokenSvg(winner.color, 16)} ${COLOR_NAMES[winner.color]} · ${SYMBOL_NAMES[winner.color]}`;
    $('#victory-title').textContent = mine ? `Felicitări, ${winner.name}!` : `${winner.name} a câștigat!`;
    const hasHumans = state.players.some(p => p.type === 'human');
    $('#victory-text').textContent = mine
      ? 'Ai adus toți cei patru pioni acasă.'
      : hasHumans ? 'Data viitoare va fi rândul tău. Mai încerci o dată?' : 'Toți cei patru pioni au ajuns acasă.';
    const progress = p => p.pawns.reduce((sum, x) => sum + Math.max(0, x + 1), 0);
    const ranked = [...state.players].sort((a, b) => finishedCount(b) - finishedCount(a) || progress(b) - progress(a));
    $('#victory-standings').innerHTML = ranked.map((p, i) =>
      `<li><span class="rank">${i + 1}</span>${tokenSvg(p.color, 20)}<span class="st-name">${escapeHtml(p.name)}</span><b>${finishedCount(p)}/4 acasă</b></li>`).join('');
    $('#victory-again-label').textContent = actions.againLabel || 'Joacă din nou';
    const confetti = $('.confetti');
    confetti.innerHTML = settings.animations
      ? Array.from({ length: 60 }, () => {
        const c = PALETTE[COLORS[Math.floor(Math.random() * 4)]].main;
        return `<i style="left:${Math.random() * 100}%;background:${c};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.2).toFixed(2)}s"></i>`;
      }).join('')
      : '';
    $('#victory').hidden = false;
    $('#victory-again').focus();
  }, delay);
}

$('#roll-btn').addEventListener('click', () => controller?.requestRoll());
$('#die').addEventListener('click', () => controller?.requestRoll());
$('#confirm-leave').addEventListener('click', () => {
  $('#dlg-leave').close();
  const leave = actions.leave;
  stopGame();
  leave ? leave() : showScreen('home');
});
$('#victory-again').addEventListener('click', () => actions.again?.());
$('#victory-home').addEventListener('click', () => {
  const exit = actions.exit;
  stopGame();
  exit ? exit() : showScreen('home');
});

document.addEventListener('keydown', e => {
  if (e.key !== ' ' || !controller || !$('#screen-game').classList.contains('active')) return;
  if (document.querySelector('dialog[open]') || !$('#victory').hidden) return;
  if (e.target.closest('button, input, select, textarea, summary, .pawn')) return;
  e.preventDefault();
  controller.requestRoll();
});

export function confirmLeave(text) {
  $('#leave-text').textContent = text;
  openDialog('#dlg-leave');
}
