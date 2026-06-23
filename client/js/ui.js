// ui.js — Utilidades de interfaz: cambio de pantallas, modales, notificaciones
// (toasts) y renderizado de listas (lobby, historial, movimientos, chat) y
// barras de jugador.

import { formatTime } from './clock.js';

const $ = (id) => document.getElementById(id);

// ---- Pantallas -------------------------------------------------------------
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

// ---- Modales ---------------------------------------------------------------
export function openModal(id) {
  const el = $(id);
  if (el) el.classList.add('show');
}
export function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('show');
}
export function closeAllModals() {
  document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
}

// ---- Toasts ----------------------------------------------------------------
export function toast(message, type = '') {
  const box = $('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ---- Helpers ---------------------------------------------------------------
function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

export function controlLabel(initialMs, incrementMs) {
  const m = Math.round(initialMs / 60000);
  const inc = Math.round(incrementMs / 1000);
  return `${m}+${inc}`;
}

function controlName(initialMs) {
  const min = initialMs / 60000;
  if (min < 3) return 'Bullet';
  if (min < 6) return 'Blitz';
  if (min < 15) return 'Rapid';
  return 'Clásico';
}

// ---- Chip de usuario / navegación -----------------------------------------
export function renderUserChip(user) {
  if (!user) return;
  const av = $('nav-avatar');
  if (av) {
    av.textContent = initial(user.username);
    av.style.background = user.avatarColor || '#C9A35B';
  }
  $('nav-username').textContent = user.username;
  $('nav-rating').textContent = user.isGuest ? 'Invitado' : `${user.rating ?? 1200}`;
}

// ---- Estadísticas e historial ----------------------------------------------
export function renderStats(user) {
  if (!user) return;
  $('stat-played').textContent = user.gamesPlayed ?? 0;
  $('stat-wins').textContent = user.wins ?? 0;
  const rate = user.gamesPlayed ? Math.round((user.wins / user.gamesPlayed) * 100) : 0;
  $('stat-winrate').textContent = `${rate}%`;
}

export function renderHistory(games) {
  const box = $('history-list');
  if (!box) return;
  if (!games || !games.length) {
    box.innerHTML = '<div class="empty-state">Aún no has jugado partidas.</div>';
    return;
  }
  const label = { win: 'Victoria', loss: 'Derrota', draw: 'Tablas' };
  const cls = { win: 'success', loss: 'danger', draw: 'muted' };
  box.innerHTML = games
    .map((g) => {
      const opp = g.opponent || 'Rival';
      return `<div class="hist-item">
        <span>vs <b>${escapeHtml(opp)}</b> <span style="color:var(--faint)">· ${g.timeControl}</span></span>
        <span class="badge ${cls[g.outcome] || ''}">${label[g.outcome] || g.outcome}</span>
      </div>`;
    })
    .join('');
}

// ---- Lobby: partidas abiertas ----------------------------------------------
export function renderLobby(games, onJoin) {
  const box = $('games-list');
  if (!box) return;
  if (!games || !games.length) {
    box.innerHTML =
      '<div class="empty-state">No hay partidas públicas ahora mismo. ¡Crea la primera!</div>';
    return;
  }
  box.innerHTML = '';
  games.forEach((g) => {
    const item = document.createElement('div');
    item.className = 'game-item';
    item.innerHTML = `
      <div class="gi-host">
        <span class="avatar" style="background:#C9A35B">${initial(g.host)}</span>
        <div>
          <div><b>${escapeHtml(g.host)}</b></div>
          <div style="font-size:.78rem;color:var(--faint)">${controlName(g.initialMs)} · ${g.hostRating}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:.8rem">
        <span class="gi-tc">${controlLabel(g.initialMs, g.incrementMs)}</span>
        <button class="btn sm">Unirse</button>
      </div>`;
    item.querySelector('button').addEventListener('click', () => onJoin(g.code));
    box.appendChild(item);
  });
}

// ---- Barras de jugador -----------------------------------------------------
export function renderPlayers(state, orientation) {
  const bottomColor = orientation === 'black' ? 'black' : 'white';
  const topColor = bottomColor === 'white' ? 'black' : 'white';
  paintBar('bottom', state.players[bottomColor]);
  paintBar('top', state.players[topColor]);
}

function paintBar(pos, player) {
  const av = $(`${pos}-avatar`);
  const name = $(`${pos}-name`);
  const rating = $(`${pos}-rating`);
  const dot = $(`${pos}-conn`);
  if (!player) {
    name.textContent = 'Esperando rival…';
    rating.textContent = '—';
    av.textContent = '?';
    av.style.background = '#3a4150';
    dot.classList.add('off');
    return;
  }
  name.textContent = player.username;
  rating.textContent = `${player.rating ?? ''}`;
  av.textContent = initial(player.username);
  av.style.background = player.avatarColor || '#C9A35B';
  dot.classList.toggle('off', !player.connected);
}

// ---- Lista de movimientos --------------------------------------------------
export function renderMoves(history) {
  const body = $('moves-body');
  if (!body) return;
  body.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const tr = document.createElement('tr');
    const no = Math.floor(i / 2) + 1;
    const white = history[i] ? history[i].san : '';
    const black = history[i + 1] ? history[i + 1].san : '';
    tr.innerHTML = `<td class="mv-no">${no}.</td><td class="mv">${white}</td><td class="mv">${black}</td>`;
    body.appendChild(tr);
  }
  const wrap = $('moves');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// ---- Chat ------------------------------------------------------------------
export function renderChat(messages) {
  const log = $('chat-log');
  if (!log) return;
  log.innerHTML = '';
  (messages || []).forEach(appendChatMessage);
}

export function appendChatMessage(msg) {
  const log = $('chat-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="who ${msg.color}">${escapeHtml(msg.author)}:</span> <span class="txt">${escapeHtml(
    msg.text
  )}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ---- Banner de conexión ----------------------------------------------------
export function setConnBanner(show, text) {
  const b = $('conn-banner');
  if (!b) return;
  if (text) b.textContent = text;
  b.classList.toggle('show', show);
}

// ---- Seguridad -------------------------------------------------------------
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export { formatTime };
