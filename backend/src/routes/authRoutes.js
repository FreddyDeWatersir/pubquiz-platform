/**
 * Minimal shared-password auth.
 *
 * One password (ADMIN_PASSWORD) unlocks the organizer + admin surface.
 * Login returns a signed, expiring token. No database, no sessions, no
 * extra npm packages: the token is an HMAC so it survives PM2 restarts.
 *
 * Required in backend/.env:
 *   ADMIN_PASSWORD=something-strong
 *   AUTH_SECRET=a-long-random-string
 * Optional:
 *   AUTH_TTL_HOURS=12
 */

const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;
const TOKEN_TTL_HOURS = parseInt(process.env.AUTH_TTL_HOURS || '12', 10);

// Fail loudly at boot rather than silently running unprotected.
if (!ADMIN_PASSWORD || !AUTH_SECRET) {
  console.error('FATAL: ADMIN_PASSWORD and AUTH_SECRET must be set in backend/.env');
  process.exit(1);
}

function sign(payload) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
}

/** Constant-time string compare that tolerates different lengths. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Token format: "<expiryMs>.<hmac>" */
function createToken() {
  const payload = String(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;

  const split = token.lastIndexOf('.');
  if (split === -1) return false;

  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);

  if (!safeEqual(signature, sign(payload))) return false;

  const expiresAt = parseInt(payload, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

function checkPassword(password) {
  if (typeof password !== 'string') return false;
  return safeEqual(password, ADMIN_PASSWORD);
}

/** Express middleware: rejects anything without a valid Bearer token. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { createToken, verifyToken, checkPassword, requireAuth };