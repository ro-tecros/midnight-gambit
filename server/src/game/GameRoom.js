'use strict';

const { Chess } = require('chess.js');
const Clock = require('./Clock');
const { cleanChat } = require('../utils/sanitize');

const COLORS = { w: 'white', b: 'black' };

/**
 * Representa una única partida en vivo. La validación de reglas es
 * autoritativa en el servidor mediante chess.js (jaque, mate, ahogado,
 * enroques, captura al paso, promoción, 50 jugadas, triple repetición,
 * material insuficiente).
 */
class GameRoom {
  constructor({ code, isPrivate, isRated, initialMs, incrementMs, io, persistence, manager }) {
    this.code = code;
    this.isPrivate = isPrivate;
    this.isRated = isRated;
    this.initialMs = initialMs;
    this.incrementMs = incrementMs;
    this.io = io;
    this.persistence = persistence;
    this.manager = manager;

    this.chess = new Chess();
    this.clock = new Clock(initialMs, incrementMs);

    this.players = { w: null, b: null }; // { userId, username, avatarColor, rating, connected, socketId }
    this.spectators = new Set();

    this.status = 'waiting'; // waiting | active | finished
    this.result = null; // '1-0' | '0-1' | '1/2-1/2'
    this.resultReason = null;
    this.winnerColor = null; // 'white' | 'black' | null

    this.chatLog = [];
    this.drawOfferBy = null; // 'w' | 'b' | null
    this.rematchOffers = { w: false, b: false };
    this.abandonTimers = {}; // userId -> timeout
    this.startedAt = null;
    this.endedAt = null;
    this.persisted = false;
  }

  get roomName() {
    return `game:${this.code}`;
  }

  isFull() {
    return this.players.w && this.players.b;
  }

  colorOfUser(userId) {
    if (this.players.w && this.players.w.userId === userId) return 'w';
    if (this.players.b && this.players.b.userId === userId) return 'b';
    return null;
  }

  /** Sienta a un jugador. Devuelve el color asignado o null si está lleno. */
  seatPlayer(user, socket) {
    const existing = this.colorOfUser(user.id);
    if (existing) {
      // Reconexión.
      this.players[existing].connected = true;
      this.players[existing].socketId = socket.id;
      this._clearAbandon(user.id);
      socket.join(this.roomName);
      this.maybeStart();
      return existing;
    }
    let color = null;
    if (!this.players.w && !this.players.b) {
      color = Math.random() < 0.5 ? 'w' : 'b';
    } else if (!this.players.w) {
      color = 'w';
    } else if (!this.players.b) {
      color = 'b';
    } else {
      return null; // lleno -> espectador
    }
    this.players[color] = {
      userId: user.id,
      username: user.username,
      avatarColor: user.avatarColor || '#C9A35B',
      rating: user.rating || 1200,
      connected: true,
      socketId: socket.id,
    };
    socket.join(this.roomName);
    this.maybeStart();
    return color;
  }

  addSpectator(socket) {
    this.spectators.add(socket.id);
    socket.join(this.roomName);
  }

  maybeStart() {
    if (
      this.status === 'waiting' &&
      this.isFull() &&
      this.players.w.connected &&
      this.players.b.connected
    ) {
      this.status = 'active';
      this.startedAt = new Date();
      this.clock.start('w');
    }
  }

  // ---- Jugadas -------------------------------------------------------------

  handleMove(userId, { from, to, promotion }) {
    if (this.status !== 'active') return { error: 'La partida no está activa.' };
    const color = this.colorOfUser(userId);
    if (!color) return { error: 'No eres jugador de esta partida.' };
    if (this.chess.turn() !== color) return { error: 'No es tu turno.' };

    let move;
    try {
      move = this.chess.move({ from, to, promotion: promotion || 'q' });
    } catch (e) {
      move = null;
    }
    if (!move) return { error: 'Movimiento ilegal.' };

    // El reloj del que movió: descuenta tiempo + incremento, pasa turno.
    this.clock.press(color);
    this.drawOfferBy = null; // cualquier jugada anula la oferta de tablas

    this._checkGameEndByPosition(color);
    this.broadcastState({ lastMove: { from: move.from, to: move.to, san: move.san } });
    return { ok: true };
  }

  _checkGameEndByPosition(moverColor) {
    const c = this.chess;
    if (c.isCheckmate()) {
      const winner = COLORS[moverColor];
      return this.finish(moverColor === 'w' ? '1-0' : '0-1', 'checkmate', winner);
    }
    if (c.isStalemate()) return this.finish('1/2-1/2', 'stalemate', null);
    if (c.isInsufficientMaterial()) return this.finish('1/2-1/2', 'insufficient_material', null);
    if (typeof c.isThreefoldRepetition === 'function' && c.isThreefoldRepetition()) {
      return this.finish('1/2-1/2', 'threefold', null);
    }
    if (c.isDraw()) return this.finish('1/2-1/2', 'fifty_move', null);
    return null;
  }

  // ---- Reloj ---------------------------------------------------------------

  /** Llamado periódicamente por el manager para detectar caída de bandera. */
  checkClock() {
    if (this.status !== 'active') return;
    const flagged = this.clock.flaggedColor();
    if (!flagged) return;
    this.clock.pause();
    const winnerColor = flagged === 'w' ? 'b' : 'w';
    // Si el rival no tiene material para dar mate -> tablas por tiempo.
    if (this.chess.isInsufficientMaterial()) {
      return this.finish('1/2-1/2', 'timeout_vs_insufficient', null);
    }
    return this.finish(
      winnerColor === 'w' ? '1-0' : '0-1',
      'timeout',
      COLORS[winnerColor]
    );
  }

