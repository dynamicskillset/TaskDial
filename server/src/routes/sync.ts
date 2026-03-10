import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

const router = Router();

// GET /api/sync?since=ISO_TIMESTAMP
router.get('/', (req: Request, res: Response) => {
  const { since } = req.query;
  const userId = req.user!.id;

  if (!since || typeof since !== 'string') {
    res.status(400).json({ error: 'since query parameter is required (ISO 8601 timestamp)' });
    return;
  }

  const db = getDb();

  const tasks = db.prepare(
    'SELECT * FROM tasks WHERE updated_at > ? AND user_id = ? ORDER BY updated_at ASC'
  ).all(since, userId);

  const sessions = db.prepare(
    'SELECT * FROM pomodoro_sessions WHERE started_at > ? AND user_id = ? ORDER BY started_at ASC'
  ).all(since, userId);

  const settingRows = db.prepare(
    'SELECT key, value FROM user_settings WHERE user_id = ?'
  ).all(userId) as Array<{ key: string; value: string }>;

  const settingsObj: Record<string, any> = {};
  for (const row of settingRows) {
    try {
      settingsObj[row.key] = JSON.parse(row.value);
    } catch {
      settingsObj[row.key] = row.value;
    }
  }

  res.json({
    tasks,
    pomodoro_sessions: sessions,
    settings: settingsObj,
    server_time: new Date().toISOString(),
  });
});

// POST /api/sync
router.post('/', (req: Request, res: Response) => {
  const { tasks, pomodoro_sessions, settings } = req.body;
  const userId = req.user!.id;
  const db = getDb();

  const results = {
    tasks: { created: 0, updated: 0, skipped: 0 },
    pomodoro_sessions: { created: 0, updated: 0, skipped: 0 },
    settings: { updated: 0 },
  };

  const syncAll = db.transaction(() => {
    // Sync tasks
    if (Array.isArray(tasks)) {
      const findTask = db.prepare('SELECT id, updated_at FROM tasks WHERE id = ? AND user_id = ?');
      const insertTask = db.prepare(`
        INSERT INTO tasks (id, user_id, title, duration_minutes, fixed_start_time, completed, important, is_break, tag, details, recurrence_pattern, recurrence_source_id, sort_order, date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateTask = db.prepare(`
        UPDATE tasks SET title = ?, duration_minutes = ?, fixed_start_time = ?, completed = ?, important = ?, is_break = ?, tag = ?, details = ?, recurrence_pattern = ?, recurrence_source_id = ?, sort_order = ?, date = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `);

      for (const task of tasks) {
        if (!task.id || !task.title || !task.date) continue;

        const existing = findTask.get(task.id, userId) as { id: string; updated_at: string } | undefined;
        const now = new Date().toISOString();

        if (!existing) {
          insertTask.run(
            task.id, userId, task.title,
            task.duration_minutes ?? 25, task.fixed_start_time ?? null,
            task.completed ? 1 : 0, task.important ? 1 : 0, task.is_break ? 1 : 0,
            task.tag ?? null, task.details ?? null,
            task.recurrence_pattern ?? null, task.recurrence_source_id ?? null,
            task.sort_order ?? 0, task.date,
            task.created_at ?? now, task.updated_at ?? now
          );
          results.tasks.created++;
        } else {
          const incomingTime = task.updated_at || now;
          if (incomingTime >= existing.updated_at) {
            updateTask.run(
              task.title, task.duration_minutes ?? 25, task.fixed_start_time ?? null,
              task.completed ? 1 : 0, task.important ? 1 : 0, task.is_break ? 1 : 0,
              task.tag ?? null, task.details ?? null,
              task.recurrence_pattern ?? null, task.recurrence_source_id ?? null,
              task.sort_order ?? 0, task.date, incomingTime,
              task.id, userId
            );
            results.tasks.updated++;
          } else {
            results.tasks.skipped++;
          }
        }
      }
    }

    // Sync pomodoro sessions
    if (Array.isArray(pomodoro_sessions)) {
      const findSession = db.prepare('SELECT id FROM pomodoro_sessions WHERE id = ? AND user_id = ?');
      const insertSession = db.prepare(`
        INSERT INTO pomodoro_sessions (id, user_id, task_id, type, duration_minutes, started_at, completed_at, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateSession = db.prepare(`
        UPDATE pomodoro_sessions SET task_id = ?, type = ?, duration_minutes = ?, completed_at = ?
        WHERE id = ? AND user_id = ?
      `);

      for (const session of pomodoro_sessions) {
        if (!session.id || !session.started_at || !session.date) continue;

        const existing = findSession.get(session.id, userId);

        if (!existing) {
          insertSession.run(
            session.id, userId, session.task_id ?? null,
            session.type ?? 'work', session.duration_minutes ?? 25,
            session.started_at, session.completed_at ?? null, session.date
          );
          results.pomodoro_sessions.created++;
        } else {
          updateSession.run(
            session.task_id ?? null, session.type ?? 'work',
            session.duration_minutes ?? 25, session.completed_at ?? null,
            session.id, userId
          );
          results.pomodoro_sessions.updated++;
        }
      }
    }

    // Sync settings
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      const upsertSetting = db.prepare(`
        INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
      `);

      for (const [key, value] of Object.entries(settings)) {
        const serialised = typeof value === 'string' ? value : JSON.stringify(value);
        upsertSetting.run(userId, key, serialised);
        results.settings.updated++;
      }
    }
  });

  syncAll();

  res.json({
    success: true,
    results,
    server_time: new Date().toISOString(),
  });
});

export default router;
