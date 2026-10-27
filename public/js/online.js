// Modul online: creare/intrare în cameră, lobby, invitații, reconectare.
// Tokenul de reconectare stă în sessionStorage (per filă, supraviețuiește reîncărcării),
// nu apare în linkul de invitație și nu este trimis altor jucători.

import { DIFFICULTIES } from '/shared/ai.js';
import { COLOR_NAMES } from '/shared/messages.js';
import { validateName, cleanName } from '/shared/validation.js';
import { SYMBOL_NAMES, avatarSvg } from './theme.js';
import { icon } from './icons.js';
import { $, escapeHtml, colorVars, showScreen } from './ui.js';
import { net } from './net.js';
import { runGame, stopGame, setNotice, currentController } from './game-screen.js';
import { OnlineGame } from './online-game.js';

const SESSION_KEY = 'ludo.online.session';   // sessionStorage: fila curentă (supraviețuiește reîncărcării)
const LAST_KEY = 'ludo.online.last';         // localStorage: ultima cameră, oferită doar la cerere după închiderea filei
const NAME_KEY = 'ludo.online.name';
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

const store = {
  get(key, storage = sessionStorage) { try { return JSON.parse(storage.getItem(key)); } catch { return null; } },
  set(key, value, storage = sessionStorage) { try { storage.setItem(key, JSON.stringify(value)); } catch { /* stocare indisponibilă */ } },
  remove(key, storage = sessionStorage) { try { storage.removeItem(key); } catch { /* idem */ } },
};

let snap = null;          // ultima stare a camerei
let game = null;          // OnlineGame activ
let wasConnected = false;

const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
const inviteLink = code => `${location.origin}/?camera=${code}`;

// ---------------------------------------------------------------- stări de la server

function normalize(s) {
  // Timpul rămas devine termen local, independent de ceasul serverului.
  for (const p of s.pauses || []) p.deadline = Date.now() + p.remainingMs;
  return s;
}

function handleState(raw) {
  const s = normalize(raw);
  if (snap && s.code === snap.code && s.rev < snap.rev) return;   // stare mai veche: ignorată
  snap = s;
  if (s.phase === 'lobby') {
    if (game) { game.stop(); game = null; stopGame(); }
    renderLobby(s);
    if (document.body.dataset.screen !== 'lobby') showScreen('lobby');
    return;
  }
  // playing / over
  if (game && currentController() === game) {
    game.update(s);
  } else {
    startOnlineGame(s);
  }
}

function startOnlineGame(s) {
  const me = s.game.players.find(p => p.id === s.you)?.color ?? null;
  runGame(s.game.players, ui => {
    game = new OnlineGame(ui, net, s, { onResync: resync });
    return game;
  }, {
    me,
    startNotice: s.game.version > 0 ? 'Te-ai reconectat la partidă.' : 'Partida online a început. Mult noroc!',
    againLabel: 'Înapoi în cameră',
    again: () => net.request('room:rematch').catch(err => setNotice(err.message, 'warn')),
    leave: () => leaveRoom(),
    exit: () => leaveRoom(),
  });
}

async function resync() {
  try {
    const res = await net.request('room:sync');
    handleState(res.state);
  } catch { /* reconectarea automată va încerca din nou */ }
}

// ---------------------------------------------------------------- conexiune

net.on('room:state', s => handleState(s));
net.on('room:kicked', ({ message }) => {
  store.remove(SESSION_KEY);
  endOnline();
  showOnline(message);
});
net.on('disconnect', () => {
  if (!snap) return;
  setConn(false);
  if (document.body.dataset.screen === 'game') setNotice('Conexiunea cu serverul s-a pierdut. Încercăm să ne reconectăm…', 'warn');
});
net.on('connect', () => {
  setConn(true);
  if (wasConnected && store.get(SESSION_KEY)) resume(true);
  wasConnected = true;
});

function setConn(ok) {
  const chip = $('#lobby-conn');
  chip.textContent = ok ? 'Conectat' : 'Se reconectează…';
  chip.dataset.kind = ok ? 'ok' : 'off';
}

async function resume(silent = false, session = store.get(SESSION_KEY)) {
  if (!session) return false;
  try {
    const res = await net.request('room:resume', { code: session.code, token: session.token });
    store.set(SESSION_KEY, { code: session.code, token: session.token });
    handleState(res.state);
    if (silent && document.body.dataset.screen === 'game') setNotice('Te-ai reconectat. Tabla este sincronizată cu serverul.', 'info');
    return true;
  } catch (err) {
    if (err.code === 'timeout' || err.code === 'unavailable') { if (!silent) showOnline(err.message); return false; }
    store.remove(SESSION_KEY);
    store.remove(LAST_KEY, localStorage);
    endOnline();
    showOnline(err.code === 'not_found' ? 'Camera nu mai există (a expirat sau serverul a fost repornit).' : err.message);
    return false;
  }
}

