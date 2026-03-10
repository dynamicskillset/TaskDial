import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getDb, writeAuditLog, incrementUsageStat } from '../db';
import { jwtAuth, signAccessToken, JwtPayload } from '../middleware/jwtAuth';

const router = Router();

const BCRYPT_ROUNDS = 10;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRefreshExpires(): number {
  return parseInt(process.env.JWT_REFRESH_EXPIRES || '2592000', 10); // 30 days
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    path: '/',
  };

  const accessExpires = parseInt(process.env.JWT_ACCESS_EXPIRES || '3600', 10);
  const refreshExpires = getRefreshExpires();

  res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: accessExpires * 1000 });
  res.cookie('refresh_token', refreshToken, { ...cookieOpts, maxAge: refreshExpires * 1000 });
}

function clearAuthCookies(res: Response): void {
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
  res.clearCookie('access_token', opts);
  res.clearCookie('refresh_token', opts);
}

function issueRefreshToken(userId: string): string {
  const raw = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + getRefreshExpires() * 1000).toISOString();

  getDb().prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, tokenHash, expiresAt, new Date().toISOString());

  return raw;
}

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate invite code: exactly 8 alphanumeric chars
function isValidInviteCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const { email, password, invite_code } = req.body;
  const ip = getClientIp(req);

  // Input validation
  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 12) {
    res.status(400).json({ error: 'Password must be at least 12 characters' });
    return;
  }
  if (!invite_code || typeof invite_code !== 'string') {
    res.status(400).json({ error: 'An invite code is required' });
    return;
  }
  const codeUpper = invite_code.toUpperCase();
  if (!isValidInviteCodeFormat(codeUpper)) {
    res.status(400).json({ error: 'Invite code must be 8 alphanumeric characters' });
    return;
  }

  const db = getDb();
  const normalEmail = email.trim().toLowerCase();

  // Validate invite code (deliberately vague on failure reason)
  const invite = db.prepare(`
    SELECT id, used_by, expires_at FROM invite_codes
    WHERE code = ? AND used_by IS NULL AND (expires_at IS NULL OR expires_at > ?)
  `).get(codeUpper, new Date().toISOString()) as { id: string; used_by: string | null; expires_at: string | null } | undefined;

  if (!invite) {
    writeAuditLog(null, 'register_fail', { reason: 'invalid_invite' }, ip);
    res.status(400).json({ error: 'Invalid or expired invite code' });
    return;
  }

  // Check email not already taken
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalEmail);
  if (existingUser) {
    writeAuditLog(null, 'register_fail', { reason: 'email_taken' }, ip);
    res.status(400).json({ error: 'An account with that email already exists' });
    return;
  }

  const now = new Date().toISOString();
  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const keySalt = crypto.randomBytes(32).toString('hex');

  const doRegister = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, key_salt, role, is_active, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', 1, 0, ?, ?)
    `).run(userId, normalEmail, passwordHash, keySalt, now, now);

    db.prepare(`
      UPDATE invite_codes SET used_by = ?, used_at = ? WHERE id = ?
    `).run(userId, now, invite.id);
  });

  doRegister();

  writeAuditLog(userId, 'register_ok', null, ip);
  incrementUsageStat('register_ok');

  const user = { id: userId, email: normalEmail, role: 'user', token_version: 0 };
  const accessToken = signAccessToken(user);
  const refreshToken = issueRefreshToken(userId);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({ user: { id: userId, email: normalEmail, role: 'user' }, key_salt: keySalt });
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ip = getClientIp(req);

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required' });
    return;
  }
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  const db = getDb();
  const normalEmail = email.trim().toLowerCase();

  const user = db.prepare(
    'SELECT id, email, password_hash, key_salt, role, is_active, token_version, deleted_at FROM users WHERE email = ?'
  ).get(normalEmail) as {
    id: string; email: string; password_hash: string; key_salt: string | null; role: string;
    is_active: number; token_version: number; deleted_at: string | null;
  } | undefined;

  // Always run bcrypt compare to avoid timing attacks (use dummy hash if user not found)
  const DUMMY_HASH = '$2b$10$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnn';
  const hashToCompare = user?.password_hash || DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch || !user.is_active || user.deleted_at) {
    writeAuditLog(user?.id || null, 'login_fail', null, ip);
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  writeAuditLog(user.id, 'login_ok', null, ip);
  incrementUsageStat('login_ok');

  // Progressively upgrade hashes stored with a higher cost factor
  if (user.password_hash.startsWith('$2') && !user.password_hash.startsWith(`$2b$${BCRYPT_ROUNDS}$`)) {
    const upgraded = await bcrypt.hash(password, BCRYPT_ROUNDS);
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(upgraded, user.id);
  }

  // Ensure this user has a key_salt (backfill for accounts created before E2EE)
  if (!user.key_salt) {
    const newSalt = crypto.randomBytes(32).toString('hex');
    getDb().prepare('UPDATE users SET key_salt = ? WHERE id = ?').run(newSalt, user.id);
    user.key_salt = newSalt;
  }

  const accessToken = signAccessToken(user);
  const refreshToken = issueRefreshToken(user.id);
  setAuthCookies(res, accessToken, refreshToken);

  // Update last_seen_at
  db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);

  res.json({ user: { id: user.id, email: user.email, role: user.role }, key_salt: user.key_salt });
});

// POST /api/auth/logout
router.post('/logout', jwtAuth, (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rawRefresh = req.cookies?.refresh_token;

  if (rawRefresh) {
    const tokenHash = hashToken(rawRefresh);
    getDb().prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
  }

  // Invalidate all existing tokens by bumping token_version
  getDb().prepare('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), req.user!.id);

  writeAuditLog(req.user!.id, 'logout', null, ip);
  clearAuthCookies(res);
  res.json({ success: true });
});

// POST /api/auth/refresh
router.post('/refresh', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rawRefresh = req.cookies?.refresh_token;

  if (!rawRefresh) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const tokenHash = hashToken(rawRefresh);
  const db = getDb();

  const stored = db.prepare(`
    SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
           u.id as uid, u.email, u.role, u.is_active, u.token_version, u.deleted_at
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
  `).get(tokenHash) as {
    id: string; user_id: string; expires_at: string; revoked: number;
    uid: string; email: string; role: string; is_active: number;
    token_version: number; deleted_at: string | null;
  } | undefined;

  if (
    !stored ||
    stored.revoked ||
    new Date(stored.expires_at) < new Date() ||
    !stored.is_active ||
    stored.deleted_at
  ) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Rotate: revoke old token, issue new one
  const newRefreshRaw = crypto.randomBytes(40).toString('hex');
  const newRefreshHash = hashToken(newRefreshRaw);
  const newRefreshId = uuidv4();
  const expiresAt = new Date(Date.now() + getRefreshExpires() * 1000).toISOString();
  const now = new Date().toISOString();

  const rotate = db.transaction(() => {
    db.prepare('UPDATE refresh_tokens SET revoked = 1, replaced_by = ? WHERE id = ?')
      .run(newRefreshId, stored.id);
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(newRefreshId, stored.user_id, newRefreshHash, expiresAt, now);
  });

  rotate();

  const user = { id: stored.uid, email: stored.email, role: stored.role, token_version: stored.token_version };
  const accessToken = signAccessToken(user);
  setAuthCookies(res, accessToken, newRefreshRaw);

  writeAuditLog(stored.user_id, 'token_refresh', null, ip);

  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', jwtAuth, (req: Request, res: Response) => {
  res.json({ id: req.user!.id, email: req.user!.email, role: req.user!.role });
});

export default router;
