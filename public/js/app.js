// Punctul de intrare: ecranul principal, configurarea partidei locale, dialoguri și navigare.
// Ecranul de joc comun este în game-screen.js, modul online în online.js.

import { COLORS, FINISH } from '/shared/engine.js';
import { DIFFICULTIES } from '/shared/ai.js';
import { COLOR_NAMES } from '/shared/messages.js';
import { validateName, cleanName } from '/shared/validation.js';
import { BoardView } from './board-view.js';
import { LocalGame } from './local-game.js';
import { settings, updateSettings, onSettingsChange } from './settings.js';
import { SYMBOL_NAMES, tokenSvg, avatarSvg, pawnSvg, decoDieSvg, logoMarkSvg } from './theme.js';
import { icon, hydrateIcons } from './icons.js';
import { $, $$, escapeHtml, colorVars, showScreen, openDialog } from './ui.js';
import { runGame, confirmLeave } from './game-screen.js';
import { online } from './online.js';

hydrateIcons();

// ---------------------------------------------------------------- ecranul principal
$('#logo-mark').innerHTML = logoMarkSvg();
$('#hero-die').innerHTML = decoDieSvg();
$('#hero-pawn-a').innerHTML = pawnSvg('red');
$('#hero-pawn-b').innerHTML = pawnSvg('blue');

const homeBoard = new BoardView($('#home-board'), { interactive: false });
homeBoard.setupPlayers(COLORS.map(c => ({ color: c, pawns: [0, 0, 0, 0] })));
homeBoard.render({
  phase: 'over',
  current: 0,
  players: [
    { color: 'red', pawns: [4, -1, -1, 53] },
    { color: 'green', pawns: [9, 22, -1, -1] },
    { color: 'yellow', pawns: [-1, -1, 30, FINISH] },
    { color: 'blue', pawns: [17, -1, -1, -1] },
  ],
}, { showMovable: false });


// ---------------------------------------------------------------- dialoguri
$$('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });   // clic pe fundal
  d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
});
$('#symbols-legend').innerHTML = COLORS
  .map(c => `<span class="legend-item">${tokenSvg(c, 22)} ${COLOR_NAMES[c]} — ${SYMBOL_NAMES[c]}</span>`)
  .join('');

// ---------------------------------------------------------------- setări
const settingsForm = $('#settings-form');
function syncSettingsForm() {
  settingsForm.sound.checked = settings.sound;
  settingsForm.animations.checked = settings.animations;
  settingsForm.autoMove.checked = settings.autoMove;
  settingsForm.querySelector(`input[name="aiSpeed"][value="${settings.aiSpeed}"]`).checked = true;
}
settingsForm.addEventListener('change', () => {
  updateSettings({
    sound: settingsForm.sound.checked,
    animations: settingsForm.animations.checked,
    autoMove: settingsForm.autoMove.checked,
    aiSpeed: settingsForm.querySelector('input[name="aiSpeed"]:checked').value,
  });
});

// ---------------------------------------------------------------- configurarea partidei
let seats = [];

const defaultName = (seat, i) => (seat.type === 'ai' ? `AI ${COLOR_NAMES[seat.color]}` : `Jucător ${i + 1}`);

function presetSeats(mode, aiCount = 3) {
  if (mode === 'ai') {
    const aiColors = { 1: ['yellow'], 2: ['green', 'yellow'], 3: ['green', 'yellow', 'blue'] }[aiCount];
    seats = COLORS.map(c => ({
      color: c,
      type: c === 'red' ? 'human' : aiColors.includes(c) ? 'ai' : 'empty',
      difficulty: 'medium',
    }));
  } else {
    seats = COLORS.map((c, i) => ({ color: c, type: i < 2 ? 'human' : 'empty', difficulty: 'medium' }));
  }
  seats.forEach((s, i) => { s.name = defaultName(s, i); });
}

const TYPE_OPTIONS = [['human', 'Om', 'user'], ['ai', 'AI', 'robot'], ['empty', 'Liber', 'empty']];

