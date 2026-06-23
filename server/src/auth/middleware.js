'use strict';

const { verifyToken } = require('./jwt');

/** Middleware Express: exige un Bearer token válido. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  req.user = payload; // { id, username, is_guest }
  return next();
}

/** Middleware Socket.IO: valida el token del handshake. */
function socketAuth(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers?.authorization || '').replace('Bearer ', '');
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return next(new Error('No autenticado.'));
  }
  socket.user = payload;
  return next();
}

module.exports = { requireAuth, socketAuth };
