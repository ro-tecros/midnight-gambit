// board.js — Renderiza el tablero a partir de un FEN y gestiona la interacción
// (clic y arrastrar/soltar). Las pistas de movimientos legales se calculan en
// el cliente con chess.js vendorizado SOLO para mejorar la experiencia; la
// validación real y autoritativa ocurre siempre en el servidor.

import { Chess } from './vendor/chess.js';
import { pieceSVG } from './pieces.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function squareName(file, rankIdx) {
  return FILES[file] + (rankIdx + 1);
}

export class BoardController {
  /**
   * @param {HTMLElement} el  contenedor #board
   * @param {Object} opts { onMove, requestPromotion }
   *   onMove({from,to,promotion}) -> envía la jugada al servidor.
   *   requestPromotion(color) -> Promise<'q'|'r'|'b'|'n'>
   */
  constructor(el, { onMove, requestPromotion } = {}) {
    this.el = el;
    this.onMove = onMove || (() => {});
    this.requestPromotion = requestPromotion || (async () => 'q');

    this.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.orientation = 'white'; // color abajo
    this.myColor = null; // 'white' | 'black' | null (espectador)
    this.interactive = false; // ¿puedo mover ahora?
    this.lastMove = null; // { from, to }
    this.selected = null; // casilla seleccionada
    this.legalTargets = new Map(); // to -> moveObj
    this.pieceEls = new Map(); // square -> elemento .piece
    this.drag = null;

    this.squareEls = new Map(); // square -> elemento .square
    this._buildGrid();

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  // ---- Construcción de la rejilla 8x8 -------------------------------------
  _buildGrid() {
    this.el.innerHTML = '';
    this.squareEls.clear();
    for (let dr = 0; dr < 8; dr += 1) {
      for (let dc = 0; dc < 8; dc += 1) {
        const sq = document.createElement('div');
        sq.className = 'square';
        sq.addEventListener('click', () => this._onSquareClick(sq.dataset.square));
        sq.addEventListener('pointerup', (e) => this._onDropSquare(e, sq.dataset.square));
        this.el.appendChild(sq);
      }
    }
    this._layoutGrid();
  }

  /** Asigna nombre/colores/coordenadas a cada casilla según la orientación. */
  _layoutGrid() {
    const cells = this.el.querySelectorAll('.square');
    let i = 0;
    this.squareEls.clear();
    for (let dr = 0; dr < 8; dr += 1) {
      for (let dc = 0; dc < 8; dc += 1) {
        const cell = cells[i];
        i += 1;
        let file;
        let rankIdx;
        if (this.orientation === 'white') {
          file = dc;
          rankIdx = 7 - dr;
        } else {
          file = 7 - dc;
          rankIdx = dr;
        }
        const name = squareName(file, rankIdx);
        const isLight = (file + rankIdx) % 2 === 1;
        cell.className = `square ${isLight ? 'light' : 'dark'}`;
        cell.dataset.square = name;
        // Coordenadas grabadas: letras abajo, números a la izquierda.
        let coords = '';
        if (dr === 7) coords += `<span class="coord file">${FILES[file]}</span>`;
        if (dc === 0) coords += `<span class="coord rank">${rankIdx + 1}</span>`;
        cell.innerHTML = coords;
        this.squareEls.set(name, cell);
      }
    }
  }

  _xy(square) {
    const file = square.charCodeAt(0) - 97;
    const rankIdx = Number(square[1]) - 1;
    if (this.orientation === 'white') return { x: file, y: 7 - rankIdx };
    return { x: 7 - file, y: rankIdx };
  }

  // ---- Estado externo ------------------------------------------------------
  setOrientation(color) {
    this.orientation = color === 'black' ? 'black' : 'white';
    this._layoutGrid();
    this._renderPieces(true);
    this._renderHighlights();
  }

  flip() {
    this.setOrientation(this.orientation === 'white' ? 'black' : 'white');
  }

  setPosition({ fen, lastMove, myColor, interactive }) {
    if (typeof myColor !== 'undefined') this.myColor = myColor;
    if (typeof interactive !== 'undefined') this.interactive = interactive;
    if (lastMove) this.lastMove = { from: lastMove.from, to: lastMove.to };
    this.fen = fen;
    this._clearSelection();
    this._renderPieces();
    this._renderHighlights();
  }

  setInteractive(v) {
    this.interactive = v;
    if (!v) this._clearSelection();
  }

  // ---- Render de piezas con animación de la última jugada ------------------
  _parseFen(fen) {
    const map = new Map();
    const board = fen.split(' ')[0];
    const ranks = board.split('/');
    for (let r = 0; r < 8; r += 1) {
      let file = 0;
      for (const ch of ranks[r]) {
        if (/\d/.test(ch)) {
          file += Number(ch);
        } else {
          const color = ch === ch.toUpperCase() ? 'white' : 'black';
          const type = ch.toLowerCase();
          map.set(squareName(file, 7 - r), { type, color });
          file += 1;
        }
      }
    }
    return map;
  }

  _renderPieces(forceReset = false) {
    const target = this._parseFen(this.fen);
    const code = (p) => `${p.color[0]}${p.type}`;

    if (forceReset) {
      this.pieceEls.forEach((el) => el.remove());
      this.pieceEls.clear();
    }

    // Casillas que conservan exactamente la misma pieza.
    const keep = new Set();
    const newAppears = []; // {square, code}
    target.forEach((p, sq) => {
      const existing = this.pieceEls.get(sq);
      if (existing && existing.dataset.code === code(p)) {
        keep.add(sq);
        this._placePiece(existing, sq);
      } else {
        newAppears.push({ square: sq, code: code(p), piece: p });
      }
    });

    // Piezas viejas que ya no están donde estaban.
    const oldDisappears = [];
    this.pieceEls.forEach((el, sq) => {
      if (!target.has(sq) || (target.has(sq) && !keep.has(sq))) {
        if (!keep.has(sq)) oldDisappears.push({ square: sq, code: el.dataset.code, el });
      }
    });

    // Empareja apariciones con desapariciones del mismo código (movimiento).
    const usedOld = new Set();
    for (const appear of newAppears) {
      // Preferimos el origen real de la última jugada.
      let matchIdx = -1;
      if (this.lastMove && appear.square === this.lastMove.to) {
        matchIdx = oldDisappears.findIndex(
          (o, idx) => !usedOld.has(idx) && o.code === appear.code && o.square === this.lastMove.from
        );
      }
      if (matchIdx === -1) {
        matchIdx = oldDisappears.findIndex(
          (o, idx) => !usedOld.has(idx) && o.code === appear.code
        );
      }
      if (matchIdx >= 0) {
        usedOld.add(matchIdx);
        const old = oldDisappears[matchIdx];
        this.pieceEls.delete(old.square);
        this.pieceEls.set(appear.square, old.el);
        this._placePiece(old.el, appear.square); // transición CSS anima el deslizamiento
      } else {
        const fresh = this._createPiece(appear.piece, appear.square);
        this.pieceEls.set(appear.square, fresh);
      }
    }

    // Elimina las piezas capturadas / sobrantes.
    oldDisappears.forEach((o, idx) => {
      if (!usedOld.has(idx)) {
        o.el.remove();
        if (this.pieceEls.get(o.square) === o.el) this.pieceEls.delete(o.square);
      }
    });
  }

  _createPiece(piece, square) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.dataset.code = `${piece.color[0]}${piece.type}`;
    el.innerHTML = pieceSVG(piece.type, piece.color === 'white' ? 'w' : 'b');
    const svg = el.querySelector('svg');
    if (svg) svg.classList.add('piece-vec', piece.color);
    el.addEventListener('pointerdown', (e) => this._onPiecePointerDown(e, square));
    this.el.appendChild(el);
    this._placePiece(el, square);
    return el;
  }

