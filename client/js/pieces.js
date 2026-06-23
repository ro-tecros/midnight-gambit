// Piezas de ajedrez — siluetas vectoriales originales (estilo Staunton moderno).
// Cada pieza es un <svg> 45x45 con relleno y contorno controlados por CSS
// mediante las variables --piece-fill y --piece-stroke.

const PATHS = {
  p: `<g stroke-linecap="round" stroke-linejoin="round">
      <circle cx="22.5" cy="14" r="5"/>
      <path d="M18 18 h9 l2.5 9 q1 3 -2 3 h-12 q-3 0 -2 -3 z"/>
      <path d="M14 32 q8.5 -3 17 0 l2 6 h-21 z"/>
    </g>`,
  r: `<g stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 11 h3 v3 h3 v-3 h4 v3 h3 v-3 h3 v6 l-2.5 3 v9 l2.5 3 v4 h-19 v-4 l2.5 -3 v-9 l-2.5 -3 z"/>
      <path d="M11 39 h23 v-3 q-11.5 -3 -23 0 z"/>
    </g>`,
  n: `<g stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 35 c0 -6 1 -9 4 -12 c-3 1 -6 3 -7 1 c-1 -2 2 -4 3 -6 c2 -3 5 -5 9 -6 c1 -2 1 -3 1 -4 c2 1 3 2 3 4 c5 2 9 7 9 16 c0 4 0 7 0 7 z"/>
      <circle cx="18" cy="20" r="0.9" fill="var(--piece-stroke)" stroke="none"/>
      <path d="M14 39 h22 v-3 q-11 -3 -22 0 z"/>
    </g>`,
  b: `<g stroke-linecap="round" stroke-linejoin="round">
      <circle cx="22.5" cy="9" r="2.4"/>
      <path d="M22.5 11.5 c5 3 7 8 7 12 c0 4 -3 7 -7 7 c-4 0 -7 -3 -7 -7 c0 -4 2 -9 7 -12 z"/>
      <path d="M19.5 21 h6 M22.5 18 v6" stroke-width="1.4"/>
      <path d="M15 31 q7.5 3 15 0 l1.5 4 h-18 z"/>
      <path d="M13 39 h19 v-3 q-9.5 -2.5 -19 0 z"/>
    </g>`,
  q: `<g stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="14" r="2"/><circle cx="16.5" cy="11" r="2"/>
      <circle cx="22.5" cy="10" r="2.2"/><circle cx="28.5" cy="11" r="2"/>
      <circle cx="36" cy="14" r="2"/>
      <path d="M9 15 l3.5 13 h20 l3.5 -13 l-6 8 l-2.5 -12 l-3 12 l-3 -12 l-2.5 12 z"/>
      <path d="M12 29 q10.5 -3 21 0 v3 q-10.5 3 -21 0 z"/>
      <path d="M11 36 h23 v3 h-23 z"/>
    </g>`,
  k: `<g stroke-linecap="round" stroke-linejoin="round">
      <path d="M22.5 6 v6 M19.5 9 h6" stroke-width="1.6"/>
      <path d="M22.5 13 c6 0 9 4 9 8 c0 4 -4 6 -9 6 c-5 0 -9 -2 -9 -6 c0 -4 3 -8 9 -8 z"/>
      <path d="M13 30 q9.5 -3 19 0 v4 q-9.5 3 -19 0 z"/>
      <path d="M12 37 h21 v3 h-21 z"/>
    </g>`,
};

const VIEWBOX = '0 0 45 45';

export function pieceSVG(type, color) {
  const t = type.toLowerCase();
  const cls = color === 'w' ? 'piece-vec white' : 'piece-vec black';
  return `<svg class="${cls}" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg"
    fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.1">
    ${PATHS[t]}
  </svg>`;
}

export const PIECE_TYPES = ['p', 'r', 'n', 'b', 'q', 'k'];
