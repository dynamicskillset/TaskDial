import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

const router = Router();

// GET /api/pomodoro/sessions?date=YYYY-MM-DD
router.get('/sessions', (req: Request, res: Response) => {
  const { date } = req.query;
  const userId = req.user!.id;

  if (!date || typeof date !== 'string') {
    res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    return;
  }

  const db = getDb();
  const sessions = db.prepare(
    'SELECT * FROM pomodoro_sessions WHERE date = ? AND user_id = ? ORDER BY started_at ASC'
  ).all(date, userId);

  res.json(sessions);
});

// POST /api/pomodoro/sessions
router.post('/sessions', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const {
    id,
    task_id = null,
    type = 'work',
    duration_minutes = 25,
    started_at,
    completed_at = null,
    date,
  } = req.body;

  if (!started_at || !date) {
    res.status(400).json({ error: 'started_at and date are required' });
    return;
  }

  const validTypes = ['work', 'short_break', 'long_break'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const sessionId = id || uuidv4();
  const db = getDb();

  try {
    db.prepare(`
      INSERT INTO pomodoro_sessions (id, user_id, task_id, type, duration_minutes, started_at, completed_at, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, task_id, type, duration_minutes, started_at, completed_at, date);

    const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
    res.status(201).json(session);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Session with this id already exists' });
    } else {
      throw err;
    }
  }
});

// PUT /api/pomodoro/sessions/:id
router.put('/sessions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const updates = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);

  if (!existing) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const allowedFields = ['task_id', 'type', 'duration_minutes', 'completed_at'];
  const setClauses: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  values.push(id, userId);
  db.prepare(`UPDATE pomodoro_sessions SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);

  const session = db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?').get(id, userId);
  res.json(session);
});

export default router;
