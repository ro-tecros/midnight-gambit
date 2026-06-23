'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const db = require('../db/pool');
const { signToken } = require('./jwt');
const { requireAuth } = require('./middleware');
const { clean, validUsername, validEmail } = require('../utils/sanitize');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo más tarde.' },
});

const AVATAR_COLORS = ['#C9A35B', '#3DB389', '#E0564A', '#5B8DEF', '#B57BDC', '#E8A33D'];
function pickColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    isGuest: u.is_guest,
    avatarColor: u.avatar_color,
    rating: u.rating,
    gamesPlayed: u.games_played,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    timePlayedMs: Number(u.time_played_ms),
    createdAt: u.created_at,
  };
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const username = clean(req.body.username, 20);
    const email = clean(req.body.email, 255).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!validUsername(username)) {
      return res.status(400).json({ error: 'Usuario inválido (3-20 caracteres: letras, números, _ o -).' });
    }
    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Correo electrónico inválido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const exists = await db.query(
      'SELECT 1 FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)',
      [username, email]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'El usuario o correo ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password_hash, avatar_color)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [username, email, hash, pickColor()]
    );
    const user = rows[0];
    const token = signToken({ id: user.id, username: user.username, is_guest: false });
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/register]', err.message);
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const identifier = clean(req.body.identifier || req.body.username || req.body.email, 255);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Faltan credenciales.' });
    }
    const { rows } = await db.query(
      'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
      [identifier]
    );
    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
    const token = signToken({ id: user.id, username: user.username, is_guest: false });
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/login]', err.message);
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

// POST /api/auth/guest  — acceso rápido sin registro
router.post('/guest', authLimiter, async (req, res) => {
  try {
    let username = clean(req.body.username, 16);
    if (!validUsername(username)) {
      username = `Invitado-${crypto.randomBytes(2).toString('hex')}`;
    }
    // Garantiza unicidad añadiendo sufijo si hace falta.
    let finalName = username;
    // eslint-disable-next-line no-await-in-loop
    while ((await db.query('SELECT 1 FROM users WHERE lower(username)=lower($1)', [finalName])).rowCount > 0) {
      finalName = `${username}-${crypto.randomBytes(1).toString('hex')}`;
    }
    const { rows } = await db.query(
      `INSERT INTO users (username, is_guest, avatar_color) VALUES ($1, TRUE, $2) RETURNING *`,
      [finalName, pickColor()]
    );
    const user = rows[0];
    const token = signToken({ id: user.id, username: user.username, is_guest: true });
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/guest]', err.message);
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
  return res.json({ user: publicUser(rows[0]) });
});

// POST /api/auth/forgot-password
// Sin servidor de correo: en desarrollo se devuelve el token directamente.
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const email = clean(req.body.email, 255).toLowerCase();
    const { rows } = await db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
    if (rows[0]) {
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await db.query(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [rows[0].id, token, expires]
      );
      const payload = { ok: true, message: 'Si el correo existe, se enviaron instrucciones.' };
      if (process.env.NODE_ENV !== 'production') {
        // En un entorno real esto se enviaría por email.
        payload.devResetToken = token;
      }
      return res.json(payload);
    }
    return res.json({ ok: true, message: 'Si el correo existe, se enviaron instrucciones.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const token = clean(req.body.token, 128);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    const { rows } = await db.query(
      'SELECT * FROM password_resets WHERE token=$1 AND used=FALSE AND expires_at > now()',
      [token]
    );
    const reset = rows[0];
    if (!reset) return res.status(400).json({ error: 'Token inválido o expirado.' });

    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, reset.user_id]);
    await db.query('UPDATE password_resets SET used=TRUE WHERE id=$1', [reset.id]);
    return res.json({ ok: true, message: 'Contraseña actualizada.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor.' });
  }
});

module.exports = { router, publicUser };
