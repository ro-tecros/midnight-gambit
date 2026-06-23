'use strict';

/** Recorta y limita longitud; elimina caracteres de control. */
function clean(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

/** Mensajes de chat: texto plano, sin HTML, longitud acotada. */
function cleanChat(str) {
  return clean(str, 280).replace(/[<>]/g, '');
}

/** Nombre de usuario: 3-20 chars, alfanumérico + _ - */
function validUsername(str) {
  if (typeof str !== 'string') return false;
  return /^[A-Za-z0-9_-]{3,20}$/.test(str.trim());
}

function validEmail(str) {
  if (typeof str !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim()) && str.length <= 255;
}

module.exports = { clean, cleanChat, validUsername, validEmail };
