// socket.js — Envoltura del cliente Socket.IO. Gestiona la conexión
// autenticada por token, la reconexión automática y un registro central de
// manejadores de eventos.

import { getToken } from './api.js';

/* global io */

class GameSocket {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.statusListeners = new Set();
  }

  connect() {
    if (this.socket && this.socket.connected) return this.socket;
    const token = getToken();
    this.socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
    });

    this.socket.on('connect', () => this._emitStatus('connected'));
    this.socket.on('disconnect', () => this._emitStatus('disconnected'));
    this.socket.io.on('reconnect_attempt', () => this._emitStatus('reconnecting'));
    this.socket.io.on('reconnect', () => this._emitStatus('connected'));

    // Re-vincula los manejadores registrados antes de conectar.
    for (const [event, fns] of this.handlers.entries()) {
      for (const fn of fns) this.socket.on(event, fn);
    }
    return this.socket;
  }

  onStatus(fn) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  _emitStatus(status) {
    for (const fn of this.statusListeners) fn(status);
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    if (this.socket) this.socket.on(event, fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this.handlers.has(event)) this.handlers.get(event).delete(fn);
    if (this.socket) this.socket.off(event, fn);
  }

  emit(event, payload) {
    if (this.socket) this.socket.emit(event, payload);
  }

  get connected() {
    return !!(this.socket && this.socket.connected);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const gameSocket = new GameSocket();
