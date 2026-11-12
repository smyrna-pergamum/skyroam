// Storage helpers. Every access is wrapped: private mode or blocked storage must never break the game.

const TOKEN_KEY = 'skyroam.ionToken';

function store(kind) { try { return window[kind]; } catch { return null; } }

export function readJSON(key, fallback) {
  try { return JSON.parse(store('localStorage')?.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeJSON(key, val) {
  try { store('localStorage')?.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

export function getToken() {
  try { return store('localStorage')?.getItem(TOKEN_KEY) || store('sessionStorage')?.getItem(TOKEN_KEY) || ''; }
  catch { return ''; }
}
export function saveToken(token, remember) {
  try {
    store('localStorage')?.removeItem(TOKEN_KEY);
    store('sessionStorage')?.removeItem(TOKEN_KEY);
    if (token) store(remember ? 'localStorage' : 'sessionStorage')?.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
}

export const looksLikeToken = v => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(v);
