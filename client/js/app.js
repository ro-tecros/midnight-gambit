// app.js — Controlador principal del cliente. Orquesta autenticación, lobby,
// emparejamiento, sala de juego, relojes, chat y reconexión. Conecta los
// módulos api/socket/board/clock/ui con el DOM definido en index.html.

import { api, getToken, setSession, getStoredUser, clearSession } from './api.js';
import { gameSocket } from './socket.js';
import { BoardController } from './board.js';
import { ClockController } from './clock.js';
import { pieceSVG } from './pieces.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

// ---- Controles de tiempo predefinidos -------------------------------------
const TIME_CONTROLS = [
  { cat: 'Bullet', label: '1+0', min: 1, inc: 0 },
  { cat: 'Bullet', label: '2+1', min: 2, inc: 1 },
  { cat: 'Blitz', label: '3+0', min: 3, inc: 0 },
  { cat: 'Blitz', label: '3+2', min: 3, inc: 2 },
  { cat: 'Blitz', label: '5+0', min: 5, inc: 0 },
  { cat: 'Rapid', label: '10+0', min: 10, inc: 0 },
  { cat: 'Rapid', label: '15+10', min: 15, inc: 10 },
  { cat: 'Clásico', label: '30+0', min: 30, inc: 0 },
  { cat: 'Personal.', label: 'Otro', custom: true },
];

const state = {
  user: null,
  selected: { initialMs: 300000, incrementMs: 0, custom: false },
  game: null, // { code, myColor, status }
};

let board;
let clock;

// ===========================================================================
//  ARRANQUE
// ===========================================================================
async function boot() {
  buildTimeControls();
  buildHeroBoard();
  wireAuth();
  wireLobby();
  wireGame();
  wireModals();

  board = new BoardController($('board'), {
    onMove: (m) => gameSocket.emit('game:move', m),
    requestPromotion,
  });
  clock = new ClockController({ topEl: $('top-clock'), bottomEl: $('bottom-clock') });

  // ¿Sesión existente?
  if (getToken()) {
    try {
      const { user } = await api.me();
      state.user = user;
      enterApp();
    } catch {
      clearSession();
      ui.showScreen('screen-auth');
    }
  } else {
    ui.showScreen('screen-auth');
  }
}

// ===========================================================================
//  AUTENTICACIÓN
// ===========================================================================
function wireAuth() {
  $('tab-login').addEventListener('click', () => switchAuthTab('login'));
  $('tab-register').addEventListener('click', () => switchAuthTab('register'));

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').textContent = '';
    try {
      const { token, user } = await api.login($('login-id').value.trim(), $('login-pass').value);
      setSession(token, user);
      state.user = user;
      enterApp();
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  });

  $('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('reg-error').textContent = '';
    try {
      const { token, user } = await api.register(
        $('reg-user').value.trim(),
        $('reg-email').value.trim(),
        $('reg-pass').value
      );
      setSession(token, user);
      state.user = user;
      enterApp();
    } catch (err) {
      $('reg-error').textContent = err.message;
    }
  });

  $('btn-guest').addEventListener('click', async () => {
    try {
      const { token, user } = await api.guest('');
      setSession(token, user);
      state.user = user;
      enterApp();
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  });

  $('btn-logout').addEventListener('click', () => {
    gameSocket.disconnect();
    clearSession();
    state.user = null;
    state.game = null;
    ui.showScreen('screen-auth');
  });
}

function switchAuthTab(which) {
  const login = which === 'login';
  $('tab-login').classList.toggle('active', login);
  $('tab-register').classList.toggle('active', !login);
  $('form-login').hidden = !login;
  $('form-register').hidden = login;
}

async function enterApp() {
  ui.renderUserChip(state.user);
  ui.showScreen('screen-home');
  connectSocket();
  await refreshHomeData();
  handleDeepLink();
}

async function refreshHomeData() {
  try {
    const { user } = await api.me();
    state.user = user;
    ui.renderUserChip(user);
    ui.renderStats(user);
  } catch {
    /* sesión inválida se gestiona en otro punto */
  }
  if (!state.user || state.user.isGuest) {
    ui.renderHistory([]);
    return;
  }
  try {
    const { games } = await api.history();
    ui.renderHistory(games);
  } catch {
    ui.renderHistory([]);
  }
}

// ===========================================================================
//  SOCKET
// ===========================================================================
function connectSocket() {
  gameSocket.connect();
  registerSocketEvents();
  gameSocket.emit('lobby:subscribe');

  gameSocket.onStatus((status) => {
    const onGame = $('screen-game').classList.contains('active');
    if (status === 'connected') {
      ui.setConnBanner(false);
      if (state.game && state.game.code) gameSocket.emit('game:join', { code: state.game.code });
    } else if (onGame) {
      ui.setConnBanner(true, status === 'reconnecting' ? 'Reconectando…' : 'Conexión perdida… reintentando.');
    }
  });
}

