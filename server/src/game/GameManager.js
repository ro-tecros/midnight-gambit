'use strict';

const crypto = require('crypto');
const { GameRoom } = require('./GameRoom');
const db = require('../db/pool');
const config = require('../config');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // code -> GameRoom
    this.queues = new Map(); // controlKey -> [{ userId, user, socket, resolve }]
    this.cleanupTimers = new Map();

    // Tick global de relojes: detecta caídas de bandera.
    this.tickInterval = setInterval(() => {
      this.rooms.forEach((room) => room.checkClock());
    }, 250);
  }

  generateCode(len = 6) {
    let code;
    do {
      code = Array.from({ length: len }, () =>
        CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  persistGame = async (room) => {
    const w = room.players.w;
    const b = room.players.b;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const gameRes = await client.query(
        `INSERT INTO games
          (code, white_id, black_id, white_name, black_name, status, result, result_reason,
           winner_color, is_private, is_rated, initial_ms, increment_ms, pgn, final_fen, started_at, ended_at)
         VALUES ($1,$2,$3,$4,$5,'finished',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          room.code,
          w ? w.userId : null,
          b ? b.userId : null,
          w ? w.username : null,
          b ? b.username : null,
          room.result,
          room.resultReason,
          room.winnerColor,
          room.isPrivate,
          room.isRated,
          room.initialMs,
          room.incrementMs,
          room.chess.pgn(),
          room.chess.fen(),
          room.startedAt,
          room.endedAt,
        ]
      );
      const gameId = gameRes.rows[0].id;

      const history = room.chess.history({ verbose: true });
      for (let i = 0; i < history.length; i += 1) {
        const m = history[i];
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO moves (game_id, ply, san, uci, fen_after)
           VALUES ($1,$2,$3,$4,$5)`,
          [gameId, i + 1, m.san, `${m.from}${m.to}${m.promotion || ''}`, m.after]
        );
      }

      // Actualiza estadísticas y rating (Elo simple K=32) de jugadores registrados.
      const spentW = Math.max(0, room.initialMs - room.clock.remaining.w);
      const spentB = Math.max(0, room.initialMs - room.clock.remaining.b);
      await this._updateStats(client, w, b, room.winnerColor, spentW);
      await this._updateStats(client, b, w, room.winnerColor, spentB, true);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  async _updateStats(client, player, opponent, winnerColor, spentMs, isBlack = false) {
    if (!player) return;
    const myColor = isBlack ? 'black' : 'white';
    let outcome = 'draw';
    if (winnerColor === myColor) outcome = 'win';
    else if (winnerColor && winnerColor !== myColor) outcome = 'loss';

    const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const ratingA = player.rating || 1200;
    const ratingB = opponent ? opponent.rating || 1200 : 1200;
    const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
    const newRating = Math.round(ratingA + 32 * (score - expected));

    await client.query(
      `UPDATE users SET
         games_played = games_played + 1,
         wins   = wins   + $1,
         losses = losses + $2,
         draws  = draws  + $3,
         time_played_ms = time_played_ms + $4,
         rating = CASE WHEN is_guest THEN rating ELSE $5 END
       WHERE id = $6`,
      [
        outcome === 'win' ? 1 : 0,
        outcome === 'loss' ? 1 : 0,
        outcome === 'draw' ? 1 : 0,
        Math.round(spentMs),
        newRating,
        player.userId,
      ]
    );
  }

  createRoomWithCode(code, opts) {
    const room = new GameRoom({
      code,
      isPrivate: !!opts.isPrivate,
      isRated: opts.isRated !== false,
      initialMs: opts.initialMs,
      incrementMs: opts.incrementMs,
      io: this.io,
      persistence: this.persistGame,
      manager: this,
    });
    this.rooms.set(code, room);
    return room;
  }

  createRoom(opts) {
    return this.createRoomWithCode(this.generateCode(), opts);
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  /** Lista de partidas públicas esperando rival. */
  listOpenGames() {
    const list = [];
    this.rooms.forEach((room) => {
      if (room.status === 'waiting' && !room.isPrivate && !room.isFull()) {
        const host = room.players.w || room.players.b;
        list.push({
          code: room.code,
          host: host ? host.username : 'Anfitrión',
          hostRating: host ? host.rating : 1200,
          initialMs: room.initialMs,
          incrementMs: room.incrementMs,
        });
      }
    });
    return list.sort((a, b) => a.initialMs - b.initialMs);
  }

  // ---- Emparejamiento automático ------------------------------------------

  controlKey(initialMs, incrementMs) {
    return `${initialMs}+${incrementMs}`;
  }

  /**
   * Empareja al jugador con otro en cola para el mismo control de tiempo.
   * Si no hay nadie, lo deja esperando y devuelve { waiting: true }.
   */
  matchmake(user, socket, initialMs, incrementMs) {
    const key = this.controlKey(initialMs, incrementMs);
    if (!this.queues.has(key)) this.queues.set(key, []);
    const queue = this.queues.get(key);

    // Evita duplicados del mismo usuario en cola.
    const idx = queue.findIndex((e) => e.userId === user.id);
    if (idx !== -1) queue.splice(idx, 1);

    if (queue.length > 0) {
      const opponent = queue.shift();
      const room = this.createRoom({ isPrivate: false, isRated: true, initialMs, incrementMs });
      return { matched: true, room, opponent };
    }
    queue.push({ userId: user.id, user, socketId: socket.id });
    return { waiting: true, key };
  }

  cancelMatchmaking(userId) {
    this.queues.forEach((queue) => {
      const idx = queue.findIndex((e) => e.userId === userId);
      if (idx !== -1) queue.splice(idx, 1);
    });
  }

  // ---- Limpieza ------------------------------------------------------------

  scheduleCleanup(code, delayMs = 5 * 60 * 1000) {
    if (this.cleanupTimers.has(code)) clearTimeout(this.cleanupTimers.get(code));
    const t = setTimeout(() => {
      this.rooms.delete(code);
      this.cleanupTimers.delete(code);
    }, delayMs);
    this.cleanupTimers.set(code, t);
  }

  removeEmptyRoom(code) {
    const room = this.rooms.get(code);
    if (room && room.status === 'waiting' && !room.isFull()) {
      const anyone = room.players.w || room.players.b;
      if (!anyone) this.rooms.delete(code);
    }
  }
}

module.exports = { GameManager, RECONNECT_GRACE: config.reconnectGraceSeconds };
