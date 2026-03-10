import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import express from 'express';
import { getDb, writeAuditLog } from '../db';

const router = Router();

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: (req) => (req as any).user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many export requests, please try again later' },
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req as any).user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests, please try again later' },
});

const EXPORT_SCHEMA_VERSION = '1.0';

// ── Validation helpers ────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isIntOrNull(v: unknown): boolean {
  return v === null || (typeof v === 'number' && Number.isInteger(v));
}

function validateTask(t: unknown): string | null {
  if (!t || typeof t !== 'object') return 'task must be an object';
  const task = t as Record<string, unknown>;
  if (!isString(task.title) || task.title.trim() === '') return 'task.title is required';
  if (!isString(task.date) || !/^\d{4}-\d{2}-\d{2}$/.test(task.date)) return 'task.date must be YYYY-MM-DD';
  if (!isInt(task.duration_minutes) || task.duration_minutes < 1 || task.duration_minutes > 1440) return 'task.duration_minutes must be 1–1440';
  if (!isInt(task.sort_order)) return 'task.sort_order must be an integer';
  if (typeof task.completed !== 'number' && typeof task.completed !== 'boolean') return 'task.completed is required';
  if (typeof task.important !== 'number' && typeof task.important !== 'boolean') return 'task.important is required';
  if (!isStringOrNull(task.fixed_start_time)) return 'task.fixed_start_time must be a string or null';
  if (!isStringOrNull(task.tag)) return 'task.tag must be a string or null';
  if (!isStringOrNull(task.details)) return 'task.details must be a string or null';
  if (!isStringOrNull(task.recurrence_pattern)) return 'task.recurrence_pattern must be a string or null';
  return null;
}

function validateSession(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'session must be an object';
  const sess = s as Record<string, unknown>;
  if (!isString(sess.type) || !['work', 'short_break', 'long_break'].includes(sess.type)) return 'session.type must be work|short_break|long_break';
  if (!isInt(sess.duration_minutes) || sess.duration_minutes < 1) return 'session.duration_minutes must be a positive integer';
  if (!isString(sess.started_at)) return 'session.started_at is required';
  if (!isString(sess.date) || !/^\d{4}-\d{2}-\d{2}$/.test(sess.date)) return 'session.date must be YYYY-MM-DD';
  if (!isStringOrNull(sess.completed_at)) return 'session.completed_at must be a string or null';
  return null;
}

// ── GET /api/user/export ──────────────────────────────────────────────────────

