/**
 * api.js — thin fetch wrapper for the Ouroboros backend.
 * All requests include credentials (session cookie).
 */

const BASE = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}`);
    err.status = res.status;
    try { err.body = await res.json(); } catch { /* ignore */ }
    throw err;
  }
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────────────────
export const login    = (data) => request('POST', '/auth/login', data);
export const register = (data) => request('POST', '/auth/register', data);
export const logout   = ()     => request('POST', '/auth/logout');
export const me             = ()     => request('GET',  '/auth/me');
export const updateBirthday = (data) => request('PATCH', '/auth/users/birthday', data);

// ── Entries ─────────────────────────────────────────────────────────────────
export const getEntries  = ()     => request('GET',  '/entries');
export const createEntry = (data) => request('POST', '/entries', data);

// ── Analyses ────────────────────────────────────────────────────────────────
export const getAnalyses    = ()     => request('GET',    '/analyses');
export const createAnalysis = (data) => request('POST',   '/analyses', data);
export const deleteAnalysis = (id)   => request('DELETE', `/analyses/${id}`);