function endOnline() {
  if (game) { game.stop(); game = null; stopGame(); }
  snap = null;
}

async function leaveRoom() {
  try { await net.request('room:leave'); } catch { /* serverul eliberează oricum locul după expirare */ }
  store.remove(SESSION_KEY);
  store.remove(LAST_KEY, localStorage);
  endOnline();
  history.replaceState(null, '', location.pathname);
  showScreen('home');
}

// ---------------------------------------------------------------- creare / intrare

function showOnline(message = '', code = '') {
  const name = store.get(NAME_KEY, localStorage) || '';
  for (const input of document.querySelectorAll('#screen-online input[name="name"]')) if (!input.value) input.value = name;
  if (code) $('#join-code').value = code;
  $('#online-error').innerHTML = message ? `${icon('alert', 18)}<span>${escapeHtml(message)}</span>` : '';
  // Fila a fost închisă în timpul unei partide: oferim revenirea (doar la cerere, ca să nu închidem altă filă).
  const last = store.get(LAST_KEY, localStorage);
  const box = $('#rejoin');
  box.hidden = !last;
  if (last) {
    box.innerHTML = `${icon('replay', 20)}<span>Ai fost în camera <b>${escapeHtml(last.code)}</b> ca <b>${escapeHtml(last.name)}</b>.</span>
      <button type="button" class="btn btn-primary btn-sm" id="rejoin-btn">Revino în cameră</button>`;
  }
  showScreen('online');
}

$('#rejoin').addEventListener('click', async e => {
  if (!e.target.closest('#rejoin-btn')) return;
  const last = store.get(LAST_KEY, localStorage);
  if (last && !(await resume(false, last))) $('#rejoin').hidden = true;
});

function formError(message, input) {
  $('#online-error').innerHTML = `${icon('alert', 18)}<span>${escapeHtml(message)}</span>`;
  if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
}

async function submitRoom(form, event, payload) {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  $('#online-error').textContent = '';
  try {
    const res = await net.request(event, payload);
    store.set(SESSION_KEY, { code: res.code, token: res.token });
    store.set(LAST_KEY, { code: res.code, token: res.token, name: payload.name }, localStorage);
    store.set(NAME_KEY, payload.name, localStorage);
    history.replaceState(null, '', `/?camera=${res.code}`);
    handleState(res.state);
  } catch (err) {
    const field = err.code === 'bad_name' || err.code === 'name_taken' ? form.name : (err.code === 'bad_code' || err.code === 'not_found' ? $('#join-code') : null);
    formError(err.message, field);
  } finally {
    btn.disabled = false;
  }
}

$('#form-create').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = validateName(form.name.value);
  if (err) return formError(err, form.name);
  submitRoom(form, 'room:create', { name: cleanName(form.name.value) });
});

$('#form-join').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = validateName(form.name.value);
  if (err) return formError(err, form.name);
  const code = $('#join-code').value.trim().toUpperCase();
  if (!CODE_RE.test(code)) return formError('Codul camerei are 6 caractere: litere și cifre (fără 0, O, 1, I, L).', $('#join-code'));
  submitRoom(form, 'room:join', { code, name: cleanName(form.name.value) });
});

$('#join-code').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});
document.querySelectorAll('#screen-online .input').forEach(i => i.addEventListener('input', () => i.removeAttribute('aria-invalid')));

// ---------------------------------------------------------------- lobby

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Pe http://IP-local (fără HTTPS) API-ul clipboard nu este disponibil: copiem din câmpul selectat.
    if (!input) return false;
    input.focus();
    input.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

function copyFeedback(ok, what) {
  const fb = $('#copy-feedback');
  fb.innerHTML = ok ? `${icon('check', 16)} ${what} a fost copiat.` : `${icon('alert', 16)} Nu am putut copia automat. Selectează textul și copiază-l manual (Ctrl+C).`;
  fb.dataset.kind = ok ? 'ok' : 'warn';
  clearTimeout(copyFeedback.timer);
  copyFeedback.timer = setTimeout(() => { fb.textContent = ''; }, 3500);
}