  _placePiece(el, square) {
    const { x, y } = this._xy(square);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    el.dataset.square = square;
  }

  // ---- Resaltados ----------------------------------------------------------
  _renderHighlights() {
    this.squareEls.forEach((cell) => cell.classList.remove('last', 'sel', 'check'));
    this.el.querySelectorAll('.hint-dot, .hint-cap').forEach((n) => n.remove());

    if (this.lastMove) {
      [this.lastMove.from, this.lastMove.to].forEach((s) => {
        const c = this.squareEls.get(s);
        if (c) c.classList.add('last');
      });
    }
    if (this.selected) {
      const c = this.squareEls.get(this.selected);
      if (c) c.classList.add('sel');
      this.legalTargets.forEach((mv, to) => {
        const cell = this.squareEls.get(to);
        if (!cell) return;
        const hint = document.createElement('div');
        const isCapture = mv.flags.includes('c') || mv.flags.includes('e');
        hint.className = isCapture ? 'hint-cap' : 'hint-dot';
        cell.appendChild(hint);
      });
    }
    // Indicador de jaque sobre el rey en turno.
    const game = this._safeGame();
    if (game && game.inCheck()) {
      const turn = game.turn(); // 'w' | 'b'
      const kingSq = this._findKing(turn);
      if (kingSq) {
        const c = this.squareEls.get(kingSq);
        if (c) c.classList.add('check');
      }
    }
  }

