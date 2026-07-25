import { API_URL } from './config';

const TOKEN_KEY = 'quizAdminToken';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

/** Exchange the password for a token. Throws on failure. */
export async function login(password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Login failed');
  }

  const data = await res.json();
  setToken(data.token);
  return data.token;
}

export function logout() {
  clearToken();
  window.location.href = '/admin';
}

/**
 * Wraps window.fetch once so every call to /api/organizer or /api/admin
 * carries the token automatically. Done centrally so no endpoint can be
 * forgotten, and so existing components need no changes.
 */
export function installAuthInterceptor() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url =
      typeof input === 'string' ? input : (input && input.url) || '';
    const isProtected =
      url.includes('/api/organizer') || url.includes('/api/admin');

    if (isProtected) {
      const token = getToken();
      if (token) {
        init = {
          ...init,
          headers: {
            ...(init.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        };
      }
    }

    const res = await originalFetch(input, init);

    // Token expired or missing: drop it and send them back to login.
    if (isProtected && res.status === 401) {
      clearToken();
      if (window.location.pathname !== '/admin') {
        window.location.href = '/admin';
      }
    }

    return res;
  };
}