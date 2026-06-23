'use strict';

const express = require('express');
const db = require('../db/pool');
const { publicUser } = require('../auth/routes');

const router = express.Router();

// GET /api/users/:username  — perfil público + estadísticas
router.get('/:username', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE lower(username) = lower($1)',
      [req.params.username]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const user = publicUser(rows[0]);
    const winRate = user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0;
    return res.json({ user: { ...user, winRate } });
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

module.exports = router;