router.get('/export', exportLimiter, (req: Request, res: Response) => {
  const userId = req.user!.id;
  const db = getDb();

  const user = db.prepare(
    'SELECT email, role, created_at FROM users WHERE id = ?'
  ).get(userId) as { email: string; role: string; created_at: string } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const tasks = db.prepare(`
    SELECT title, duration_minutes, fixed_start_time, completed, important, is_break,
           tag, details, recurrence_pattern, recurrence_source_id, sort_order, date,
           created_at, updated_at
    FROM tasks WHERE user_id = ? ORDER BY date ASC, sort_order ASC
  `).all(userId);

  const sessions = db.prepare(`
    SELECT type, duration_minutes, started_at, completed_at, date
    FROM pomodoro_sessions WHERE user_id = ? ORDER BY started_at ASC
  `).all(userId);

  const settingsRows = db.prepare(
    'SELECT key, value FROM user_settings WHERE user_id = ?'
  ).all(userId) as Array<{ key: string; value: string }>;

  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) {
    try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
  }

  const payload = {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    user: { email: user.email, role: user.role, created_at: user.created_at },
    tasks,
    sessions,
    settings,
  };

  writeAuditLog(userId, 'data_export', null, req.ip || null);

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="taskdial-export-${dateStr}.json"`);
  res.json(payload);
});

// ── POST /api/user/import ─────────────────────────────────────────────────────

router.post(
  '/import',
  importLimiter,
  express.json({ limit: '5mb' }),
  (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = req.body;

    // Validate envelope
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Request body must be a JSON object' });
      return;
    }
    if (body.export_schema_version !== EXPORT_SCHEMA_VERSION) {
      res.status(400).json({
        error: `Unsupported export version: ${body.export_schema_version}. Expected ${EXPORT_SCHEMA_VERSION}.`,
      });
      return;
    }
    if (!Array.isArray(body.tasks)) {
      res.status(400).json({ error: 'tasks must be an array' });
      return;
    }
    if (!Array.isArray(body.sessions)) {
      res.status(400).json({ error: 'sessions must be an array' });
      return;
    }
    if (body.tasks.length > 10000 || body.sessions.length > 50000) {
      res.status(400).json({ error: 'Import file exceeds maximum record count' });
      return;
    }

    // Validate all records before touching the DB
    for (let i = 0; i < body.tasks.length; i++) {
      const err = validateTask(body.tasks[i]);
      if (err) { res.status(400).json({ error: `tasks[${i}]: ${err}` }); return; }
    }
    for (let i = 0; i < body.sessions.length; i++) {
      const err = validateSession(body.sessions[i]);
      if (err) { res.status(400).json({ error: `sessions[${i}]: ${err}` }); return; }
    }

    const db = getDb();
    const now = new Date().toISOString();

    const doImport = db.transaction(() => {
      // Delete existing user data
      db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM pomodoro_sessions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);

      // Insert tasks — regenerate all IDs, force user_id
      const insertTask = db.prepare(`
        INSERT INTO tasks (
          id, user_id, title, duration_minutes, fixed_start_time, completed, important,
          is_break, tag, details, recurrence_pattern, recurrence_source_id,
          sort_order, date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of body.tasks as Array<Record<string, unknown>>) {
        insertTask.run(
          uuidv4(), userId,
          String(t.title).slice(0, 500),
          Number(t.duration_minutes),
          isStringOrNull(t.fixed_start_time) ? t.fixed_start_time : null,
          t.completed ? 1 : 0,
          t.important ? 1 : 0,
          t.is_break ? 1 : 0,
          isStringOrNull(t.tag) ? (t.tag ? String(t.tag).slice(0, 100) : null) : null,
          isStringOrNull(t.details) ? t.details : null,
          isStringOrNull(t.recurrence_pattern) ? t.recurrence_pattern : null,
          null, // recurrence_source_id — regenerated IDs make this unmappable; drop it
          Number(t.sort_order),
          String(t.date),
          isString(t.created_at) ? t.created_at : now,
          now,
        );
      }

      // Insert sessions — regenerate all IDs
      const insertSession = db.prepare(`
        INSERT INTO pomodoro_sessions (id, user_id, type, duration_minutes, started_at, completed_at, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const s of body.sessions as Array<Record<string, unknown>>) {
        insertSession.run(
          uuidv4(), userId,
          String(s.type),
          Number(s.duration_minutes),
          String(s.started_at),
          isStringOrNull(s.completed_at) ? s.completed_at : null,
          String(s.date),
        );
      }

      // Restore settings if present
      if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
        const upsertSetting = db.prepare(`
          INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
        `);
        for (const [key, value] of Object.entries(body.settings as Record<string, unknown>)) {
          if (typeof key === 'string' && key.length <= 100) {
            upsertSetting.run(userId, key, JSON.stringify(value));
          }
        }
      }
    });

    try {
      doImport();
    } catch (err: unknown) {
      console.error('[import] transaction failed:', err);
      res.status(500).json({ error: 'Import failed — no data was changed' });
      return;
    }

    writeAuditLog(userId, 'data_import', {
      tasks: body.tasks.length,
      sessions: body.sessions.length,
    }, req.ip || null);

    res.json({
      imported: {
        tasks: body.tasks.length,
        sessions: body.sessions.length,
      },
    });
  }
);

// ── DELETE /api/user/account ──────────────────────────────────────────────────

router.delete('/account', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required to delete your account' });
    return;
  }

  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, role, password_hash FROM users WHERE id = ? AND deleted_at IS NULL'
  ).get(userId) as { id: string; email: string; role: string; password_hash: string } | undefined;

  if (!user) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  if (user.role === 'owner') {
    res.status(403).json({ error: 'The owner account cannot be self-deleted. Transfer ownership first.' });
    return;
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    res.status(403).json({ error: 'Incorrect password' });
    return;
  }

  // Write audit log entry BEFORE deleting (so we have a record)
  writeAuditLog(userId, 'account_deleted', { email: user.email }, req.ip || null);

  const doDelete = db.transaction(() => {
    // Anonymise audit log entries — null user_id and IP
    db.prepare('UPDATE audit_log SET user_id = NULL, ip = NULL WHERE user_id = ?').run(userId);

    // Delete all user data
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM pomodoro_sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM invite_codes WHERE used_by = ?').run(userId);

    // Hard delete the user row
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  try {
    doDelete();
  } catch (err: unknown) {
    console.error('[delete-account] transaction failed:', err);
    res.status(500).json({ error: 'Account deletion failed — please try again' });
    return;
  }

  // Clear auth cookies
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('access_token', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.clearCookie('refresh_token', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });

  res.status(204).send();
});

export default router;