$('#copy-code').addEventListener('click', async () => copyFeedback(await copyText(snap.code, $('#lobby-code-input')), 'Codul'));
$('#copy-link').addEventListener('click', async () => copyFeedback(await copyText($('#lobby-link').value, $('#lobby-link')), 'Linkul'));
$('#lobby-leave').addEventListener('click', () => leaveRoom());

async function lobbyAction(event, payload) {
  $('#lobby-error').textContent = '';
  try { await net.request(event, payload); } catch (err) {
    $('#lobby-error').innerHTML = `${icon('alert', 18)}<span>${escapeHtml(err.message)}</span>`;
  }
}

$('#lobby-ready').addEventListener('click', () => {
  const me = snap?.participants.find(p => p.pid === snap.you);
  if (me) lobbyAction('lobby:ready', { ready: !me.ready });
});
$('#lobby-start').addEventListener('click', () => lobbyAction('lobby:start'));

$('#lobby-seats').addEventListener('click', e => {
  const btn = e.target.closest('[data-lobby]');
  if (!btn) return;
  const { lobby, color } = btn.dataset;
  if (lobby === 'color') lobbyAction('lobby:color', { color });
  if (lobby === 'ai-add') lobbyAction('lobby:ai-add', { color, difficulty: 'medium' });
  if (lobby === 'ai-remove') lobbyAction('lobby:ai-remove', { color });
});
$('#lobby-seats').addEventListener('change', e => {
  if (e.target.name?.startsWith('ai-diff-')) lobbyAction('lobby:ai-difficulty', { color: e.target.dataset.color, difficulty: e.target.value });
});

let lanChecked = false;
async function showLanHint(code) {
  const box = $('#lan-hint');
  if (!isLocalHost()) { box.hidden = true; return; }
  box.hidden = false;
  let addresses = [];
  try { addresses = (await (await fetch('/api/lan')).json()).addresses; } catch { /* fără sugestii */ }
  const row = a => `<div class="lan-row"><input class="input" readonly value="${escapeHtml(`${a.url}/?camera=${code}`)}" aria-label="Link LAN prin ${escapeHtml(a.name)}"><button class="btn btn-ghost btn-sm" data-copy-lan>Copiază</button></div>`;
  const [first, ...others] = addresses;
  box.innerHTML = `
    <p><b>${icon('alert', 18)} Linkul de mai sus conține „localhost”</b> și funcționează doar pe acest calculator.
    Pentru un prieten din aceeași rețea Wi-Fi trimite linkul cu adresa locală${first ? ` (${escapeHtml(first.name)})` : ''}:</p>
    ${first ? row(first) : '<p>Nu am găsit o adresă de rețea. Află adresa IPv4 cu <kbd>ipconfig</kbd> și deschide <b>http://ADRESA:PORT</b>.</p>'}
    ${others.length ? `<details class="lan-more"><summary>Alte adrese ale acestui calculator (${others.length})</summary>${others.map(row).join('')}</details>` : ''}
    <p class="lan-small">Prin internet, folosește linkul aplicației publicate (HTTPS) — vezi README.</p>`;
  lanChecked = true;
}
$('#lan-hint').addEventListener('click', async e => {
  const btn = e.target.closest('[data-copy-lan]');
  if (!btn) return;
  const input = btn.previousElementSibling;
  copyFeedback(await copyText(input.value, input), 'Linkul pentru rețeaua locală');
});