function renderSeats() {
  $('#seats').innerHTML = seats.map((s, i) => `
    <fieldset class="seat ${s.type === 'empty' ? 'is-empty' : ''}" data-i="${i}">
      <legend class="sr-only">${COLOR_NAMES[s.color]}</legend>
      <div class="seat-band">
        ${avatarSvg(s.color, 46)}
        <div><b>${COLOR_NAMES[s.color]}</b><small>simbol: ${SYMBOL_NAMES[s.color]}</small></div>
      </div>
      <div class="seat-body">
        <div class="segmented segmented-full" role="radiogroup" aria-label="Cine joacă cu ${COLOR_NAMES[s.color]}">
          ${TYPE_OPTIONS.map(([v, l, ic]) => `
            <label><input type="radio" name="type-${i}" value="${v}" ${s.type === v ? 'checked' : ''}><span>${icon(ic, 16)}${l}</span></label>`).join('')}
        </div>
        ${s.type === 'empty'
          ? '<p class="seat-empty-note">Nimeni nu joacă cu această culoare.</p>'
          : `<label class="field">
              <span class="field-label">Nume</span>
              <input id="name-${i}" class="input seat-name" maxlength="16" autocomplete="off" value="${escapeHtml(s.name)}" placeholder="Nume">
            </label>`}
        ${s.type === 'ai' ? `
          <div class="field">
            <span class="field-label" id="diff-label-${i}">Dificultate</span>
            <div class="segmented segmented-full segmented-sm" role="radiogroup" aria-labelledby="diff-label-${i}">
              ${Object.entries(DIFFICULTIES).map(([v, l]) => `
                <label><input type="radio" name="diff-${i}" value="${v}" ${s.difficulty === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
            </div>
          </div>` : ''}
      </div>
    </fieldset>`).join('');
  $$('.seat').forEach(el => colorVars(el, seats[el.dataset.i].color));
  updateSetupSummary();
}

function updateSetupSummary() {
  const humans = seats.filter(s => s.type === 'human').length;
  const ais = seats.filter(s => s.type === 'ai').length;
  const total = humans + ais;
  const el = $('#setup-summary');
  el.hidden = false;
  $('#setup-error').textContent = '';
  const parts = [];
  if (humans) parts.push(`${humans} ${humans === 1 ? 'om' : 'oameni'}`);
  if (ais) parts.push(`${ais} AI`);
  if (total < 2) {
    el.innerHTML = `${icon('alert', 18)} Mai ai nevoie de ${2 - total === 1 ? 'încă un participant' : 'doi participanți'} (om sau AI).`;
    el.classList.add('warn');
  } else {
    el.innerHTML = `${icon('check', 18)} ${total} participanți: ${parts.join(' și ')}`;
    el.classList.remove('warn');
  }
}

$('#seats').addEventListener('input', e => {
  const seatEl = e.target.closest('.seat');
  if (!seatEl || !e.target.classList.contains('seat-name')) return;
  seats[seatEl.dataset.i].name = e.target.value;
  e.target.removeAttribute('aria-invalid');
});
$('#seats').addEventListener('change', e => {
  const seatEl = e.target.closest('.seat');
  if (!seatEl || e.target.type !== 'radio') return;
  const i = Number(seatEl.dataset.i);
  const seat = seats[i];
  if (e.target.name.startsWith('type-')) {
    const wasDefault = !seat.name.trim() || seat.name === defaultName(seat, i);
    seat.type = e.target.value;
    if (wasDefault) seat.name = defaultName(seat, i);
    renderSeats();
    $(`input[name="type-${i}"][value="${seat.type}"]`).focus();
  } else if (e.target.name.startsWith('diff-')) {
    seat.difficulty = e.target.value;
  }
  $('#setup-error').textContent = '';
});
$$('input[name="aiCount"]').forEach(r => r.addEventListener('change', () => {
  presetSeats('ai', Number(r.value));
  renderSeats();
}));

function openSetup(mode) {
  $('#setup-title').textContent = mode === 'ai' ? 'Contra AI' : 'Cu prietenii';
  $('#ai-count').hidden = mode !== 'ai';
  presetSeats(mode, Number($('input[name="aiCount"]:checked').value));
  renderSeats();
  $('#setup-error').textContent = '';
  showScreen('setup');
}

function validateSetup() {
  const active = seats.filter(s => s.type !== 'empty');
  if (active.length < 2) return { error: 'Partida are nevoie de cel puțin doi participanți. Alege „Om” sau „AI” pentru încă o culoare.' };
  const seen = new Set();
  for (const s of active) {
    const i = seats.indexOf(s);
    const err = validateName(s.name);
    const name = cleanName(s.name);
    const input = $(`#name-${i}`);
    if (err) { input.setAttribute('aria-invalid', 'true'); input.focus(); return { error: `${COLOR_NAMES[s.color]}: ${err}` }; }
    if (seen.has(name.toLowerCase())) { input.setAttribute('aria-invalid', 'true'); input.focus(); return { error: `Numele „${name}” este folosit de doi jucători. Alege nume diferite.` }; }
    seen.add(name.toLowerCase());
  }
  return {
    configs: active.map(s => ({
      name: cleanName(s.name), color: s.color, type: s.type,
      difficulty: s.type === 'ai' ? s.difficulty : null,
    })),
  };
}

$('#setup-form').addEventListener('submit', e => {
  e.preventDefault();
  const { error, configs } = validateSetup();
  const errEl = $('#setup-error');
  $('#setup-summary').hidden = Boolean(error);   // eroarea înlocuiește rezumatul, fără mesaje duble
  if (error) { errEl.innerHTML = `${icon('alert', 18)}<span>${escapeHtml(error)}</span>`; return; }
  errEl.textContent = '';
  startGame(configs);
});

homeBoard.setAnimations(settings.animations);
onSettingsChange(() => homeBoard.setAnimations(settings.animations));

// ---------------------------------------------------------------- partida locală
function startGame(configs) {
  runGame(configs, ui => new LocalGame(configs, ui), {
    again: () => startGame(configs),
    againLabel: 'Joacă din nou',
  });
}

// ---------------------------------------------------------------- acțiuni generale (data-action)
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  switch (btn.dataset.action) {
    case 'local': openSetup('local'); break;
    case 'ai': openSetup('ai'); break;
    case 'online': online.open(); break;
    case 'home': showScreen('home'); break;
    case 'rules': openDialog('#dlg-rules'); break;
    case 'settings': syncSettingsForm(); openDialog('#dlg-settings'); break;
    case 'leave': confirmLeave(online.inGame() ? 'Locul tău va fi jucat de AI până la finalul partidei. Ceilalți pot continua.' : 'Partida curentă se va încheia și progresul nu va fi salvat.'); break;
  }
});

// Link de invitație (?camera=COD) sau revenire după reîncărcarea paginii.
online.boot();
