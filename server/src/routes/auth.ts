import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getDb, writeAuditLog, incrementUsageStat } from '../db';
import { jwtAuth, signAccessToken, JwtPayload } from '../middleware/jwtAuth';
import { sendEmail } from '../services/email';

const router = Router();

const BCRYPT_ROUNDS = 10;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // generous — silent background refreshes; still caps abuse
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts, please try again later' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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
  const accessExpires = parseInt(process.env.JWT_ACCESS_EXPIRES || '3600', 10);
  const refreshExpires = getRefreshExpires();

  // Access token: strict is fine — short-lived (1 h) and only sent on same-site requests
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: accessExpires * 1000,
  });

  // Refresh token: lax so it survives PWA navigation contexts on iOS Safari (Bug #27).
  // 'strict' blocked the cookie when the installed PWA briefly navigated away, logging the user out.
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshExpires * 1000,
  });
}

function clearAuthCookies(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('access_token', { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' });
  res.clearCookie('refresh_token', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
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
    SELECT id, expires_at, use_limit, use_count FROM invite_codes
    WHERE code = ? AND revoked = 0
      AND (expires_at IS NULL OR expires_at > ?)
      AND (use_limit IS NULL OR use_count < use_limit)
  `).get(codeUpper, new Date().toISOString()) as { id: string; expires_at: string | null; use_limit: number | null; use_count: number } | undefined;

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
      UPDATE invite_codes SET use_count = use_count + 1, used_by = ?, used_at = ? WHERE id = ?
    `).run(userId, now, invite.id);

    db.prepare(`
      INSERT INTO invite_code_uses (id, invite_code_id, used_by, used_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), invite.id, userId, now);
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

  // Ensure this user has a key_salt (backfill for accounts created before E2EE).
  // Uses UPDATE … WHERE key_salt IS NULL so concurrent logins are idempotent:
  // only the first writer sets the salt; the second reads back whatever was stored.
  if (!user.key_salt) {
    const candidate = crypto.randomBytes(32).toString('hex');
    getDb().prepare('UPDATE users SET key_salt = ? WHERE id = ? AND key_salt IS NULL').run(candidate, user.id);
    const refreshed = getDb().prepare('SELECT key_salt FROM users WHERE id = ?').get(user.id) as { key_salt: string };
    user.key_salt = refreshed.key_salt;
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
router.post('/refresh', refreshLimiter, (req: Request, res: Response) => {
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

  if (!stored) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Reuse detection: if this token is already revoked, a previous legitimate token
  // was rotated and someone is replaying the old one. Revoke all tokens for this
  // user immediately to limit the damage from a stolen refresh token.
  if (stored.revoked) {
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(stored.user_id);
    writeAuditLog(stored.user_id, 'refresh_token_reuse_detected', null, ip);
    clearAuthCookies(res);
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (
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

// POST /api/auth/forgot-password
// Always returns 200 — never reveals whether the email exists.
router.post('/forgot-password', resetLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  const ip = getClientIp(req);

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.json({ success: true });
    return;
  }

  const db = getDb();
  const normalEmail = email.trim().toLowerCase();

  const user = db.prepare(
    'SELECT id, email, is_active, deleted_at FROM users WHERE email = ?'
  ).get(normalEmail) as { id: string; email: string; is_active: number; deleted_at: string | null } | undefined;

  if (!user || !user.is_active || user.deleted_at) {
    writeAuditLog(null, 'forgot_password_noop', { email: normalEmail }, ip);
    res.json({ success: true });
    return;
  }

  const now = new Date().toISOString();

  // Invalidate any existing unused tokens for this user
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
    .run(now, user.id);

  // Generate new token
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), user.id, tokenHash, expiresAt, now);

  const appUrl = (process.env.APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
  const resetUrl = `${appUrl}/reset-password?token=${raw}`;

  const textBody = [
    `Hi,`,
    ``,
    `Someone requested a password reset for your TaskDial account (${user.email}).`,
    ``,
    `Click the link below to reset your password. This link expires in 1 hour.`,
    ``,
    resetUrl,
    ``,
    `If you did not request this, you can safely ignore this email.`,
    `Your password will not change unless you follow the link above.`,
  ].join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td style="padding-bottom:20px;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.03em;">TaskDial</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;">Reset your password</p>
              <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6;">
                We received a request to reset the password for your TaskDial account
                (<strong style="color:#111827;">${user.email}</strong>).
                This link expires in 1 hour.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#3b5998;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
                If you did not request this, you can safely ignore this email.
                Your password will not change unless you follow the link above.
              </p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 0;">
              <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
                Or copy this link into your browser:<br>
                <span style="color:#3b5998;word-break:break-all;">${resetUrl}</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset your TaskDial password',
      text: textBody,
      html: htmlBody,
    });
  } catch (err) {
    console.error('[auth] Failed to send password reset email:', err);
  }

  writeAuditLog(user.id, 'forgot_password_sent', null, ip);
  res.json({ success: true });
});

// POST /api/auth/reset-password
router.post('/reset-password', resetLimiter, async (req: Request, res: Response) => {
  const { token, password } = req.body;
  const ip = getClientIp(req);

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Reset token is required' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 12) {
    res.status(400).json({ error: 'Password must be at least 12 characters' });
    return;
  }

  const tokenHash = hashToken(token);
  const db = getDb();

  const stored = db.prepare(`
    SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at,
           u.email, u.is_active, u.deleted_at
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token_hash = ?
  `).get(tokenHash) as {
    id: string; user_id: string; expires_at: string; used_at: string | null;
    email: string; is_active: number; deleted_at: string | null;
  } | undefined;

  if (!stored || stored.used_at || new Date(stored.expires_at) < new Date() || !stored.is_active || stored.deleted_at) {
    writeAuditLog(null, 'reset_password_fail', { reason: 'invalid_token' }, ip);
    res.status(400).json({ error: 'This reset link is invalid or has expired' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Rotate key_salt so the old E2EE key cannot be re-derived from the previous password
  const newKeySalt = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();

  const doReset = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, key_salt = ?, token_version = token_version + 1, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, newKeySalt, now, stored.user_id);

    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?')
      .run(now, stored.id);

    // Revoke all active sessions
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?')
      .run(stored.user_id);
  });

  doReset();

  writeAuditLog(stored.user_id, 'reset_password_ok', null, ip);
  res.json({ success: true });
});

export default router;