let socketWired = false;
function registerSocketEvents() {
  if (socketWired) return;
  socketWired = true;

  gameSocket.on('lobby:games', (games) => ui.renderLobby(games, joinByCode));

  gameSocket.on('lobby:waiting', () => toggleQuickWaiting(true));
  gameSocket.on('lobby:waitingCancelled', () => toggleQuickWaiting(false));
  gameSocket.on('lobby:matched', ({ code }) => {
    toggleQuickWaiting(false);
    gameSocket.emit('game:join', { code });
  });

  gameSocket.on('game:joined', ({ code, color, state: gs }) => {
    state.game = { code, myColor: color === 'spectator' ? null : color, status: gs.status };
    enterGame(gs);
  });

  gameSocket.on('game:state', (gs) => applyGameState(gs));

  gameSocket.on('game:over', ({ result, reason, winnerColor, state: gs }) => {
    applyGameState(gs);
    showGameOver(result, reason, winnerColor);
  });

  gameSocket.on('move:rejected', ({ error }) => {
    ui.toast(error || 'Movimiento rechazado.', 'error');
  });

  gameSocket.on('chat:message', (msg) => ui.appendChatMessage(msg));

  gameSocket.on('draw:offered', ({ by }) => {
    if (state.game && by !== state.game.myColor) {
      $('draw-text').textContent = 'Tu rival ofrece tablas.';
      ui.openModal('overlay-draw');
    }
  });
  gameSocket.on('draw:declined', () => ui.toast('Tu oferta de tablas fue rechazada.'));

  gameSocket.on('rematch:offered', ({ by }) => {
    if (state.game && by !== state.game.myColor) ui.toast('Tu rival quiere la revancha.');
  });
  gameSocket.on('rematch:start', ({ code }) => {
    ui.closeAllModals();
    ui.toast('¡Revancha! Colores invertidos.', 'success');
    gameSocket.emit('game:join', { code });
  });

  gameSocket.on('error:msg', ({ error }) => ui.toast(error, 'error'));
}

// ===========================================================================
//  LOBBY
// ===========================================================================
function wireLobby() {
  $('btn-play-now').addEventListener('click', () => {
    $('tc-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    quickplay();
  });
  $('btn-create-scroll').addEventListener('click', () => {
    $('tc-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('btn-create-game').addEventListener('click', () => createGame());
  $('btn-quickplay').addEventListener('click', () => quickplay());
  $('btn-cancel-quick').addEventListener('click', () => {
    gameSocket.emit('lobby:cancelQuickplay');
    toggleQuickWaiting(false);
  });
  $('btn-refresh-list').addEventListener('click', () => gameSocket.emit('lobby:list'));
  $('btn-join-code').addEventListener('click', () => {
    const code = $('join-code').value.trim().toUpperCase();
    if (code) joinByCode(code);
  });
  $('join-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-join-code').click();
  });
}

function buildTimeControls() {
  const grid = $('tc-grid');
  grid.innerHTML = '';
  TIME_CONTROLS.forEach((tc, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tc';
    card.innerHTML = `<div class="cat">${tc.cat}</div><div class="time">${tc.label}</div>
      <div class="sub">${tc.custom ? 'A tu medida' : 'min + seg/jugada'}</div>`;
    card.addEventListener('click', () => selectTimeControl(idx, card));
    grid.appendChild(card);
    if (tc.label === '5+0') {
      card.classList.add('selected');
    }
  });
}

function selectTimeControl(idx, card) {
  document.querySelectorAll('.tc').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  const tc = TIME_CONTROLS[idx];
  if (tc.custom) {
    $('custom-time').hidden = false;
    state.selected.custom = true;
  } else {
    $('custom-time').hidden = true;
    state.selected = { initialMs: tc.min * 60000, incrementMs: tc.inc * 1000, custom: false };
  }
}

function resolveTimeControl() {
  if (state.selected.custom) {
    const min = Math.min(90, Math.max(1, parseInt($('custom-min').value, 10) || 10));
    const inc = Math.min(60, Math.max(0, parseInt($('custom-inc').value, 10) || 0));
    return { initialMs: min * 60000, incrementMs: inc * 1000 };
  }
  return { initialMs: state.selected.initialMs, incrementMs: state.selected.incrementMs };
}

function createGame() {
  const tc = resolveTimeControl();
  gameSocket.emit('lobby:create', { ...tc, isPrivate: $('private-toggle').checked });
}

function quickplay() {
  const tc = resolveTimeControl();
  toggleQuickWaiting(true);
  gameSocket.emit('lobby:quickplay', tc);
}

function joinByCode(code) {
  gameSocket.emit('game:join', { code });
}

function toggleQuickWaiting(on) {
  $('quick-waiting').hidden = !on;
  $('btn-quickplay').disabled = on;
  $('btn-play-now').disabled = on;
}

function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    history.replaceState({}, '', location.pathname);
    joinByCode(code.toUpperCase());
  }
}