  _findKing(turn) {
    const map = this._parseFen(this.fen);
    for (const [sq, p] of map.entries()) {
      if (p.type === 'k' && p.color === (turn === 'w' ? 'white' : 'black')) return sq;
    }
    return null;
  }

  _safeGame() {
    try {
      return new Chess(this.fen);
    } catch {
      return null;
    }
  }

  // ---- Selección y movimientos legales ------------------------------------
  _myTurnColorChar() {
    return this.myColor === 'white' ? 'w' : this.myColor === 'black' ? 'b' : null;
  }

  _canMoveFrom(square) {
    if (!this.interactive) return false;
    const game = this._safeGame();
    if (!game) return false;
    const myChar = this._myTurnColorChar();
    if (!myChar || game.turn() !== myChar) return false;
    const piece = game.get(square);
    return piece && piece.color === myChar;
  }

  _select(square) {
    const game = this._safeGame();
    if (!game) return;
    this.selected = square;
    this.legalTargets.clear();
    const moves = game.moves({ square, verbose: true });
    for (const mv of moves) this.legalTargets.set(mv.to, mv);
    this._renderHighlights();
  }

  _clearSelection() {
    this.selected = null;
    this.legalTargets.clear();
  }

  async _attemptMove(from, to) {
    const mv = this.legalTargets.get(to);
    this._clearSelection();
    this._renderHighlights();
    if (!mv) return false;
    let promotion;
    if (mv.flags.includes('p')) {
      promotion = await this.requestPromotion(this.myColor);
      if (!promotion) return false;
    }
    this.onMove({ from, to, promotion });
    return true;
  }

  _onSquareClick(square) {
    if (!square) return;
    if (this.selected && this.legalTargets.has(square)) {
      this._attemptMove(this.selected, square);
      return;
    }
    if (this._canMoveFrom(square)) {
      this._select(square);
    } else {
      this._clearSelection();
      this._renderHighlights();
    }
  }

  // ---- Arrastrar y soltar --------------------------------------------------
  _onPiecePointerDown(e, square) {
    if (!this._canMoveFrom(square)) return;
    e.preventDefault();
    this._select(square);
    const el = this.pieceEls.get(square);
    if (!el) return;
    const rect = this.el.getBoundingClientRect();
    this.drag = { el, from: square, rect, started: false };
    el.classList.add('dragging');
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp, { once: true });
    this._moveDragTo(e.clientX, e.clientY);
  }

  _moveDragTo(clientX, clientY) {
    if (!this.drag) return;
    const { rect, el } = this.drag;
    const size = rect.width / 8;
    const x = clientX - rect.left - size / 2;
    const y = clientY - rect.top - size / 2;
    el.style.transform = `translate(${(x / size) * 100}%, ${(y / size) * 100}%)`;
  }

  _squareFromPoint(clientX, clientY) {
    const { rect } = this.drag;
    const size = rect.width / 8;
    let dc = Math.floor((clientX - rect.left) / size);
    let dr = Math.floor((clientY - rect.top) / size);
    if (dc < 0 || dc > 7 || dr < 0 || dr > 7) return null;
    let file;
    let rankIdx;
    if (this.orientation === 'white') {
      file = dc;
      rankIdx = 7 - dr;
    } else {
      file = 7 - dc;
      rankIdx = dr;
    }
    return squareName(file, rankIdx);
  }

  _onPointerMove(e) {
    if (!this.drag) return;
    this.drag.started = true;
    this._moveDragTo(e.clientX, e.clientY);
  }

  async _onPointerUp(e) {
    window.removeEventListener('pointermove', this._onPointerMove);
    if (!this.drag) return;
    const { el, from, started } = this.drag;
    el.classList.remove('dragging');
    const target = this._squareFromPoint(e.clientX, e.clientY);
    this.drag = null;
    if (started && target && target !== from && this.legalTargets.has(target)) {
      await this._attemptMove(from, target);
    } else {
      // Vuelve a su casilla; si fue un clic, conserva la selección.
      this._placePiece(el, from);
      if (!started) {
        // clic simple: selección ya activa
      }
    }
    // Reposiciona por si el FEN no cambió.
    if (this.pieceEls.get(from) === el) this._placePiece(el, from);
  }

  _onDropSquare() {
    // El manejo real se hace en _onPointerUp con coordenadas globales.
  }
}
