'use strict';

const db = require('../db/pool');
const config = require('../config');
const { socketAuth } = require('../auth/middleware');

const LOBBY_ROOM = 'lobby';

async function loadUserRecord(id) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const u = rows[0];
  return {
    id: u.id,
    username: u.username,
    avatarColor: u.avatar_color,
    rating: u.rating,
    isGuest: u.is_guest,
  };
}

function registerSocketHandlers(io, manager) {
  io.use(socketAuth);

  function broadcastLobby() {
    io.to(LOBBY_ROOM).emit('lobby:games', manager.listOpenGames());
  }

  io.on('connection', async (socket) => {
    const userRecord = await loadUserRecord(socket.user.id);
    if (!userRecord) {
      socket.emit('error:msg', { error: 'Usuario no encontrado.' });
      return socket.disconnect(true);
    }
    socket.userRecord = userRecord;
    let currentCode = null;

    // ---- Lobby -----------------------------------------------------------
    socket.on('lobby:subscribe', () => {
      socket.join(LOBBY_ROOM);
      socket.emit('lobby:games', manager.listOpenGames());
    });

    socket.on('lobby:list', () => {
      socket.emit('lobby:games', manager.listOpenGames());
    });

    socket.on('lobby:create', ({ initialMs, incrementMs, isPrivate }) => {
      const init = sanitizeTime(initialMs, 60000, 5400000, 300000);
      const inc = sanitizeTime(incrementMs, 0, 60000, 0);
      const room = manager.createRoom({
        isPrivate: !!isPrivate,
        isRated: true,
        initialMs: init,
        incrementMs: inc,
      });
      const color = room.seatPlayer(userRecord, socket);
      currentCode = room.code;
      socket.emit('game:joined', { code: room.code, color: colorName(color), state: room.state() });
      broadcastLobby();
    });

    socket.on('lobby:quickplay', ({ initialMs, incrementMs }) => {
      const init = sanitizeTime(initialMs, 60000, 5400000, 300000);
      const inc = sanitizeTime(incrementMs, 0, 60000, 0);
      const result = manager.matchmake(userRecord, socket, init, inc);
      if (result.matched) {
        const code = result.room.code;
        socket.emit('lobby:matched', { code });
        const oppSocket = io.sockets.sockets.get(result.opponent.socketId);
        if (oppSocket) oppSocket.emit('lobby:matched', { code });
      } else {
        socket.emit('lobby:waiting', { key: result.key });
      }
    });

    socket.on('lobby:cancelQuickplay', () => {
      manager.cancelMatchmaking(userRecord.id);
      socket.emit('lobby:waitingCancelled', {});
    });

    // ---- Entrar a una partida -------------------------------------------
    socket.on('game:join', ({ code }) => {
      const room = manager.getRoom(code);
      if (!room) {
        return socket.emit('error:msg', { error: 'Partida no encontrada.' });
      }
      currentCode = room.code;
      const seatedColor = room.colorOfUser(userRecord.id);
      let color;
      if (seatedColor) {
        color = room.seatPlayer(userRecord, socket); // reconexión
      } else if (!room.isFull()) {
        color = room.seatPlayer(userRecord, socket);
      } else {
        room.addSpectator(socket);
        color = null;
      }
      socket.emit('game:joined', { code: room.code, color: colorName(color), state: room.state() });
      room.broadcastState();
      broadcastLobby();
    });

    // ---- Acciones en partida --------------------------------------------
    socket.on('game:move', ({ from, to, promotion }) => {
      const room = manager.getRoom(currentCode);
      if (!room) return;
      const res = room.handleMove(userRecord.id, { from, to, promotion });
      if (res && res.error) socket.emit('move:rejected', { error: res.error });
    });

    socket.on('game:resign', () => {
      const room = manager.getRoom(currentCode);
      if (room) room.resign(userRecord.id);
    });

    socket.on('game:offerDraw', () => {
      const room = manager.getRoom(currentCode);
      if (room) room.offerDraw(userRecord.id);
    });

    socket.on('game:respondDraw', ({ accept }) => {
      const room = manager.getRoom(currentCode);
      if (room) room.respondDraw(userRecord.id, !!accept);
    });

    socket.on('game:rematch', () => {
      const room = manager.getRoom(currentCode);
      if (room) room.requestRematch(userRecord.id);
    });

    socket.on('chat:send', ({ text }) => {
      const room = manager.getRoom(currentCode);
      if (room) room.sendChat(userRecord.id, text);
    });

    // ---- Desconexión -----------------------------------------------------
    socket.on('disconnect', () => {
      manager.cancelMatchmaking(userRecord.id);
      const room = manager.getRoom(currentCode);
      if (room) {
        room.onDisconnect(userRecord.id, config.reconnectGraceSeconds);
        manager.removeEmptyRoom(room.code);
        broadcastLobby();
      }
    });
  });
}

function colorName(c) {
  if (c === 'w') return 'white';
  if (c === 'b') return 'black';
  return 'spectator';
}

function sanitizeTime(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

module.exports = { registerSocketHandlers };
