import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

const router = Router();

// GET /api/tasks?date=YYYY-MM-DD
router.get('/', (req: Request, res: Response) => {
  const { date } = req.query;
  const userId = req.user!.id;

  if (!date || typeof date !== 'string') {
    res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    return;
  }

  const db = getDb();
  const tasks = db.prepare(
    'SELECT * FROM tasks WHERE date = ? AND user_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(date, userId);

  res.json(tasks);
});

// POST /api/tasks
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const {
    id,
    title,
    duration_minutes = 25,
    fixed_start_time = null,
    completed = 0,
    important = 0,
    is_break = 0,
    tag = null,
    details = null,
    recurrence_pattern = null,
    recurrence_source_id = null,
    sort_order = 0,
    date,
    created_at,
    updated_at,
  } = req.body;

  if (!title || !date) {
    res.status(400).json({ error: 'title and date are required' });
    return;
  }

  const now = new Date().toISOString();
  const taskId = id || uuidv4();

  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO tasks (id, user_id, title, duration_minutes, fixed_start_time, completed, important, is_break, tag, details, recurrence_pattern, recurrence_source_id, sort_order, date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId, userId, title, duration_minutes, fixed_start_time,
      completed ? 1 : 0, important ? 1 : 0, is_break ? 1 : 0,
      tag, details, recurrence_pattern, recurrence_source_id,
      sort_order, date, created_at || now, updated_at || now
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    res.status(201).json(task);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Task with this id already exists' });
    } else {
      throw err;
    }
  }
});

// PUT /api/tasks/reorder
router.put('/reorder', (req: Request, res: Response) => {
  const { tasks } = req.body;
  const userId = req.user!.id;

  if (!Array.isArray(tasks)) {
    res.status(400).json({ error: 'tasks array is required, each with id and sort_order' });
    return;
  }

  const db = getDb();
  const ids = tasks.map((t: any) => t.id);

  // Verify all tasks belong to this user before writing any
  const placeholders = ids.map(() => '?').join(', ');
  const owned = db.prepare(
    `SELECT id FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`
  ).all(...ids, userId) as Array<{ id: string }>;

  if (owned.length !== ids.length) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?');

  const updateMany = db.transaction((items: Array<{ id: string; sort_order: number }>) => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id, userId);
    }
  });

  updateMany(tasks);
  res.json({ success: true, updated: tasks.length });
});

// PUT /api/tasks/:id
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const updates = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);

  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const allowedFields = [
    'title', 'duration_minutes', 'fixed_start_time', 'completed',
    'important', 'is_break', 'tag', 'details', 'recurrence_pattern',
    'recurrence_source_id', 'sort_order', 'date'
  ];

  const setClauses: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      let value = updates[field];
      if (field === 'completed' || field === 'important' || field === 'is_break') {
        value = value ? 1 : 0;
      }
      setClauses.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  const now = updates.updated_at || new Date().toISOString();
  setClauses.push('updated_at = ?');
  values.push(now, id, userId);

  db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
  res.json(task);
});

// DELETE /api/tasks/recurring/:sourceId?mode=single|all|future
router.delete('/recurring/:sourceId', (req: Request, res: Response) => {
  const { sourceId } = req.params;
  const { mode, task_id, from } = req.query;
  const userId = req.user!.id;
  const db = getDb();

  if (mode === 'single' && typeof task_id === 'string') {
    const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(task_id, userId);
    res.json({ success: true, deletedCount: result.changes });
    return;
  }

  if (mode === 'all') {
    const deleteAll = db.transaction(() => {
      const r1 = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(sourceId, userId);
      const r2 = db.prepare('DELETE FROM tasks WHERE recurrence_source_id = ? AND user_id = ?').run(sourceId, userId);
      return r1.changes + r2.changes;
    });
    res.json({ success: true, deletedCount: deleteAll() });
    return;
  }

  if (mode === 'future' && typeof from === 'string') {
    const deleteFuture = db.transaction(() => {
      const r1 = db.prepare('DELETE FROM tasks WHERE recurrence_source_id = ? AND date >= ? AND user_id = ?').run(sourceId, from, userId);
      const r2 = db.prepare('DELETE FROM tasks WHERE id = ? AND date >= ? AND user_id = ?').run(sourceId, from, userId);
      return r1.changes + r2.changes;
    });
    res.json({ success: true, deletedCount: deleteFuture() });
    return;
  }

  res.status(400).json({ error: 'Invalid mode. Use mode=single&task_id=ID, mode=all, or mode=future&from=YYYY-MM-DD' });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const db = getDb();
  const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ success: true, deleted: id });
});

export default router;