  // ---- Acciones de jugador -------------------------------------------------

  resign(userId) {
    if (this.status !== 'active') return;
    const color = this.colorOfUser(userId);
    if (!color) return;
    const winnerColor = color === 'w' ? 'b' : 'w';
    this.clock.pause();
    this.finish(winnerColor === 'w' ? '1-0' : '0-1', 'resign', COLORS[winnerColor]);
  }

  offerDraw(userId) {
    if (this.status !== 'active') return;
    const color = this.colorOfUser(userId);
    if (!color) return;
    this.drawOfferBy = color;
    this.io.to(this.roomName).emit('draw:offered', { by: COLORS[color] });
  }

  respondDraw(userId, accept) {
    if (this.status !== 'active' || !this.drawOfferBy) return;
    const color = this.colorOfUser(userId);
    if (!color || color === this.drawOfferBy) return;
    if (accept) {
      this.clock.pause();
      this.finish('1/2-1/2', 'agreement', null);
    } else {
      this.drawOfferBy = null;
      this.io.to(this.roomName).emit('draw:declined', {});
    }
  }

  sendChat(userId, text) {
    const color = this.colorOfUser(userId);
    const author = color
      ? this.players[color].username
      : 'Espectador';
    const message = {
      author,
      color: color ? COLORS[color] : 'spectator',
      text: cleanChat(text),
      at: Date.now(),
    };
    if (!message.text) return;
    this.chatLog.push(message);
    if (this.chatLog.length > 200) this.chatLog.shift();
    this.io.to(this.roomName).emit('chat:message', message);
  }

  requestRematch(userId) {
    if (this.status !== 'finished') return;
    const color = this.colorOfUser(userId);
    if (!color) return;
    this.rematchOffers[color] = true;
    this.io.to(this.roomName).emit('rematch:offered', { by: COLORS[color] });
    if (this.rematchOffers.w && this.rematchOffers.b) {
      this._startRematch();
    }
  }

  _startRematch() {
    // Nueva partida con colores invertidos, mismo control de tiempo.
    const newCode = this.manager.generateCode();
    const room = this.manager.createRoomWithCode(newCode, {
      isPrivate: this.isPrivate,
      isRated: this.isRated,
      initialMs: this.initialMs,
      incrementMs: this.incrementMs,
    });
    // Invierte colores.
    room.players.w = this.players.b ? { ...this.players.b, connected: false } : null;
    room.players.b = this.players.w ? { ...this.players.w, connected: false } : null;
    this.io.to(this.roomName).emit('rematch:start', { code: newCode });
  }

  // ---- Conexión / abandono -------------------------------------------------

  onDisconnect(userId, graceSeconds) {
    const color = this.colorOfUser(userId);
    if (!color) {
      return;
    }
    this.players[color].connected = false;
    this.broadcastState();
    if (this.status === 'active') {
      this._clearAbandon(userId);
      this.abandonTimers[userId] = setTimeout(() => {
        if (this.status === 'active' && !this.players[color].connected) {
          const winnerColor = color === 'w' ? 'b' : 'w';
          this.clock.pause();
          this.finish(winnerColor === 'w' ? '1-0' : '0-1', 'abandonment', COLORS[winnerColor]);
        }
      }, graceSeconds * 1000);
    }
  }

  _clearAbandon(userId) {
    if (this.abandonTimers[userId]) {
      clearTimeout(this.abandonTimers[userId]);
      delete this.abandonTimers[userId];
    }
  }

  // ---- Fin de partida ------------------------------------------------------

  finish(result, reason, winnerColor) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.result = result;
    this.resultReason = reason;
    this.winnerColor = winnerColor;
    this.endedAt = new Date();
    Object.keys(this.abandonTimers).forEach((id) => this._clearAbandon(id));

    this.io.to(this.roomName).emit('game:over', {
      result,
      reason,
      winnerColor,
      state: this.state(),
    });

    if (!this.persisted && this.persistence) {
      this.persisted = true;
      this.persistence(this).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[persist]', err.message);
      });
    }
    this.manager.scheduleCleanup(this.code);
  }

  // ---- Serialización -------------------------------------------------------

  publicPlayer(color) {
    const p = this.players[color];
    if (!p) return null;
    return {
      username: p.username,
      avatarColor: p.avatarColor,
      rating: p.rating,
      connected: p.connected,
      color: COLORS[color],
    };
  }

  state(extra = {}) {
    const clock = this.clock.snapshot();
    const history = this.chess.history({ verbose: true }).map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      color: m.color,
    }));
    return {
      code: this.code,
      status: this.status,
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      inCheck: this.chess.inCheck(),
      isPrivate: this.isPrivate,
      players: { white: this.publicPlayer('w'), black: this.publicPlayer('b') },
      clock: { white: clock.white, black: clock.black, running: clock.running },
      timeControl: { initialMs: this.initialMs, incrementMs: this.incrementMs },
      history,
      result: this.result,
      resultReason: this.resultReason,
      winnerColor: this.winnerColor,
      drawOfferBy: this.drawOfferBy ? COLORS[this.drawOfferBy] : null,
      chat: this.chatLog.slice(-50),
      ...extra,
    };
  }

  broadcastState(extra = {}) {
    this.io.to(this.roomName).emit('game:state', this.state(extra));
  }
}

module.exports = { GameRoom, COLORS };
