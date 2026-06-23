'use strict';

/**
 * Reloj de ajedrez autoritativo (lado servidor).
 * El tiempo restante se calcula en milisegundos. El incremento Fischer se
 * suma al jugador que acaba de mover, tras descontar su tiempo de reflexión.
 */
class Clock {
  constructor(initialMs, incrementMs) {
    this.initialMs = initialMs;
    this.incrementMs = incrementMs;
    this.remaining = { w: initialMs, b: initialMs };
    this.turn = null; // 'w' | 'b'
    this.running = false;
    this.lastTick = null; // timestamp ms
  }

  _drain() {
    if (this.running && this.turn && this.lastTick != null) {
      const now = Date.now();
      this.remaining[this.turn] -= now - this.lastTick;
      this.lastTick = now;
    }
  }

  /** Arranca el reloj para el color indicado (inicio de partida). */
  start(turn) {
    this.turn = turn;
    this.running = true;
    this.lastTick = Date.now();
  }

  /**
   * El jugador `turn` (que estaba al turno) completó su jugada:
   * descuenta su tiempo, le suma el incremento y pasa el turno.
   */
  press(turn) {
    if (!this.running) {
      this.turn = turn === 'w' ? 'b' : 'w';
      return;
    }
    this._drain();
    this.remaining[turn] += this.incrementMs;
    this.turn = turn === 'w' ? 'b' : 'w';
    this.lastTick = Date.now();
  }

  pause() {
    this._drain();
    this.running = false;
  }

  resume() {
    if (!this.running && this.turn) {
      this.running = true;
      this.lastTick = Date.now();
    }
  }

  /** Tiempo restante "en vivo" sin mutar el estado interno. */
  snapshot() {
    const copy = { w: this.remaining.w, b: this.remaining.b };
    if (this.running && this.turn && this.lastTick != null) {
      copy[this.turn] -= Date.now() - this.lastTick;
    }
    return {
      white: Math.max(0, Math.round(copy.w)),
      black: Math.max(0, Math.round(copy.b)),
      running: this.running,
      turn: this.turn,
    };
  }

  /** Devuelve 'w' o 'b' si alguien agotó su tiempo, o null. */
  flaggedColor() {
    const s = this.snapshot();
    if (s.white <= 0) return 'w';
    if (s.black <= 0) return 'b';
    return null;
  }
}

module.exports = Clock;
