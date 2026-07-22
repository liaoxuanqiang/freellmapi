import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

// Dashboard authentication: email + password accounts with opaque session
// tokens. Distinct from the unified API key, which authenticates the /v1 proxy
// for apps — this gates the /api/* admin surface for the human operator (#35).
//
// Sessions use self-contained signed tokens (JWT-like) so they work in
// Vercel serverless where each instance has its own SQLite at /tmp/.
// Tokens are HMAC-SHA256 signed with ENCRYPTION_KEY — no DB lookup needed.

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  userId: number;
  email: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Get the HMAC signing key (derived from ENCRYPTION_KEY). */
function getSigningKey(): Buffer {
  const encKey = process.env.ENCRYPTION_KEY || 'dev-only-insecure-fallback-key-please-set-ENCRYPTION_KEY';
  // Derive a 256-bit key from ENCRYPTION_KEY so the raw env value is never the
  // symmetric key directly.
  return crypto.pbkdf2Sync(encKey, 'freellmapi-session-v2', 100_000, 32, 'sha256');
}

/** Create a self-contained signed session token (no DB write). */
function createSessionToken(userId: number, email: string): string {
  const payload = JSON.stringify({
    userId,
    email,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/** Validate a self-contained signed session token (no DB read). Returns user or null. */
function validateSessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  // Verify HMAC signature
  const expectedSig = crypto.createHmac('sha256', getSigningKey())
    .update(payloadB64)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(sig, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  // Decode and parse payload
  let payload: { userId: number; email: string; exp: number };
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(json);
  } catch {
    return null;
  }

  // Check expiry
  if (payload.exp < Date.now()) return null;

  return { userId: payload.userId, email: payload.email };
}

export function userCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c;
}

/** Create a user. Throws { code: 'email_taken' } if the email already exists. */
export function createUser(email: string, password: string): SessionUser {
  const db = getDb();
  const normalized = normalizeEmail(email);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (existing) {
    const err = new Error('An account with that email already exists') as any;
    err.code = 'email_taken';
    throw err;
  }
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(normalized, hashPassword(password));
  return { userId: Number(result.lastInsertRowid), email: normalized };
}

/** Verify credentials. Returns the user on success, null on failure. */
export function verifyCredentials(email: string, password: string): SessionUser | null {
  const db = getDb();
  const row = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as { id: number; email: string; password_hash: string } | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { userId: row.id, email: row.email };
}

/** Mint a session and return the raw token (self-contained — no DB storage). */
export function createSession(userId: number): string {
  // We need the email for the token payload. The caller (routes/auth.ts)
  // already resolves user info, but the signature on `createSession` only
  // passes userId. Since the DB write is gone, we persist nothing, so the
  // caller can still pass only `userId` and the email will be looked up.
  const db = getDb();
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!row) throw new Error('User not found');
  return createSessionToken(userId, row.email);
}

/** Resolve a session token to its user, or null if missing/expired. */
export function validateSession(token: string | undefined | null): SessionUser | null {
  return validateSessionToken(token);
}

export function deleteSession(token: string | undefined | null): void {
  // Self-contained tokens can't be revoked server-side.
  // The client discards the token to "log out".
  // A future enhancement could add a server-side blocklist via Vercel KV.
}