// ===========================================================================
//  SALA DE JUEGO
// ===========================================================================
function wireGame() {
  $('btn-home').addEventListener('click', () => leaveGame());
  $('btn-leave').addEventListener('click', () => leaveGame());
  $('btn-flip').addEventListener('click', () => {
    board.flip();
    clock.setOrientation(board.orientation);
    if (lastState) ui.renderPlayers(lastState, board.orientation);
  });
  $('btn-resign').addEventListener('click', () => {
    if (confirm('¿Seguro que quieres rendirte?')) gameSocket.emit('game:resign');
  });
  $('btn-draw').addEventListener('click', () => {
    gameSocket.emit('game:offerDraw');
    ui.toast('Oferta de tablas enviada.');
  });
  $('btn-rematch').addEventListener('click', () => gameSocket.emit('game:rematch'));
  $('btn-share').addEventListener('click', () => openShare());
  $('btn-send-chat').addEventListener('click', sendChat);
  $('chat-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

function sendChat() {
  const input = $('chat-text');
  const text = input.value.trim();
  if (!text) return;
  gameSocket.emit('chat:send', { text });
  input.value = '';
}

function leaveGame() {
  state.game = null;
  ui.setConnBanner(false);
  clock.stop();
  ui.showScreen('screen-home');
  gameSocket.emit('lobby:list');
  refreshHomeData();
}

let lastState = null;

function enterGame(gs) {
  ui.closeAllModals();
  ui.showScreen('screen-game');
  $('btn-rematch').hidden = true;
  $('chat-log').innerHTML = '';
  const orientation = state.game.myColor === 'black' ? 'black' : 'white';
  board.lastMove = null;
  board.selected = null;
  board.legalTargets.clear();
  board.setOrientation(orientation);
  clock.setOrientation(orientation);
  $('game-code-tag').textContent = `#${gs.code}`;
  ui.renderChat(gs.chat || []);
  applyGameState(gs);
}

function applyGameState(gs) {
  lastState = gs;
  if (state.game) state.game.status = gs.status;
  const orientation = board.orientation;

  const myChar = state.game && state.game.myColor ? state.game.myColor[0] : null;
  const interactive = gs.status === 'active' && myChar && gs.turn === myChar;

  board.setPosition({
    fen: gs.fen,
    lastMove: gs.history && gs.history.length ? gs.history[gs.history.length - 1] : null,
    myColor: state.game ? state.game.myColor : null,
    interactive: !!interactive,
  });

  ui.renderPlayers(gs, orientation);
  ui.renderMoves(gs.history || []);

  const runningColor =
    gs.status === 'active' && gs.clock.running ? (gs.turn === 'w' ? 'white' : 'black') : null;
  clock.sync({ white: gs.clock.white, black: gs.clock.black, runningColor });
  if (gs.status !== 'active') clock.stop();

  // Botones según estado.
  const playing = gs.status === 'active' && myChar;
  $('btn-resign').disabled = !playing;
  $('btn-draw').disabled = !playing;
  if (gs.status === 'finished') {
    $('btn-rematch').hidden = !(state.game && state.game.myColor);
  }
}

const REASONS = {
  checkmate: 'Jaque mate',
  resign: 'Abandono',
  timeout: 'Tiempo agotado',
  timeout_vs_insufficient: 'Tiempo agotado · material insuficiente',
  stalemate: 'Rey ahogado',
  insufficient_material: 'Material insuficiente',
  threefold: 'Triple repetición',
  fifty_move: 'Regla de las 50 jugadas',
  agreement: 'Tablas acordadas',
  abandonment: 'Abandono por desconexión',
};

function showGameOver(result, reason, winnerColor) {
  const badge = result === '1-0' ? '1–0' : result === '0-1' ? '0–1' : '½–½';
  $('over-result').textContent = badge;
  let title;
  if (!winnerColor) {
    title = 'Tablas';
  } else if (state.game && state.game.myColor === winnerColor) {
    title = '¡Has ganado!';
  } else if (state.game && state.game.myColor) {
    title = 'Has perdido';
  } else {
    title = winnerColor === 'white' ? 'Ganan las blancas' : 'Ganan las negras';
  }
  $('over-title').textContent = title;
  $('over-sub').textContent = REASONS[reason] || '';
  ui.openModal('overlay-over');
}

function requestPromotion(color) {
  return new Promise((resolve) => {
    const grid = $('promo-grid');
    grid.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = pieceSVG(t, color === 'white' ? 'w' : 'b');
      const svg = btn.querySelector('svg');
      if (svg) svg.classList.add('piece-vec', color);
      btn.addEventListener('click', () => {
        ui.closeModal('overlay-promo');
        resolve(t);
      });
      grid.appendChild(btn);
    });
    ui.openModal('overlay-promo');
  });
}

