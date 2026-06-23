// clock.js — Visualización suave de los relojes en el cliente. El servidor es
// la fuente autoritativa: envía instantáneas (ms restantes + color al turno).
// Entre instantáneas, el cliente interpola localmente para que la cuenta
// regresiva se vea fluida sin descargar el servidor.

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  // Bajo 10 s mostramos décimas para dar tensión.
  if (ms < 10000 && ms > 0) {
    const s = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `0:${String(s).padStart(2, '0')}.${tenths}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export class ClockController {
  /**
   * @param {Object} els  { topEl, bottomEl }  — nodos DOM donde pintar.
   */
  constructor({ topEl, bottomEl }) {
    this.topEl = topEl;
    this.bottomEl = bottomEl;
    this.remaining = { white: 0, black: 0 };
    this.running = null; // 'white' | 'black' | null
    this.orientation = 'white'; // color del jugador abajo
    this.lastSync = performance.now();
    this.raf = null;
    this._tick = this._tick.bind(this);
  }

  setOrientation(color) {
    this.orientation = color === 'black' ? 'black' : 'white';
    this._render();
  }

  /** Sincroniza con una instantánea del servidor. */
  sync({ white, black, runningColor }) {
    this.remaining.white = white;
    this.remaining.black = black;
    this.running = runningColor || null;
    this.lastSync = performance.now();
    if (this.running && !this.raf) this.raf = requestAnimationFrame(this._tick);
    this._render();
  }

  stop() {
    this.running = null;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this._render();
  }

  _tick() {
    if (!this.running) {
      this.raf = null;
      return;
    }
    const now = performance.now();
    const elapsed = now - this.lastSync;
    this._render(elapsed);
    this.raf = requestAnimationFrame(this._tick);
  }

  _render(elapsed = 0) {
    const live = { white: this.remaining.white, black: this.remaining.black };
    if (this.running) live[this.running] = Math.max(0, this.remaining[this.running] - elapsed);

    const bottomColor = this.orientation;
    const topColor = bottomColor === 'white' ? 'black' : 'white';

    this._paint(this.bottomEl, live[bottomColor], this.running === bottomColor);
    this._paint(this.topEl, live[topColor], this.running === topColor);
  }

  _paint(el, ms, isActive) {
    if (!el) return;
    el.textContent = formatTime(ms);
    el.classList.toggle('active', !!isActive);
    el.classList.toggle('low', ms <= 20000);
    el.classList.toggle('critical', ms <= 10000);
  }
}

export { formatTime };
