// api.js — Cliente REST. Encapsula todas las llamadas HTTP al backend.
// El token JWT se guarda en localStorage y se adjunta como Bearer en cada
// petición autenticada.

const TOKEN_KEY = 'mg_token';
const USER_KEY = 'mg_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || `Error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  // ---- Autenticación ----
  register: (username, email, password) =>
    request('/auth/register', { method: 'POST', body: { username, email, password } }),
  login: (identifier, password) =>
    request('/auth/login', { method: 'POST', body: { identifier, password } }),
  guest: (username) =>
    request('/auth/guest', { method: 'POST', body: { username } }),
  me: () => request('/auth/me', { auth: true }),
  forgotPassword: (email) =>
    request('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: { token, password } }),

  // ---- Usuarios ----
  userProfile: (username) => request(`/users/${encodeURIComponent(username)}`),

  // ---- Partidas ----
  history: (limit = 30) => request(`/games/history?limit=${limit}`, { auth: true }),
  game: (id) => request(`/games/${id}`),
};
