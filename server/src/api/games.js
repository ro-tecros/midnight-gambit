'use strict';

const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

// GET /api/games/history  — historial del usuario autenticado
router.get('/history', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const { rows } = await db.query(
      `SELECT id, code, white_name, black_name, white_id, black_id, status, result,
              result_reason, winner_color, initial_ms, increment_ms, started_at, ended_at
       FROM games
       WHERE (white_id = $1 OR black_id = $1) AND status = 'finished'
       ORDER BY ended_at DESC NULLS LAST
       LIMIT $2`,
      [req.user.id, limit]
    );
    const games = rows.map((g) => {
      const userIsWhite = g.white_id === req.user.id;
      let outcome = 'draw';
      if (g.winner_color === 'white') outcome = userIsWhite ? 'win' : 'loss';
      else if (g.winner_color === 'black') outcome = userIsWhite ? 'loss' : 'win';
      return {
        id: g.id,
        code: g.code,
        white: g.white_name,
        black: g.black_name,
        color: userIsWhite ? 'white' : 'black',
        opponent: userIsWhite ? g.black_name : g.white_name,
        result: g.result,
        reason: g.result_reason,
        outcome,
        timeControl: `${Math.round(g.initial_ms / 60000)}+${Math.round(g.increment_ms / 1000)}`,
        endedAt: g.ended_at,
      };
    });
    return res.json({ games });
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

// GET /api/games/:id  — detalle de una partida con movimientos
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Id inválido.' });
    const { rows } = await db.query('SELECT * FROM games WHERE id = $1', [id]);
    const game = rows[0];
    if (!game) return res.status(404).json({ error: 'Partida no encontrada.' });
    const movesRes = await db.query(
      'SELECT ply, san, uci, fen_after, clock_white_ms, clock_black_ms FROM moves WHERE game_id = $1 ORDER BY ply',
      [id]
    );
    return res.json({
      game: {
        id: game.id,
        code: game.code,
        white: game.white_name,
        black: game.black_name,
        result: game.result,
        reason: game.result_reason,
        winnerColor: game.winner_color,
        pgn: game.pgn,
        finalFen: game.final_fen,
        initialMs: game.initial_ms,
        incrementMs: game.increment_ms,
        startedAt: game.started_at,
        endedAt: game.ended_at,
      },
      moves: movesRes.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

module.exports = router;
