'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./config');
const { initDb } = require('./db/init');
const { router: authRouter } = require('./auth/routes');
const usersRouter = require('./api/users');
const gamesRouter = require('./api/games');
const { GameManager } = require('./game/GameManager');
const { registerSocketHandlers } = require('./game/socket');

async function main() {
  await initDb();

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false, // el cliente usa CDNs de fuentes/socket.io
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' }));

  // Límite global anti-spam para la API.
  app.use(
    '/api',
    rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
  );

  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/games', gamesRouter);

  // Servir el cliente estático.
  const clientDir = path.join(__dirname, '..', '..', 'client');
  app.use(express.static(clientDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'No encontrado.' });
    return res.sendFile(path.join(clientDir, 'index.html'));
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), methods: ['GET', 'POST'] },
    pingTimeout: 20000,
  });

  const manager = new GameManager(io);
  registerSocketHandlers(io, manager);

  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`♞ Midnight Gambit escuchando en http://localhost:${config.port} (${config.env})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});
