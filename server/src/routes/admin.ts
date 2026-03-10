import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb, writeAuditLog } from '../db';

const router = Router();

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
}

function generateInviteCode(): string {
  // 8 uppercase alphanumeric characters from a cryptographically secure source
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to avoid confusion
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req: Request, res: Response) => {
  const db = getDb();

  const users = db.prepare(`
    SELECT id, email, role, is_active, token_version, deleted_at, created_at, updated_at
    FROM users
    ORDER BY created_at ASC
  `).all() as Array<{
    id: string; email: string; role: string; is_active: number;
    token_version: number; deleted_at: string | null; created_at: string; updated_at: string;
  }>;

  // Attach last seen from audit log
  const lastSeen = db.prepare(`
    SELECT user_id, MAX(created_at) as last_seen
    FROM audit_log
    WHERE action IN ('login_ok', 'token_refresh')
    GROUP BY user_id
  `).all() as Array<{ user_id: string; last_seen: string }>;

  const lastSeenMap = Object.fromEntries(lastSeen.map(r => [r.user_id, r.last_seen]));

  const active = users.filter(u => !u.deleted_at).map(u => ({ ...u, last_seen: lastSeenMap[u.id] || null }));
  const deleted = users.filter(u => u.deleted_at).map(u => ({ ...u, last_seen: lastSeenMap[u.id] || null }));

  res.json({ active, deleted });
});

// PATCH /api/admin/users/:id/disable
router.patch('/users/:id/disable', (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;
  const ip = getClientIp(req);
  const db = getDb();

  // Cannot disable yourself or another owner
  const target = db.prepare('SELECT id, role, deleted_at FROM users WHERE id = ?').get(id) as
    { id: string; role: string; deleted_at: string | null } | undefined;

  if (!target || target.deleted_at) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === adminId) {
    res.status(400).json({ error: 'You cannot disable your own account' });
    return;
  }
  if (target.role === 'owner' && req.user!.role !== 'owner') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET is_active = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .run(now, id);

  writeAuditLog(adminId, 'user_disabled', { target_id: id }, ip);
  res.json({ success: true });
});

// PATCH /api/admin/users/:id/enable
router.patch('/users/:id/enable', (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;
  const ip = getClientIp(req);
  const db = getDb();

  const target = db.prepare('SELECT id, deleted_at FROM users WHERE id = ?').get(id) as
    { id: string; deleted_at: string | null } | undefined;

  if (!target || target.deleted_at) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  db.prepare('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);

  writeAuditLog(adminId, 'user_enabled', { target_id: id }, ip);
  res.json({ success: true });
});

// DELETE /api/admin/users/:id — soft delete
router.delete('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;
  const ip = getClientIp(req);
  const db = getDb();

  const target = db.prepare('SELECT id, role, deleted_at FROM users WHERE id = ?').get(id) as
    { id: string; role: string; deleted_at: string | null } | undefined;

  if (!target || target.deleted_at) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === adminId) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }
  if (target.role === 'owner') {
    res.status(400).json({ error: 'The owner account cannot be deleted' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE users SET deleted_at = ?, is_active = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?'
  ).run(now, now, id);

  writeAuditLog(adminId, 'user_deleted', { target_id: id }, ip);
  res.json({ success: true });
});

// DELETE /api/admin/users/:id/purge — hard delete (owner only)
router.delete('/users/:id/purge', (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;
  const ip = getClientIp(req);

  if (req.user!.role !== 'owner') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const db = getDb();
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as
    { id: string; role: string } | undefined;

  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === adminId) {
    res.status(400).json({ error: 'You cannot purge your own account' });
    return;
  }
  if (target.role === 'owner') {
    res.status(400).json({ error: 'The owner account cannot be purged' });
    return;
  }

  const purge = db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM pomodoro_sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM invite_codes WHERE used_by = ?').run(id);
    // Keep audit log entries for the record, but nullify user_id link
    db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  purge();

  writeAuditLog(adminId, 'user_purged', { target_id: id }, ip);
  res.json({ success: true });
});

// ── Invite codes ──────────────────────────────────────────────────────────────

// GET /api/admin/invites
router.get('/invites', (req: Request, res: Response) => {
  const db = getDb();

  const invites = db.prepare(`
    SELECT
      ic.id, ic.code, ic.expires_at, ic.created_at,
      ic.used_at,
      creator.email as created_by_email,
      redeemer.email as used_by_email
    FROM invite_codes ic
    JOIN users creator ON creator.id = ic.created_by
    LEFT JOIN users redeemer ON redeemer.id = ic.used_by
    ORDER BY ic.created_at DESC
  `).all();

  res.json(invites);
});

// POST /api/admin/invites
router.post('/invites', (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const ip = getClientIp(req);
  const { expires_at } = req.body;

  // Validate optional expiry
  if (expires_at !== undefined && expires_at !== null) {
    if (typeof expires_at !== 'string' || isNaN(Date.parse(expires_at))) {
      res.status(400).json({ error: 'expires_at must be a valid ISO 8601 date string' });
      return;
    }
    if (new Date(expires_at) <= new Date()) {
      res.status(400).json({ error: 'expires_at must be in the future' });
      return;
    }
  }

  const db = getDb();
  const code = generateInviteCode();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO invite_codes (id, code, created_by, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, code, adminId, expires_at || null, now);

  writeAuditLog(adminId, 'invite_created', { code, expires_at: expires_at || null }, ip);

  res.status(201).json({ id, code, expires_at: expires_at || null, created_at: now });
});

// DELETE /api/admin/invites/:id — revoke
router.delete('/invites/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;
  const ip = getClientIp(req);
  const db = getDb();

  const invite = db.prepare('SELECT id, code, used_by FROM invite_codes WHERE id = ?').get(id) as
    { id: string; code: string; used_by: string | null } | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite code not found' });
    return;
  }
  if (invite.used_by) {
    res.status(400).json({ error: 'Cannot revoke an invite code that has already been used' });
    return;
  }

  db.prepare('DELETE FROM invite_codes WHERE id = ?').run(id);

  writeAuditLog(adminId, 'invite_revoked', { code: invite.code }, ip);
  res.json({ success: true });
});

// ── Audit log ─────────────────────────────────────────────────────────────────

// GET /api/admin/audit
router.get('/audit', (_req: Request, res: Response) => {
  const db = getDb();

  const entries = db.prepare(`
    SELECT al.id, al.action, al.detail, al.ip, al.created_at,
           u.email as user_email
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT 50
  `).all();

  res.json(entries);
});

// ── Stats ─────────────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const totalUsers = (db.prepare('SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL').get() as { n: number }).n;
  const activeUsers = (db.prepare('SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL AND is_active = 1').get() as { n: number }).n;
  const totalTasks = (db.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number }).n;
  const tasksThisWeek = (db.prepare('SELECT COUNT(*) as n FROM tasks WHERE created_at >= ?').get(sevenDaysAgo) as { n: number }).n;
  const sessionsThisWeek = (db.prepare('SELECT COUNT(*) as n FROM pomodoro_sessions WHERE started_at >= ?').get(sevenDaysAgo) as { n: number }).n;
  const loginsToday = (db.prepare("SELECT COUNT(*) as n FROM audit_log WHERE action = 'login_ok' AND created_at >= ?").get(today) as { n: number }).n;

  res.json({ totalUsers, activeUsers, totalTasks, tasksThisWeek, sessionsThisWeek, loginsToday });
});

export default router;