function renderLobby(s) {
  const me = s.participants.find(p => p.pid === s.you);
  const isHost = s.hostId === s.you;
  const byPid = new Map(s.participants.map(p => [p.pid, p]));
  const seatCount = s.seats.filter(x => x.kind !== 'free').length;

  $('#lobby-code').textContent = s.code;
  $('#lobby-code-input').value = s.code;
  $('#lobby-link').value = inviteLink(s.code);
  if (!lanChecked || $('#lan-hint').dataset.code !== s.code) { $('#lan-hint').dataset.code = s.code; showLanHint(s.code); }

  $('#lobby-seats').innerHTML = s.seats.map(seat => {
    const { color } = seat;
    let body;
    if (seat.kind === 'human') {
      const p = byPid.get(seat.pid);
      const chips = [
        p.pid === s.hostId ? `<span class="chip chip-host">${icon('home', 14)} Gazdă</span>` : '',
        p.pid === s.you ? '<span class="chip chip-you">Tu</span>' : '',
        `<span class="chip" data-kind="${p.connected ? 'ok' : 'off'}">${p.connected ? 'Conectat' : 'Deconectat'}</span>`,
        `<span class="chip" data-kind="${p.ready ? 'ready' : 'wait'}">${p.ready ? `${icon('check', 14)} Pregătit` : 'Nu e pregătit'}</span>`,
      ].join('');
      body = `<p class="lobby-name">${escapeHtml(p.name)}</p><div class="chips">${chips}</div>`;
    } else if (seat.kind === 'ai') {
      body = `<p class="lobby-name">${icon('robot', 18)} AI ${COLOR_NAMES[color]}</p>`;
      body += isHost
        ? `<div class="segmented segmented-full segmented-sm" role="radiogroup" aria-label="Dificultatea AI ${COLOR_NAMES[color]}">
            ${Object.entries(DIFFICULTIES).map(([v, l]) => `<label><input type="radio" name="ai-diff-${color}" data-color="${color}" value="${v}" ${seat.difficulty === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
           </div>
           <button class="btn btn-ghost btn-sm" data-lobby="ai-remove" data-color="${color}">${icon('close', 16)} Elimină AI</button>`
        : `<div class="chips"><span class="chip">Dificultate: ${DIFFICULTIES[seat.difficulty]}</span></div>`;
    } else {
      const btns = [
        me && me.color !== color ? `<button class="btn btn-ghost btn-sm" data-lobby="color" data-color="${color}">${icon('user', 16)} Alege culoarea</button>` : '',
        isHost && seatCount < 4 ? `<button class="btn btn-ghost btn-sm" data-lobby="ai-add" data-color="${color}">${icon('robot', 16)} Adaugă AI</button>` : '',
      ].join('');
      body = `<p class="seat-empty-note">Loc liber</p><div class="lobby-seat-actions">${btns}</div>`;
    }
    return `<section class="seat lobby-seat ${seat.kind === 'free' ? 'is-empty' : ''}" data-color="${color}" aria-label="${COLOR_NAMES[color]}">
      <div class="seat-band">${avatarSvg(color, 46)}<div><b>${COLOR_NAMES[color]}</b><small>simbol: ${SYMBOL_NAMES[color]}</small></div></div>
      <div class="seat-body">${body}</div>
    </section>`;
  }).join('');
  document.querySelectorAll('#lobby-seats .seat').forEach(el => colorVars(el, el.dataset.color));

  const status = $('#lobby-status');
  status.innerHTML = s.startProblem
    ? `${icon('alert', 18)} ${escapeHtml(s.startProblem)}`
    : `${icon('check', 18)} Totul este pregătit. ${isHost ? 'Poți porni partida.' : 'Așteptăm ca gazda să pornească partida.'}`;
  status.classList.toggle('warn', Boolean(s.startProblem));

  const readyBtn = $('#lobby-ready');
  readyBtn.innerHTML = me?.ready ? `${icon('close', 20)} Nu mai sunt pregătit` : `${icon('check', 20)} Sunt pregătit`;
  readyBtn.classList.toggle('btn-primary', !me?.ready);
  readyBtn.classList.toggle('btn-ghost', Boolean(me?.ready));
  const startBtn = $('#lobby-start');
  startBtn.hidden = !isHost;
  startBtn.disabled = Boolean(s.startProblem);
  $('#lobby-role').textContent = isHost ? 'Ești gazda camerei: poți adăuga AI și porni partida.' : `Gazda camerei: ${s.participants.find(p => p.pid === s.hostId)?.name ?? '—'}.`;
  setConn(net.connected);
}

// ---------------------------------------------------------------- intrare în modul online

export const online = {
  open() {
    showOnline();
    net.ready().catch(err => formError(err.message));
  },
  inGame: () => Boolean(game),
  /** La încărcarea paginii: link de invitație sau revenire într-o cameră după reîncărcare. */
  async boot() {
    const params = new URLSearchParams(location.search);
    const invited = (params.get('camera') || '').toUpperCase();
    const session = store.get(SESSION_KEY);
    if (session && (!invited || invited === session.code)) {
      if (await resume()) return;
    }
    if (CODE_RE.test(invited)) {
      $('#invite-banner').hidden = false;
      $('.online-cards').classList.add('invited');   // formularul de intrare apare primul
      $('#invite-banner').innerHTML = `${icon('users', 20)}<span>Ai fost invitat în camera <b>${invited}</b>. Scrie-ți numele și apasă „Intră în cameră”.</span>`;
      showOnline('', invited);
      const name = $('#form-join').name;
      (name.value ? $('#form-join button[type="submit"]') : name).focus();
      net.ready().catch(err => formError(err.message));
    }
  },
};