function openShare() {
  if (!state.game) return;
  const code = state.game.code;
  $('share-code').textContent = code;
  const link = `${location.origin}/?code=${code}`;
  $('btn-copy-code').onclick = () => copyText(code, 'Código copiado.');
  $('btn-copy-link').onclick = () => copyText(link, 'Enlace copiado.');
  ui.openModal('overlay-share');
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    ui.toast(okMsg, 'success');
  } catch {
    // Reserva: selección manual.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ui.toast(okMsg, 'success');
    } catch {
      ui.toast('No se pudo copiar.', 'error');
    }
    ta.remove();
  }
}

// ===========================================================================
//  MODALES
// ===========================================================================
function wireModals() {
  $('over-rematch').addEventListener('click', () => {
    gameSocket.emit('game:rematch');
    ui.toast('Revancha solicitada.');
  });
  $('over-home').addEventListener('click', () => {
    ui.closeModal('overlay-over');
    leaveGame();
  });
  $('draw-accept').addEventListener('click', () => {
    gameSocket.emit('game:respondDraw', { accept: true });
    ui.closeModal('overlay-draw');
  });
  $('draw-decline').addEventListener('click', () => {
    gameSocket.emit('game:respondDraw', { accept: false });
    ui.closeModal('overlay-draw');
  });
  $('share-close').addEventListener('click', () => ui.closeModal('overlay-share'));

  // Recuperación de contraseña.
  $('link-forgot').addEventListener('click', () => ui.openModal('overlay-forgot'));
  $('forgot-close').addEventListener('click', () => ui.closeModal('overlay-forgot'));
  $('forgot-send').addEventListener('click', async () => {
    const email = $('forgot-email').value.trim();
    $('forgot-msg').textContent = '';
    try {
      const res = await api.forgotPassword(email);
      $('forgot-reset').hidden = false;
      $('forgot-do-reset').hidden = false;
      if (res.devResetToken) {
        $('reset-token').value = res.devResetToken;
        $('forgot-msg').textContent = 'Token generado (modo desarrollo). Define tu nueva contraseña.';
      } else {
        $('forgot-msg').textContent = 'Si el correo existe, recibirás instrucciones.';
      }
    } catch (err) {
      $('forgot-msg').textContent = err.message;
    }
  });
  $('forgot-do-reset').addEventListener('click', async () => {
    try {
      await api.resetPassword($('reset-token').value.trim(), $('reset-pass').value);
      ui.toast('Contraseña actualizada. Inicia sesión.', 'success');
      ui.closeModal('overlay-forgot');
    } catch (err) {
      $('forgot-msg').textContent = err.message;
    }
  });

  // Cerrar modales al pulsar el fondo.
  document.querySelectorAll('.overlay').forEach((ov) => {
    ov.addEventListener('click', (e) => {
      if (e.target === ov && ov.id !== 'overlay-promo' && ov.id !== 'overlay-over') {
        ov.classList.remove('show');
      }
    });
  });
}

// ---- Tablero decorativo del hero ------------------------------------------
function buildHeroBoard() {
  const hb = $('hero-board');
  if (!hb) return;
  const layout = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', '', '', 'p', 'p', 'p'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', 'p', 'p', '', '', ''],
    ['', '', '', 'P', 'P', '', '', ''],
    ['', '', 'N', '', '', '', '', ''],
    ['P', 'P', 'P', '', '', 'P', 'P', 'P'],
    ['R', '', 'B', 'Q', 'K', 'B', 'N', 'R'],
  ];
  hb.innerHTML = '';
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const cell = document.createElement('i');
      const light = (r + c) % 2 === 1;
      cell.style.background = light ? 'var(--board-light)' : 'var(--board-dark)';
      cell.style.display = 'grid';
      cell.style.placeItems = 'center';
      const ch = layout[r][c];
      if (ch) {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        cell.innerHTML = pieceSVG(ch.toLowerCase(), color);
        const svg = cell.querySelector('svg');
        if (svg) {
          svg.classList.add('piece-vec', color === 'w' ? 'white' : 'black');
          svg.style.width = '84%';
          svg.style.height = '84%';
        }
      }
      hb.appendChild(cell);
    }
  }
}

// ---- Inicio ----------------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
